import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { requirePermission } from '../utils/authz.js';

// ── Helpers ────────────────────────────────────────────────────────
async function requireDb(req: { dbClient?: import('pg').PoolClient }) {
  if (!req.dbClient) {
    const error = new Error('DB not available');
    (error as Error & { statusCode: number }).statusCode = 500;
    throw error;
  }
  return req.dbClient;
}

async function resolveDefaultProjectId(client: import('pg').PoolClient): Promise<string> {
  const row = await client.query('SELECT id FROM projects ORDER BY updated_at DESC, created_at DESC LIMIT 1');
  if (row.rowCount === 0) {
    const error = new Error('No project found for tenant');
    (error as Error & { statusCode: number }).statusCode = 404;
    throw error;
  }
  return String(row.rows[0].id);
}

// ── Validation schemas ─────────────────────────────────────────────
const reviewParamsSchema = z.object({
  id: z.string().uuid(),
});

const reviewBodySchema = z.object({
  action: z.enum(['approve', 'reject']),
  comment: z.string().max(2000).optional().default(''),
  reviewerName: z.string().max(200).optional().default('Reviewer'),
});

const pendingQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(20),
});

// ── Routes ─────────────────────────────────────────────────────────
export const reviewRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/content/review-queue
   * Returns all content drafts in pending_review status.
   */
  fastify.get(
    '/api/content/review-queue',
    {
      schema: {
        tags: ['review', 'content'],
        description: 'List content drafts pending human review (status=pending_review).',
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'number', minimum: 1, default: 1 },
            limit: { type: 'number', minimum: 1, maximum: 200, default: 20 },
          },
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              projectId: { type: 'string' },
              total: { type: 'number' },
              page: { type: 'number' },
              limit: { type: 'number' },
              data: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
            required: ['ok', 'projectId', 'total', 'page', 'limit', 'data'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    requirePermission(req, 'content.review');
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);
    const q = pendingQuerySchema.parse(req.query ?? {});
    const offset = (q.page - 1) * q.limit;

    const totalRow = await client.query(
      `SELECT COUNT(*)::int AS total FROM content_drafts
       WHERE project_id = $1 AND status = 'pending_review'`,
      [projectId],
    );
    const total = Number(totalRow.rows[0]?.total ?? 0);

    const rows = await client.query(
      `SELECT
         id, title, topic, primary_keyword, total_word_count, sections,
         created_at, updated_at, reviewed_by,
         (settings->>'review_history') AS review_history
       FROM content_drafts
       WHERE project_id = $1 AND status = 'pending_review'
       ORDER BY updated_at ASC
       LIMIT $2 OFFSET $3`,
      [projectId, q.limit, offset],
    );

    const data = (rows.rows as any[]).map((r) => ({
      id: String(r.id),
      title: String(r.title),
      topic: r.topic ? String(r.topic) : '',
      primaryKeyword: r.primary_keyword ? String(r.primary_keyword) : '',
      wordCount: Number(r.total_word_count ?? 0),
      createdAt: new Date(r.created_at ?? new Date()).toISOString(),
      updatedAt: new Date(r.updated_at ?? new Date()).toISOString(),
      reviewedBy: r.reviewed_by ? String(r.reviewed_by) : null,
      reviewHistory: (() => {
        try { return JSON.parse(r.review_history || '[]'); }
        catch { return []; }
      })(),
    }));

    return { ok: true, projectId, total, page: q.page, limit: q.limit, data };
    },
  );

  /**
   * POST /api/content/:id/review
   * Approve or reject a content draft.
   * - approve → status = 'approved', sets reviewed_by
   * - reject → status = 'rejected', sets reviewed_by
   * Adds an entry to review_history in settings JSONB.
   */
  fastify.post(
    '/api/content/:id/review',
    {
      schema: {
        tags: ['review', 'content'],
        description: 'Approve or reject a pending content draft and append to review history.',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
          additionalProperties: true,
        },
        body: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['approve', 'reject'] },
            comment: { type: 'string' },
            reviewerName: { type: 'string' },
          },
          required: ['action'],
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              id: { type: 'string' },
              status: { type: 'string' },
              reviewedBy: { type: 'string' },
              action: { type: 'string' },
            },
            required: ['ok', 'id', 'status', 'reviewedBy', 'action'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    requirePermission(req, 'content.review');
    const client = await requireDb(req);
    const params = reviewParamsSchema.parse((req as any).params ?? {});
    const body = reviewBodySchema.parse(req.body ?? {});

    // Verify draft exists and is pending_review
    const existing = await client.query(
      'SELECT id, status, settings FROM content_drafts WHERE id = $1 LIMIT 1',
      [params.id],
    );

    if ((existing.rowCount ?? 0) === 0) {
      const error = new Error('Content draft not found');
      (error as Error & { statusCode: number }).statusCode = 404;
      throw error;
    }

    const draft = existing.rows[0] as { id: string; status: string; settings: unknown };

    if (draft.status !== 'pending_review') {
      const error = new Error(`Cannot review: current status is '${draft.status}', expected 'pending_review'`);
      (error as Error & { statusCode: number }).statusCode = 400;
      throw error;
    }

    const newStatus = body.action === 'approve' ? 'approved' : 'rejected';

    // Append review history entry
    const settings = (draft.settings && typeof draft.settings === 'object') ? draft.settings as Record<string, unknown> : {};
    const history = Array.isArray(settings.review_history) ? settings.review_history as unknown[] : [];
    history.push({
      action: body.action,
      comment: body.comment,
      reviewer: body.reviewerName,
      timestamp: new Date().toISOString(),
    });
    settings.review_history = history;

    const updated = await client.query(
      `UPDATE content_drafts
       SET status = $2, reviewed_by = $3, settings = $4::jsonb, updated_at = now()
       WHERE id = $1
       RETURNING id, status, reviewed_by`,
      [params.id, newStatus, body.reviewerName, JSON.stringify(settings)],
    );

    return {
      ok: true,
      id: String(updated.rows[0].id),
      status: String(updated.rows[0].status),
      reviewedBy: String(updated.rows[0].reviewed_by),
      action: body.action,
    };
    },
  );

  /**
   * GET /api/content/:id/review-history
   * Returns the review history for a content draft.
   */
  fastify.get(
    '/api/content/:id/review-history',
    {
      schema: {
        tags: ['review', 'content'],
        description: 'Return review history array for a content draft.',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              id: { type: 'string' },
              status: { type: 'string' },
              reviewedBy: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              history: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
            required: ['ok', 'id', 'status', 'reviewedBy', 'history'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const params = reviewParamsSchema.parse((req as any).params ?? {});

    const row = await client.query(
      `SELECT id, status, reviewed_by, COALESCE(settings->>'review_history', '[]') AS review_history
       FROM content_drafts WHERE id = $1 LIMIT 1`,
      [params.id],
    );

    if ((row.rowCount ?? 0) === 0) {
      const error = new Error('Content draft not found');
      (error as Error & { statusCode: number }).statusCode = 404;
      throw error;
    }

    const r = row.rows[0] as any;
    let history: unknown[] = [];
    try { history = JSON.parse(r.review_history ?? '[]'); } catch { /* empty */ }

    return {
      ok: true,
      id: String(r.id),
      status: String(r.status),
      reviewedBy: r.reviewed_by ? String(r.reviewed_by) : null,
      history,
    };
    },
  );
};
