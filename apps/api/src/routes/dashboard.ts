import type { FastifyPluginAsync } from 'fastify';

import { getJsonCache, setJsonCache, getRedis } from '../redis.js';
import { AppError, requireDb, resolveDefaultProjectId } from '../utils/index.js';

// PERF-02: invalidate dashboard cache for a tenant when a job completes.
export async function invalidateDashboardCache(tenantId: string, projectId: string): Promise<void> {
  try {
    const redis = getRedis() as unknown as { del(key: string): Promise<unknown> };
    await redis.del(`cache:dashboard:metrics:${tenantId}:${projectId}`);
  } catch {
    // best-effort
  }
}

function percentChange(current: number, previous: number): { change: number; trend: 'up' | 'down' } {
  const safePrev = previous === 0 ? 1 : previous;
  const delta = current - previous;
  const pct = Math.round((Math.abs(delta) / safePrev) * 100);
  return {
    change: pct,
    trend: delta >= 0 ? 'up' : 'down',
  };
}

export const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/dashboard/metrics',
    {
      schema: {
        tags: ['dashboard'],
        description:
          'Get dashboard metric cards for the default project.\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:3001/api/dashboard/metrics\n' +
          '```\n',
        response: {
          200: {
            type: 'object',
            properties: {
              organicTraffic: {
                type: 'object',
                properties: { value: { type: 'number' }, change: { type: 'number' }, trend: { type: 'string', enum: ['up', 'down'] } },
                required: ['value', 'change', 'trend'],
                additionalProperties: true,
              },
              topRankings: {
                type: 'object',
                properties: { value: { type: 'number' }, change: { type: 'number' }, trend: { type: 'string', enum: ['up', 'down'] } },
                required: ['value', 'change', 'trend'],
                additionalProperties: true,
              },
              trackedKeywords: {
                type: 'object',
                properties: { value: { type: 'number' }, change: { type: 'number' }, trend: { type: 'string', enum: ['up', 'down'] } },
                required: ['value', 'change', 'trend'],
                additionalProperties: true,
              },
              contentPublished: {
                type: 'object',
                properties: { value: { type: 'number' }, change: { type: 'number' }, trend: { type: 'string', enum: ['up', 'down'] } },
                required: ['value', 'change', 'trend'],
                additionalProperties: true,
              },
            },
            required: ['organicTraffic', 'topRankings', 'trackedKeywords', 'contentPublished'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req, reply) => {
    const client = await requireDb(req);
    const tenantId = (req as any).tenantId as string | undefined;
    const projectId = await resolveDefaultProjectId(client);

    // PERF-02: tenant-scoped cache key, 60s TTL, Cache-Control header
    const cacheKey = `cache:dashboard:metrics:${tenantId ?? 'anon'}:${projectId}`;
    const cached = await getJsonCache<{
      organicTraffic: { value: number; change: number; trend: 'up' | 'down' };
      topRankings: { value: number; change: number; trend: 'up' | 'down' };
      trackedKeywords: { value: number; change: number; trend: 'up' | 'down' };
      contentPublished: { value: number; change: number; trend: 'up' | 'down' };
    }>(cacheKey);
    if (cached) {
      void reply.header('Cache-Control', 'private, max-age=60');
      return cached;
    }

    const traffic = await client.query(
      `SELECT
         COALESCE(SUM(CASE WHEN checked_at >= now() - interval '30 days' THEN current_traffic ELSE 0 END), 0) AS current,
         COALESCE(SUM(CASE WHEN checked_at < now() - interval '30 days' AND checked_at >= now() - interval '60 days' THEN current_traffic ELSE 0 END), 0) AS previous
       FROM content_freshness_checks
       WHERE project_id = $1`,
      [projectId],
    );

    const rankings = await client.query(
      `WITH k AS (
         SELECT id FROM keywords WHERE project_id = $1
       ),
       latest AS (
         SELECT DISTINCT ON (r.keyword_id)
           r.keyword_id,
           r.rank AS current_rank
         FROM keyword_ranks r
         JOIN k ON k.id = r.keyword_id
         ORDER BY r.keyword_id, r.checked_at DESC
       ),
       prev AS (
         SELECT DISTINCT ON (r.keyword_id)
           r.keyword_id,
           r.rank AS previous_rank
         FROM keyword_ranks r
         JOIN k ON k.id = r.keyword_id
         WHERE r.checked_at < now() - interval '30 days'
         ORDER BY r.keyword_id, r.checked_at DESC
       )
       SELECT
         COUNT(*) FILTER (WHERE COALESCE(latest.current_rank, 999) <= 10) AS current,
         COUNT(*) FILTER (WHERE COALESCE(prev.previous_rank, 999) <= 10) AS previous
       FROM k
       LEFT JOIN latest ON latest.keyword_id = k.id
       LEFT JOIN prev ON prev.keyword_id = k.id`,
      [projectId],
    );

    const keywords = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE created_at < now() - interval '30 days') AS created_before,
         COUNT(*) AS total
       FROM keywords
       WHERE project_id = $1`,
      [projectId],
    );

    const content = await client.query(
      `SELECT
         COUNT(*) FILTER (
           WHERE status = 'published'
             AND COALESCE(published_at, updated_at, created_at) >= date_trunc('month', now())
         ) AS current,
         COUNT(*) FILTER (
           WHERE status = 'published'
             AND COALESCE(published_at, updated_at, created_at) >= date_trunc('month', now() - interval '1 month')
             AND COALESCE(published_at, updated_at, created_at) < date_trunc('month', now())
         ) AS previous
       FROM content_drafts
       WHERE project_id = $1`,
      [projectId],
    );

    const trafficCurrent = Number(traffic.rows[0]?.current ?? 0);
    const trafficPrevious = Number(traffic.rows[0]?.previous ?? 0);
    const top10Current = Number(rankings.rows[0]?.current ?? 0);
    const top10Previous = Number(rankings.rows[0]?.previous ?? 0);
    const keywordsTotal = Number(keywords.rows[0]?.total ?? 0);
    const keywordsBefore = Number(keywords.rows[0]?.created_before ?? 0);
    const publishedCurrent = Number(content.rows[0]?.current ?? 0);
    const publishedPrevious = Number(content.rows[0]?.previous ?? 0);

    const response = {
      organicTraffic: {
        value: trafficCurrent,
        ...percentChange(trafficCurrent, trafficPrevious),
      },
      topRankings: {
        value: top10Current,
        ...percentChange(top10Current, top10Previous),
      },
      trackedKeywords: {
        value: keywordsTotal,
        ...percentChange(keywordsTotal, keywordsBefore),
      },
      contentPublished: {
        value: publishedCurrent,
        ...percentChange(publishedCurrent, publishedPrevious),
      },
    };

    await setJsonCache(cacheKey, response, 60); // PERF-02: 60s TTL
    void reply.header('Cache-Control', 'private, max-age=60');
    return response;
    },
  );
};
