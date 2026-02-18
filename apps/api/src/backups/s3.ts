import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  GetObjectCommand,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { env } from '../config/env.js';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';

function isReadableStream(value: unknown): value is Readable {
  return !!value && typeof value === 'object' && typeof (value as any).pipe === 'function';
}

export type BackupObject = {
  key: string;
  lastModified: Date | undefined;
  size: number | undefined;
};

function required(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) throw new Error(`Missing ${name}`);
  return value;
}

export function createBackupS3Client() {
  const endpoint = env.BACKUP_S3_ENDPOINT;
  const accessKeyId = env.BACKUP_S3_ACCESS_KEY_ID;
  const secretAccessKey = env.BACKUP_S3_SECRET_ACCESS_KEY;

  const forcePathStyle =
    typeof env.BACKUP_S3_FORCE_PATH_STYLE === 'boolean'
      ? env.BACKUP_S3_FORCE_PATH_STYLE
      : !!endpoint; // default true for MinIO-like endpoints

  return new S3Client({
    region: env.BACKUP_S3_REGION,
    endpoint,
    forcePathStyle,
    credentials:
      accessKeyId && secretAccessKey
        ? {
            accessKeyId: required('BACKUP_S3_ACCESS_KEY_ID', accessKeyId),
            secretAccessKey: required('BACKUP_S3_SECRET_ACCESS_KEY', secretAccessKey),
          }
        : undefined,
  });
}

export async function putBackupObject(args: {
  bucket: string;
  key: string;
  body: PutObjectCommandInput['Body'];
  contentType: string;
  metadata?: Record<string, string>;
}): Promise<{ etag: string | undefined }> {
  const s3 = createBackupS3Client();

  const sseEnabled =
    typeof env.BACKUP_S3_SSE === 'boolean'
      ? env.BACKUP_S3_SSE
      : !env.BACKUP_S3_ENDPOINT; // default true for AWS, off for custom endpoints (e.g., MinIO)

  const res = await s3.send(
    new PutObjectCommand({
      Bucket: args.bucket,
      Key: args.key,
      Body: args.body,
      ContentType: args.contentType,
      Metadata: args.metadata,
      ...(sseEnabled ? { ServerSideEncryption: 'AES256' } : {}),
    }),
  );
  await s3.destroy();
  return { etag: res.ETag };
}

export async function listBackupObjects(args: {
  bucket: string;
  prefix: string;
}): Promise<BackupObject[]> {
  const s3 = createBackupS3Client();
  const out: BackupObject[] = [];

  let continuationToken: string | undefined;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: args.bucket,
        Prefix: args.prefix,
        ContinuationToken: continuationToken,
      }),
    );

    for (const item of res.Contents ?? []) {
      if (!item.Key) continue;
      out.push({ key: item.Key, lastModified: item.LastModified, size: item.Size });
    }

    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);

  await s3.destroy();
  return out;
}

export async function deleteBackupObject(args: { bucket: string; key: string }) {
  const s3 = createBackupS3Client();
  await s3.send(new DeleteObjectCommand({ Bucket: args.bucket, Key: args.key }));
  await s3.destroy();
}

export async function downloadBackupObjectToFile(args: {
  bucket: string;
  key: string;
  filePath: string;
}): Promise<{ contentType: string | undefined; sizeBytes: number | undefined }> {
  const s3 = createBackupS3Client();
  const res = await s3.send(new GetObjectCommand({ Bucket: args.bucket, Key: args.key }));
  const body = res.Body;
  if (!isReadableStream(body)) {
    await s3.destroy();
    throw new Error('Unexpected S3 response body type');
  }

  const ws = createWriteStream(args.filePath);
  const sizeBytes = res.ContentLength;

  await pipeline(body as unknown as Readable, ws);

  await s3.destroy();
  return { contentType: res.ContentType, sizeBytes };
}
