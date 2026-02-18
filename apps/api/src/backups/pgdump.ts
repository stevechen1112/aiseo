import { createWriteStream } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createGzip } from 'node:zlib';

function spawnCrossPlatform(command: string, args: string[]) {
  const isCmd = /\.cmd$/i.test(command) || /\.bat$/i.test(command);
  if (process.platform === 'win32' && isCmd) {
    return spawn('cmd.exe', ['/c', command, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  }

  return spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

export type PgDumpResult = {
  filePath: string;
  contentType: string;
  filename: string;
};

function isoSafe(ts = new Date()) {
  return ts.toISOString().replace(/[:.]/g, '-');
}

export async function runPgDumpToGzipFile(args: {
  databaseUrl: string;
  pgDumpPath?: string;
  prefix?: string;
}): Promise<PgDumpResult> {
  const pgDumpPath = args.pgDumpPath ?? 'pg_dump';
  const prefix = args.prefix ?? 'aiseo';

  const dir = join(tmpdir(), 'aiseo-backups');
  await mkdir(dir, { recursive: true });

  const filename = `${prefix}-db-${isoSafe()}.sql.gz`;
  const filePath = join(dir, filename);

  const child = spawnCrossPlatform(pgDumpPath, ['--no-owner', '--no-privileges', '--format=plain', args.databaseUrl]);

  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr += d.toString();
  });

  const gz = createGzip({ level: 6 });
  const out = createWriteStream(filePath);

  const pipePromise = new Promise<void>((resolve, reject) => {
    child.on('error', reject);
    out.on('error', reject);
    gz.on('error', reject);

    out.on('finish', () => resolve());

    child.stdout.pipe(gz).pipe(out);
  });

  const exitCode: number = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 0));
  });

  if (exitCode !== 0) {
    await unlink(filePath).catch(() => {});
    const msg = stderr.trim() ? `pg_dump failed: ${stderr.trim()}` : `pg_dump failed with exit code ${exitCode}`;
    throw new Error(msg);
  }

  await pipePromise;

  return {
    filePath,
    contentType: 'application/gzip',
    filename,
  };
}
