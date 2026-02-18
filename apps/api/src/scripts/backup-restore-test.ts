import 'dotenv/config';

import { randomUUID } from 'node:crypto';

import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import { listBackupObjects } from '../backups/s3.js';
import { restoreBackupFromS3ToDatabase } from '../backups/restore.js';

function withDatabase(url: string, database: string) {
  const u = new URL(url);
  u.pathname = `/${database}`;
  return u.toString();
}

async function main() {
  if (!env.BACKUP_ENABLED) throw new Error('BACKUP_ENABLED is false');
  if (!env.BACKUP_S3_BUCKET) throw new Error('Missing BACKUP_S3_BUCKET');

  const adminUrl = env.DATABASE_URL_MIGRATION ?? env.DATABASE_URL;

  const testDb = `aiseo_restore_test_${randomUUID().slice(0, 8)}`;
  const restoreUrl = withDatabase(adminUrl, testDb);

  const client = await pool.connect();
  try {
    // Create temp DB
    await client.query(`CREATE DATABASE ${testDb}`);
  } finally {
    client.release();
  }

  const prefix = `${env.BACKUP_PREFIX}/db/`;
  const objects = await listBackupObjects({ bucket: env.BACKUP_S3_BUCKET, prefix });
  const latest = objects
    .filter((o) => !!o.lastModified)
    .sort((a, b) => (b.lastModified!.getTime() ?? 0) - (a.lastModified!.getTime() ?? 0))[0];

  if (!latest) {
    throw new Error(`No backup objects found under prefix ${prefix}`);
  }

  await restoreBackupFromS3ToDatabase({ bucket: env.BACKUP_S3_BUCKET, key: latest.key, restoreDatabaseUrl: restoreUrl });

  // Basic verification: can connect and query a known table.
  const verifyPool = new (await import('pg')).Pool({ connectionString: restoreUrl });
  try {
    const res = await verifyPool.query('SELECT COUNT(*)::int AS n FROM tenants');
    const n = Number(res.rows[0]?.n ?? 0);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, testDb, restoredKey: latest.key, tenants: n }, null, 2));
  } finally {
    await verifyPool.end();
  }

  if (!env.BACKUP_RESTORE_TEST_KEEP_DB) {
    const c2 = await pool.connect();
    try {
      // Terminate connections and drop DB
      await c2.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [testDb],
      );
      await c2.query(`DROP DATABASE ${testDb}`);
    } finally {
      c2.release();
    }
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
