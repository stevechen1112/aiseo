import type { FastifyPluginAsync } from 'fastify';
import { Queue } from 'bullmq';

import { createRedisConnection } from '@aiseo/core';
import { env } from '../config/env.js';

type WorkflowStatus = {
  id: string;
  name: string;
  stage: string;
  progress: number;
  status: 'running' | 'completed' | 'failed';
};

export const workflowsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/workflows/status',
    {
      schema: {
        tags: ['workflows'],
        description:
          'Get recent orchestrator workflow statuses for the current tenant (MVP via queue introspection).\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:3001/api/workflows/status\n' +
          '```\n',
        response: { 200: { type: 'array', items: { type: 'object', additionalProperties: true } } },
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
    const queue = new Queue('orchestrator', { connection: redis, prefix: 'aiseo' });

    try {
      const byState = await Promise.all([
        queue.getJobs(['active'], 0, 25, true),
        queue.getJobs(['waiting', 'delayed'], 0, 25, true),
        queue.getJobs(['completed'], 0, 25, true),
        queue.getJobs(['failed'], 0, 25, true),
      ]);

      const entries: Array<{ state: 'active' | 'waiting' | 'completed' | 'failed'; jobs: any[] }> = [
        { state: 'active', jobs: byState[0] },
        { state: 'waiting', jobs: byState[1] },
        { state: 'completed', jobs: byState[2] },
        { state: 'failed', jobs: byState[3] },
      ];

      const results: WorkflowStatus[] = [];
      for (const { state, jobs } of entries) {
        for (const job of jobs) {
          const data = job?.data as unknown;
          const jobTenantId = data && typeof data === 'object' && 'tenantId' in (data as any) ? String((data as any).tenantId) : undefined;
          if (!jobTenantId || jobTenantId !== tenantId) continue;

          const status: WorkflowStatus['status'] = state === 'failed' ? 'failed' : state === 'completed' ? 'completed' : 'running';
          const stage = state === 'waiting' ? 'queued' : state;
          const progress = status === 'completed' ? 100 : status === 'failed' ? 100 : state === 'active' ? 50 : 10;

          results.push({
            id: String(job.id),
            name: String(job.name),
            stage,
            progress,
            status,
          });
        }
      }

      const running = results.filter((r) => r.status === 'running');
      const terminal = results.filter((r) => r.status !== 'running');
      return [...running, ...terminal].slice(0, 20);
    } finally {
      await queue.close();
      redis.disconnect();
    }
    },
  );
};
