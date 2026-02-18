import crypto from 'node:crypto';

import { env } from '../config/env.js';

export function requireEncryptionSecret(): string {
  if (!env.API_KEY_ENCRYPTION_SECRET || env.API_KEY_ENCRYPTION_SECRET.trim().length === 0) {
    const error = new Error('Encryption not configured');
    (error as Error & { statusCode: number }).statusCode = 500;
    throw error;
  }
  return env.API_KEY_ENCRYPTION_SECRET;
}

function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

export function base64Url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

export function encryptSecret(plaintext: string, secret: string): { ciphertext: string; iv: string; tag: string } {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]).toString('base64');
  const tag = cipher.getAuthTag().toString('base64');
  return { ciphertext, iv: iv.toString('base64'), tag };
}

export function decryptSecret(input: { ciphertext: string; iv: string; tag: string }, secret: string): string {
  const key = deriveKey(secret);
  const iv = Buffer.from(input.iv, 'base64');
  const tag = Buffer.from(input.tag, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(Buffer.from(input.ciphertext, 'base64')), decipher.final()]).toString('utf8');
}
