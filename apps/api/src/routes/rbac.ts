import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';

import { requirePermission, requireRole } from '../utils/authz.js';

async function requireDb(req: { dbClient?: import('pg').PoolClient }) {
  if (!req.dbClient) {
    const error = new Error('DB not available');
    (error as Error & { statusCode: number }).statusCode = 500;
    throw error;
  }
  return req.dbClient;
}

const roleSchema = z.enum(['admin', 'manager', 'analyst']);

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: roleSchema.default('analyst'),
});

const userIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).optional(),
  role: roleSchema.optional(),
});

const projectMembershipListQuerySchema = z.object({
  userId: z.string().uuid(),
});

const projectMembershipUpsertSchema = z.object({
  userId: z.string().uuid(),
  projectId: z.string().uuid(),
  role: roleSchema.default('analyst'),
});

const projectMembershipParamsSchema = z.object({
  userId: z.string().uuid(),
  projectId: z.string().uuid(),
});

export const rbacRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/rbac/users',
    {
      schema: {
        tags: ['rbac'],
        description:
          'List users in the current tenant (admin only).\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:3001/api/rbac/users\n' +
          '```\n',
        response: {
          200: {
            type: 'object',
            properties: { ok: { type: 'boolean' }, users: { type: 'array', items: { type: 'object', additionalProperties: true } } },
            required: ['ok', 'users'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    requirePermission(req, 'rbac.manage');
    const client = await requireDb(req);

    const tenantId = req.tenantId;
    if (!tenantId) {
      const error = new Error('Missing tenant context');
      (error as Error & { statusCode: number }).statusCode = 403;
      throw error;
    }

    const rows = await client.query(
      `SELECT u.id, u.email, u.name, m.role, u.created_at, u.updated_at
       FROM memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.tenant_id = $1
       ORDER BY u.created_at DESC`,
      [tenantId],
    );

    return {
      ok: true,
      users: rows.rows.map((r) => ({
        id: String(r.id),
        email: String(r.email),
        name: String(r.name),
        role: roleSchema.parse(r.role),
        createdAt: (r.created_at ?? new Date()).toISOString(),
        updatedAt: (r.updated_at ?? new Date()).toISOString(),
      })),
    };
    },
  );

  fastify.post(
    '/api/rbac/users',
    {
      schema: {
        tags: ['rbac'],
        description:
          'Create/add a user to the current tenant (admin only).\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -X POST \\\n+  -H "Authorization: Bearer <ACCESS_TOKEN>" \\\n+  -H "Content-Type: application/json" \\\n+  -d "{\"email\":\"user@example.com\",\"name\":\"User\",\"role\":\"analyst\"}" \\\n+  http://localhost:3001/api/rbac/users\n' +
          '```\n',
        body: {
          type: 'object',
          properties: {
            email: { type: 'string' },
            name: { type: 'string' },
            role: { type: 'string', enum: ['admin', 'manager', 'analyst'] },
          },
          required: ['email', 'name'],
          additionalProperties: true,
        },
        response: {
          200: { type: 'object', properties: { ok: { type: 'boolean' }, userId: { type: 'string', format: 'uuid' } }, required: ['ok', 'userId'], additionalProperties: true },
        },
      },
    },
    async (req) => {
    requirePermission(req, 'rbac.manage');
    const client = await requireDb(req);

    const tenantId = req.tenantId;
    if (!tenantId) {
      const error = new Error('Missing tenant context');
      (error as Error & { statusCode: number }).statusCode = 403;
      throw error;
    }

    const input = createUserSchema.parse(req.body ?? {});

    const existing = await client.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [input.email]);

    let userId: string;

    if ((existing.rowCount ?? 0) > 0) {
      userId = String(existing.rows[0].id);

      // Only update the global user record if the user is already a member of this tenant.
      const hasMembership = await client.query(
        'SELECT 1 FROM memberships WHERE tenant_id = $1 AND user_id = $2 LIMIT 1',
        [tenantId, userId],
      );

      if ((hasMembership.rowCount ?? 0) > 0) {
        await client.query('UPDATE users SET name = $2, updated_at = now() WHERE id = $1', [userId, input.name]);
      }
    } else {
      const passwordHash = `pending:${crypto.randomBytes(16).toString('hex')}`;
      const created = await client.query(
        `INSERT INTO users (email, name, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [input.email, input.name, passwordHash],
      );
      userId = String(created.rows[0].id);
    }

    await client.query(
      `INSERT INTO memberships (tenant_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, user_id)
       DO UPDATE SET role = EXCLUDED.role`,
      [tenantId, userId, input.role],
    );

    return { ok: true, userId };
    },
  );

  fastify.post(
    '/api/rbac/users/:id',
    {
      schema: {
        tags: ['rbac'],
        description:
          'Update a user (admin only). Can change name/email and/or role within current tenant.\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -X POST \\\n+  -H "Authorization: Bearer <ACCESS_TOKEN>" \\\n+  -H "Content-Type: application/json" \\\n+  -d "{\"role\":\"manager\"}" \\\n+  http://localhost:3001/api/rbac/users/<USER_ID>\n' +
          '```\n',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'], additionalProperties: true },
        body: {
          type: 'object',
          properties: {
            email: { type: 'string' },
            name: { type: 'string' },
            role: { type: 'string', enum: ['admin', 'manager', 'analyst'] },
          },
          additionalProperties: true,
        },
        response: {
          200: { type: 'object', properties: { ok: { type: 'boolean' }, userId: { type: 'string', format: 'uuid' } }, required: ['ok', 'userId'], additionalProperties: true },
        },
      },
    },
    async (req) => {
    requirePermission(req, 'rbac.manage');
    const client = await requireDb(req);

    const tenantId = req.tenantId;
    if (!tenantId) {
      const error = new Error('Missing tenant context');
      (error as Error & { statusCode: number }).statusCode = 403;
      throw error;
    }

    const { id: userId } = userIdParamsSchema.parse(req.params as unknown);
    const input = updateUserSchema.parse(req.body ?? {});

    // Ensure the target user is in this tenant.
    const membership = await client.query(
      'SELECT role FROM memberships WHERE tenant_id = $1 AND user_id = $2 LIMIT 1',
      [tenantId, userId],
    );
    if ((membership.rowCount ?? 0) === 0) {
      const error = new Error('Membership not found');
      (error as Error & { statusCode: number }).statusCode = 404;
      throw error;
    }

    if (input.email || input.name) {
      const updated = await client.query(
        `UPDATE users
         SET email = COALESCE($2, email),
             name = COALESCE($3, name),
             updated_at = now()
         WHERE id = $1
         RETURNING id`,
        [userId, input.email ?? null, input.name ?? null],
      );

      if (updated.rowCount === 0) {
        const error = new Error('User not found');
        (error as Error & { statusCode: number }).statusCode = 404;
        throw error;
      }
    }

    if (input.role) {
      const updatedMembership = await client.query(
        `UPDATE memberships
         SET role = $3
         WHERE tenant_id = $1 AND user_id = $2
         RETURNING user_id`,
        [tenantId, userId, input.role],
      );

      if (updatedMembership.rowCount === 0) {
        const error = new Error('Membership not found');
        (error as Error & { statusCode: number }).statusCode = 404;
        throw error;
      }
    }

    return { ok: true, userId };
    },
  );

  fastify.get(
    '/api/rbac/project-memberships',
    {
      schema: {
        tags: ['rbac'],
        description:
          'List project memberships for a user within the current tenant (admin only).\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -H "Authorization: Bearer <ACCESS_TOKEN>" "http://localhost:3001/api/rbac/project-memberships?userId=<USER_ID>"\n' +
          '```\n',
        querystring: {
          type: 'object',
          properties: { userId: { type: 'string', format: 'uuid' } },
          required: ['userId'],
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              userId: { type: 'string', format: 'uuid' },
              memberships: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
            required: ['ok', 'userId', 'memberships'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    requirePermission(req, 'rbac.manage');
    const client = await requireDb(req);

    const tenantId = req.tenantId;
    if (!tenantId) {
      const error = new Error('Missing tenant context');
      (error as Error & { statusCode: number }).statusCode = 403;
      throw error;
    }

    const q = projectMembershipListQuerySchema.parse(req.query ?? {});

    const rows = await client.query(
      `SELECT pm.project_id, pm.role, p.name, p.domain
       FROM project_memberships pm
       JOIN projects p ON p.id = pm.project_id
       WHERE pm.tenant_id = $1 AND pm.user_id = $2
       ORDER BY p.updated_at DESC, p.created_at DESC`,
      [tenantId, q.userId],
    );

    return {
      ok: true,
      userId: q.userId,
      memberships: (rows.rows as any[]).map((r) => ({
        projectId: String(r.project_id),
        role: roleSchema.parse(r.role),
        projectName: String(r.name ?? ''),
        projectDomain: String(r.domain ?? ''),
      })),
    };
    },
  );

  fastify.post(
    '/api/rbac/project-memberships',
    {
      schema: {
        tags: ['rbac'],
        description: 'Upsert a project membership for a user (admin only).',
        body: {
          type: 'object',
          properties: {
            userId: { type: 'string', format: 'uuid' },
            projectId: { type: 'string', format: 'uuid' },
            role: { type: 'string', enum: ['admin', 'manager', 'analyst'] },
          },
          required: ['userId', 'projectId'],
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: { ok: { type: 'boolean' } },
            required: ['ok'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    requirePermission(req, 'rbac.manage');
    const client = await requireDb(req);

    const tenantId = req.tenantId;
    if (!tenantId) {
      const error = new Error('Missing tenant context');
      (error as Error & { statusCode: number }).statusCode = 403;
      throw error;
    }

    const input = projectMembershipUpsertSchema.parse(req.body ?? {});

    await client.query(
      `INSERT INTO project_memberships (tenant_id, project_id, user_id, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, project_id, user_id)
       DO UPDATE SET role = EXCLUDED.role`,
      [tenantId, input.projectId, input.userId, input.role],
    );

    return { ok: true };
    },
  );

  fastify.delete(
    '/api/rbac/project-memberships/:userId/:projectId',
    {
      schema: {
        tags: ['rbac'],
        description: 'Remove a project membership for a user (admin only).',
        params: {
          type: 'object',
          properties: {
            userId: { type: 'string', format: 'uuid' },
            projectId: { type: 'string', format: 'uuid' },
          },
          required: ['userId', 'projectId'],
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: { ok: { type: 'boolean' } },
            required: ['ok'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    requirePermission(req, 'rbac.manage');
    const client = await requireDb(req);

    const tenantId = req.tenantId;
    if (!tenantId) {
      const error = new Error('Missing tenant context');
      (error as Error & { statusCode: number }).statusCode = 403;
      throw error;
    }

    const params = projectMembershipParamsSchema.parse((req as any).params ?? {});

    await client.query(
      'DELETE FROM project_memberships WHERE tenant_id = $1 AND user_id = $2 AND project_id = $3',
      [tenantId, params.userId, params.projectId],
    );

    return { ok: true };
    },
  );

  fastify.get(
    '/api/rbac/permissions-matrix',
    {
      schema: {
        tags: ['rbac'],
        description:
          'Get a permission matrix (MVP/static).\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:3001/api/rbac/permissions-matrix\n' +
          '```\n',
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async () => {
    return {
      ok: true,
      roles: ['admin', 'manager', 'analyst'],
      permissions: [
        { key: 'projects', label: 'Projects', admin: true, manager: true, analyst: true },
        { key: 'apiKeys', label: 'API Keys', admin: true, manager: false, analyst: false },
        { key: 'notifications', label: 'Notifications', admin: true, manager: true, analyst: false },
        { key: 'users', label: 'Users & Roles', admin: true, manager: false, analyst: false },
        { key: 'export', label: 'Backup / Export', admin: true, manager: true, analyst: true },
        { key: 'contentReview', label: 'Content Review', admin: true, manager: true, analyst: false },
        { key: 'contentPublish', label: 'Content Publish', admin: true, manager: false, analyst: false },
      ],
    };
    },
  );
};
