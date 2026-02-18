import { deleteBackupObject, listBackupObjects } from './s3.js';

export async function cleanupOldBackups(args: {
  bucket: string;
  prefix: string;
  retentionDays: number;
}): Promise<{ deleted: number; scanned: number }> {
  const cutoff = Date.now() - args.retentionDays * 24 * 60 * 60 * 1000;
  const objects = await listBackupObjects({ bucket: args.bucket, prefix: args.prefix });

  let deleted = 0;
  for (const obj of objects) {
    const ts = obj.lastModified?.getTime();
    if (!ts) continue;
    if (ts >= cutoff) continue;
    await deleteBackupObject({ bucket: args.bucket, key: obj.key });
    deleted += 1;
  }

  return { deleted, scanned: objects.length };
}
