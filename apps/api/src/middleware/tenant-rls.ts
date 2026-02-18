import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { pool, setAuthContext } from '../db/pool.js';
import { computeTenantQuotas } from '../quotas/tenant-quotas.js';
import { incrementApiCallsOrThrow } from '../quotas/usage.js';

declare module 'fastify' {
  interface FastifyRequest {
    dbClient?: import('pg').PoolClient;
    tenantId?: string;
    auth?: {
      userId: string;
      email: string;
      tenantId: string;
      role: 'admin' | 'manager' | 'analyst';
      emailVerified: boolean;
    };
  }
}

export const tenantRlsMiddleware: FastifyPluginAsync = async (fastify) => {
  addTenantRlsHooks(fastify);
};

export function addTenantRlsHooks(fastify: FastifyInstance) {
  const releaseDbClient = (req: { dbClient?: import('pg').PoolClient }) => {
    if (!req.dbClient) return;
    req.dbClient.release();
    req.dbClient = undefined;
  };

  fastify.addHook('onRequest', async (req) => {
    // Skip DB session setup for routes that don't touch the DB.
    if (req.url === '/health' || req.url.startsWith('/ws') || req.url.startsWith('/docs') || req.url === '/openapi.json') {
      return;
    }

    const isAuthRoute = req.url.startsWith('/api/auth/');
    const isPlatformRoute = req.url.startsWith('/api/platform/');

    const requireAuth = () => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        const error = new Error('Missing authorization header');
        (error as Error & { statusCode: number }).statusCode = 401;
        throw error;
      }

      const secret = env.JWT_SECRET ?? 'aiseo-jwt-dev-secret-change-in-production';
      let decoded: { userId: string; email: string; tenantId: string; role: string };
      try {
        decoded = jwt.verify(authHeader.slice(7), secret) as any;
      } catch {
        const error = new Error('Invalid or expired token');
        (error as Error & { statusCode: number }).statusCode = 401;
        throw error;
      }

      const isMembershipRole = (value: unknown): value is 'admin' | 'manager' | 'analyst' =>
        value === 'admin' || value === 'manager' || value === 'analyst';

      const roleRaw: unknown = decoded.role;
      if (!isMembershipRole(roleRaw)) {
        const error = new Error('Invalid role');
        (error as Error & { statusCode: number }).statusCode = 401;
        throw error;
      }

      return {
        userId: String(decoded.userId),
        email: String(decoded.email),
        tenantId: String(decoded.tenantId),
        role: roleRaw,
        emailVerified: Boolean((decoded as any).emailVerified ?? false),
      };
    };

    const client = await pool.connect();
    try {
      req.dbClient = client;

      if (isAuthRoute) {
        // Auth routes need DB access before a tenant is known.
        return;
      }

      if (isPlatformRoute) {
        const expected = env.PLATFORM_ADMIN_SECRET;
        const provided = typeof req.headers['x-platform-admin-secret'] === 'string' ? req.headers['x-platform-admin-secret'] : undefined;
        if (!expected || !provided || provided !== expected) {
          const error = new Error('Forbidden');
          (error as Error & { statusCode: number }).statusCode = 403;
          throw error;
        }

        // Platform routes still require a valid user session; enforce tenant-admin role.
        const auth = requireAuth();
        if (auth.role !== 'admin') {
          const error = new Error('Forbidden');
          (error as Error & { statusCode: number }).statusCode = 403;
          throw error;
        }
        req.auth = auth;
        req.tenantId = auth.tenantId;

        // Platform routes must NOT set tenant context (they operate across tenants).
        return;
      }

      const auth = requireAuth();
      req.auth = auth;
      req.tenantId = auth.tenantId;

      // Email verification gate (production default): allow unverified users only on /api/auth/*.
      if (env.NODE_ENV === 'production' && !auth.emailVerified) {
        const error = new Error('Email not verified');
        (error as Error & { statusCode: number }).statusCode = 403;
        throw error;
      }

      // Block disabled/deleted tenants early.
      // Note: tenants table is not protected by RLS; we always filter by primary key.
      const tenantRow = await client.query('SELECT status, plan, settings FROM tenants WHERE id = $1 LIMIT 1', [auth.tenantId]);
      if ((tenantRow.rowCount ?? 0) === 0) {
        const error = new Error('Tenant not found');
        (error as Error & { statusCode: number }).statusCode = 403;
        throw error;
      }
      const status = String((tenantRow.rows[0] as any).status ?? 'active');
      if (status !== 'active') {
        const error = new Error('Tenant is disabled');
        (error as Error & { statusCode: number }).statusCode = 403;
        throw error;
      }

      // Quota enforcement (monthly): API calls per tenant.
      const plan = (tenantRow.rows[0] as any).plan;
      const settings = (tenantRow.rows[0] as any).settings;
      const quotas = computeTenantQuotas(plan, settings);
      await incrementApiCallsOrThrow(client, auth.tenantId, quotas);

      await setAuthContext(client, { tenantId: auth.tenantId, userId: auth.userId, role: auth.role });
    } catch (error) {
      // Ensure the client is released exactly once.
      // The request may still go through onError/onResponse hooks.
      releaseDbClient(req);
      throw error;
    }
  });

  fastify.addHook('onError', async (req) => {
    releaseDbClient(req);
  });

  fastify.addHook('onResponse', async (req) => {
    releaseDbClient(req);
  });
}
