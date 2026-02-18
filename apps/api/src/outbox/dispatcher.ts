import 'dotenv/config';

import pg from 'pg';

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

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function dispatchEvent(event: {
  id: number;
  event_type: string;
  payload: unknown;
}) {
  // Phase 0 stub: replace with WebSocket/Slack dispatch.
  // Keep deterministic and fail-fast.
  // eslint-disable-next-line no-console
  console.log(`[outbox] dispatch id=${event.id} type=${event.event_type}`);
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
