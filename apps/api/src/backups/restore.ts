import { createReadStream } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createGunzip } from 'node:zlib';

import { env } from '../config/env.js';
import { downloadBackupObjectToFile } from './s3.js';

function isoSafe(ts = new Date()) {
  return ts.toISOString().replace(/[:.]/g, '-');
}

function spawnCrossPlatform(command: string, args: string[]) {
  const isCmd = /\.cmd$/i.test(command) || /\.bat$/i.test(command);
  if (process.platform === 'win32' && isCmd) {
    return spawn('cmd.exe', ['/c', command, ...args], {
      stdio: ['pipe', 'inherit', 'inherit'],
      windowsHide: true,
    });
  }

  return spawn(command, args, {
    stdio: ['pipe', 'inherit', 'inherit'],
    windowsHide: true,
  });
}

export async function restoreBackupFromS3ToDatabase(args: {
  bucket: string;
  key: string;
  restoreDatabaseUrl: string;
}): Promise<{ ok: true; bucket: string; key: string; restoredTo: string }> {
  const dir = join(tmpdir(), 'aiseo-backups-restore');
  await mkdir(dir, { recursive: true });
  const gzPath = join(dir, `restore-${isoSafe()}.sql.gz`);

  await downloadBackupObjectToFile({ bucket: args.bucket, key: args.key, filePath: gzPath });

  try {
    // Feed gunzipped SQL into psql stdin.
    const psql = spawnCrossPlatform(env.BACKUP_PSQL_PATH, [args.restoreDatabaseUrl]);

    const gunzip = createGunzip();
    const rs = createReadStream(gzPath);

    const finished = new Promise<void>((resolve, reject) => {
      psql.on('error', reject);
      psql.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`psql failed with exit code ${code ?? -1}`));
      });
    });

    rs.pipe(gunzip).pipe(psql.stdin);

    await finished;

    return { ok: true, bucket: args.bucket, key: args.key, restoredTo: args.restoreDatabaseUrl };
  } finally {
    await unlink(gzPath).catch(() => {});
  }
}
