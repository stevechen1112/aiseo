import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { requirePermission } from '../utils/authz.js';
import { writeAuditLog } from '../audit/audit-log.js';

async function requireDb(req: { dbClient?: import('pg').PoolClient }) {
  if (!req.dbClient) {
    const error = new Error('DB not available');
    (error as Error & { statusCode: number }).statusCode = 500;
    throw error;
  }
  return req.dbClient;
}

const createProjectSchema = z.object({
  name: z.string().min(1),
  domain: z.string().min(1),
  targetKeywords: z.array(z.string().min(1)).optional().default([]),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  domain: z.string().min(1).optional(),
  targetKeywords: z.array(z.string().min(1)).optional(),
});

const projectIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const projectsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/projects',
    {
      schema: {
        tags: ['projects'],
        description:
          'List projects for the current tenant.\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:3001/api/projects\n' +
          '```\n',
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              projects: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    name: { type: 'string' },
                    domain: { type: 'string' },
                    settings: { type: 'object', additionalProperties: true },
                    createdAt: { type: 'string' },
                    updatedAt: { type: 'string' },
                  },
                  required: ['id', 'name', 'domain', 'settings', 'createdAt', 'updatedAt'],
                  additionalProperties: true,
                },
              },
            },
            required: ['ok', 'projects'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);

    const row = await client.query(
      `SELECT id, name, domain, settings, created_at, updated_at
       FROM projects
       ORDER BY updated_at DESC, created_at DESC`,
    );

    return {
      ok: true,
      projects: row.rows.map((r) => ({
        id: String(r.id),
        name: String(r.name),
        domain: String(r.domain),
        settings: (r.settings as unknown) ?? {},
        createdAt: (r.created_at ?? new Date()).toISOString(),
        updatedAt: (r.updated_at ?? new Date()).toISOString(),
      })),
    };
    },
  );

  fastify.post(
    '/api/projects',
    {
      schema: {
        tags: ['projects'],
        description:
          'Create a new project for the current tenant.\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -X POST \\\n+  -H "Authorization: Bearer <ACCESS_TOKEN>" \\\n+  -H "Content-Type: application/json" \\\n+  -d "{\"name\":\"My Project\",\"domain\":\"example.com\",\"targetKeywords\":[\"seo\"]}" \\\n+  http://localhost:3001/api/projects\n' +
          '```\n',
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            domain: { type: 'string' },
            targetKeywords: { type: 'array', items: { type: 'string' } },
          },
          required: ['name', 'domain'],
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              project: { type: 'object', additionalProperties: true },
            },
            required: ['ok', 'project'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    requirePermission(req, 'projects.manage');
    const client = await requireDb(req);
    const tenantId = req.tenantId;
    const userId = req.auth?.userId ?? null;

    if (!tenantId) {
      const error = new Error('Missing tenant context');
      (error as Error & { statusCode: number }).statusCode = 403;
      throw error;
    }

    const input = createProjectSchema.parse(req.body ?? {});

    const settings = {
      targetKeywords: input.targetKeywords,
    };

    const created = await client.query(
      `INSERT INTO projects (tenant_id, name, domain, settings)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING id, name, domain, settings, created_at, updated_at`,
      [tenantId, input.name, input.domain, settings],
    );

    const r = created.rows[0];

    // Project-scoped access (Phase 4 advanced RBAC): grant all tenant members access by default.
    await client.query(
      `INSERT INTO project_memberships (tenant_id, project_id, user_id, role)
       SELECT tenant_id, $2::uuid AS project_id, user_id, role
       FROM memberships
       WHERE tenant_id = $1
       ON CONFLICT (tenant_id, project_id, user_id) DO NOTHING`,
      [tenantId, String(r.id)],
    );

    await writeAuditLog(client, {
      tenantId,
      userId,
      projectId: String(r.id),
      action: 'project.create',
      resourceType: 'project',
      resourceId: String(r.id),
      metadata: {
        name: input.name,
        domain: input.domain,
      },
    });

    return {
      ok: true,
      project: {
        id: String(r.id),
        name: String(r.name),
        domain: String(r.domain),
        settings: (r.settings as unknown) ?? {},
        createdAt: (r.created_at ?? new Date()).toISOString(),
        updatedAt: (r.updated_at ?? new Date()).toISOString(),
      },
    };
    },
  );

  fastify.put(
    '/api/projects/:id',
    {
      schema: {
        tags: ['projects'],
        description:
          'Update a project.\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -X PUT \\\n+  -H "Authorization: Bearer <ACCESS_TOKEN>" \\\n+  -H "Content-Type: application/json" \\\n+  -d "{\"name\":\"New name\"}" \\\n+  http://localhost:3001/api/projects/<PROJECT_ID>\n' +
          '```\n',
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id'],
          additionalProperties: true,
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            domain: { type: 'string' },
            targetKeywords: { type: 'array', items: { type: 'string' } },
          },
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              project: { type: 'object', additionalProperties: true },
            },
            required: ['ok', 'project'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    requirePermission(req, 'projects.manage');
    const client = await requireDb(req);
    const tenantId = req.tenantId;
    if (!tenantId) {
      const error = new Error('Missing tenant context');
      (error as Error & { statusCode: number }).statusCode = 403;
      throw error;
    }
    const { id } = projectIdParamsSchema.parse(req.params as unknown);

    const input = updateProjectSchema.parse(req.body ?? {});

    const row = await client.query('SELECT settings FROM projects WHERE id = $1 LIMIT 1', [id]);
    if (row.rowCount === 0) {
      const error = new Error('Project not found');
      (error as Error & { statusCode: number }).statusCode = 404;
      throw error;
    }

    const currentSettings = (row.rows[0]?.settings as unknown) ?? {};
    const nextSettings: Record<string, unknown> =
      currentSettings && typeof currentSettings === 'object' ? (currentSettings as Record<string, unknown>) : {};

    if (input.targetKeywords) {
      nextSettings.targetKeywords = input.targetKeywords;
    }

    const updated = await client.query(
      `UPDATE projects
       SET name = COALESCE($2, name),
           domain = COALESCE($3, domain),
           settings = $4::jsonb,
           updated_at = now()
       WHERE id = $1
       RETURNING id, name, domain, settings, created_at, updated_at`,
      [id, input.name ?? null, input.domain ?? null, nextSettings],
    );

    const r = updated.rows[0];

    await writeAuditLog(client, {
      tenantId,
      userId: req.auth?.userId ?? null,
      projectId: id,
      action: 'project.update',
      resourceType: 'project',
      resourceId: id,
      metadata: {
        name: input.name,
        domain: input.domain,
        targetKeywords: input.targetKeywords,
      },
    });
    return {
      ok: true,
      project: {
        id: String(r.id),
        name: String(r.name),
        domain: String(r.domain),
        settings: (r.settings as unknown) ?? {},
        createdAt: (r.created_at ?? new Date()).toISOString(),
        updatedAt: (r.updated_at ?? new Date()).toISOString(),
      },
    };
    },
  );

  fastify.delete(
    '/api/projects/:id',
    {
      schema: {
        tags: ['projects'],
        description:
          'Delete a project.\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -X DELETE -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:3001/api/projects/<PROJECT_ID>\n' +
          '```\n',
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id'],
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: { ok: { type: 'boolean' }, id: { type: 'string', format: 'uuid' } },
            required: ['ok', 'id'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    requirePermission(req, 'projects.manage');
    const client = await requireDb(req);
    const { id } = projectIdParamsSchema.parse(req.params as unknown);

    const deleted = await client.query('DELETE FROM projects WHERE id = $1 RETURNING id', [id]);
    if (deleted.rowCount === 0) {
      const error = new Error('Project not found');
      (error as Error & { statusCode: number }).statusCode = 404;
      throw error;
    }

    const tenantId = req.tenantId;
    if (tenantId) {
      await writeAuditLog(client, {
        tenantId,
        userId: req.auth?.userId ?? null,
        projectId: id,
        action: 'project.delete',
        resourceType: 'project',
        resourceId: id,
      });
    }

    return { ok: true, id };
    },
  );
};
