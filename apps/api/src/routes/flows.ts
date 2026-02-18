import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { createRedisConnection, OrchestratorEngine } from '@aiseo/core';

import { env } from '../config/env.js';
import { computeTenantQuotas } from '../quotas/tenant-quotas.js';
import { reserveCrawlJobsOrThrow } from '../quotas/usage.js';

const startFlowSchema = z.object({
  flowName: z.literal('seo-content-pipeline').default('seo-content-pipeline'),
  projectId: z.string().uuid(),
  seedKeyword: z.string().min(1).optional(),
});

export const flowsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/api/flows/start',
    {
      schema: {
        tags: ['flows'],
        description:
          'Start a workflow/flow run (currently supports seo-content-pipeline).\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -X POST \\\n+  -H "Authorization: Bearer <ACCESS_TOKEN>" \\\n+  -H "Content-Type: application/json" \\\n+  -d "{\"flowName\":\"seo-content-pipeline\",\"projectId\":\"<PROJECT_UUID>\",\"seedKeyword\":\"aiseo\"}" \\\n+  http://localhost:3001/api/flows/start\n' +
          '```\n',
        body: {
          type: 'object',
          properties: {
            flowName: { type: 'string', enum: ['seo-content-pipeline'] },
            projectId: { type: 'string', format: 'uuid' },
            seedKeyword: { type: 'string' },
          },
          required: ['flowName', 'projectId'],
          additionalProperties: true,
        },
        response: {
          200: { type: 'object', additionalProperties: true },
          429: {
            type: 'object',
            properties: {
              statusCode: { type: 'number' },
              message: { type: 'string' },
              kind: { type: 'string' },
              quota: { type: 'object', additionalProperties: true },
            },
            required: ['statusCode', 'message'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const input = startFlowSchema.parse(req.body ?? {});

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

    const tenantRow = await req.dbClient.query('SELECT plan, settings FROM tenants WHERE id = $1 LIMIT 1', [tenantId]);
    const quotas = computeTenantQuotas(tenantRow.rows[0]?.plan, tenantRow.rows[0]?.settings);
    await reserveCrawlJobsOrThrow(req.dbClient, tenantId, 1, quotas);

    const redis = createRedisConnection({ url: env.REDIS_URL });
    const engine = new OrchestratorEngine({ redis, prefix: 'aiseo' });

    try {
      return await engine.startFlow(input.flowName, {
        tenantId,
        projectId: input.projectId,
        seedKeyword: input.seedKeyword,
      });
    } finally {
      await engine.close();
      redis.disconnect();
    }
    },
  );
};
