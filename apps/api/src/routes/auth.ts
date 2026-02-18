import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';

import { env } from '../config/env.js';
import { createEmailService } from '@aiseo/core';
import { setAuthContext } from '../db/pool.js';
import {
  signAccessToken as jwtSignAccess,
  signRefreshToken as jwtSignRefresh,
  verifyAccessToken as jwtVerifyAccess,
  verifyRefreshToken as jwtVerifyRefresh,
  requireDb,
  AppError,
} from '../utils/index.js';

// ── Env / secrets ──────────────────────────────────────────────────
const JWT_SECRET = env.JWT_SECRET;
const JWT_REFRESH_SECRET = env.JWT_REFRESH_SECRET;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const SALT_ROUNDS = 12;
const REQUIRE_EMAIL_VERIFICATION = env.NODE_ENV === 'production';

// ── Helpers ────────────────────────────────────────────────────────
function signAccessToken(payload: { userId: string; email: string; tenantId: string; role: 'admin' | 'manager' | 'analyst'; emailVerified: boolean }) {
  return jwtSignAccess(payload, JWT_SECRET, ACCESS_TOKEN_EXPIRY);
}

function signRefreshToken(payload: { userId: string; tenantId: string }) {
  return jwtSignRefresh(payload, JWT_REFRESH_SECRET, REFRESH_TOKEN_EXPIRY);
}

function verifyAccessToken(token: string) {
  return jwtVerifyAccess(token, JWT_SECRET);
}

function verifyRefreshToken(token: string) {
  return jwtVerifyRefresh(token, JWT_REFRESH_SECRET);
}

// ── Validation schemas ─────────────────────────────────────────────
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(200),
  tenantName: z.string().min(1).max(200).optional(),
  tenantSlug: z.string().min(1).max(100).optional(),
  projectDomain: z.string().min(1).max(255).optional(),
});

function createEmailVerificationToken(ttlHours = 24) {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  return { token, tokenHash, expiresAt };
}

function normalizeSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-/, '')
    .replace(/-$/, '');
}

