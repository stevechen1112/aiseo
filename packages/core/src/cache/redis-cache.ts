import type { Redis } from 'ioredis';

/**
 * Generic Redis-backed cache helper.
 *
 * Usage:
 *   const result = await withRedisCache(redis, 'semrush:kw:ts:hello', 3600, () => expensiveFetch());
 *
 * @param redis   - An ioredis client (or compatible duplicate).
 * @param key     - The cache key.
 * @param ttlSecs - Time-to-live in seconds. 0 = no caching.
 * @param fn      - The async function to call on cache miss.
 */
export async function withRedisCache<T>(
  redis: Redis,
  key: string,
  ttlSecs: number,
  fn: () => Promise<T>,
): Promise<T> {
  if (ttlSecs <= 0) return fn();

  try {
    const cached = await redis.get(key);
    if (cached !== null) {
      return JSON.parse(cached) as T;
    }
  } catch {
    // Redis unavailable — fall through to live fetch
  }

  const result = await fn();

  try {
    await redis.setex(key, ttlSecs, JSON.stringify(result));
  } catch {
    // Best-effort write — don't fail the request on cache write errors
  }

  return result;
}

/**
 * Build a deterministic cache key from an object's own enumerable properties.
 * Keys are sorted so argument order doesn't affect the key.
 */
export function cacheKey(prefix: string, params: Record<string, unknown>): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${String(params[k] ?? '')}`)
    .join(':');
  return `${prefix}:${sorted}`;
}
