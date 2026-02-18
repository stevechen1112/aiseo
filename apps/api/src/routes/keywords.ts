import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function syntheticPosition(keyword: string): number {
  return (fnv1a(keyword) % 100) + 1; // 1..100
}

function syntheticVolume(keyword: string): number {
  const h = fnv1a(`vol:${keyword}`);
  return 50 + (h % 5000);
}

function syntheticDifficulty(keyword: string): number {
  const h = fnv1a(`diff:${keyword}`);
  return 1 + (h % 90);
}

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

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(20),
});

const distributionQuerySchema = z.object({
  range: z.enum(['7d', '30d', '90d']).optional().default('30d'),
});

export const keywordsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/keywords/distribution',
    {
      schema: {
        tags: ['keywords'],
        description:
          'Get keyword rank distribution buckets (Top 3/10/20/20+).\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -H "Authorization: Bearer <ACCESS_TOKEN>" "http://localhost:3001/api/keywords/distribution?range=30d"\n' +
          '```\n',
        querystring: {
          type: 'object',
          properties: { range: { type: 'string', enum: ['7d', '30d', '90d'] } },
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              topThree: { type: 'number' },
              topTen: { type: 'number' },
              topTwenty: { type: 'number' },
              topHundred: { type: 'number' },
            },
            required: ['topThree', 'topTen', 'topTwenty', 'topHundred'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);

    const q = distributionQuerySchema.parse(req.query ?? {});
    const intervalText = q.range === '7d' ? '7 days' : q.range === '90d' ? '90 days' : '30 days';

    const rows = await client.query(
      `WITH latest AS (
         SELECT
           k.id AS keyword_id,
           COALESCE(lr.rank, 999) AS rank
         FROM keywords k
         LEFT JOIN LATERAL (
           SELECT r.rank
           FROM keyword_ranks r
           WHERE r.keyword_id = k.id
             AND r.checked_at >= now() - $2::interval
           ORDER BY r.checked_at DESC
           LIMIT 1
         ) lr ON true
         WHERE k.project_id = $1
       )
       SELECT
         COUNT(*) FILTER (WHERE rank <= 3) AS top_three,
         COUNT(*) FILTER (WHERE rank > 3 AND rank <= 10) AS top_ten,
         COUNT(*) FILTER (WHERE rank > 10 AND rank <= 20) AS top_twenty,
         COUNT(*) FILTER (WHERE rank > 20) AS top_hundred
       FROM latest`,
      [projectId, intervalText],
    );

    const row = rows.rows[0] ?? {};
    return {
      topThree: Number(row.top_three ?? 0),
      topTen: Number(row.top_ten ?? 0),
      topTwenty: Number(row.top_twenty ?? 0),
      topHundred: Number(row.top_hundred ?? 0),
    };
    },
  );

  fastify.get(
    '/api/keywords',
    {
      schema: {
        tags: ['keywords'],
        description:
          'List keywords (paginated) for the default project.\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -H "Authorization: Bearer <ACCESS_TOKEN>" "http://localhost:3001/api/keywords?page=1&limit=20"\n' +
          '```\n',
        querystring: {
          type: 'object',
          properties: { page: { type: 'number' }, limit: { type: 'number' } },
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

    const totalRows = await client.query('SELECT COUNT(*)::int AS total FROM keywords WHERE project_id = $1', [projectId]);
    const total = Number(totalRows.rows[0]?.total ?? 0);

    const rows = await client.query(
      `SELECT
         k.id,
         k.keyword,
         k.created_at,
         lr.rank AS latest_rank,
         lr.result_url AS latest_url,
         lr.checked_at AS latest_checked_at,
         pr.rank AS prev_rank
       FROM keywords k
       LEFT JOIN LATERAL (
         SELECT r.rank, r.result_url, r.checked_at
         FROM keyword_ranks r
         WHERE r.keyword_id = k.id
         ORDER BY r.checked_at DESC
         LIMIT 1
       ) lr ON true
       LEFT JOIN LATERAL (
         SELECT r.rank
         FROM keyword_ranks r
         WHERE r.keyword_id = k.id
         ORDER BY r.checked_at DESC
         OFFSET 1
         LIMIT 1
       ) pr ON true
       WHERE k.project_id = $1
       ORDER BY COALESCE(lr.checked_at, k.created_at) DESC
       LIMIT $2
       OFFSET $3`,
      [projectId, query.limit, offset],
    );

    const data = rows.rows.map((r) => {
      const keyword = String(r.keyword);
      const latestRank = r.latest_rank === null || r.latest_rank === undefined ? null : Number(r.latest_rank);
      const prevRank = r.prev_rank === null || r.prev_rank === undefined ? null : Number(r.prev_rank);
      const position = latestRank ?? syntheticPosition(keyword);
      const change = latestRank !== null && prevRank !== null ? prevRank - latestRank : 0;

      return {
        id: String(r.id),
        keyword,
        position,
        change,
        volume: syntheticVolume(keyword),
        difficulty: syntheticDifficulty(keyword),
        url: r.latest_url ? String(r.latest_url) : '',
        lastUpdated: (r.latest_checked_at ?? r.created_at ?? new Date()).toISOString(),
      };
    });

    return { data, total };
    },
  );
};
