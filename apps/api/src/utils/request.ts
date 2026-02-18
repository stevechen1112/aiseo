/**
 * Common request-level helpers shared across all route files.
 */
import type { PoolClient } from 'pg';

import { AppError } from './errors.js';

/**
 * requireDb — asserts that the request has an attached DB client (injected by
 * the tenant RLS middleware). Throws AppError(500) if not available so callers
 * don't need to repeat the same inline guard.
 *
 * @example
 *   const db = await requireDb(req);
 *   const rows = await db.query('SELECT ...');
 */
export async function requireDb(req: { dbClient?: PoolClient }): Promise<PoolClient> {
  if (!req.dbClient) {
    throw new AppError('Database connection not available', 500);
  }
  return req.dbClient;
}

/**
 * resolveDefaultProjectId — returns the most recently updated project for the
 * current tenant, or throws AppError(404) if none exists.
 * Re-exported here so every route can import from one place.
 */
export async function resolveDefaultProjectId(client: PoolClient): Promise<string> {
  const row = await client.query(
    'SELECT id FROM projects ORDER BY updated_at DESC, created_at DESC LIMIT 1',
  );
  if (!row.rowCount || row.rowCount === 0) {
    throw AppError.notFound('No project found for tenant');
  }
  return String(row.rows[0].id);
}
