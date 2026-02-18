import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../utils/authz.js';
import { computeTenantQuotas, currentUsagePeriodKey } from '../quotas/tenant-quotas.js';
import { getKeywordCapacity, getTenantUsage } from '../quotas/usage.js';

async function requireDb(req: { dbClient?: import('pg').PoolClient }) {
  if (!req.dbClient) {
    const error = new Error('DB not available');
    (error as Error & { statusCode: number }).statusCode = 500;
    throw error;
  }
  return req.dbClient;
}

const updateTenantMeSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    plan: z.string().min(1).max(50).optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

const brandingPatchSchema = z
  .object({
    logoDataUrl: z.string().max(350_000).optional(),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    headerText: z.string().max(500).optional(),
    footerText: z.string().max(500).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

function validateLogoDataUrl(value: string) {
  if (!value.startsWith('data:image/')) {
    const error = new Error('Invalid logo format');
    (error as Error & { statusCode: number }).statusCode = 400;
    throw error;
  }
  if (!value.includes(';base64,')) {
    const error = new Error('Invalid logo encoding');
    (error as Error & { statusCode: number }).statusCode = 400;
    throw error;
  }
}

export const tenantsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/tenants/me',
    {
      schema: {
        tags: ['tenants'],
        description:
          'Get current tenant details.\n\n' +
          'Examples:\n' +
          '\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:3001/api/tenants/me\n' +
          '```\n' +
          '\n' +
          'JavaScript:\n' +
          '```js\n' +
          'await fetch("/api/tenants/me", { headers: { Authorization: `Bearer ${token}` } })\n' +
          '```\n',
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              tenant: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  slug: { type: 'string' },
                  plan: { type: 'string' },
                  status: { type: 'string' },
                  settings: { type: 'object', additionalProperties: true },
                  createdAt: { type: 'string' },
                  updatedAt: { type: 'string' },
                },
                required: ['id', 'name', 'slug', 'plan', 'status', 'settings', 'createdAt', 'updatedAt'],
                additionalProperties: true,
              },
            },
            required: ['ok', 'tenant'],
            additionalProperties: true,
          },
          429: {
            type: 'object',
            properties: {
              statusCode: { type: 'number' },
              error: { type: 'string' },
              message: { type: 'string' },
              kind: { type: 'string' },
              quota: { type: 'object', additionalProperties: true },
            },
            required: ['statusCode', 'message'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const tenantId = req.tenantId;
    if (!tenantId) {
      const error = new Error('Missing tenant context');
      (error as Error & { statusCode: number }).statusCode = 403;
      throw error;
    }

    const row = await client.query(
      `SELECT id, name, slug, plan, status, settings, created_at, updated_at
       FROM tenants
       WHERE id = $1
       LIMIT 1`,
      [tenantId],
    );

    if ((row.rowCount ?? 0) === 0) {
      const error = new Error('Tenant not found');
      (error as Error & { statusCode: number }).statusCode = 404;
      throw error;
    }

    const r = row.rows[0];
    return {
      ok: true,
      tenant: {
        id: String(r.id),
        name: String(r.name),
        slug: String(r.slug),
        plan: String(r.plan),
        status: String(r.status ?? 'active'),
        settings: r.settings && typeof r.settings === 'object' ? (r.settings as unknown) : {},
        createdAt: (r.created_at ?? new Date()).toISOString(),
        updatedAt: (r.updated_at ?? new Date()).toISOString(),
      },
    };
    },
  );

  fastify.patch(
    '/api/tenants/me',
    {
      schema: {
        tags: ['tenants'],
        description:
          'Update current tenant (admin only).\n\n' +
          'Examples:\n' +
          '\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -X PATCH \\\n  -H "Authorization: Bearer <ACCESS_TOKEN>" \\\n  -H "Content-Type: application/json" \\\n  -d "{\"name\":\"Acme\"}" \\\n  http://localhost:3001/api/tenants/me\n' +
          '```\n',
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            plan: { type: 'string' },
            settings: { type: 'object', additionalProperties: true },
          },
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              tenant: { type: 'object', additionalProperties: true },
            },
            required: ['ok', 'tenant'],
            additionalProperties: true,
          },
          429: {
            type: 'object',
            properties: {
              statusCode: { type: 'number' },
              error: { type: 'string' },
              message: { type: 'string' },
              kind: { type: 'string' },
              quota: { type: 'object', additionalProperties: true },
            },
            required: ['statusCode', 'message'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const tenantId = req.tenantId;
    if (!tenantId) {
      const error = new Error('Missing tenant context');
      (error as Error & { statusCode: number }).statusCode = 403;
      throw error;
    }

    requireRole(req, ['admin']);
    const input = updateTenantMeSchema.parse(req.body ?? {});

    const updated = await client.query(
      `UPDATE tenants
       SET name = COALESCE($2, name),
           plan = COALESCE($3, plan),
           settings = COALESCE($4::jsonb, settings),
           updated_at = now()
       WHERE id = $1
       RETURNING id, name, slug, plan, status, settings, created_at, updated_at`,
      [tenantId, input.name ?? null, input.plan ?? null, input.settings ? JSON.stringify(input.settings) : null],
    );

    const r = updated.rows[0];
    return {
      ok: true,
      tenant: {
        id: String(r.id),
        name: String(r.name),
        slug: String(r.slug),
        plan: String(r.plan),
        status: String(r.status ?? 'active'),
        settings: r.settings && typeof r.settings === 'object' ? (r.settings as unknown) : {},
        createdAt: (r.created_at ?? new Date()).toISOString(),
        updatedAt: (r.updated_at ?? new Date()).toISOString(),
      },
    };
    },
  );

  /**
   * GET /api/tenants/usage
   * Returns current period quota + usage counters for the current tenant.
   */
  fastify.get(
    '/api/tenants/usage',
    {
      schema: {
        tags: ['tenants'],
        description:
          'Get current tenant usage and quotas for the current month.\n\n' +
          'Examples:\n' +
          '\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:3001/api/tenants/usage\n' +
          '```\n' +
          '\n' +
          'Python:\n' +
          '```python\n' +
          'import requests\n' +
          'r = requests.get("http://localhost:3001/api/tenants/usage", headers={"Authorization": "Bearer " + token})\n' +
          'print(r.json())\n' +
          '```\n' +
          '\n' +
          'JavaScript:\n' +
          '```js\n' +
          'const res = await fetch("/api/tenants/usage", { headers: { Authorization: `Bearer ${token}` } });\n' +
          'console.log(await res.json());\n' +
          '```\n' +
          '\n' +
          'Notes:\n' +
          '- All /api/* routes may return 429 when the monthly API-call quota is exceeded.\n',
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              tenantId: { type: 'string', format: 'uuid' },
              plan: { type: 'string' },
              period: { type: 'string' },
              quotas: {
                type: 'object',
                properties: {
                  keywordsMax: { anyOf: [{ type: 'number' }, { type: 'null' }] },
                  apiCallsPerMonth: { anyOf: [{ type: 'number' }, { type: 'null' }] },
                  serpJobsPerMonth: { anyOf: [{ type: 'number' }, { type: 'null' }] },
                  crawlJobsPerMonth: { anyOf: [{ type: 'number' }, { type: 'null' }] },
                },
                required: ['keywordsMax', 'apiCallsPerMonth', 'serpJobsPerMonth', 'crawlJobsPerMonth'],
                additionalProperties: true,
              },
              usage: {
                type: 'object',
                properties: {
                  apiCalls: { type: 'number' },
                  serpJobs: { type: 'number' },
                  crawlJobs: { type: 'number' },
                  keywords: {
                    type: 'object',
                    properties: {
                      current: { type: 'number' },
                      max: { anyOf: [{ type: 'number' }, { type: 'null' }] },
                      remaining: { anyOf: [{ type: 'number' }, { type: 'null' }] },
                    },
                    required: ['current', 'max', 'remaining'],
                    additionalProperties: true,
                  },
                },
                required: ['apiCalls', 'serpJobs', 'crawlJobs', 'keywords'],
                additionalProperties: true,
              },
              history: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    period: { type: 'string' },
                    apiCalls: { type: 'number' },
                    serpJobs: { type: 'number' },
                    crawlJobs: { type: 'number' },
                  },
                  required: ['period', 'apiCalls', 'serpJobs', 'crawlJobs'],
                  additionalProperties: true,
                },
              },
            },
            required: ['ok', 'tenantId', 'plan', 'period', 'quotas', 'usage', 'history'],
            additionalProperties: true,
          },
          429: {
            type: 'object',
            properties: {
              statusCode: { type: 'number' },
              error: { type: 'string' },
              message: { type: 'string' },
              kind: { type: 'string', description: 'quota_exceeded' },
              quota: {
                type: 'object',
                properties: {
                  kind: { type: 'string' },
                  period: { type: 'string' },
                  limit: { anyOf: [{ type: 'number' }, { type: 'null' }] },
                  current: { type: 'number' },
                  requested: { type: 'number' },
                },
                additionalProperties: true,
              },
            },
            required: ['statusCode', 'message'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const tenantId = req.tenantId;
    if (!tenantId) {
      const error = new Error('Missing tenant context');
      (error as Error & { statusCode: number }).statusCode = 403;
      throw error;
    }

    const row = await client.query(
      `SELECT id, plan, settings
       FROM tenants
       WHERE id = $1
       LIMIT 1`,
      [tenantId],
    );

    if ((row.rowCount ?? 0) === 0) {
      const error = new Error('Tenant not found');
      (error as Error & { statusCode: number }).statusCode = 404;
      throw error;
    }

    const plan = String((row.rows[0] as any).plan ?? 'starter');
    const settings = (row.rows[0] as any).settings;
    const quotas = computeTenantQuotas(plan, settings);
    const period = currentUsagePeriodKey();

    const usage = await getTenantUsage(client, tenantId, period);
    const keywordsCap = await getKeywordCapacity(client, tenantId, quotas.keywordsMax);

    const historyRows = await client.query(
      `SELECT period, api_calls, serp_jobs, crawl_jobs
       FROM tenant_usage
       WHERE tenant_id = $1
       ORDER BY period DESC
       LIMIT 6`,
      [tenantId],
    );

    const history = (historyRows.rows ?? []).map((r: any) => ({
      period: String(r.period),
      apiCalls: Number(r.api_calls ?? 0),
      serpJobs: Number(r.serp_jobs ?? 0),
      crawlJobs: Number(r.crawl_jobs ?? 0),
    }));

    return {
      ok: true,
      tenantId,
      plan,
      period,
      quotas,
      usage: {
        apiCalls: usage.apiCalls,
        serpJobs: usage.serpJobs,
        crawlJobs: usage.crawlJobs,
        keywords: {
          current: keywordsCap.current,
          max: quotas.keywordsMax,
          remaining: keywordsCap.remaining,
        },
      },
      history,
    };
    },
  );

  /**
   * GET /api/tenants/brand
   * Returns white-label branding settings for the current tenant.
   */
  fastify.get(
    '/api/tenants/brand',
    {
      schema: {
        tags: ['tenants'],
        description:
          'Get tenant white-label branding settings.\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:3001/api/tenants/brand\n' +
          '```\n',
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              tenantId: { type: 'string', format: 'uuid' },
              brand: { type: 'object', additionalProperties: true },
            },
            required: ['ok', 'tenantId', 'brand'],
            additionalProperties: true,
          },
          429: {
            type: 'object',
            properties: {
              statusCode: { type: 'number' },
              error: { type: 'string' },
              message: { type: 'string' },
              kind: { type: 'string' },
              quota: { type: 'object', additionalProperties: true },
            },
            required: ['statusCode', 'message'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const tenantId = req.tenantId;
    if (!tenantId) {
      const error = new Error('Missing tenant context');
      (error as Error & { statusCode: number }).statusCode = 403;
      throw error;
    }

    const row = await client.query('SELECT settings FROM tenants WHERE id = $1 LIMIT 1', [tenantId]);
    if ((row.rowCount ?? 0) === 0) {
      const error = new Error('Tenant not found');
      (error as Error & { statusCode: number }).statusCode = 404;
      throw error;
    }

    const settings = row.rows[0]?.settings;
    const brand = settings && typeof settings === 'object' && 'brand' in (settings as any) ? (settings as any).brand : {};
    return { ok: true, tenantId, brand: brand && typeof brand === 'object' ? brand : {} };
    },
  );

  /**
   * PATCH /api/tenants/brand
   * Updates tenant white-label branding settings.
   */
  fastify.patch(
    '/api/tenants/brand',
    {
      schema: {
        tags: ['tenants'],
        description:
          'Update tenant white-label branding settings (admin only).\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -X PATCH \\\n+  -H "Authorization: Bearer <ACCESS_TOKEN>" \\\n+  -H "Content-Type: application/json" \\\n+  -d "{\"primaryColor\":\"#3b82f6\",\"headerText\":\"Monthly SEO Report\"}" \\\n+  http://localhost:3001/api/tenants/brand\n' +
          '```\n',
        body: {
          type: 'object',
          properties: {
            logoDataUrl: { type: 'string' },
            primaryColor: { type: 'string' },
            headerText: { type: 'string' },
            footerText: { type: 'string' },
          },
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              tenantId: { type: 'string', format: 'uuid' },
              brand: { type: 'object', additionalProperties: true },
            },
            required: ['ok', 'tenantId', 'brand'],
            additionalProperties: true,
          },
          429: {
            type: 'object',
            properties: {
              statusCode: { type: 'number' },
              error: { type: 'string' },
              message: { type: 'string' },
              kind: { type: 'string' },
              quota: { type: 'object', additionalProperties: true },
            },
            required: ['statusCode', 'message'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const tenantId = req.tenantId;
    if (!tenantId) {
      const error = new Error('Missing tenant context');
      (error as Error & { statusCode: number }).statusCode = 403;
      throw error;
    }

    requireRole(req, ['admin']);
    const input = brandingPatchSchema.parse(req.body ?? {});

    if (input.logoDataUrl) {
      validateLogoDataUrl(input.logoDataUrl);
    }

    const patch: Record<string, unknown> = {};
    if (input.logoDataUrl !== undefined) patch.logoDataUrl = input.logoDataUrl;
    if (input.primaryColor !== undefined) patch.primaryColor = input.primaryColor;
    if (input.headerText !== undefined) patch.headerText = input.headerText;
    if (input.footerText !== undefined) patch.footerText = input.footerText;

    const updated = await client.query(
      `UPDATE tenants
       SET settings = jsonb_set(
         settings,
         '{brand}',
         COALESCE(settings->'brand', '{}'::jsonb) || $2::jsonb,
         true
       ),
       updated_at = now()
       WHERE id = $1
       RETURNING settings`,
      [tenantId, JSON.stringify(patch)],
    );

    const settings = updated.rows[0]?.settings;
    const brand = settings && typeof settings === 'object' && 'brand' in (settings as any) ? (settings as any).brand : {};
    return { ok: true, tenantId, brand: brand && typeof brand === 'object' ? brand : {} };
    },
  );
};
