import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

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

const timelineQuerySchema = z.object({
  range: z.enum(['7d', '30d', '90d']).optional().default('30d'),
});

const gapQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
});

const outreachUpdateParams = z.object({ id: z.string().uuid() });
const outreachUpdateBody = z.object({
  status: z.enum(['draft', 'sent', 'opened', 'replied', 'accepted', 'rejected']),
});

export const backlinksRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/backlinks/profile',
    {
      schema: {
        tags: ['backlinks'],
        description: 'Return backlink profile aggregates for the default project.',
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              projectId: { type: 'string' },
              totals: {
                type: 'object',
                properties: {
                  backlinks: { type: 'number' },
                  referringDomains: { type: 'number' },
                },
                required: ['backlinks', 'referringDomains'],
                additionalProperties: false,
              },
              daBuckets: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    bucket: { type: 'string' },
                    count: { type: 'number' },
                  },
                  required: ['bucket', 'count'],
                  additionalProperties: false,
                },
              },
            },
            required: ['ok', 'projectId', 'totals', 'daBuckets'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);

    const totals = await client.query(
      `SELECT
         COUNT(*)::int AS opportunities,
         COUNT(DISTINCT target_domain)::int AS referring_domains
       FROM backlink_opportunities
       WHERE project_id = $1`,
      [projectId],
    );

    const buckets = await client.query(
      `SELECT
         CASE
           WHEN domain_rating IS NULL THEN 'unknown'
           WHEN domain_rating < 20 THEN '0-19'
           WHEN domain_rating < 40 THEN '20-39'
           WHEN domain_rating < 60 THEN '40-59'
           WHEN domain_rating < 80 THEN '60-79'
           ELSE '80-100'
         END AS bucket,
         COUNT(*)::int AS c
       FROM backlink_opportunities
       WHERE project_id = $1
       GROUP BY bucket
       ORDER BY bucket`,
      [projectId],
    );

    return {
      ok: true,
      projectId,
      totals: {
        backlinks: Number(totals.rows[0]?.opportunities ?? 0),
        referringDomains: Number(totals.rows[0]?.referring_domains ?? 0),
      },
      daBuckets: (buckets.rows as any[]).map((r) => ({
        bucket: String(r.bucket),
        count: Number(r.c ?? 0),
      })),
    };
    },
  );

  fastify.get(
    '/api/backlinks/timeline',
    {
      schema: {
        tags: ['backlinks'],
        description: 'Return simple backlink discovery timeline points for the default project.',
        querystring: {
          type: 'object',
          properties: {
            range: { type: 'string', enum: ['7d', '30d', '90d'], default: '30d' },
          },
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              projectId: { type: 'string' },
              range: { type: 'string' },
              points: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    date: { type: 'string' },
                    new: { type: 'number' },
                    lost: { type: 'number' },
                  },
                  required: ['date', 'new', 'lost'],
                  additionalProperties: false,
                },
              },
            },
            required: ['ok', 'projectId', 'range', 'points'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);
    const q = timelineQuerySchema.parse(req.query ?? {});
    const intervalText = q.range === '7d' ? '7 days' : q.range === '90d' ? '90 days' : '30 days';

    const discovered = await client.query(
      `SELECT date_trunc('day', discovered_at) AS day, COUNT(*)::int AS c
       FROM backlink_opportunities
       WHERE project_id = $1
         AND discovered_at >= now() - $2::interval
       GROUP BY day
       ORDER BY day ASC`,
      [projectId, intervalText],
    );

    // MVP: lost links tracking is not available yet; return zeros.
    const points = (discovered.rows as any[]).map((r) => ({
      date: new Date(r.day).toISOString().slice(0, 10),
      new: Number(r.c ?? 0),
      lost: 0,
    }));

    return { ok: true, projectId, range: q.range, points };
    },
  );

  fastify.get(
    '/api/backlinks/outreach',
    {
      schema: {
        tags: ['backlinks'],
        description: 'List outreach campaigns for the default project.',
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              projectId: { type: 'string' },
              campaigns: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    campaignId: { type: 'string' },
                    targetDomain: { type: 'string' },
                    contactEmail: { type: 'string' },
                    subject: { type: 'string' },
                    status: { type: 'string' },
                    createdAt: { type: 'string' },
                    updatedAt: { type: 'string' },
                  },
                  required: ['id', 'campaignId', 'targetDomain', 'contactEmail', 'subject', 'status', 'createdAt', 'updatedAt'],
                  additionalProperties: true,
                },
              },
            },
            required: ['ok', 'projectId', 'campaigns'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);

    const rows = await client.query(
      `SELECT
         id,
         campaign_id,
         target_domain,
         contact_email,
         subject,
         status,
         created_at,
         updated_at
       FROM outreach_campaigns
       WHERE project_id = $1
       ORDER BY updated_at DESC
       LIMIT 200`,
      [projectId],
    );

    return {
      ok: true,
      projectId,
      campaigns: (rows.rows as any[]).map((r) => ({
        id: String(r.id),
        campaignId: String(r.campaign_id),
        targetDomain: String(r.target_domain),
        contactEmail: String(r.contact_email),
        subject: String(r.subject),
        status: String(r.status),
        createdAt: new Date(r.created_at ?? new Date()).toISOString(),
        updatedAt: new Date(r.updated_at ?? new Date()).toISOString(),
      })),
    };
    },
  );

  fastify.post(
    '/api/backlinks/outreach/:id',
    {
      schema: {
        tags: ['backlinks'],
        description: 'Update outreach campaign status.',
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
            status: { type: 'string', enum: ['draft', 'sent', 'opened', 'replied', 'accepted', 'rejected'] },
          },
          required: ['status'],
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              id: { type: 'string' },
              status: { type: 'string' },
            },
            required: ['ok', 'id', 'status'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);
    const params = outreachUpdateParams.parse((req as any).params ?? {});
    const body = outreachUpdateBody.parse(req.body ?? {});

    const updated = await client.query(
      `UPDATE outreach_campaigns
       SET status = $3, updated_at = now()
       WHERE id = $1 AND project_id = $2
       RETURNING id, status`,
      [params.id, projectId, body.status],
    );

    if (updated.rowCount === 0) {
      const error = new Error('Outreach campaign not found');
      (error as Error & { statusCode: number }).statusCode = 404;
      throw error;
    }

    return { ok: true, id: String(updated.rows[0].id), status: String(updated.rows[0].status) };
    },
  );

  fastify.get(
    '/api/backlinks/gap',
    {
      schema: {
        tags: ['backlinks'],
        description: 'List backlink gap opportunities for the default project.',
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', minimum: 1, maximum: 200, default: 50 },
          },
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              projectId: { type: 'string' },
              opportunities: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    targetDomain: { type: 'string' },
                    targetUrl: { type: 'string' },
                    domainRating: { anyOf: [{ type: 'number' }, { type: 'null' }] },
                    priority: { type: 'string' },
                    competitors: { type: 'array', items: { type: 'string' } },
                    status: { type: 'string' },
                    discoveredAt: { type: 'string' },
                  },
                  required: ['id', 'targetDomain', 'targetUrl', 'domainRating', 'priority', 'competitors', 'status', 'discoveredAt'],
                  additionalProperties: true,
                },
              },
            },
            required: ['ok', 'projectId', 'opportunities'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);
    const q = gapQuerySchema.parse(req.query ?? {});

    const rows = await client.query(
      `SELECT
         id,
         target_domain,
         target_url,
         domain_rating,
         priority,
         competitors_having_link,
         status,
         discovered_at
       FROM backlink_opportunities
       WHERE project_id = $1
         AND competitors_having_link IS NOT NULL
         AND array_length(competitors_having_link, 1) > 0
       ORDER BY discovered_at DESC
       LIMIT $2`,
      [projectId, q.limit],
    );

    return {
      ok: true,
      projectId,
      opportunities: (rows.rows as any[]).map((r) => ({
        id: String(r.id),
        targetDomain: String(r.target_domain),
        targetUrl: String(r.target_url),
        domainRating: r.domain_rating === null || r.domain_rating === undefined ? null : Number(r.domain_rating),
        priority: String(r.priority),
        competitors: Array.isArray(r.competitors_having_link) ? (r.competitors_having_link as unknown[]).map(String) : [],
        status: String(r.status),
        discoveredAt: new Date(r.discovered_at ?? new Date()).toISOString(),
      })),
    };
    },
  );

  // ── HITL Outreach Pre-Send Review ─────────────────────────────────
  // List outreach drafts that are pending human approval before sending.
  fastify.get(
    '/api/backlinks/outreach/pending',
    {
      schema: {
        tags: ['backlinks'],
        description: 'List outreach drafts pending human approval (status=draft).',
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              projectId: { type: 'string' },
              pending: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    campaignId: { type: 'string' },
                    targetDomain: { type: 'string' },
                    contactEmail: { type: 'string' },
                    subject: { type: 'string' },
                    status: { type: 'string' },
                    createdAt: { type: 'string' },
                    updatedAt: { type: 'string' },
                  },
                  required: ['id', 'campaignId', 'targetDomain', 'contactEmail', 'subject', 'status', 'createdAt', 'updatedAt'],
                  additionalProperties: true,
                },
              },
            },
            required: ['ok', 'projectId', 'pending'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);

    const rows = await client.query(
      `SELECT
         id, campaign_id, target_domain, contact_email,
         subject, status, created_at, updated_at
       FROM outreach_campaigns
       WHERE project_id = $1 AND status = 'draft'
       ORDER BY created_at DESC
       LIMIT 100`,
      [projectId],
    );

    return {
      ok: true,
      projectId,
      pending: (rows.rows as any[]).map((r) => ({
        id: String(r.id),
        campaignId: String(r.campaign_id),
        targetDomain: String(r.target_domain),
        contactEmail: String(r.contact_email),
        subject: String(r.subject),
        status: String(r.status),
        createdAt: new Date(r.created_at ?? new Date()).toISOString(),
        updatedAt: new Date(r.updated_at ?? new Date()).toISOString(),
      })),
    };
    },
  );

  // Approve an outreach draft → transitions status to 'sent'.
  const outreachApproveParams = z.object({ id: z.string().uuid() });
  const outreachApproveBody = z.object({
    action: z.enum(['approve', 'reject']),
    comment: z.string().max(2000).optional(),
  });

  fastify.post(
    '/api/backlinks/outreach/:id/review',
    {
      schema: {
        tags: ['backlinks'],
        description: 'Approve/reject an outreach draft (HITL pre-send review).',
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
              action: { type: 'string' },
              comment: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            },
            required: ['ok', 'id', 'status', 'action', 'comment'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);
    const params = outreachApproveParams.parse((req as any).params ?? {});
    const body = outreachApproveBody.parse(req.body ?? {});

    // Verify it's still a draft
    const check = await client.query(
      `SELECT id, status FROM outreach_campaigns WHERE id = $1 AND project_id = $2`,
      [params.id, projectId],
    );
    if (check.rowCount === 0) {
      const error = new Error('Outreach campaign not found');
      (error as Error & { statusCode: number }).statusCode = 404;
      throw error;
    }
    if (String(check.rows[0].status) !== 'draft') {
      const error = new Error('Only draft outreach can be reviewed');
      (error as Error & { statusCode: number }).statusCode = 400;
      throw error;
    }

    const nextStatus = body.action === 'approve' ? 'sent' : 'rejected';

    const updated = await client.query(
      `UPDATE outreach_campaigns
       SET status = $3, updated_at = now()
       WHERE id = $1 AND project_id = $2
       RETURNING id, status`,
      [params.id, projectId, nextStatus],
    );

    return {
      ok: true,
      id: String(updated.rows[0].id),
      status: String(updated.rows[0].status),
      action: body.action,
      comment: body.comment ?? null,
    };
    },
  );
};
