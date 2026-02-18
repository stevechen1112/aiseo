import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { computeTenantQuotas } from '../quotas/tenant-quotas.js';
import { assertKeywordCapacityForRequested } from '../quotas/usage.js';

async function requireDb(req: { dbClient?: import('pg').PoolClient }) {
  if (!req.dbClient) {
    const error = new Error('DB not available');
    (error as Error & { statusCode: number }).statusCode = 500;
    throw error;
  }
  return req.dbClient;
}

const exportQuerySchema = z.object({
  projectId: z.string().uuid(),
  format: z.enum(['json', 'csv']).optional().default('json'),
});

const importSchema = z.object({
  project: z.object({
    name: z.string().min(1),
    domain: z.string().min(1),
    settings: z.record(z.unknown()).optional().default({}),
  }),
  keywords: z.array(z.string().min(1)).optional().default([]),
});

function toCsvRow(value: string): string {
  const escaped = value.replaceAll('"', '""');
  return `"${escaped}"`;
}

export const backupRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/backup/export',
    {
      schema: {
        tags: ['backup'],
        description:
          'Export a project backup as JSON or CSV (keywords).\n\n' +
          'curl JSON:\n' +
          '```bash\n' +
          'curl -H "Authorization: Bearer <ACCESS_TOKEN>" "http://localhost:3001/api/backup/export?projectId=<PROJECT_UUID>&format=json"\n' +
          '```\n' +
          '\n' +
          'curl CSV:\n' +
          '```bash\n' +
          'curl -L -H "Authorization: Bearer <ACCESS_TOKEN>" "http://localhost:3001/api/backup/export?projectId=<PROJECT_UUID>&format=csv" --output keywords.csv\n' +
          '```\n',
        querystring: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid' },
            format: { type: 'string', enum: ['json', 'csv'] },
          },
          required: ['projectId'],
          additionalProperties: true,
        },
        response: {
          200: { description: 'JSON object or CSV string', additionalProperties: true },
        },
      },
    },
    async (req, reply) => {
    const client = await requireDb(req);
    const { projectId, format } = exportQuerySchema.parse(req.query as unknown);

    const projectRow = await client.query('SELECT id, name, domain, settings, created_at, updated_at FROM projects WHERE id = $1 LIMIT 1', [projectId]);
    if (projectRow.rowCount === 0) {
      const error = new Error('Project not found');
      (error as Error & { statusCode: number }).statusCode = 404;
      throw error;
    }

    const keywordsRow = await client.query('SELECT keyword FROM keywords WHERE project_id = $1 ORDER BY created_at DESC', [projectId]);
    const schedulesRow = await client.query(
      'SELECT id, flow_name, seed_keyword, cron, timezone, enabled, created_at, updated_at FROM schedules WHERE project_id = $1 ORDER BY created_at DESC',
      [projectId],
    );

    if (format === 'csv') {
      const header = 'keyword\n';
      const lines = keywordsRow.rows.map((r) => toCsvRow(String(r.keyword)) + '\n');
      const csv = header + lines.join('');

      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="keywords-${projectId}.csv"`);
      return reply.send(csv);
    }

    const p = projectRow.rows[0];

    return {
      ok: true,
      export: {
        project: {
          id: String(p.id),
          name: String(p.name),
          domain: String(p.domain),
          settings: (p.settings as unknown) ?? {},
          createdAt: (p.created_at ?? new Date()).toISOString(),
          updatedAt: (p.updated_at ?? new Date()).toISOString(),
        },
        keywords: keywordsRow.rows.map((r) => String(r.keyword)),
        schedules: schedulesRow.rows.map((r) => ({
          id: String(r.id),
          flowName: String(r.flow_name),
          seedKeyword: r.seed_keyword ? String(r.seed_keyword) : null,
          cron: String(r.cron),
          timezone: r.timezone ? String(r.timezone) : null,
          enabled: Boolean(r.enabled),
          createdAt: (r.created_at ?? new Date()).toISOString(),
          updatedAt: (r.updated_at ?? new Date()).toISOString(),
        })),
      },
    };
    },
  );

  fastify.post(
    '/api/backup/import',
    {
      schema: {
        tags: ['backup'],
        description:
          'Import a backup: creates a new project and inserts keywords (quota enforced).\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -X POST \\\n+  -H "Authorization: Bearer <ACCESS_TOKEN>" \\\n+  -H "Content-Type: application/json" \\\n+  -d "{\"project\":{\"name\":\"Imported\",\"domain\":\"example.com\",\"settings\":{}},\"keywords\":[\"seo\",\"aiseo\"]}" \\\n+  http://localhost:3001/api/backup/import\n' +
          '```\n',
        body: {
          type: 'object',
          properties: {
            project: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                domain: { type: 'string' },
                settings: { type: 'object', additionalProperties: true },
              },
              required: ['name', 'domain'],
              additionalProperties: true,
            },
            keywords: { type: 'array', items: { type: 'string' } },
          },
          required: ['project'],
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: { ok: { type: 'boolean' }, projectId: { type: 'string', format: 'uuid' } },
            required: ['ok', 'projectId'],
            additionalProperties: true,
          },
          429: {
            type: 'object',
            properties: { statusCode: { type: 'number' }, message: { type: 'string' }, kind: { type: 'string' }, quota: { type: 'object', additionalProperties: true } },
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

    const input = importSchema.parse(req.body ?? {});

    // Enforce keyword quota before inserting bulk keywords.
    const tenantRow = await client.query('SELECT plan, settings FROM tenants WHERE id = $1 LIMIT 1', [tenantId]);
    if ((tenantRow.rowCount ?? 0) > 0) {
      const quotas = computeTenantQuotas((tenantRow.rows[0] as any).plan, (tenantRow.rows[0] as any).settings);
      const uniqueKeywords = Array.from(new Set(input.keywords.map((k) => k.trim()).filter(Boolean)));
      await assertKeywordCapacityForRequested(client, tenantId, quotas.keywordsMax, uniqueKeywords.length);
    }

    const inserted = await client.query(
      `INSERT INTO projects (tenant_id, name, domain, settings)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING id`,
      [tenantId, input.project.name, input.project.domain, input.project.settings],
    );

    const projectId = String(inserted.rows[0].id);

    for (const keyword of input.keywords) {
      await client.query(
        `INSERT INTO keywords (project_id, keyword)
         VALUES ($1, $2)
         ON CONFLICT (project_id, keyword)
         DO NOTHING`,
        [projectId, keyword],
      );
    }

    return { ok: true, projectId };
    },
  );
};
