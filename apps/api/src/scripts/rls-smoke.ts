import 'dotenv/config';

import pg from 'pg';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

async function withClient<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function main() {
  const adminUrl = requireEnv('DATABASE_URL_MIGRATION');
  const appUrl = requireEnv('DATABASE_URL');

  const adminPool = new pg.Pool({ connectionString: adminUrl });
  const appPool = new pg.Pool({ connectionString: appUrl });

  const setup = await withClient(adminPool, async (client) => {
    await client.query('TRUNCATE TABLE schedules, keywords, project_memberships, projects, memberships, users, tenants RESTART IDENTITY CASCADE');

    const t1 = await client.query(
      'INSERT INTO tenants (id, name, slug, plan, settings) VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id',
      ['Tenant One', 'tenant-one', 'starter', '{}'],
    );
    const t2 = await client.query(
      'INSERT INTO tenants (id, name, slug, plan, settings) VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id',
      ['Tenant Two', 'tenant-two', 'starter', '{}'],
    );

    const tenant1Id = t1.rows[0].id as string;
    const tenant2Id = t2.rows[0].id as string;

    const u1 = await client.query(
      'INSERT INTO users (id, email, name, password_hash) VALUES (gen_random_uuid(), $1, $2, $3) RETURNING id',
      ['rls-t1@example.com', 'RLS Tenant1', 'x'],
    );
    const u2 = await client.query(
      'INSERT INTO users (id, email, name, password_hash) VALUES (gen_random_uuid(), $1, $2, $3) RETURNING id',
      ['rls-t2@example.com', 'RLS Tenant2', 'x'],
    );

    const user1Id = u1.rows[0].id as string;
    const user2Id = u2.rows[0].id as string;

    await client.query(
      'INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, $3)',
      [tenant1Id, user1Id, 'admin'],
    );
    await client.query(
      'INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, $3)',
      [tenant2Id, user2Id, 'admin'],
    );

    const p1 = await client.query(
      'INSERT INTO projects (id, tenant_id, name, domain, settings) VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id',
      [tenant1Id, 'P1', 'example.com', '{}'],
    );
    const p2 = await client.query(
      'INSERT INTO projects (id, tenant_id, name, domain, settings) VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id',
      [tenant2Id, 'P2', 'example.org', '{}'],
    );

    const project1Id = p1.rows[0].id as string;
    const project2Id = p2.rows[0].id as string;

    await client.query(
      'INSERT INTO project_memberships (tenant_id, project_id, user_id, role) VALUES ($1, $2, $3, $4)',
      [tenant1Id, project1Id, user1Id, 'admin'],
    );
    await client.query(
      'INSERT INTO project_memberships (tenant_id, project_id, user_id, role) VALUES ($1, $2, $3, $4)',
      [tenant2Id, project2Id, user2Id, 'admin'],
    );

    await client.query('INSERT INTO keywords (id, project_id, keyword) VALUES (gen_random_uuid(), $1, $2)', [project1Id, 'alpha']);
    await client.query('INSERT INTO keywords (id, project_id, keyword) VALUES (gen_random_uuid(), $1, $2)', [project2Id, 'beta']);

    return { tenant1Id, tenant2Id, user1Id, user2Id, project1Id, project2Id };
  });

  const assertions = await withClient(appPool, async (client) => {
    // Tenant 1 context
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [setup.tenant1Id]);
    await client.query("SELECT set_config('app.current_user_id', $1, false)", [setup.user1Id]);
    await client.query("SELECT set_config('app.current_role', $1, false)", ['admin']);

    // Cross-tenant writes MUST be denied.
    // 1) Insert a project for tenant2 while in tenant1 context.
    let deniedProjectInsert = false;
    try {
      await client.query(
        'INSERT INTO projects (id, tenant_id, name, domain, settings) VALUES (gen_random_uuid(), $1, $2, $3, $4)',
        [setup.tenant2Id, 'X-Tenant Project', 'evil.example', '{}'],
      );
    } catch {
      deniedProjectInsert = true;
    }

    // 2) Update tenant_id of an existing tenant1 project to tenant2.
    let deniedProjectUpdate = false;
    try {
      await client.query('UPDATE projects SET tenant_id = $2 WHERE id = $1', [setup.project1Id, setup.tenant2Id]);
    } catch {
      deniedProjectUpdate = true;
    }

    // 3) Insert a keyword into tenant2's project while in tenant1 context.
    let deniedKeywordInsert = false;
    try {
      await client.query('INSERT INTO keywords (id, project_id, keyword) VALUES (gen_random_uuid(), $1, $2)', [
        setup.project2Id,
        'gamma',
      ]);
    } catch {
      deniedKeywordInsert = true;
    }

    // 4) Insert schedule with tenant1 tenant_id but tenant2 project_id (should be denied).
    let deniedScheduleCrossProject = false;
    try {
      await client.query(
        'INSERT INTO schedules (tenant_id, id, flow_name, project_id, seed_keyword, cron, timezone, enabled) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [setup.tenant1Id, 's1', 'seo-content-pipeline', setup.project2Id, 'aiseo', '0 0 * * *', 'UTC', true],
      );
    } catch {
      deniedScheduleCrossProject = true;
    }

    // 5) Insert schedule with mismatched tenant_id (should be denied).
    let deniedScheduleTenantMismatch = false;
    try {
      await client.query(
        'INSERT INTO schedules (tenant_id, id, flow_name, project_id, seed_keyword, cron, timezone, enabled) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [setup.tenant2Id, 's2', 'seo-content-pipeline', setup.project1Id, 'aiseo', '0 0 * * *', 'UTC', true],
      );
    } catch {
      deniedScheduleTenantMismatch = true;
    }

    const t1Projects = await client.query('SELECT id, tenant_id FROM projects ORDER BY id');
    const t1Keywords = await client.query(
      'SELECT k.keyword, p.tenant_id FROM keywords k JOIN projects p ON p.id = k.project_id ORDER BY k.keyword',
    );

    // Attempt to reach tenant2 project by primary key should return 0 rows under RLS.
    const forbiddenProject = await client.query('SELECT id FROM projects WHERE id = $1', [setup.project2Id]);

    // Tenant 2 context
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [setup.tenant2Id]);
    await client.query("SELECT set_config('app.current_user_id', $1, false)", [setup.user2Id]);
    await client.query("SELECT set_config('app.current_role', $1, false)", ['admin']);

    const t2Projects = await client.query('SELECT id, tenant_id FROM projects ORDER BY id');
    const t2Keywords = await client.query(
      'SELECT k.keyword, p.tenant_id FROM keywords k JOIN projects p ON p.id = k.project_id ORDER BY k.keyword',
    );

    return {
      t1Projects: t1Projects.rows,
      t1Keywords: t1Keywords.rows,
      forbiddenProject: forbiddenProject.rows,
      deniedProjectInsert,
      deniedProjectUpdate,
      deniedKeywordInsert,
      deniedScheduleCrossProject,
      deniedScheduleTenantMismatch,
      t2Projects: t2Projects.rows,
      t2Keywords: t2Keywords.rows,
    };
  });

  if (assertions.forbiddenProject.length !== 0) {
    throw new Error('RLS failure: tenant1 can read tenant2 project by id');
  }

  if (assertions.t1Projects.length !== 1 || assertions.t2Projects.length !== 1) {
    throw new Error('RLS failure: unexpected project visibility');
  }

  if (assertions.t1Keywords.length !== 1 || assertions.t2Keywords.length !== 1) {
    throw new Error('RLS failure: unexpected keyword visibility');
  }

  if (!assertions.deniedProjectInsert) {
    throw new Error('RLS failure: cross-tenant project INSERT was allowed');
  }

  if (!assertions.deniedProjectUpdate) {
    throw new Error('RLS failure: cross-tenant project UPDATE was allowed');
  }

  if (!assertions.deniedKeywordInsert) {
    throw new Error('RLS failure: cross-tenant keyword INSERT was allowed');
  }

  if (!assertions.deniedScheduleCrossProject) {
    throw new Error('RLS failure: schedule INSERT with cross-tenant project_id was allowed');
  }

  if (!assertions.deniedScheduleTenantMismatch) {
    throw new Error('RLS failure: schedule INSERT with mismatched tenant_id was allowed');
  }

  console.log('RLS smoke test passed');

  await adminPool.end();
  await appPool.end();
}

await main();
