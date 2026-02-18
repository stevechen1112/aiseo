import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { createRedisConnection } from '@aiseo/core';
import { Queue } from 'bullmq';

import { env } from '../config/env.js';
import { computeTenantQuotas } from '../quotas/tenant-quotas.js';
import { reserveSerpJobsOrThrow } from '../quotas/usage.js';

const trackSchema = z.object({
  projectId: z.string().uuid(),
  keyword: z.string().min(1),
  locale: z.string().default('zh-TW'),
});

const trackProjectSchema = z.object({
  projectId: z.string().uuid(),
  locale: z.string().default('zh-TW'),
});

const listRanksQuery = z.object({
  projectId: z.string().uuid(),
  keyword: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(500).default(200),
});

const listFeaturesQuery = z.object({
  projectId: z.string().uuid(),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function deterministicFeatureFlags(keyword: string) {
  const h = fnv1a(keyword);
  return {
    featuredSnippet: h % 3 === 0,
    peopleAlsoAsk: h % 4 === 0,
    video: h % 5 === 0,
    images: h % 6 === 0,
    localPack: h % 7 === 0,
  };
}

function deterministicOwnedFlags(keyword: string) {
  const h = fnv1a(`owned:${keyword}`);
  return {
    featuredSnippet: h % 4 === 0,
    peopleAlsoAsk: h % 6 === 0,
    video: h % 8 === 0,
    images: h % 10 === 0,
    localPack: h % 12 === 0,
  };
}

export const serpRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/serp/features',
    {
      schema: {
        tags: ['serp'],
        description:
          'List SERP feature flags (MVP/deterministic) for keywords in a project.\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -H "Authorization: Bearer <ACCESS_TOKEN>" "http://localhost:3001/api/serp/features?projectId=<PROJECT_UUID>&limit=50"\n' +
          '```\n',
        querystring: {
          type: 'object',
          properties: { projectId: { type: 'string', format: 'uuid' }, limit: { type: 'number' } },
          required: ['projectId'],
          additionalProperties: true,
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (req) => {
    if (!req.dbClient) {
      const error = new Error('DB not available');
      (error as Error & { statusCode: number }).statusCode = 500;
      throw error;
    }

    const query = listFeaturesQuery.parse(req.query ?? {});

    const projectRow = await req.dbClient.query('SELECT domain FROM projects WHERE id = $1 LIMIT 1', [query.projectId]);
    const domain = (projectRow.rows[0]?.domain as string | undefined) ?? undefined;
    void domain;

    const keywords = await req.dbClient.query(
      'SELECT id, keyword FROM keywords WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2',
      [query.projectId, query.limit],
    );

    const rows = keywords.rows as Array<{ id: string; keyword: string }>;
    return {
      ok: true,
      rows: rows.map((k) => {
        const features = deterministicFeatureFlags(k.keyword);
        const owned = deterministicOwnedFlags(k.keyword);
        return {
          keywordId: k.id,
          keyword: k.keyword,
          features,
          owned,
        };
      }),
    };
    },
  );

  fastify.get(
    '/api/serp/ranks',
    {
      schema: {
        tags: ['serp'],
        description:
          'List recent SERP ranks for a project (optionally filtered by keyword).\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -H "Authorization: Bearer <ACCESS_TOKEN>" "http://localhost:3001/api/serp/ranks?projectId=<PROJECT_UUID>&limit=200"\n' +
          '```\n',
        querystring: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid' },
            keyword: { type: 'string' },
            limit: { type: 'number' },
          },
          required: ['projectId'],
          additionalProperties: true,
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (req) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      const error = new Error('Missing tenant context');
      (error as Error & { statusCode: number }).statusCode = 403;
      throw error;
    }

    if (!req.dbClient) {
      const error = new Error('DB not available');
      (error as Error & { statusCode: number }).statusCode = 500;
      throw error;
    }

    const query = listRanksQuery.parse(req.query ?? {});

    // RLS enforces tenant scope via projects/keywords/keyword_ranks policies.
    const rows = await req.dbClient.query(
      `SELECT k.keyword, r.rank, r.result_url, r.checked_at
       FROM keyword_ranks r
       JOIN keywords k ON k.id = r.keyword_id
       WHERE k.project_id = $1
         AND ($2::text IS NULL OR k.keyword = $2)
       ORDER BY r.checked_at DESC
       LIMIT $3`,
      [query.projectId, query.keyword ?? null, query.limit],
    );

    return { ok: true, rows: rows.rows };
    },
  );

  fastify.post(
    '/api/serp/track',
    {
      schema: {
        tags: ['serp'],
        description:
          'Enqueue a SERP tracking job for a single keyword (consumes monthly serp quota).\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -X POST \\\n+  -H "Authorization: Bearer <ACCESS_TOKEN>" \\\n+  -H "Content-Type: application/json" \\\n+  -d "{\"projectId\":\"<PROJECT_UUID>\",\"keyword\":\"seo\",\"locale\":\"zh-TW\"}" \\\n+  http://localhost:3001/api/serp/track\n' +
          '```\n',
        body: {
          type: 'object',
          properties: { projectId: { type: 'string', format: 'uuid' }, keyword: { type: 'string' }, locale: { type: 'string' } },
          required: ['projectId', 'keyword'],
          additionalProperties: true,
        },
        response: {
          200: { type: 'object', properties: { ok: { type: 'boolean' }, jobId: { anyOf: [{ type: 'string' }, { type: 'number' }] } }, required: ['ok', 'jobId'], additionalProperties: true },
          429: { type: 'object', properties: { statusCode: { type: 'number' }, message: { type: 'string' }, kind: { type: 'string' }, quota: { type: 'object', additionalProperties: true } }, required: ['statusCode', 'message'], additionalProperties: true },
        },
      },
    },
    async (req) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      const error = new Error('Missing tenant context');
      (error as Error & { statusCode: number }).statusCode = 403;
      throw error;
    }

    const input = trackSchema.parse(req.body ?? {});

    if (!req.dbClient) {
      const error = new Error('DB not available');
      (error as Error & { statusCode: number }).statusCode = 500;
      throw error;
    }

    const tenantRow = await req.dbClient.query('SELECT plan, settings FROM tenants WHERE id = $1 LIMIT 1', [tenantId]);
    const quotas = computeTenantQuotas(tenantRow.rows[0]?.plan, tenantRow.rows[0]?.settings);
    await reserveSerpJobsOrThrow(req.dbClient, tenantId, 1, quotas);

    const redis = createRedisConnection({ url: env.REDIS_URL });
    const queue = new Queue('auto-tasks', { connection: redis, prefix: 'aiseo' });

    try {
      const job = await queue.add(
        'serp-tracker',
        {
          tenantId,
          projectId: input.projectId,
          keyword: input.keyword,
          locale: input.locale,
        },
        {
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );

      return { ok: true, jobId: job.id };
    } finally {
      await queue.close();
      redis.disconnect();
    }
    },
  );

  fastify.post(
    '/api/serp/track-project',
    {
      schema: {
        tags: ['serp'],
        description:
          'Enqueue SERP tracking jobs for all keywords in a project (consumes monthly serp quota).\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -X POST \\\n+  -H "Authorization: Bearer <ACCESS_TOKEN>" \\\n+  -H "Content-Type: application/json" \\\n+  -d "{\"projectId\":\"<PROJECT_UUID>\",\"locale\":\"zh-TW\"}" \\\n+  http://localhost:3001/api/serp/track-project\n' +
          '```\n',
        body: {
          type: 'object',
          properties: { projectId: { type: 'string', format: 'uuid' }, locale: { type: 'string' } },
          required: ['projectId'],
          additionalProperties: true,
        },
        response: {
          200: { type: 'object', additionalProperties: true },
          429: { type: 'object', properties: { statusCode: { type: 'number' }, message: { type: 'string' }, kind: { type: 'string' }, quota: { type: 'object', additionalProperties: true } }, required: ['statusCode', 'message'], additionalProperties: true },
        },
      },
    },
    async (req) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      const error = new Error('Missing tenant context');
      (error as Error & { statusCode: number }).statusCode = 403;
      throw error;
    }

    if (!req.dbClient) {
      const error = new Error('DB not available');
      (error as Error & { statusCode: number }).statusCode = 500;
      throw error;
    }

    const input = trackProjectSchema.parse(req.body ?? {});

    const keywords = await req.dbClient.query(
      'SELECT keyword FROM keywords WHERE project_id = $1 ORDER BY created_at DESC',
      [input.projectId],
    );

    const tenantRow = await req.dbClient.query('SELECT plan, settings FROM tenants WHERE id = $1 LIMIT 1', [tenantId]);
    const quotas = computeTenantQuotas(tenantRow.rows[0]?.plan, tenantRow.rows[0]?.settings);
    await reserveSerpJobsOrThrow(req.dbClient, tenantId, keywords.rows.length, quotas);

    const redis = createRedisConnection({ url: env.REDIS_URL });
    const queue = new Queue('auto-tasks', { connection: redis, prefix: 'aiseo' });

    try {
      const jobIds: Array<string | number | null> = [];
      for (const row of keywords.rows) {
        const job = await queue.add(
          'serp-tracker',
          {
            tenantId,
            projectId: input.projectId,
            keyword: String(row.keyword),
            locale: input.locale,
          },
          { removeOnComplete: true, removeOnFail: 100 },
        );
        jobIds.push(job.id ?? null);
      }

      return { ok: true, enqueued: jobIds.length, jobIds };
    } finally {
      await queue.close();
      redis.disconnect();
    }
    },
  );
};
