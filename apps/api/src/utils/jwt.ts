/**
 * Type-safe JWT helpers.
 *
 * Replaces the `jwt.verify(...) as any` pattern with a Zod-validated wrapper
 * that returns a properly typed payload or throws a descriptive error.
 */

import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { AppError } from './errors.js';

// ── JWT payload schemas ───────────────────────────────────────────

export const jwtPayloadSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
  tenantId: z.string(),
  role: z.enum(['admin', 'manager', 'analyst']),
  emailVerified: z.boolean().default(false),
  iat: z.number().optional(),
  exp: z.number().optional(),
});

export type JwtPayload = z.infer<typeof jwtPayloadSchema>;

export const refreshPayloadSchema = z.object({
  userId: z.string(),
  tenantId: z.string(),
  iat: z.number().optional(),
  exp: z.number().optional(),
});

export type RefreshPayload = z.infer<typeof refreshPayloadSchema>;

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Verify an access JWT and return a validated payload.
 * Throws AppError(401) on invalid/expired token or schema mismatch.
 */
export function verifyAccessToken(token: string, secret: string): JwtPayload {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, secret);
  } catch {
    throw new AppError('Invalid or expired token', 401);
  }

  const result = jwtPayloadSchema.safeParse(decoded);
  if (!result.success) {
    throw new AppError('Malformed token payload', 401);
  }
  return result.data;
}

/**
 * Verify a refresh JWT and return a validated payload.
 * Throws AppError(401) on invalid/expired token or schema mismatch.
 */
export function verifyRefreshToken(token: string, secret: string): RefreshPayload {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, secret);
  } catch {
    throw new AppError('Invalid or expired refresh token', 401);
  }

  const result = refreshPayloadSchema.safeParse(decoded);
  if (!result.success) {
    throw new AppError('Malformed refresh token payload', 401);
  }
  return result.data;
}

/**
 * Sign an access JWT.
 */
export function signAccessToken(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  secret: string,
  expiresIn: string | number = '1h',
): string {
  return jwt.sign(payload as object, secret, { expiresIn } as jwt.SignOptions);
}

/**
 * Sign a refresh JWT.
 */
export function signRefreshToken(
  payload: Omit<RefreshPayload, 'iat' | 'exp'>,
  secret: string,
  expiresIn: string | number = '7d',
): string {
  return jwt.sign(payload as object, secret, { expiresIn } as jwt.SignOptions);
}
