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

function mapStatus(status: string): 'published' | 'draft' | 'pending' | 'scheduled' {
  switch (status) {
    case 'published':
      return 'published';
    case 'draft':
      return 'draft';
    case 'pending_review':
    case 'approved':
      return 'pending';
    default:
      return 'draft';
  }
}

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(20),
  filter: z.string().optional(),
});

const contentIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const updateDraftSchema = z.object({
  title: z.string().min(1).max(500),
  metaDescription: z.string().max(500).optional().default(''),
  primaryKeyword: z.string().max(200).optional().default(''),
  status: z.enum(['draft', 'pending_review', 'approved', 'rejected', 'published']).optional().default('draft'),
  markdown: z.string().optional().default(''),
});

const performanceQuerySchema = z.object({
  range: z.enum(['7d', '30d', '90d']).optional().default('30d'),
  tag: z.string().optional(),
  author: z.enum(['all', 'ai', 'reviewer']).optional().default('all'),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
});

function markdownToSections(markdown: string): { sections: Array<{ title: string; content: string; wordCount: number }>; totalWords: number } {
  const text = markdown.trim();
  const wordCount = text.length === 0 ? 0 : text.split(/\s+/).filter(Boolean).length;
  return {
    sections: [
      {
        title: 'Content',
        content: markdown,
        wordCount,
      },
    ],
    totalWords: wordCount,
  };
}

function sectionsToMarkdown(sections: unknown): string {
  if (!Array.isArray(sections)) return '';
  return sections
    .map((s) => {
      if (!s || typeof s !== 'object') return '';
      const content = 'content' in (s as any) ? String((s as any).content ?? '') : '';
      return content;
    })
    .filter(Boolean)
    .join('\n\n');
}

