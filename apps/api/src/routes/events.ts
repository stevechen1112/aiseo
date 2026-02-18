import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { createRedisConnection, EventBus } from '@aiseo/core';

import { env } from '../config/env.js';

const publishSchema = z.object({
  type: z.enum(['system.test', 'agent.task.started', 'agent.task.completed', 'agent.task.failed']).default('system.test'),
  payload: z.record(z.unknown()).default({}),
  projectId: z.string().uuid().optional(),
});

// Phase 1: dev-only helper to publish events.
export const eventsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/api/events/publish',
    {
      schema: {
        tags: ['events'],
        description:
          'Publish an event to the tenant EventBus (primarily for dev/testing).\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -X POST \\\n+  -H "Authorization: Bearer <ACCESS_TOKEN>" \\\n+  -H "Content-Type: application/json" \\\n+  -d "{\"type\":\"system.test\",\"payload\":{\"hello\":\"world\"}}" \\\n+  http://localhost:3001/api/events/publish\n' +
          '```\n',
        body: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            payload: { type: 'object', additionalProperties: true },
            projectId: { type: 'string', format: 'uuid' },
          },
          additionalProperties: true,
        },
        response: {
          200: { type: 'object', properties: { ok: { type: 'boolean' }, event: { type: 'object', additionalProperties: true } }, required: ['ok', 'event'], additionalProperties: true },
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

    const input = publishSchema.parse(req.body ?? {});

    const redis = createRedisConnection({ url: env.REDIS_URL });
    const bus = new EventBus({ redis, prefix: 'aiseo' });

    try {
      const event = await bus.publish({
        tenantId,
        projectId: input.projectId,
        type: input.type,
        payload: input.payload,
      });

      return { ok: true, event };
    } finally {
      redis.disconnect();
    }
    },
  );
};
