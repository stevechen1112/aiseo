import type { FastifyInstance } from 'fastify';
import { Queue } from 'bullmq';
import { z } from 'zod';

import { createRedisConnection } from '@aiseo/core';
import { env } from '../config/env.js';

const redis = createRedisConnection({ url: env.REDIS_URL });
const autoTasksQueue = new Queue('auto-tasks', { connection: redis, prefix: 'aiseo' });

const createScheduleSchema = z.object({
  projectId: z.string().uuid(),
  cron: z.string().min(1).default('0 9 * * *'), // Daily at 9 AM by default
  timezone: z.string().default('Asia/Taipei'),
  enabled: z.boolean().default(true),
});

const updateScheduleSchema = z.object({
  cron: z.string().min(1).optional(),
  timezone: z.string().optional(),
  enabled: z.boolean().optional(),
});

export async function serpScheduleRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/serp/schedule
   * Create or update daily SERP tracking schedule for a project
   */
  fastify.post(
    '/schedule',
    {
      schema: {
        tags: ['serp'],
        description: 'Create/update (or remove) a daily SERP tracking schedule for a project.',
        body: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid' },
            cron: { type: 'string', default: '0 9 * * *' },
            timezone: { type: 'string', default: 'Asia/Taipei' },
            enabled: { type: 'boolean', default: true },
          },
          required: ['projectId'],
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: true,
          },
          403: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
            required: ['error'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req, reply) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return reply.code(403).send({ error: 'Missing tenant context' });
    }

    const body = createScheduleSchema.parse(req.body);
    const { projectId, cron, timezone, enabled } = body;

    if (!enabled) {
      // Remove schedule
      const scheduleId = `serp-daily:${projectId}`;
      const repeats = await autoTasksQueue.getRepeatableJobs();
      const match = repeats.find((r) => r.id === scheduleId);
      if (match) {
        await autoTasksQueue.removeRepeatableByKey(match.key);
      }
      return reply.send({ ok: true, removed: true, scheduleId });
    }

    // Create/update schedule
    const scheduleId = `serp-daily:${projectId}`;
    await autoTasksQueue.add(
      'serp-daily-tracker',
      { tenantId, projectId },
      {
        jobId: scheduleId,
        repeat: {
          pattern: cron,
          tz: timezone,
        },
        removeOnComplete: 10,
        removeOnFail: 100,
      },
    );

    return reply.send({ ok: true, scheduleId, cron, timezone });
    },
  );

  /**
   * GET /api/serp/schedules
   * List all SERP tracking schedules
   */
  fastify.get(
    '/schedules',
    {
      schema: {
        tags: ['serp'],
        description: 'List all repeatable SERP daily tracker schedules.',
        response: {
          200: {
            type: 'object',
            properties: {
              schedules: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    pattern: { type: 'string' },
                    tz: { type: 'string' },
                    next: { type: 'number' },
                  },
                  required: ['id', 'pattern', 'tz', 'next'],
                  additionalProperties: true,
                },
              },
            },
            required: ['schedules'],
            additionalProperties: true,
          },
        },
      },
    },
    async (_req, reply) => {
    const repeats = await autoTasksQueue.getRepeatableJobs();
    const serpSchedules = repeats.filter((r) => r.name === 'serp-daily-tracker');
    return reply.send({
      schedules: serpSchedules.map((r) => ({
        id: r.id,
        pattern: r.pattern,
        tz: r.tz,
        next: r.next,
      })),
    });
    },
  );

  /**
   * DELETE /api/serp/schedule/:projectId
   * Remove daily SERP tracking schedule for a project
   */
  fastify.delete<{ Params: { projectId: string } }>(
    '/schedule/:projectId',
    {
      schema: {
        tags: ['serp'],
        description: 'Remove a daily SERP tracking schedule for a project.',
        params: {
          type: 'object',
          properties: {
            projectId: { type: 'string' },
          },
          required: ['projectId'],
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              scheduleId: { type: 'string' },
            },
            required: ['ok', 'scheduleId'],
            additionalProperties: true,
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
            required: ['error'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req, reply) => {
    const { projectId } = req.params;
    const scheduleId = `serp-daily:${projectId}`;

    const repeats = await autoTasksQueue.getRepeatableJobs();
    const match = repeats.find((r) => r.id === scheduleId);

    if (!match) {
      return reply.code(404).send({ error: 'Schedule not found' });
    }

    await autoTasksQueue.removeRepeatableByKey(match.key);
    return reply.send({ ok: true, scheduleId });
    },
  );
}
