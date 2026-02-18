import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../utils/authz.js';
import crypto from 'node:crypto';
import { assertSafeOutboundUrl } from '../utils/ssrf.js';
import { base64Url, encryptSecret, requireEncryptionSecret } from '../utils/crypto-secrets.js';

async function requireDb(req: { dbClient?: import('pg').PoolClient }) {
  if (!req.dbClient) {
    const error = new Error('DB not available');
    (error as Error & { statusCode: number }).statusCode = 500;
    throw error;
  }
  return req.dbClient;
}

const webhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string().min(1).max(200)).optional().default([]),
  enabled: z.boolean().optional().default(true),
});

const webhookPatchSchema = z
  .object({
    url: z.string().url().optional(),
    events: z.array(z.string().min(1).max(200)).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

const webhookIdParams = z.object({ id: z.string().uuid() });
const listDeliveriesQuery = z.object({ limit: z.coerce.number().int().positive().max(200).default(50) });

function maskSecret(secret: string): { prefix: string; last4: string } {
  const prefix = secret.slice(0, 10);
  const last4 = secret.slice(-4);
  return { prefix, last4 };
}

export const webhooksRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/webhooks
   * List webhook subscriptions (tenant-scoped).
   */
  fastify.get(
    '/api/webhooks',
    {
      schema: {
        tags: ['webhooks'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              webhooks: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    url: { type: 'string' },
                    events: { type: 'array', items: { type: 'string' } },
                    enabled: { type: 'boolean' },
                    createdAt: { type: 'string' },
                    updatedAt: { type: 'string' },
                  },
                  required: ['id', 'url', 'events', 'enabled', 'createdAt', 'updatedAt'],
                },
              },
            },
            required: ['ok', 'webhooks'],
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

      requireRole(req, ['admin', 'manager']);

      const row = await client.query(
        `SELECT id, url, events, enabled, created_at, updated_at, secret_ciphertext, secret_iv, secret_tag
         FROM webhooks
         WHERE tenant_id = $1
         ORDER BY updated_at DESC, created_at DESC`,
        [tenantId],
      );

      return {
        ok: true,
        webhooks: row.rows.map((r: any) => ({
          id: String(r.id),
          url: String(r.url),
          events: Array.isArray(r.events) ? (r.events as unknown[]).map(String) : [],
          enabled: !!r.enabled,
          signingEnabled: !!(r.secret_ciphertext && r.secret_iv && r.secret_tag),
          createdAt: (r.created_at ?? new Date()).toISOString(),
          updatedAt: (r.updated_at ?? new Date()).toISOString(),
        })),
      };
    },
  );

  /**
   * POST /api/webhooks
   * Create a webhook subscription.
   */
  fastify.post(
    '/api/webhooks',
    {
      schema: {
        tags: ['webhooks'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            url: { type: 'string', format: 'uri' },
            events: { type: 'array', items: { type: 'string' } },
            enabled: { type: 'boolean' },
          },
          required: ['url'],
          additionalProperties: false,
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

      requireRole(req, ['admin', 'manager']);
      const input = webhookSchema.parse(req.body ?? {});

      await assertSafeOutboundUrl(input.url);

      const encryptionSecret = requireEncryptionSecret();
      const rawSecret = `whsec_${base64Url(crypto.randomBytes(24))}`;
      const masked = maskSecret(rawSecret);
      const encrypted = encryptSecret(rawSecret, encryptionSecret);

      const created = await client.query(
        `INSERT INTO webhooks (
           tenant_id, url, events, enabled,
           secret_ciphertext, secret_iv, secret_tag,
           created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
         RETURNING id, url, events, enabled, created_at, updated_at`,
        [tenantId, input.url, input.events, input.enabled, encrypted.ciphertext, encrypted.iv, encrypted.tag],
      );

      const r = created.rows[0] as any;
      return {
        ok: true,
        secret: rawSecret,
        maskedSecret: `${masked.prefix}...${masked.last4}`,
        webhook: {
          id: String(r.id),
          url: String(r.url),
          events: Array.isArray(r.events) ? (r.events as unknown[]).map(String) : [],
          enabled: !!r.enabled,
          signingEnabled: true,
          createdAt: (r.created_at ?? new Date()).toISOString(),
          updatedAt: (r.updated_at ?? new Date()).toISOString(),
        },
      };
    },
  );

  /**
   * PATCH /api/webhooks/:id
   */
  fastify.patch(
    '/api/webhooks/:id',
    {
      schema: {
        tags: ['webhooks'],
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
        body: {
          type: 'object',
          properties: {
            url: { type: 'string', format: 'uri' },
            events: { type: 'array', items: { type: 'string' } },
            enabled: { type: 'boolean' },
          },
          additionalProperties: false,
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

      requireRole(req, ['admin', 'manager']);
      const { id } = webhookIdParams.parse(req.params as any);
      const input = webhookPatchSchema.parse(req.body ?? {});

      if (input.url) {
        await assertSafeOutboundUrl(input.url);
      }

      const updated = await client.query(
        `UPDATE webhooks
         SET url = COALESCE($3, url),
             events = COALESCE($4, events),
             enabled = COALESCE($5, enabled),
             updated_at = now()
         WHERE id = $1 AND tenant_id = $2
         RETURNING id, url, events, enabled, created_at, updated_at, secret_ciphertext, secret_iv, secret_tag`,
        [id, tenantId, input.url ?? null, input.events ?? null, input.enabled ?? null],
      );

      if ((updated.rowCount ?? 0) === 0) {
        const error = new Error('Webhook not found');
        (error as Error & { statusCode: number }).statusCode = 404;
        throw error;
      }

      const r = updated.rows[0] as any;
      return {
        ok: true,
        webhook: {
          id: String(r.id),
          url: String(r.url),
          events: Array.isArray(r.events) ? (r.events as unknown[]).map(String) : [],
          enabled: !!r.enabled,
          signingEnabled: !!(r.secret_ciphertext && r.secret_iv && r.secret_tag),
          createdAt: (r.created_at ?? new Date()).toISOString(),
          updatedAt: (r.updated_at ?? new Date()).toISOString(),
        },
      };
    },
  );

  /**
   * POST /api/webhooks/:id/rotate-secret
   * Rotate signing secret (admin/manager). Returns the new secret once.
   */
  fastify.post(
    '/api/webhooks/:id/rotate-secret',
    {
      schema: {
        tags: ['webhooks'],
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              id: { type: 'string', format: 'uuid' },
              secret: { type: 'string' },
              maskedSecret: { type: 'string' },
            },
            required: ['ok', 'id', 'secret', 'maskedSecret'],
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

      requireRole(req, ['admin', 'manager']);
      const { id } = webhookIdParams.parse(req.params as any);

      const encryptionSecret = requireEncryptionSecret();
      const rawSecret = `whsec_${base64Url(crypto.randomBytes(24))}`;
      const masked = maskSecret(rawSecret);
      const encrypted = encryptSecret(rawSecret, encryptionSecret);

      const updated = await client.query(
        `UPDATE webhooks
         SET secret_ciphertext = $3,
             secret_iv = $4,
             secret_tag = $5,
             updated_at = now()
         WHERE id = $1 AND tenant_id = $2
         RETURNING id`,
        [id, tenantId, encrypted.ciphertext, encrypted.iv, encrypted.tag],
      );

      if ((updated.rowCount ?? 0) === 0) {
        const error = new Error('Webhook not found');
        (error as Error & { statusCode: number }).statusCode = 404;
        throw error;
      }

      return { ok: true, id, secret: rawSecret, maskedSecret: `${masked.prefix}...${masked.last4}` };
    },
  );

  /**
   * DELETE /api/webhooks/:id
   */
  fastify.delete(
    '/api/webhooks/:id',
    {
      schema: {
        tags: ['webhooks'],
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
        response: {
          200: {
            type: 'object',
            properties: { ok: { type: 'boolean' }, deletedId: { type: 'string', format: 'uuid' } },
            required: ['ok', 'deletedId'],
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

      requireRole(req, ['admin', 'manager']);
      const { id } = webhookIdParams.parse(req.params as any);

      const deleted = await client.query('DELETE FROM webhooks WHERE id = $1 AND tenant_id = $2 RETURNING id', [id, tenantId]);
      if ((deleted.rowCount ?? 0) === 0) {
        const error = new Error('Webhook not found');
        (error as Error & { statusCode: number }).statusCode = 404;
        throw error;
      }

      return { ok: true, deletedId: String(deleted.rows[0].id) };
    },
  );

  /**
   * GET /api/webhooks/:id/deliveries
   * Delivery logs.
   */
  fastify.get(
    '/api/webhooks/:id/deliveries',
    {
      schema: {
        tags: ['webhooks'],
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
        querystring: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 200 } } },
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

      requireRole(req, ['admin', 'manager']);
      const { id } = webhookIdParams.parse(req.params as any);
      const q = listDeliveriesQuery.parse(req.query ?? {});

      const row = await client.query(
        `SELECT id, webhook_id, event_type, event_seq, status_code, ok, error, created_at
         FROM webhook_deliveries
         WHERE tenant_id = $1 AND webhook_id = $2
         ORDER BY created_at DESC
         LIMIT $3`,
        [tenantId, id, q.limit],
      );

      return {
        ok: true,
        webhookId: id,
        deliveries: row.rows.map((r: any) => ({
          id: Number(r.id),
          eventType: String(r.event_type),
          eventSeq: r.event_seq === null || r.event_seq === undefined ? null : Number(r.event_seq),
          statusCode: r.status_code === null || r.status_code === undefined ? null : Number(r.status_code),
          ok: !!r.ok,
          error: r.error ? String(r.error) : null,
          createdAt: (r.created_at ?? new Date()).toISOString(),
        })),
      };
    },
  );
};
