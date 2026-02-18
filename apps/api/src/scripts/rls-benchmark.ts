import 'dotenv/config';

import pg from 'pg';

function envVar(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

const adminUrl = envVar('DATABASE_URL_MIGRATION');
const appUrl = envVar('DATABASE_URL');

const adminPool = new pg.Pool({ connectionString: adminUrl });
const appPool = new pg.Pool({ connectionString: appUrl });

async function timeIt(label: string, fn: () => Promise<void>) {
  const started = performance.now();
  await fn();
  const ended = performance.now();
  const ms = ended - started;
  // eslint-disable-next-line no-console
  console.log(`${label}: ${ms.toFixed(2)}ms`);
  return ms;
}

async function main() {
  // Seed minimal data if missing.
  const setup = await adminPool.connect();
  let tenantId: string;
  try {
    const t = await setup.query('SELECT id FROM tenants ORDER BY created_at DESC LIMIT 1');
    if (t.rowCount === 0) {
      const inserted = await setup.query(
        'INSERT INTO tenants (id, name, slug, plan, settings) VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id',
        ['Bench Tenant', 'bench-tenant', 'starter', '{}'],
      );
      tenantId = inserted.rows[0].id as string;
      const p = await setup.query(
        'INSERT INTO projects (id, tenant_id, name, domain, settings) VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id',
        [tenantId, 'Bench Project', 'bench.example', '{}'],
      );
      await setup.query(
        'INSERT INTO keywords (id, project_id, keyword) VALUES (gen_random_uuid(), $1, $2)',
        [p.rows[0].id as string, 'bench-keyword'],
      );
    } else {
      tenantId = t.rows[0].id as string;
    }
  } finally {
    setup.release();
  }

  const iterations = 300;

  // Admin: bypass RLS by virtue of BYPASSRLS; acts as baseline.
  await timeIt('admin(select projects)', async () => {
    const client = await adminPool.connect();
    try {
      for (let i = 0; i < iterations; i += 1) {
        await client.query('SELECT id FROM projects LIMIT 1');
      }
    } finally {
      client.release();
    }
  });

  // App: subject to RLS; includes set_config once.
  await timeIt('app(set tenant + select projects)', async () => {
    const client = await appPool.connect();
    try {
      await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantId]);
      for (let i = 0; i < iterations; i += 1) {
        await client.query('SELECT id FROM projects LIMIT 1');
      }
    } finally {
      client.release();
    }
  });

  // eslint-disable-next-line no-console
  console.log('RLS benchmark complete', { iterations });

  await adminPool.end();
  await appPool.end();
}

await main();
