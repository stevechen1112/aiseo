import 'dotenv/config';

import pg from 'pg';

const adminUrl = process.env.DATABASE_URL_MIGRATION ?? process.env.DATABASE_URL;
if (!adminUrl) throw new Error('Missing DATABASE_URL_MIGRATION or DATABASE_URL');

const pool = new pg.Pool({ connectionString: adminUrl });

async function main() {
  const payload = {
    ts: Date.now(),
    note: 'Phase 0 outbox enqueue smoke',
  };

  const result = await pool.query(
    'INSERT INTO events_outbox (event_type, payload, dispatched) VALUES ($1, $2, false) RETURNING id',
    ['smoke.test', payload],
  );

  // eslint-disable-next-line no-console
  console.log(`enqueued outbox event id=${result.rows[0].id}`);

  await pool.end();
}

await main();
