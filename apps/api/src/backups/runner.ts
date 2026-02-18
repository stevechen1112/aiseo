import { createReadStream } from 'node:fs';
import { stat, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';

import { env } from '../config/env.js';
import { pool } from '../db/pool.js';

import { runPgDumpToGzipFile } from './pgdump.js';
import { cleanupOldBackups } from './retention.js';
import { putBackupObject } from './s3.js';

function getAdminDatabaseUrl() {
  return env.DATABASE_URL_MIGRATION ?? env.DATABASE_URL;
}

function toDatePath(d = new Date()) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function sha256OfFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const rs = createReadStream(path);
    rs.on('error', reject);
    rs.on('data', (chunk) => hash.update(chunk));
    rs.on('end', () => resolve());
  });
  return hash.digest('hex');
}

export async function runAutomatedBackupOnce(): Promise<{
  ok: true;
  bucket: string;
  key: string;
  sizeBytes: number;
  sha256: string;
  retention: { scanned: number; deleted: number };
}> {
  if (!env.BACKUP_ENABLED) {
    throw new Error('BACKUP_ENABLED is false');
  }

  const bucket = env.BACKUP_S3_BUCKET;
  if (!bucket) {
    throw new Error('Missing BACKUP_S3_BUCKET');
  }

  const dump = await runPgDumpToGzipFile({
    databaseUrl: getAdminDatabaseUrl(),
    pgDumpPath: env.BACKUP_PGDUMP_PATH,
    prefix: 'aiseo',
  });

  try {
    const fileStat = await stat(dump.filePath);
    const sizeBytes = fileStat.size;
    const sha256 = await sha256OfFile(dump.filePath);

    const key = `${env.BACKUP_PREFIX}/db/${toDatePath()}/${dump.filename}`;

    await putBackupObject({
      bucket,
      key,
      body: createReadStream(dump.filePath),
      contentType: dump.contentType,
      metadata: {
        sha256,
        kind: 'pg_dump',
      },
    });

    // Record run (best-effort)
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO backup_runs (kind, status, bucket, object_key, content_type, size_bytes, sha256)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        ['pg_dump', 'ok', bucket, key, dump.contentType, String(sizeBytes), sha256],
      );
    } finally {
      client.release();
    }

    const retention = await cleanupOldBackups({
      bucket,
      prefix: `${env.BACKUP_PREFIX}/db/`,
      retentionDays: env.BACKUP_RETENTION_DAYS,
    });

    return { ok: true, bucket, key, sizeBytes, sha256, retention };
  } catch (error) {
    // Record failure (best-effort)
    const bucket = env.BACKUP_S3_BUCKET ?? 'unknown';
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO backup_runs (kind, status, bucket, object_key, error)
         VALUES ($1, $2, $3, $4, $5)`,
        ['pg_dump', 'error', bucket, '', error instanceof Error ? error.message : String(error)],
      );
    } catch {
      // ignore
    } finally {
      client.release();
    }
    throw error;
  } finally {
    await unlink(dump.filePath).catch(() => {});
  }
}