// ── Routes ─────────────────────────────────────────────────────────
export const authRoutes: FastifyPluginAsync = async (fastify) => {
  const authUserSchema = {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      email: { type: 'string', format: 'email' },
      name: { type: 'string' },
      tenantId: { type: 'string', format: 'uuid' },
      projectId: { type: 'string' },
      role: { type: 'string' },
    },
    required: ['id', 'email', 'name', 'tenantId', 'projectId', 'role'],
    additionalProperties: true,
  } as const;

  const authResponseSchema = {
    type: 'object',
    properties: {
      ok: { type: 'boolean' },
      token: { type: 'string' },
      refreshToken: { type: 'string' },
      user: authUserSchema,
    },
    required: ['ok', 'token', 'refreshToken', 'user'],
    additionalProperties: true,
  } as const;

  /**
   * POST /api/auth/register
   * Creates a new user + auto-creates a personal tenant + membership.
   */
  fastify.post(
    '/api/auth/register',
    {
      schema: {
        tags: ['auth'],
        body: {
          type: 'object',
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
            name: { type: 'string', minLength: 1, maxLength: 200 },
            tenantName: { type: 'string' },
            tenantSlug: { type: 'string' },
            projectDomain: { type: 'string' },
          },
          required: ['email', 'password', 'name'],
          additionalProperties: false,
        },
        response: {
          200: authResponseSchema,
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const input = registerSchema.parse(req.body ?? {});

    await client.query('BEGIN');

    let user: { id: string; email: string; name: string };
    let tenantId: string;
    let projectId: string;
    const verification = createEmailVerificationToken();

    try {
      // Check if user already exists
      const existing = await client.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [input.email]);
      if ((existing.rowCount ?? 0) > 0) {
        const error = new Error('Email already registered');
        (error as Error & { statusCode: number }).statusCode = 409;
        throw error;
      }

      const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

      // Create user
      const userRow = await client.query(
        `INSERT INTO users (email, name, password_hash, email_verification_token_hash, email_verification_expires_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, name, created_at`,
        [input.email, input.name, passwordHash, verification.tokenHash, verification.expiresAt],
      );
      user = userRow.rows[0] as { id: string; email: string; name: string };

      // Create personal tenant
      const slugFromEmail = normalizeSlug(input.email.split('@')[0] ?? 'workspace') || 'workspace';
      const desiredSlug = input.tenantSlug ? normalizeSlug(input.tenantSlug) : slugFromEmail;
      const tenantRow = await client.query(`INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id`, [
        input.tenantName?.trim() || `${input.name}'s Workspace`,
        desiredSlug,
      ]);
      tenantId = String(tenantRow.rows[0].id);

      // RLS tables (projects/keywords/...) require tenant context to be set.
      await setAuthContext(client, { tenantId, userId: user.id, role: 'admin' });

      // Create membership as admin
      await client.query(`INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'admin')`, [tenantId, user.id]);

      // Create default project
      const projectRow = await client.query(
        `INSERT INTO projects (tenant_id, name, domain) VALUES ($1, $2, $3) RETURNING id`,
        [tenantId, 'My First Project', input.projectDomain?.trim() || 'example.com'],
      );
      projectId = String(projectRow.rows[0].id);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    // Sign tokens (emailVerified=false until verification)
    const accessToken = signAccessToken({
      userId: user.id,
      email: user.email,
      tenantId,
      role: 'admin',
      emailVerified: false,
    });
    const refreshToken = signRefreshToken({ userId: user.id, tenantId });

    // Send email verification (best-effort).
    try {
      const origin = typeof req.headers.origin === 'string' && req.headers.origin.trim().length > 0
        ? req.headers.origin.trim().replace(/\/$/, '')
        : 'http://127.0.0.1:3000';
      const verifyUrl = `${origin}/verify-email?token=${encodeURIComponent(verification.token)}`;

      const email = createEmailService({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
        from: env.SMTP_FROM,
      });

      await email.send({
        to: user.email,
        subject: 'Verify your email',
        text: `Welcome to AISEO. Verify your email: ${verifyUrl}`,
        html: `<p>Welcome to AISEO.</p><p><a href="${verifyUrl}">Verify your email</a></p>`,
      });
    } catch (err) {
      req.log?.warn?.({ err }, 'Failed to send verification email');
    }

    return {
      ok: true,
      token: accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        tenantId,
        projectId,
        role: 'admin',
      },
    };
    },
  );

  /**
   * GET /api/auth/verify-email?token=...
   * Marks the user's email as verified.
   */
  fastify.get(
    '/api/auth/verify-email',
    {
      schema: {
        tags: ['auth'],
        querystring: {
          type: 'object',
          properties: {
            token: { type: 'string', minLength: 1 },
          },
          required: ['token'],
          additionalProperties: false,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              alreadyVerified: { type: 'boolean' },
            },
            required: ['ok'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const token = typeof (req.query as any)?.token === 'string' ? String((req.query as any).token) : '';
    if (!token) {
      const error = new Error('Missing token');
      (error as Error & { statusCode: number }).statusCode = 400;
      throw error;
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const row = await client.query(
      `SELECT id, email_verified_at, email_verification_expires_at
       FROM users
       WHERE email_verification_token_hash = $1
       LIMIT 1`,
      [tokenHash],
    );

    if ((row.rowCount ?? 0) === 0) {
      const error = new Error('Invalid token');
      (error as Error & { statusCode: number }).statusCode = 400;
      throw error;
    }

    const user = row.rows[0] as { id: string; email_verified_at: Date | null; email_verification_expires_at: Date | null };
    if (user.email_verified_at) {
      return { ok: true, alreadyVerified: true };
    }
    if (!user.email_verification_expires_at || user.email_verification_expires_at.getTime() < Date.now()) {
      const error = new Error('Token expired');
      (error as Error & { statusCode: number }).statusCode = 400;
      throw error;
    }

    await client.query(
      `UPDATE users
       SET email_verified_at = NOW(),
           email_verification_token_hash = NULL,
           email_verification_expires_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [user.id],
    );

    return { ok: true };
    },
  );

  /**
   * POST /api/auth/resend-verification
   * Re-sends a verification email if the account exists and is not verified.
   */
  fastify.post(
    '/api/auth/resend-verification',
    {
      schema: {
        tags: ['auth'],
        body: {
          type: 'object',
          properties: {
            email: { type: 'string', format: 'email' },
          },
          required: ['email'],
          additionalProperties: false,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              alreadyVerified: { type: 'boolean' },
            },
            required: ['ok'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const input = z.object({ email: z.string().email() }).parse(req.body ?? {});

    const row = await client.query(
      `SELECT id, email, email_verified_at
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [input.email],
    );

    // Always respond with ok to avoid account enumeration.
    if ((row.rowCount ?? 0) === 0) {
      return { ok: true };
    }

    const user = row.rows[0] as { id: string; email: string; email_verified_at: Date | null };
    if (user.email_verified_at) {
      return { ok: true, alreadyVerified: true };
    }

    const verification = createEmailVerificationToken();
    await client.query(
      `UPDATE users
       SET email_verification_token_hash = $2,
           email_verification_expires_at = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [user.id, verification.tokenHash, verification.expiresAt],
    );

    try {
      const origin = typeof req.headers.origin === 'string' && req.headers.origin.trim().length > 0
        ? req.headers.origin.trim().replace(/\/$/, '')
        : 'http://127.0.0.1:3000';
      const verifyUrl = `${origin}/verify-email?token=${encodeURIComponent(verification.token)}`;

      const email = createEmailService({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
        from: env.SMTP_FROM,
      });

      await email.send({
        to: user.email,
        subject: 'Verify your email',
        text: `Verify your email: ${verifyUrl}`,
        html: `<p><a href="${verifyUrl}">Verify your email</a></p>`,
      });
    } catch (err) {
      req.log?.warn?.({ err }, 'Failed to resend verification email');
    }

    return { ok: true };
    },
  );

  /**
   * POST /api/auth/login
   * Validates email/password, returns JWT access + refresh token.
   */
  fastify.post(
    '/api/auth/login',
    {
      schema: {
        tags: ['auth'],
        body: {
          type: 'object',
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 1 },
          },
          required: ['email', 'password'],
          additionalProperties: false,
        },
        response: {
          200: authResponseSchema,
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const input = loginSchema.parse(req.body ?? {});

    // Find user by email
    const userRow = await client.query(
      'SELECT id, email, name, password_hash, email_verified_at FROM users WHERE email = $1 LIMIT 1',
      [input.email],
    );

    if ((userRow.rowCount ?? 0) === 0) {
      const error = new Error('Invalid email or password');
      (error as Error & { statusCode: number }).statusCode = 401;
      throw error;
    }

    const user = userRow.rows[0] as {
      id: string;
      email: string;
      name: string;
      password_hash: string;
      email_verified_at: Date | null;
    };

    // Verify password
    const valid = await bcrypt.compare(input.password, user.password_hash);
        if (REQUIRE_EMAIL_VERIFICATION && !user.email_verified_at) {
          const error = new Error('Email not verified');
          (error as Error & { statusCode: number }).statusCode = 403;
          throw error;
        }
    if (!valid) {
      const error = new Error('Invalid email or password');
      (error as Error & { statusCode: number }).statusCode = 401;
      throw error;
    }

    // Get membership (first tenant)
    const membershipRow = await client.query(
      'SELECT tenant_id, role FROM memberships WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1',
      [user.id],
    );

    if ((membershipRow.rowCount ?? 0) === 0) {
      const error = new Error('User has no tenant membership');
      (error as Error & { statusCode: number }).statusCode = 403;
      throw error;
    }

    const membership = membershipRow.rows[0] as { tenant_id: string; role: string };

    // Block disabled/deleted tenants.
    const tenantRow = await client.query('SELECT status FROM tenants WHERE id = $1 LIMIT 1', [membership.tenant_id]);
    if ((tenantRow.rowCount ?? 0) === 0) {
      const error = new Error('Tenant not found');
      (error as Error & { statusCode: number }).statusCode = 403;
      throw error;
    }
    const tenantStatus = String((tenantRow.rows[0] as any).status ?? 'active');
    if (tenantStatus !== 'active') {
      const error = new Error('Tenant is disabled');
      (error as Error & { statusCode: number }).statusCode = 403;
      throw error;
    }

    // Ensure RLS applies for project lookups.
    await setAuthContext(client, { tenantId: membership.tenant_id, userId: user.id, role: membership.role });

    // Get default project for tenant
    const projectRow = await client.query(
      'SELECT id FROM projects WHERE tenant_id = $1 ORDER BY updated_at DESC, created_at DESC LIMIT 1',
      [membership.tenant_id],
    );
    const projectId = (projectRow.rowCount ?? 0) > 0 ? String(projectRow.rows[0].id) : '';

    // Sign tokens
    const accessToken = signAccessToken({
      userId: user.id,
      email: user.email,
      tenantId: membership.tenant_id,
      role: membership.role as 'admin' | 'manager' | 'analyst',
      emailVerified: !!user.email_verified_at,
    });
    const refreshToken = signRefreshToken({ userId: user.id, tenantId: membership.tenant_id });

    return {
      ok: true,
      token: accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        tenantId: membership.tenant_id,
        projectId,
        role: membership.role,
      },
    };
    },
  );

  /**
   * POST /api/auth/refresh
   * Validates refresh token, returns new access + refresh token pair.
   */
  fastify.post(
    '/api/auth/refresh',
    {
      schema: {
        tags: ['auth'],
        body: {
          type: 'object',
          properties: {
            refreshToken: { type: 'string', minLength: 1 },
          },
          required: ['refreshToken'],
          additionalProperties: false,
        },
        response: {
          200: authResponseSchema,
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const input = refreshSchema.parse(req.body ?? {});

    let decoded: { userId: string };
    try {
      decoded = verifyRefreshToken(input.refreshToken);
    } catch {
      const error = new Error('Invalid or expired refresh token');
      (error as Error & { statusCode: number }).statusCode = 401;
      throw error;
    }

    // Look up user
    const userRow = await client.query(
      'SELECT id, email, name, email_verified_at FROM users WHERE id = $1 LIMIT 1',
      [decoded.userId],
    );

    if ((userRow.rowCount ?? 0) === 0) {
      const error = new Error('User not found');
      (error as Error & { statusCode: number }).statusCode = 401;
      throw error;
    }

    const user = userRow.rows[0] as { id: string; email: string; name: string; email_verified_at: Date | null };

    if (REQUIRE_EMAIL_VERIFICATION && !user.email_verified_at) {
      const error = new Error('Email not verified');
      (error as Error & { statusCode: number }).statusCode = 403;
      throw error;
    }

    // Get membership
    const membershipRow = await client.query(
      'SELECT tenant_id, role FROM memberships WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1',
      [user.id],
    );

    if ((membershipRow.rowCount ?? 0) === 0) {
      const error = new Error('User has no tenant membership');
      (error as Error & { statusCode: number }).statusCode = 403;
      throw error;
    }

    const membership = membershipRow.rows[0] as { tenant_id: string; role: string };

    const tenantRow = await client.query('SELECT status FROM tenants WHERE id = $1 LIMIT 1', [membership.tenant_id]);
    if ((tenantRow.rowCount ?? 0) === 0) {
      const error = new Error('Tenant not found');
      (error as Error & { statusCode: number }).statusCode = 403;
      throw error;
    }
    const tenantStatus = String((tenantRow.rows[0] as any).status ?? 'active');
    if (tenantStatus !== 'active') {
      const error = new Error('Tenant is disabled');
      (error as Error & { statusCode: number }).statusCode = 403;
      throw error;
    }

    // Ensure RLS applies for project lookups.
    await setAuthContext(client, { tenantId: membership.tenant_id, userId: user.id, role: membership.role });

    const projectRow = await client.query(
      'SELECT id FROM projects WHERE tenant_id = $1 ORDER BY updated_at DESC, created_at DESC LIMIT 1',
      [membership.tenant_id],
    );
    const projectId = (projectRow.rowCount ?? 0) > 0 ? String(projectRow.rows[0].id) : '';

    const accessToken = signAccessToken({
      userId: user.id,
      email: user.email,
      tenantId: membership.tenant_id,
      role: membership.role as 'admin' | 'manager' | 'analyst',
      emailVerified: !!user.email_verified_at,
    });
    const newRefreshToken = signRefreshToken({ userId: user.id, tenantId: membership.tenant_id });

    return {
      ok: true,
      token: accessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        tenantId: membership.tenant_id,
        projectId,
        role: membership.role,
      },
    };
    },
  );

  /**
   * POST /api/auth/logout
   * Acknowledges logout. In production, refresh token would be blacklisted.
   */
  fastify.post(
    '/api/auth/logout',
    {
      schema: {
        tags: ['auth'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: { ok: { type: 'boolean' }, message: { type: 'string' } },
            required: ['ok'],
          },
        },
      },
    },
    async (req) => {
    // Extract bearer token for validation (optional)
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        verifyAccessToken(authHeader.slice(7));
      } catch {
        // Token already expired or invalid — still allow logout
      }
    }

    return { ok: true, message: 'Logged out successfully' };
    },
  );

  /**
   * GET /api/auth/me
   * Returns the current authenticated user profile.
   */
  fastify.get(
    '/api/auth/me',
    {
      schema: {
        tags: ['auth'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              user: {
                ...authUserSchema,
                properties: {
                  ...(authUserSchema as any).properties,
                  avatarUrl: { type: ['string', 'null'] },
                  emailVerified: { type: 'boolean' },
                  emailVerifiedAt: { type: ['string', 'null'] },
                  createdAt: { type: 'string' },
                },
              },
            },
            required: ['ok', 'user'],
          },
        },
      },
    },
    async (req) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      const error = new Error('Missing authorization header');
      (error as Error & { statusCode: number }).statusCode = 401;
      throw error;
    }

    let decoded: { userId: string; email: string; tenantId: string; role: string };
    try {
      decoded = verifyAccessToken(authHeader.slice(7));
    } catch {
      const error = new Error('Invalid or expired token');
      (error as Error & { statusCode: number }).statusCode = 401;
      throw error;
    }

    const client = await requireDb(req);
    const userRow = await client.query(
      'SELECT id, email, name, avatar_url, created_at, email_verified_at, settings FROM users WHERE id = $1 LIMIT 1',
      [decoded.userId],
    );

    if ((userRow.rowCount ?? 0) === 0) {
      throw new AppError('User not found', 401);
    }

    const user = userRow.rows[0] as {
      id: string; email: string; name: string;
      avatar_url: string | null; created_at: Date;
      email_verified_at: Date | null;
      settings: Record<string, unknown>;
    };

    return {
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatar_url,
        tenantId: decoded.tenantId,
        role: decoded.role,
        emailVerified: !!user.email_verified_at,
        emailVerifiedAt: user.email_verified_at ? user.email_verified_at.toISOString() : null,
        createdAt: user.created_at.toISOString(),
        settings: user.settings ?? {},
      },
    };
    },
  );

  /**
   * PATCH /api/auth/me
   * Updates the current user's settings (whitelist-only).
   * Allowed keys: onboardingSeenAt, uiPreferences
   */
  fastify.patch(
    '/api/auth/me',
    {
      schema: {
        tags: ['auth'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            settings: {
              type: 'object',
              properties: {
                onboardingSeenAt: { type: ['string', 'null'] },
                uiPreferences: { type: 'object', additionalProperties: true },
              },
              additionalProperties: false,
            },
          },
          required: ['settings'],
          additionalProperties: false,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              settings: { type: 'object', additionalProperties: true },
            },
            required: ['ok', 'settings'],
          },
        },
      },
    },
    async (req) => {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) throw new AppError('Missing authorization header', 401);

      const decoded = verifyAccessToken(authHeader.slice(7));

      // Whitelist: only allow onboardingSeenAt and uiPreferences
      const input = (req.body as { settings: Record<string, unknown> }).settings ?? {};
      const ALLOWED_KEYS = new Set(['onboardingSeenAt', 'uiPreferences']);
      const safeSettings: Record<string, unknown> = {};
      for (const key of ALLOWED_KEYS) {
        if (key in input) safeSettings[key] = input[key];
      }

      const client = await requireDb(req);

      // Merge into existing settings using jsonb_strip_nulls to handle nulls cleanly
      const updated = await client.query(
        `UPDATE users
         SET settings = settings || $2::jsonb, updated_at = now()
         WHERE id = $1
         RETURNING settings`,
        [decoded.userId, JSON.stringify(safeSettings)],
      );

      return { ok: true, settings: updated.rows[0]?.settings ?? {} };
    },
  );
};
