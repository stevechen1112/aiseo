import 'dotenv/config';

import pg from 'pg';

const appUrl = process.env.DATABASE_URL;
if (!appUrl) throw new Error('Missing DATABASE_URL');

const pool = new pg.Pool({ connectionString: appUrl });

async function main() {
  const tenantId = process.env.DEFAULT_TENANT_ID;
  if (!tenantId) throw new Error('Missing DEFAULT_TENANT_ID');
  const userId = '11111111-1111-1111-1111-111111111111';
  const projectId = '22222222-2222-2222-2222-222222222222';

  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantId]);
    await client.query("SELECT set_config('app.current_user_id', $1, false)", [userId]);
    await client.query("SELECT set_config('app.current_role', $1, false)", ['admin']);

    // Ensure base tenant and user fixtures exist.
    await client.query(
      `INSERT INTO tenants (id, name, slug, plan, settings)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [tenantId, 'Smoke Tenant', `smoke-${tenantId.slice(0, 8)}`, 'starter', '{}'],
    );

    await client.query(
      `INSERT INTO users (id, email, name, password_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [userId, 'smoke-admin@example.com', 'Smoke Admin', 'x'],
    );

    await client.query(
      `INSERT INTO memberships (tenant_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [tenantId, userId, 'admin'],
    );

    // Ensure a project exists for this tenant and use its id as project_id.
    await client.query(
      `INSERT INTO projects (id, tenant_id, name, domain, settings)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [projectId, tenantId, 'Smoke Project', 'example.com', '{}'],
    );

    await client.query(
      `INSERT INTO project_memberships (tenant_id, project_id, user_id, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, project_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [tenantId, projectId, userId, 'admin'],
    );

    // Upsert a schedule row and then read it back under RLS.
    await client.query(
      `INSERT INTO schedules (tenant_id, id, flow_name, project_id, seed_keyword, cron, timezone, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (tenant_id, id) DO UPDATE SET updated_at = now()`,
      [tenantId, 'smoke', 'seo-content-pipeline', projectId, null, '*/5 * * * *', 'Asia/Taipei', true],
    );

    const rows = await client.query('SELECT id, enabled FROM schedules WHERE id = $1', ['smoke']);
    if (rows.rowCount !== 1) throw new Error('Schedule row not visible under RLS');

    // eslint-disable-next-line no-console
    console.log('Schedule smoke passed', rows.rows[0]);
  } finally {
    client.release();
    await pool.end();
  }
}

await main();
