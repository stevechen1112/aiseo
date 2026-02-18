import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: (() => {
    const raw = env.DATABASE_URL;
    try {
      const url = new URL(raw);
      if (url.hostname === 'localhost') {
        url.hostname = '127.0.0.1';
        return url.toString();
      }
    } catch {
      // If DATABASE_URL isn't a valid URL for some reason, fall back to raw.
    }
    return raw;
  })(),
  // PERF-04: Bound the pool to avoid overwhelming PostgreSQL (default was unlimited).
  // Align with PostgreSQL's max_connections (typically 100–200 for managed instances).
  // Rule of thumb: (num_cores * 2) + effective_spindle_count, capped at ~20 for API workers.
  max: 20,
  // Release idle connections after 30 seconds to avoid holding on to DB resources.
  idleTimeoutMillis: 30_000,
  // Fail fast if a connection cannot be acquired within 5 seconds.
  connectionTimeoutMillis: 5_000,
});

export async function setTenantContext(client: pg.PoolClient, tenantId: string) {
  await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantId]);
}

export async function setAuthContext(
  client: pg.PoolClient,
  ctx: {
    tenantId: string;
    userId?: string;
    role?: string;
  },
) {
  await setTenantContext(client, ctx.tenantId);

  if (ctx.userId) {
    await client.query("SELECT set_config('app.current_user_id', $1, false)", [ctx.userId]);
  }
  if (ctx.role) {
    await client.query("SELECT set_config('app.current_role', $1, false)", [ctx.role]);
  }
}
