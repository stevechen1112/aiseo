import 'dotenv/config';

import pg from 'pg';

function envVar(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

const adminUrl = process.env.DATABASE_URL_MIGRATION ?? process.env.DATABASE_URL;
if (!adminUrl) throw new Error('Missing DATABASE_URL_MIGRATION or DATABASE_URL');

const pool = new pg.Pool({ connectionString: adminUrl });

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function enqueueMany(count: number) {
  const client = await pool.connect();
  try {
    const insertPromises: Array<Promise<unknown>> = [];
    for (let i = 0; i < count; i += 1) {
      insertPromises.push(
        client.query(
          'INSERT INTO events_outbox (event_type, payload, dispatched) VALUES ($1, $2, false)',
          ['integration.test', { i, ts: Date.now() }],
        ),
      );
    }
    await Promise.all(insertPromises);
  } finally {
    client.release();
  }
}

async function pollOnce(limit: number) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const rows = await client.query<{
      id: number;
      event_type: string;
      retry_count: number;
      payload: unknown;
    }>(
      `SELECT id, event_type, payload, retry_count
       FROM events_outbox
       WHERE dispatched = false AND retry_count < 3
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [limit],
    );

    // Dispatch simulation: fail first 2 attempts for selected events.
    for (const row of rows.rows) {
      try {
        const shouldFail =
          row.event_type === 'integration.fail' && (row.retry_count === 0 || row.retry_count === 1);
        if (shouldFail) {
          throw new Error('simulated dispatch failure');
        }

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

async function countRows() {
  const result = await pool.query(
    'SELECT count(*)::int AS total, sum(CASE WHEN dispatched THEN 1 ELSE 0 END)::int AS dispatched FROM events_outbox',
  );
  return result.rows[0] as { total: number; dispatched: number };
}

async function main() {
  // Ensure env present (script is run from apps/api by default)
  envVar('DATABASE_URL');

  await pool.query('TRUNCATE TABLE events_outbox RESTART IDENTITY');

  // High-concurrency enqueue
  const enqueueCount = 250;
  await enqueueMany(enqueueCount);

  // Include a failing event to validate retry_count increments and eventual dispatch.
  await pool.query(
    'INSERT INTO events_outbox (event_type, payload, dispatched) VALUES ($1, $2, false)',
    ['integration.fail', { note: 'should require retries' }],
  );

  // Simulate dispatcher running, then restarting mid-way.
  // First run: process only a small batch, then stop ("crash").
  await pollOnce(50);

  // "Restart": keep polling until everything is dispatched or max loops hit.
  for (let i = 0; i < 200; i += 1) {
    const processed = await pollOnce(50);
    const counts = await countRows();

    if (counts.dispatched === counts.total) {
      break;
    }

    if (processed === 0) {
      await sleep(50);
    }
  }

  const finalCounts = await countRows();

  if (finalCounts.dispatched !== finalCounts.total) {
    throw new Error(`Outbox integration failed: dispatched=${finalCounts.dispatched} total=${finalCounts.total}`);
  }

  // Ensure the retry path actually executed.
  const retryCheck = await pool.query(
    "SELECT retry_count, last_error, dispatched FROM events_outbox WHERE event_type = 'integration.fail' ORDER BY id DESC LIMIT 1",
  );

  const failingEvent = retryCheck.rows[0] as { retry_count: number; last_error: string | null; dispatched: boolean };
  if (!failingEvent.dispatched || failingEvent.retry_count < 2) {
    throw new Error(`Retry verification failed: ${JSON.stringify(failingEvent)}`);
  }

  // eslint-disable-next-line no-console
  console.log('Outbox integration test passed', {
    total: finalCounts.total,
    dispatched: finalCounts.dispatched,
    failingEvent,
  });

  await pool.end();
}

await main();
