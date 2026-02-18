import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { env } from '../config/env.js';
import { computeTenantQuotas } from '../quotas/tenant-quotas.js';
import { assertKeywordCapacity } from '../quotas/usage.js';

const bootstrapSchema = z.object({
  projectId: z.string().uuid(),
  projectName: z.string().min(1).default('Demo Project'),
  domain: z.string().min(1).default('example.com'),
  seedKeyword: z.string().min(1).default('aiseo'),
});

export const devRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/api/dev/bootstrap', async (req) => {
    if (env.NODE_ENV !== 'development') {
      const error = new Error('Not found');
      (error as Error & { statusCode: number }).statusCode = 404;
      throw error;
    }

    const tenantId = req.headers['x-tenant-id']?.toString() ?? env.DEFAULT_TENANT_ID;
    if (!tenantId) {
      const error = new Error('Missing tenant context');
      (error as Error & { statusCode: number }).statusCode = 403;
      throw error;
    }

    if (!req.dbClient) {
      const error = new Error('DB not available');
      (error as Error & { statusCode: number }).statusCode = 500;
      throw error;
    }

    const input = bootstrapSchema.parse(req.body ?? {});

    // Tenants table is not RLS-protected; create it if missing.
    await req.dbClient.query(
      `INSERT INTO tenants (id, name, slug, plan, settings)
       VALUES ($1, $2, $3, 'starter', '{}'::jsonb)
       ON CONFLICT (id)
       DO UPDATE SET name = EXCLUDED.name`,
      [tenantId, `Tenant ${tenantId.slice(0, 8)}`, `tenant-${tenantId.slice(0, 8)}`],
    );

    // Projects table is RLS-protected; middleware has already set tenant context.
    await req.dbClient.query(
      `INSERT INTO projects (id, tenant_id, name, domain, settings)
       VALUES ($1, $2, $3, $4, '{}'::jsonb)
       ON CONFLICT (id)
       DO UPDATE SET name = EXCLUDED.name, domain = EXCLUDED.domain, updated_at = now()`,
      [input.projectId, tenantId, input.projectName, input.domain],
    );

    // Seed keyword.
    const tenantConfigRow = await req.dbClient.query('SELECT plan, settings FROM tenants WHERE id = $1 LIMIT 1', [tenantId]);
    const quotas = computeTenantQuotas(tenantConfigRow.rows[0]?.plan, tenantConfigRow.rows[0]?.settings);
    await assertKeywordCapacity(req.dbClient, tenantId, quotas.keywordsMax);
    await req.dbClient.query(
      `INSERT INTO keywords (project_id, keyword)
       VALUES ($1, $2)
       ON CONFLICT (project_id, keyword)
       DO NOTHING`,
      [input.projectId, input.seedKeyword],
    );

    return {
      ok: true,
      tenantId,
      projectId: input.projectId,
      seedKeyword: input.seedKeyword,
    };
  });
};
