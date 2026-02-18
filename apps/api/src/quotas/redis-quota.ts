/**
 * PERF-01: Redis-backed quota counters.
 *
 * Uses atomic Lua scripts so that increment + limit-check are a single
 * round-trip. A periodic sync job (startQuotaSyncJob) flushes the Redis
 * counters back to `tenant_usage` so data survives Redis restarts.
 *
 * Key format:  quota:{tenantId}:{period}:{kind}
 * TTL:         60 days (auto-expiry for stale periods)
 */

import type { PoolClient } from 'pg';

import { getRedis } from '../redis.js';
import { currentUsagePeriodKey } from './tenant-quotas.js';

const QUOTA_TTL_SECONDS = 60 * 24 * 60 * 60; // 60 days

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------
export function quotaRedisKey(tenantId: string, period: string, kind: string): string {
  return `quota:${tenantId}:${period}:${kind}`;
}

// ---------------------------------------------------------------------------
// Lua script: INCR by `delta`, enforce limit, return new value.
//   KEYS[1] = counter key
//   ARGV[1] = delta (positive integer)
//   ARGV[2] = limit (0 means no limit)
//   ARGV[3] = TTL seconds
// Returns: new counter value, or throws "QUOTA_EXCEEDED"
// ---------------------------------------------------------------------------
const INCR_WITHIN_LIMIT_LUA = `
local key   = KEYS[1]
local delta = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local ttl   = tonumber(ARGV[3])

local current = tonumber(redis.call('GET', key) or '0')
local next    = current + delta

if limit > 0 and next > limit then
  return redis.error_reply('QUOTA_EXCEEDED')
end

redis.call('SET', key, tostring(next), 'EX', ttl)
return next
`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

type IncrResult = { ok: true; current: number } | { ok: false; current: number; limit: number };

/**
 * Atomically increment a quota counter in Redis.
 * Returns `{ ok: false }` (with current count) when the limit would be exceeded.
 * Falls back gracefully when Redis is unavailable (logs warning, allows request).
 */
export async function redisIncrQuota(
  tenantId: string,
  kind: 'api_calls' | 'serp_jobs' | 'crawl_jobs',
  delta: number,
  limit: number | null,
  period = currentUsagePeriodKey(),
): Promise<IncrResult> {
  const redis = getRedis() as unknown as {
    eval(script: string, numkeys: number, ...args: string[]): Promise<unknown>;
    get(key: string): Promise<string | null>;
  };

  const key = quotaRedisKey(tenantId, period, kind);
  const effectiveLimit = limit ?? 0; // 0 = no limit in Lua script

  try {
    const result = await redis.eval(
      INCR_WITHIN_LIMIT_LUA,
      1,
      key,
      String(delta),
      String(effectiveLimit),
      String(QUOTA_TTL_SECONDS),
    );
    return { ok: true, current: Number(result) };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('QUOTA_EXCEEDED')) {
      // Read actual value for error details
      const raw = await redis.get(key).catch(() => '0');
      return { ok: false, current: Number(raw ?? 0), limit: limit ?? 0 };
    }
    // Redis unavailable — fail open (log & allow)
    console.warn('[redis-quota] Redis error, failing open:', msg);
    return { ok: true, current: 0 };
  }
}

/**
 * Read current Redis counter value (best-effort, returns 0 on error).
 */
export async function redisGetQuota(
  tenantId: string,
  kind: 'api_calls' | 'serp_jobs' | 'crawl_jobs',
  period = currentUsagePeriodKey(),
): Promise<number> {
  try {
    const redis = getRedis() as unknown as { get(key: string): Promise<string | null> };
    const val = await redis.get(quotaRedisKey(tenantId, period, kind));
    return Number(val ?? '0');
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Sync job: flush Redis counters → tenant_usage DB rows
// ---------------------------------------------------------------------------

/**
 * Scan Redis for `quota:*` keys and upsert into `tenant_usage`.
 * Should be called on a schedule (e.g. every hour).
 */
export async function syncQuotaCountersToDb(client: PoolClient): Promise<void> {
  const redis = getRedis() as unknown as {
    keys(pattern: string): Promise<string[]>;
    get(key: string): Promise<string | null>;
  };

  let keys: string[];
  try {
    keys = await redis.keys('quota:*');
  } catch (err) {
    console.warn('[quota-sync] Redis unavailable:', err);
    return;
  }

  for (const key of keys) {
    // quota:{tenantId}:{period}:{kind}
    const parts = key.split(':');
    if (parts.length !== 4) continue;
    const [, tenantId, period, kind] = parts as [string, string, string, string];
    if (!['api_calls', 'serp_jobs', 'crawl_jobs'].includes(kind)) continue;

    const raw = await redis.get(key).catch(() => null);
    const value = Number(raw ?? '0');
    if (value === 0) continue;

    const col = kind; // column names match kind values exactly
    try {
      await client.query(
        `INSERT INTO tenant_usage (tenant_id, period, ${col}, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (tenant_id, period)
         DO UPDATE SET ${col} = GREATEST(tenant_usage.${col}, EXCLUDED.${col}),
                       updated_at = NOW()`,
        [tenantId, period, value],
      );
    } catch (err) {
      console.warn(`[quota-sync] Failed to sync ${key}:`, err);
    }
  }
}

/**
 * Start a periodic quota-sync interval.
 * Returns a cleanup function to stop the timer.
 */
export function startQuotaSyncJob(
  getClient: () => Promise<PoolClient>,
  intervalMs = 60 * 60 * 1000, // default: 1 hour
): () => void {
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    let client: PoolClient | undefined;
    try {
      client = await getClient();
      await syncQuotaCountersToDb(client);
    } catch (err) {
      console.error('[quota-sync] Sync error:', err);
    } finally {
      client?.release();
      running = false;
    }
  };

  const timer = setInterval(() => void run(), intervalMs);
  // Fire once immediately (non-blocking)
  setTimeout(() => void run(), 5_000);

  return () => clearInterval(timer);
}
