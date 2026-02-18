import 'dotenv/config';

import pg from 'pg';

const adminUrl = process.env.DATABASE_URL_MIGRATION ?? process.env.DATABASE_URL;
if (!adminUrl) throw new Error('Missing DATABASE_URL_MIGRATION or DATABASE_URL');

const pool = new pg.Pool({ connectionString: adminUrl });

function vectorLiteral(values: number[]) {
  return `[${values.join(',')}]`;
}

async function main() {
  // Ensure table exists (migration should create it; this is just a guard for local runs).
  await pool.query(
    `CREATE TABLE IF NOT EXISTS agent_memory (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      agent_id text NOT NULL,
      embedding vector(1536) NOT NULL,
      metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
      created_at timestamptz DEFAULT now() NOT NULL
    )`,
  );

  await pool.query('TRUNCATE TABLE agent_memory');

  const base = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));
  const near = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 0.99 : i === 1 ? 0.01 : 0));
  const far = Array.from({ length: 1536 }, (_, i) => (i === 2 ? 1 : 0));

  await pool.query(
    'INSERT INTO agent_memory (agent_id, embedding, metadata) VALUES ($1, $2::vector, $3), ($1, $4::vector, $5), ($1, $6::vector, $7)',
    [
      'keyword-researcher',
      vectorLiteral(base),
      { label: 'base' },
      vectorLiteral(near),
      { label: 'near' },
      vectorLiteral(far),
      { label: 'far' },
    ],
  );

  const result = await pool.query(
    `SELECT metadata->>'label' AS label,
            (embedding <-> $1::vector) AS distance
     FROM agent_memory
     WHERE agent_id = $2
     ORDER BY embedding <-> $1::vector
     LIMIT 3`,
    [vectorLiteral(base), 'keyword-researcher'],
  );

  const labels = result.rows.map((r) => r.label);
  if (labels[0] !== 'base' || labels[1] !== 'near') {
    throw new Error(`Vector search unexpected order: ${labels.join(',')}`);
  }

  // eslint-disable-next-line no-console
  console.log('Memory smoke test passed', result.rows);

  await pool.end();
}

await main();
