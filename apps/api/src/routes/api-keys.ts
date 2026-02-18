import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';

import { env } from '../config/env.js';
import { requireRole } from '../utils/authz.js';
import { writeAuditLog } from '../audit/audit-log.js';
import { base64Url, decryptSecret, encryptSecret, requireEncryptionSecret } from '../utils/crypto-secrets.js';

async function requireDb(req: { dbClient?: import('pg').PoolClient }) {
  if (!req.dbClient) {
    const error = new Error('DB not available');
    (error as Error & { statusCode: number }).statusCode = 500;
    throw error;
  }
  return req.dbClient;
}

// crypto helpers moved to utils/crypto-secrets.ts

const createApiKeySchema = z.object({
  name: z.string().min(1),
  projectId: z.string().uuid().optional(),
  permissions: z.array(z.string().min(1)).optional().default([]),
});

const apiKeyIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const updateApiKeySchema = z.object({
  name: z.string().min(1).optional(),
  permissions: z.array(z.string().min(1)).optional(),
});

export const apiKeysRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/api-keys',
    {
      schema: {
        tags: ['api-keys'],
        description:
          'List API keys (admin only).\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:3001/api/api-keys\n' +
          '```\n',
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              apiKeys: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
            required: ['ok', 'apiKeys'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
      requireRole(req, ['admin']);
      const client = await requireDb(req);

      const row = await client.query(
        `SELECT id, project_id, name, secret_prefix, last4, permissions, revoked_at, created_at
         FROM api_keys
         ORDER BY created_at DESC`,
      );

      return {
        ok: true,
        apiKeys: row.rows.map((r) => ({
          id: String(r.id),
          projectId: r.project_id ? String(r.project_id) : null,
          name: String(r.name),
          maskedKey: `${String(r.secret_prefix)}...${String(r.last4)}`,
          permissions: (r.permissions as unknown) ?? {},
          revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : null,
          createdAt: (r.created_at ?? new Date()).toISOString(),
        })),
      };
    },
  );

  fastify.post(
    '/api/api-keys',
    {
      schema: {
        tags: ['api-keys'],
        description:
          'Create an API key (admin only). Returns a secret once.\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -X POST \\\n  -H "Authorization: Bearer <ACCESS_TOKEN>" \\\n  -H "Content-Type: application/json" \\\n  -d "{\"name\":\"CI Key\",\"permissions\":[\"keywords\",\"reports\"]}" \\\n  http://localhost:3001/api/api-keys\n' +
          '```\n',
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            projectId: { type: 'string', format: 'uuid' },
            permissions: { type: 'array', items: { type: 'string' } },
          },
          required: ['name'],
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              secret: { type: 'string' },
              apiKey: { type: 'object', additionalProperties: true },
            },
            required: ['ok', 'secret', 'apiKey'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
      requireRole(req, ['admin']);
      const client = await requireDb(req);
      const tenantId = req.tenantId;
      const userId = req.auth?.userId ?? null;

      if (!tenantId) {
        const error = new Error('Missing tenant context');
        (error as Error & { statusCode: number }).statusCode = 403;
        throw error;
      }

      const encryptionSecret = requireEncryptionSecret();
      const input = createApiKeySchema.parse(req.body ?? {});

      if (input.projectId) {
        const ok = await client.query('SELECT id FROM projects WHERE id = $1 LIMIT 1', [input.projectId]);
        if ((ok.rowCount ?? 0) === 0) {
          const error = new Error('Invalid projectId');
          (error as Error & { statusCode: number }).statusCode = 400;
          throw error;
        }
      }

      const rawToken = `aiseo_${base64Url(crypto.randomBytes(24))}`;
      const prefix = rawToken.slice(0, 10);
      const last4 = rawToken.slice(-4);
      const encrypted = encryptSecret(rawToken, encryptionSecret);

      const inserted = await client.query(
        `INSERT INTO api_keys (
           tenant_id,
           project_id,
           name,
           secret_ciphertext,
           secret_iv,
           secret_tag,
           secret_prefix,
           last4,
           permissions
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
         RETURNING id, project_id, name, secret_prefix, last4, permissions, revoked_at, created_at`,
        [
          tenantId,
          input.projectId ?? null,
          input.name,
          encrypted.ciphertext,
          encrypted.iv,
          encrypted.tag,
          prefix,
          last4,
          { scopes: input.permissions },
        ],
      );

      const r = inserted.rows[0];

      await writeAuditLog(client, {
        tenantId,
        userId,
        projectId: input.projectId ?? null,
        action: 'api_key.create',
        resourceType: 'api_key',
        resourceId: String(r.id),
        metadata: {
          name: input.name,
          permissions: input.permissions,
        },
      });

      return {
        ok: true,
        secret: rawToken,
        apiKey: {
          id: String(r.id),
          projectId: r.project_id ? String(r.project_id) : null,
          name: String(r.name),
          maskedKey: `${String(r.secret_prefix)}...${String(r.last4)}`,
          permissions: (r.permissions as unknown) ?? {},
          revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : null,
          createdAt: (r.created_at ?? new Date()).toISOString(),
        },
      };
    },
  );

  fastify.get(
    '/api/api-keys/:id/reveal',
    {
      schema: {
        tags: ['api-keys'],
        description:
          'Reveal an API key secret (admin only).\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:3001/api/api-keys/<API_KEY_ID>/reveal\n' +
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
            properties: { ok: { type: 'boolean' }, id: { type: 'string', format: 'uuid' }, secret: { type: 'string' } },
            required: ['ok', 'id', 'secret'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
      requireRole(req, ['admin']);
      const client = await requireDb(req);
      const { id } = apiKeyIdParamsSchema.parse(req.params as unknown);

      const encryptionSecret = requireEncryptionSecret();

      const row = await client.query(
        `SELECT id, secret_ciphertext, secret_iv, secret_tag, revoked_at
         FROM api_keys
         WHERE id = $1
         LIMIT 1`,
        [id],
      );

      if (row.rowCount === 0) {
        const error = new Error('API key not found');
        (error as Error & { statusCode: number }).statusCode = 404;
        throw error;
      }

      const r = row.rows[0] as {
        id: string;
        secret_ciphertext: string;
        secret_iv: string;
        secret_tag: string;
        revoked_at: Date | null;
      };

      if (r.revoked_at) {
        const error = new Error('API key is revoked');
        (error as Error & { statusCode: number }).statusCode = 400;
        throw error;
      }

      const secret = decryptSecret(
        { ciphertext: r.secret_ciphertext, iv: r.secret_iv, tag: r.secret_tag },
        encryptionSecret,
      );

      return { ok: true, id: String(r.id), secret };
    },
  );

  fastify.post(
    '/api/api-keys/:id/revoke',
    {
      schema: {
        tags: ['api-keys'],
        description:
          'Revoke an API key (admin only).\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -X POST -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:3001/api/api-keys/<API_KEY_ID>/revoke\n' +
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
            properties: { ok: { type: 'boolean' }, id: { type: 'string', format: 'uuid' }, revokedAt: { type: 'string' } },
            required: ['ok', 'id', 'revokedAt'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
      requireRole(req, ['admin']);
      const client = await requireDb(req);
      const { id } = apiKeyIdParamsSchema.parse(req.params as unknown);
      const tenantId = req.tenantId;

      if (!tenantId) {
        const error = new Error('Missing tenant context');
        (error as Error & { statusCode: number }).statusCode = 403;
        throw error;
      }

      const updated = await client.query(
        `UPDATE api_keys
         SET revoked_at = now()
         WHERE id = $1 AND revoked_at IS NULL
         RETURNING id, revoked_at`,
        [id],
      );

      if (updated.rowCount === 0) {
        const error = new Error('API key not found or already revoked');
        (error as Error & { statusCode: number }).statusCode = 404;
        throw error;
      }

      await writeAuditLog(client, {
        tenantId,
        userId: req.auth?.userId ?? null,
        action: 'api_key.revoke',
        resourceType: 'api_key',
        resourceId: id,
      });

      return {
        ok: true,
        id,
        revokedAt: (updated.rows[0]?.revoked_at ?? new Date()).toISOString(),
      };
    },
  );

  fastify.post(
    '/api/api-keys/:id',
    {
      schema: {
        tags: ['api-keys'],
        description:
          'Update an API key name/permissions (admin only).\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -X POST \\\n  -H "Authorization: Bearer <ACCESS_TOKEN>" \\\n  -H "Content-Type: application/json" \\\n  -d "{\"name\":\"New name\"}" \\\n  http://localhost:3001/api/api-keys/<API_KEY_ID>\n' +
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
            permissions: { type: 'array', items: { type: 'string' } },
          },
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
      requireRole(req, ['admin']);
      const client = await requireDb(req);
      const { id } = apiKeyIdParamsSchema.parse(req.params as unknown);
      const tenantId = req.tenantId;

      if (!tenantId) {
        const error = new Error('Missing tenant context');
        (error as Error & { statusCode: number }).statusCode = 403;
        throw error;
      }

      const input = updateApiKeySchema.parse(req.body ?? {});

      const updated = await client.query(
        `UPDATE api_keys
         SET name = COALESCE($2, name),
             permissions = COALESCE($3::jsonb, permissions)
         WHERE id = $1
         RETURNING id`,
        [id, input.name ?? null, input.permissions ? { scopes: input.permissions } : null],
      );

      if (updated.rowCount === 0) {
        const error = new Error('API key not found');
        (error as Error & { statusCode: number }).statusCode = 404;
        throw error;
      }

      await writeAuditLog(client, {
        tenantId,
        userId: req.auth?.userId ?? null,
        action: 'api_key.update',
        resourceType: 'api_key',
        resourceId: id,
        metadata: {
          name: input.name,
          permissions: input.permissions,
        },
      });

      return { ok: true, id };
    },
  );
};
