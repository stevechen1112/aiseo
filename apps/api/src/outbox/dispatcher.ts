import 'dotenv/config';

import pg from 'pg';

import { createRedisConnection, EventBus, postSlackWebhook } from '@aiseo/core';
import { invalidateDashboardCache } from '../routes/dashboard.js';

const pollIntervalMs = 5000;
const batchSize = 50;
const maxRetries = 3;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('Missing DATABASE_URL');
}

const pool = new pg.Pool({
  connectionString: databaseUrl,
});

// ── Shared EventBus (pub/sub to Redis + optional Slack webhook) ──────────────
const _redis = createRedisConnection({ url: process.env.REDIS_URL ?? 'redis://localhost:6379' });
const _bus = new EventBus({ redis: _redis, prefix: 'aiseo' });
const _slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function dispatchEvent(event: {
  id: number;
  event_type: string;
  payload: unknown;
}) {
  const payload = event.payload && typeof event.payload === 'object' ? (event.payload as Record<string, unknown>) : {};
  const tenantId = typeof payload.tenantId === 'string' ? payload.tenantId : undefined;
  const projectId = typeof payload.projectId === 'string' ? payload.projectId : undefined;

  if (!tenantId) {
    // eslint-disable-next-line no-console
    console.warn(`[outbox] id=${event.id} missing tenantId — skipping pub/sub`);
    return;
  }

  // Publish to Redis pub/sub so all connected WebSocket clients receive the event.
  await _bus.publish({
    tenantId,
    projectId,
    type: event.event_type as import('@aiseo/core').AgentEventType,
    payload,
  });

  // Invalidate dashboard cache for any event that changes metrics shown on the dashboard.
  const CACHE_INVALIDATING_EVENTS = new Set([
    'agent.task.completed',
    'serp.rank.anomaly',
    'report.ready',
  ]);
  if (CACHE_INVALIDATING_EVENTS.has(event.event_type) && projectId) {
    await invalidateDashboardCache(tenantId, projectId);
  }

  // Best-effort Slack notification (non-blocking, won't block commit).
  if (_slackWebhookUrl) {
    const text = [
      `*[AISEO]* ${event.event_type}`,
      `tenant=${tenantId}`,
      projectId ? `project=${projectId}` : undefined,
    ]
      .filter(Boolean)
      .join(' | ');

    void postSlackWebhook(_slackWebhookUrl, { text }).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.warn('[outbox] slack webhook error', err);
    });
  }

  // eslint-disable-next-line no-console
  console.log(`[outbox] dispatched id=${event.id} type=${event.event_type} tenant=${tenantId}`);
}

async function pollOnce() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const rows = await client.query<{
      id: number;
      event_type: string;
      payload: unknown;
      retry_count: number;
    }>(
      `SELECT id, event_type, payload, retry_count
       FROM events_outbox
       WHERE dispatched = false AND retry_count < $1
       ORDER BY created_at ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED`,
      [maxRetries, batchSize],
    );

    for (const row of rows.rows) {
      try {
        await dispatchEvent(row);

        await client.query(
          'UPDATE events_outbox SET dispatched = true, dispatched_at = now(), last_error = NULL WHERE id = $1',
          [row.id],
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await client.query(
          'UPDATE events_outbox SET retry_count = retry_count + 1, last_error = $2 WHERE id = $1',
          [row.id, message],
        );
      }
    }

    await client.query('COMMIT');

    return rows.rows.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  // eslint-disable-next-line no-console
  console.log('[outbox] dispatcher started');

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const processed = await pollOnce();
    if (processed === 0) {
      await sleep(pollIntervalMs);
    }
  }
}

await main();

process.on('SIGINT', async () => {
  // eslint-disable-next-line no-console
  console.log('[outbox] shutting down');
  _redis.disconnect();
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  // eslint-disable-next-line no-console
  console.log('[outbox] shutting down (SIGTERM)');
  _redis.disconnect();
  await pool.end();
  process.exit(0);
});