export const contentRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/content/performance',
    {
      schema: {
        tags: ['content'],
        description: 'Return content performance items for published drafts in the default project.',
        querystring: {
          type: 'object',
          properties: {
            range: { type: 'string', enum: ['7d', '30d', '90d'], default: '30d' },
            tag: { type: 'string' },
            author: { type: 'string', enum: ['all', 'ai', 'reviewer'], default: 'all' },
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
              range: { type: 'string' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    title: { type: 'string' },
                    tag: { type: 'string' },
                    publishedAt: { type: 'string' },
                    traffic: { type: 'number' },
                    rank: { type: 'number' },
                    conversions: { type: 'number' },
                    author: { type: 'string' },
                  },
                  required: ['id', 'title', 'tag', 'publishedAt', 'traffic', 'rank', 'conversions', 'author'],
                  additionalProperties: true,
                },
              },
            },
            required: ['ok', 'projectId', 'range', 'data'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);

    const q = performanceQuerySchema.parse(req.query ?? {});
    const intervalText = q.range === '7d' ? '7 days' : q.range === '90d' ? '90 days' : '30 days';
    const tag = q.tag?.trim() ? q.tag.trim() : null;

    const authorSql =
      q.author === 'ai'
        ? 'AND d.reviewed_by IS NULL'
        : q.author === 'reviewer'
          ? 'AND d.reviewed_by IS NOT NULL'
          : '';

    const tagSql = tag ? 'AND (d.topic ILIKE $3 OR d.title ILIKE $3)' : '';
    const params: Array<string | number | null> = [projectId, intervalText];
    if (tag) {
      params.push(`%${tag}%`);
    }

    const rows = await client.query(
      `SELECT
         d.id,
         d.title,
         d.topic,
         COALESCE(d.published_at, d.updated_at, d.created_at) AS published_ts,
         d.published_url,
         d.reviewed_by,
         cf.current_traffic,
         cf.best_rank
       FROM content_drafts d
       LEFT JOIN LATERAL (
         SELECT
           c.current_traffic,
           (
             SELECT MIN((kv.value)::int)
             FROM jsonb_each_text(COALESCE(c.current_rankings, '{}'::jsonb)) AS kv
             WHERE kv.value ~ '^[0-9]+$'
           ) AS best_rank
         FROM content_freshness_checks c
         WHERE c.project_id = d.project_id
           AND d.published_url IS NOT NULL
           AND c.url = d.published_url
         ORDER BY c.checked_at DESC
         LIMIT 1
       ) cf ON true
       WHERE d.project_id = $1
         AND d.status = 'published'
         AND COALESCE(d.published_at, d.updated_at, d.created_at) >= now() - $2::interval
         ${authorSql}
         ${tagSql}
       ORDER BY COALESCE(d.published_at, d.updated_at, d.created_at) DESC
       LIMIT $${tag ? 4 : 3}`,
      tag ? [...params, q.limit] : [...params, q.limit],
    );

    const data = rows.rows.map((r) => {
      const traffic = Number(r.current_traffic ?? 0);
      const conversions = traffic > 0 ? Math.floor(traffic * 0.01) : 0;
      return {
        id: String(r.id),
        title: String(r.title),
        tag: r.topic ? String(r.topic) : '',
        publishedAt: (r.published_ts ?? new Date()).toISOString(),
        traffic,
        rank: r.best_rank === null || r.best_rank === undefined ? 0 : Number(r.best_rank),
        conversions,
        author: r.reviewed_by ? 'Reviewer' : 'AI',
      };
    });

    return { ok: true, projectId, range: q.range, data };
    },
  );

  fastify.get(
    '/api/content/:id',
    {
      schema: {
        tags: ['content'],
        description: 'Get a single content draft by id.',
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
              draft: { type: 'object', additionalProperties: true },
            },
            required: ['ok', 'draft'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const params = contentIdParamsSchema.parse((req as any).params ?? {});

    const row = await client.query(
      `SELECT id, project_id, title, meta_description, status, primary_keyword, sections, total_word_count, created_at, updated_at
       FROM content_drafts
       WHERE id = $1
       LIMIT 1`,
      [params.id],
    );

    if (row.rowCount === 0) {
      const error = new Error('Content not found');
      (error as Error & { statusCode: number }).statusCode = 404;
      throw error;
    }

    const r = row.rows[0] as any;
    return {
      ok: true,
      draft: {
        id: String(r.id),
        projectId: String(r.project_id),
        title: String(r.title),
        metaDescription: r.meta_description ? String(r.meta_description) : '',
        status: String(r.status),
        primaryKeyword: r.primary_keyword ? String(r.primary_keyword) : '',
        markdown: sectionsToMarkdown(r.sections),
        totalWordCount: Number(r.total_word_count ?? 0),
        createdAt: (r.created_at ?? new Date()).toISOString(),
        updatedAt: (r.updated_at ?? new Date()).toISOString(),
      },
    };
    },
  );

  fastify.post(
    '/api/content/:id',
    {
      schema: {
        tags: ['content'],
        description: 'Update a content draft (stores markdown as sections).',
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
            title: { type: 'string' },
            metaDescription: { type: 'string' },
            primaryKeyword: { type: 'string' },
            status: { type: 'string', enum: ['draft', 'pending_review', 'approved', 'rejected', 'published'] },
            markdown: { type: 'string' },
          },
          required: ['title'],
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              draft: { type: 'object', additionalProperties: true },
            },
            required: ['ok', 'draft'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const params = contentIdParamsSchema.parse((req as any).params ?? {});
    const input = updateDraftSchema.parse(req.body ?? {});

    const mapped = markdownToSections(input.markdown);

    const updated = await client.query(
      `UPDATE content_drafts
       SET title = $2,
           meta_description = $3,
           primary_keyword = $4,
           status = $5,
           sections = $6::jsonb,
           total_word_count = $7,
           updated_at = now()
       WHERE id = $1
       RETURNING id, project_id, title, meta_description, status, primary_keyword, sections, total_word_count, created_at, updated_at`,
      [
        params.id,
        input.title,
        input.metaDescription || null,
        input.primaryKeyword || null,
        input.status,
        JSON.stringify(mapped.sections),
        mapped.totalWords,
      ],
    );

    if (updated.rowCount === 0) {
      const error = new Error('Content not found');
      (error as Error & { statusCode: number }).statusCode = 404;
      throw error;
    }

    const r = updated.rows[0] as any;
    return {
      ok: true,
      draft: {
        id: String(r.id),
        projectId: String(r.project_id),
        title: String(r.title),
        metaDescription: r.meta_description ? String(r.meta_description) : '',
        status: String(r.status),
        primaryKeyword: r.primary_keyword ? String(r.primary_keyword) : '',
        markdown: sectionsToMarkdown(r.sections),
        totalWordCount: Number(r.total_word_count ?? 0),
        createdAt: (r.created_at ?? new Date()).toISOString(),
        updatedAt: (r.updated_at ?? new Date()).toISOString(),
      },
    };
    },
  );

  fastify.get(
    '/api/content/status',
    {
      schema: {
        tags: ['content'],
        description: 'Return content draft status counts for the default project.',
        response: {
          200: {
            type: 'object',
            properties: {
              published: { type: 'number' },
              draft: { type: 'number' },
              pending: { type: 'number' },
              scheduled: { type: 'number' },
            },
            required: ['published', 'draft', 'pending', 'scheduled'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);

    const counts = await client.query(
      `SELECT status, COUNT(*)::int AS c
       FROM content_drafts
       WHERE project_id = $1
       GROUP BY status`,
      [projectId],
    );

    let published = 0;
    let draft = 0;
    let pending = 0;
    const scheduled = 0;

    for (const row of counts.rows) {
      const mapped = mapStatus(String(row.status));
      const c = Number(row.c ?? 0);
      if (mapped === 'published') published += c;
      if (mapped === 'draft') draft += c;
      if (mapped === 'pending') pending += c;
    }

    return { published, draft, pending, scheduled };
    },
  );

  fastify.get(
    '/api/content',
    {
      schema: {
        tags: ['content'],
        description: 'List content drafts for the default project with basic paging.',
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'number', minimum: 1, default: 1 },
            limit: { type: 'number', minimum: 1, maximum: 200, default: 20 },
            filter: { type: 'string' },
          },
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: { type: 'array', items: { type: 'object', additionalProperties: true } },
              total: { type: 'number' },
            },
            required: ['data', 'total'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);
    const query = listQuerySchema.parse(req.query ?? {});
    const offset = (query.page - 1) * query.limit;

    const filter = query.filter?.toLowerCase();
    const filterIsStatus = filter === 'published' || filter === 'draft' || filter === 'pending' || filter === 'scheduled';

    const where = filterIsStatus ? `AND status = $2` : '';
    const params: unknown[] = [projectId];
    if (filterIsStatus) {
      if (filter === 'published') params.push('published');
      if (filter === 'draft') params.push('draft');
      if (filter === 'pending') params.push('pending_review');
      if (filter === 'scheduled') params.push('__none__');
    }

    const totalSql = `SELECT COUNT(*)::int AS total FROM content_drafts WHERE project_id = $1 ${where}`;
    const totalRows = await client.query(totalSql, params as any);
    const total = Number(totalRows.rows[0]?.total ?? 0);

    const dataSql =
      `SELECT
         id,
         title,
         topic,
         status,
         total_word_count,
         primary_keyword,
         created_at,
         updated_at,
         reviewed_by
       FROM content_drafts
       WHERE project_id = $1
       ${where}
       ORDER BY updated_at DESC, created_at DESC
       LIMIT $${filterIsStatus ? 3 : 2}
       OFFSET $${filterIsStatus ? 4 : 3}`;

    const dataParams = filterIsStatus ? [...params, query.limit, offset] : [projectId, query.limit, offset];
    const rows = await client.query(dataSql, dataParams as any);

    const data = rows.rows.map((r) => {
      const status = mapStatus(String(r.status));
      const title = String(r.title);
      const topic = r.topic ? String(r.topic) : '';
      const excerpt = topic ? `${topic}` : title;

      return {
        id: String(r.id),
        title,
        excerpt,
        status,
        wordCount: Number(r.total_word_count ?? 0),
        lastModified: (r.updated_at ?? r.created_at ?? new Date()).toISOString(),
        author: r.reviewed_by ? 'Reviewer' : 'AI',
        targetKeyword: r.primary_keyword ? String(r.primary_keyword) : '',
      };
    });

    return { data, total };
    },
  );
};
