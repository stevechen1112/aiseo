import 'dotenv/config';

import { env } from '../config/env.js';
import { listBackupObjects } from '../backups/s3.js';
import { restoreBackupFromS3ToDatabase } from '../backups/restore.js';

async function main() {
  if (!env.BACKUP_ENABLED) {
    throw new Error('BACKUP_ENABLED is false');
  }
  if (!env.BACKUP_S3_BUCKET) {
    throw new Error('Missing BACKUP_S3_BUCKET');
  }

  const restoreDatabaseUrl = env.BACKUP_RESTORE_DATABASE_URL;
  if (!restoreDatabaseUrl) {
    throw new Error('Missing BACKUP_RESTORE_DATABASE_URL');
  }

  const prefix = `${env.BACKUP_PREFIX}/db/`;
  const objects = await listBackupObjects({ bucket: env.BACKUP_S3_BUCKET, prefix });
  const latest = objects
    .filter((o) => !!o.lastModified)
    .sort((a, b) => (b.lastModified!.getTime() ?? 0) - (a.lastModified!.getTime() ?? 0))[0];

  if (!latest) {
    throw new Error(`No backup objects found under prefix ${prefix}`);
  }

  const res = await restoreBackupFromS3ToDatabase({
    bucket: env.BACKUP_S3_BUCKET,
    key: latest.key,
    restoreDatabaseUrl,
  });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(res, null, 2));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
