import 'dotenv/config';

import { Queue, Worker } from 'bullmq';
import { createRedisConnection } from '@aiseo/core';

import { env } from '../config/env.js';
import { runAutomatedBackupOnce } from '../backups/runner.js';

const redis = createRedisConnection({ url: env.REDIS_URL });

const maintenanceQueue = new Queue('maintenance', { connection: redis, prefix: 'aiseo' });

async function ensureRepeatableBackupJob() {
  if (!env.BACKUP_ENABLED) {
    return;
  }
  if (!env.BACKUP_S3_BUCKET) {
    throw new Error('BACKUP_ENABLED=true but BACKUP_S3_BUCKET is missing');
  }

  await maintenanceQueue.add(
    'db-backup',
    { kind: 'pg_dump' },
    {
      jobId: 'db-backup-daily',
      repeat: {
        pattern: env.BACKUP_CRON,
        tz: env.BACKUP_TZ ?? undefined,
      },
      removeOnComplete: true,
      removeOnFail: 50,
    },
  );
}

async function main() {
  await ensureRepeatableBackupJob();

  const worker = new Worker(
    maintenanceQueue.name,
    async (job) => {
      if (job.name !== 'db-backup') {
        return { ok: true, ignored: true, jobName: job.name };
      }

      const result = await runAutomatedBackupOnce();
      return result;
    },
    { connection: redis, prefix: 'aiseo' },
  );

  worker.on('failed', (job, err) => {
    // eslint-disable-next-line no-console
    console.error('[backup-worker] job failed', { id: job?.id, name: job?.name, err: err?.message });
  });

  // eslint-disable-next-line no-console
  console.log('[backup-worker] ready', {
    enabled: env.BACKUP_ENABLED,
    cron: env.BACKUP_CRON,
    tz: env.BACKUP_TZ ?? null,
    bucket: env.BACKUP_S3_BUCKET ?? null,
    prefix: env.BACKUP_PREFIX,
    retentionDays: env.BACKUP_RETENTION_DAYS,
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[backup-worker] fatal', err);
  process.exit(1);
});
