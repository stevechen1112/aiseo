import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { createRedisConnection } from '@aiseo/core';
import { Queue } from 'bullmq';

import { env } from '../config/env.js';
import { computeTenantQuotas } from '../quotas/tenant-quotas.js';
import { reserveCrawlJobsOrThrow } from '../quotas/usage.js';

const keywordResearchSchema = z.object({
  projectId: z.string().uuid(),
  seedKeyword: z.string().min(1),
});

export const agentsRoutes: FastifyPluginAsync = async (fastify) => {
  const enqueueKeywordResearch = async (req: any) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      const error = new Error('Missing tenant context');
      (error as Error & { statusCode: number }).statusCode = 403;
      throw error;
    }

    const input = keywordResearchSchema.parse(req.body ?? {});

    if (req.dbClient) {
      const tenantRow = await req.dbClient.query('SELECT plan, settings FROM tenants WHERE id = $1 LIMIT 1', [tenantId]);
      const quotas = computeTenantQuotas(tenantRow.rows[0]?.plan, tenantRow.rows[0]?.settings);
      await reserveCrawlJobsOrThrow(req.dbClient, tenantId, 1, quotas);
    }

    const redis = createRedisConnection({ url: env.REDIS_URL });
    const queue = new Queue('smart-agents', { connection: redis, prefix: 'aiseo' });

    try {
      const job = await queue.add(
        'keyword-researcher',
        {
          tenantId,
          projectId: input.projectId,
          seedKeyword: input.seedKeyword,
        },
        {
          removeOnComplete: 1000,
          removeOnFail: 1000,
        },
      );

      return { ok: true, jobId: job.id };
    } finally {
      await queue.close();
      redis.disconnect();
    }
  };

  // Backward-compatible endpoint (kept for older clients/docs)
  fastify.post(
    '/api/agents/keyword-research',
    {
      schema: {
        tags: ['agents'],
        description:
          'Enqueue keyword research (legacy endpoint).\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -X POST \\\n+  -H "Authorization: Bearer <ACCESS_TOKEN>" \\\n+  -H "Content-Type: application/json" \\\n+  -d "{\"projectId\":\"<PROJECT_UUID>\",\"seedKeyword\":\"aiseo\"}" \\\n+  http://localhost:3001/api/agents/keyword-research\n' +
          '```\n',
        body: {
          type: 'object',
          properties: { projectId: { type: 'string', format: 'uuid' }, seedKeyword: { type: 'string' } },
          required: ['projectId', 'seedKeyword'],
          additionalProperties: true,
        },
        response: {
          200: { type: 'object', properties: { ok: { type: 'boolean' }, jobId: { anyOf: [{ type: 'string' }, { type: 'number' }] } }, required: ['ok', 'jobId'], additionalProperties: true },
          429: { type: 'object', properties: { statusCode: { type: 'number' }, message: { type: 'string' }, kind: { type: 'string' }, quota: { type: 'object', additionalProperties: true } }, required: ['statusCode', 'message'], additionalProperties: true },
        },
      },
    },
    enqueueKeywordResearch,
  );

  // Canonical endpoint (matches agent id/job name)
  fastify.post(
    '/api/agents/keyword-researcher',
    {
      schema: {
        tags: ['agents'],
        description:
          'Enqueue keyword research (canonical endpoint).\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -X POST \\\n+  -H "Authorization: Bearer <ACCESS_TOKEN>" \\\n+  -H "Content-Type: application/json" \\\n+  -d "{\"projectId\":\"<PROJECT_UUID>\",\"seedKeyword\":\"aiseo\"}" \\\n+  http://localhost:3001/api/agents/keyword-researcher\n' +
          '```\n',
        body: {
          type: 'object',
          properties: { projectId: { type: 'string', format: 'uuid' }, seedKeyword: { type: 'string' } },
          required: ['projectId', 'seedKeyword'],
          additionalProperties: true,
        },
        response: {
          200: { type: 'object', properties: { ok: { type: 'boolean' }, jobId: { anyOf: [{ type: 'string' }, { type: 'number' }] } }, required: ['ok', 'jobId'], additionalProperties: true },
          429: { type: 'object', properties: { statusCode: { type: 'number' }, message: { type: 'string' }, kind: { type: 'string' }, quota: { type: 'object', additionalProperties: true } }, required: ['statusCode', 'message'], additionalProperties: true },
        },
      },
    },
    enqueueKeywordResearch,
  );

  fastify.get(
    '/api/agents/activities',
    {
      schema: {
        tags: ['agents'],
        description:
          'List recent agent/job activities for the current tenant.\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:3001/api/agents/activities\n' +
          '```\n',
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                agentName: { type: 'string' },
                status: { type: 'string', enum: ['running', 'completed', 'failed'] },
                task: { type: 'string' },
                startedAt: { type: 'string' },
                completedAt: { type: 'string' },
              },
              required: ['id', 'agentName', 'status', 'task', 'startedAt'],
              additionalProperties: true,
            },
          },
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

    const redis = createRedisConnection({ url: env.REDIS_URL });
    const smartAgentsQueue = new Queue('smart-agents', { connection: redis, prefix: 'aiseo' });
    const autoTasksQueue = new Queue('auto-tasks', { connection: redis, prefix: 'aiseo' });

    try {
      const getRecent = async (queue: Queue) => {
        const [active, waiting, completed, failed] = await Promise.all([
          queue.getJobs(['active'], 0, 25, true),
          queue.getJobs(['waiting', 'delayed'], 0, 25, true),
          queue.getJobs(['completed'], 0, 25, true),
          queue.getJobs(['failed'], 0, 25, true),
        ]);

        return [
          ...active.map((j) => ({ state: 'active' as const, job: j })),
          ...waiting.map((j) => ({ state: 'waiting' as const, job: j })),
          ...completed.map((j) => ({ state: 'completed' as const, job: j })),
          ...failed.map((j) => ({ state: 'failed' as const, job: j })),
        ];
      };

      const [smart, auto] = await Promise.all([getRecent(smartAgentsQueue), getRecent(autoTasksQueue)]);
      const all = [...smart, ...auto];

      const activities = all
        .map(({ state, job }) => {
          const data = job?.data as unknown;
          const jobTenantId = data && typeof data === 'object' && 'tenantId' in (data as any) ? String((data as any).tenantId) : undefined;
          if (!jobTenantId || jobTenantId !== tenantId) return null;

          const status = state === 'failed' ? 'failed' : state === 'completed' ? 'completed' : 'running';
          const op = data && typeof data === 'object' && 'operation' in (data as any) ? String((data as any).operation) : undefined;

          const startedAtMs =
            typeof job.processedOn === 'number'
              ? job.processedOn
              : typeof job.timestamp === 'number'
                ? job.timestamp
                : Date.now();
          const completedAtMs = typeof job.finishedOn === 'number' ? job.finishedOn : undefined;

          return {
            id: `${job.queueName}:${job.id}`,
            agentName: String(job.name),
            status,
            task: op ? `${job.name}:${op}` : String(job.name),
            startedAt: new Date(startedAtMs).toISOString(),
            completedAt: completedAtMs ? new Date(completedAtMs).toISOString() : undefined,
          };
        })
        .filter(Boolean) as Array<{
        id: string;
        agentName: string;
        status: 'running' | 'completed' | 'failed';
        task: string;
        startedAt: string;
        completedAt?: string;
      }>;

      activities.sort((a, b) => (a.startedAt > b.startedAt ? -1 : 1));
      return activities.slice(0, 50);
    } finally {
      await Promise.all([smartAgentsQueue.close(), autoTasksQueue.close()]);
      redis.disconnect();
    }
    },
  );
};
