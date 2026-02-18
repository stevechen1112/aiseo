import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { CronScheduler, OrchestratorEngine, createRedisConnection } from '@aiseo/core';

import { env } from '../config/env.js';

const upsertSchema = z.object({
  id: z.string().min(3),
  enabled: z.boolean().default(true),
  cron: z.string().min(5),
  timezone: z.string().optional(),
  flowName: z.literal('seo-content-pipeline').default('seo-content-pipeline'),
  projectId: z.string().uuid(),
  seedKeyword: z.string().min(1).optional(),
});

const scheduleParamsSchema = z.object({
  id: z.string().min(3),
});

export const schedulesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/schedules',
    {
      schema: {
        tags: ['schedules'],
        description:
          'List schedules for the current tenant.\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:3001/api/schedules\n' +
          '```\n',
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              schedules: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
            required: ['ok', 'schedules'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    if (!req.dbClient) {
      const error = new Error('DB not available');
      (error as Error & { statusCode: number }).statusCode = 500;
      throw error;
    }

    const rows = await req.dbClient.query(
      'SELECT id, flow_name, project_id, seed_keyword, cron, timezone, enabled, created_at, updated_at FROM schedules ORDER BY created_at DESC',
    );
    return { ok: true, schedules: rows.rows };
    },
  );

  fastify.post(
    '/api/schedules/flow',
    {
      schema: {
        tags: ['schedules'],
        description:
          'Upsert a flow schedule (seo-content-pipeline).\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -X POST \\\n+  -H "Authorization: Bearer <ACCESS_TOKEN>" \\\n+  -H "Content-Type: application/json" \\\n+  -d "{\"id\":\"content-pipeline-<PROJECT_ID>\",\"enabled\":true,\"cron\":\"0 9 * * 1\",\"flowName\":\"seo-content-pipeline\",\"projectId\":\"<PROJECT_UUID>\"}" \\\n+  http://localhost:3001/api/schedules/flow\n' +
          '```\n',
        body: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            enabled: { type: 'boolean' },
            cron: { type: 'string' },
            timezone: { type: 'string' },
            flowName: { type: 'string', enum: ['seo-content-pipeline'] },
            projectId: { type: 'string', format: 'uuid' },
            seedKeyword: { type: 'string' },
          },
          required: ['id', 'cron', 'flowName', 'projectId'],
          additionalProperties: true,
        },
        response: { 200: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: true } },
      },
    },
    async (req) => {
    const input = upsertSchema.parse(req.body ?? {});

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

    // Persist schedule (RLS enforces tenant scope).
    await req.dbClient.query(
      `INSERT INTO schedules (tenant_id, id, flow_name, project_id, seed_keyword, cron, timezone, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (tenant_id, id)
       DO UPDATE SET flow_name = EXCLUDED.flow_name,
                     project_id = EXCLUDED.project_id,
                     seed_keyword = EXCLUDED.seed_keyword,
                     cron = EXCLUDED.cron,
                     timezone = EXCLUDED.timezone,
                     enabled = EXCLUDED.enabled,
                     updated_at = now()`,
      [tenantId, input.id, input.flowName, input.projectId, input.seedKeyword ?? null, input.cron, input.timezone ?? null, input.enabled],
    );

    const redis = createRedisConnection({ url: env.REDIS_URL });
    const scheduler = new CronScheduler({ redis, prefix: 'aiseo' });

    try {
      await scheduler.upsertSchedule({
        id: input.id,
        enabled: input.enabled,
        cron: input.cron,
        timezone: input.timezone,
        flowName: input.flowName,
        input: {
          tenantId,
          projectId: input.projectId,
          seedKeyword: input.seedKeyword,
        },
      });

      return { ok: true };
    } finally {
      await scheduler.close();
      redis.disconnect();
    }
    },
  );

  fastify.post(
    '/api/schedules/:id/pause',
    {
      schema: {
        tags: ['schedules'],
        description:
          'Pause a schedule.\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -X POST -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:3001/api/schedules/<SCHEDULE_ID>/pause\n' +
          '```\n',
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: true },
        response: { 200: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: true } },
      },
    },
    async (req) => {
    const { id: scheduleId } = scheduleParamsSchema.parse(req.params as unknown);

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

    await req.dbClient.query(
      'UPDATE schedules SET enabled = false, updated_at = now() WHERE id = $1 AND tenant_id = $2',
      [scheduleId, tenantId],
    );

    const redis = createRedisConnection({ url: env.REDIS_URL });
    const scheduler = new CronScheduler({ redis, prefix: 'aiseo' });
    try {
      await scheduler.removeSchedule(scheduleId);
      return { ok: true };
    } finally {
      await scheduler.close();
      redis.disconnect();
    }
    },
  );

  fastify.post(
    '/api/schedules/:id/resume',
    {
      schema: {
        tags: ['schedules'],
        description:
          'Resume a schedule.\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -X POST -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:3001/api/schedules/<SCHEDULE_ID>/resume\n' +
          '```\n',
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: true },
        response: { 200: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: true } },
      },
    },
    async (req) => {
    const { id: scheduleId } = scheduleParamsSchema.parse(req.params as unknown);

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

    const row = await req.dbClient.query(
      'SELECT id, flow_name, project_id, seed_keyword, cron, timezone FROM schedules WHERE id = $1 AND tenant_id = $2 LIMIT 1',
      [scheduleId, tenantId],
    );

    if (row.rowCount === 0) {
      const error = new Error('Schedule not found');
      (error as Error & { statusCode: number }).statusCode = 404;
      throw error;
    }

    await req.dbClient.query(
      'UPDATE schedules SET enabled = true, updated_at = now() WHERE id = $1 AND tenant_id = $2',
      [scheduleId, tenantId],
    );

    const schedule = row.rows[0] as {
      id: string;
      flow_name: string;
      project_id: string;
      seed_keyword: string | null;
      cron: string;
      timezone: string | null;
    };

    const flowName = z.literal('seo-content-pipeline').parse(schedule.flow_name);

    const redis = createRedisConnection({ url: env.REDIS_URL });
    const scheduler = new CronScheduler({ redis, prefix: 'aiseo' });
    try {
      await scheduler.upsertSchedule({
        id: schedule.id,
        enabled: true,
        cron: schedule.cron,
        timezone: schedule.timezone ?? undefined,
        flowName,
        input: {
          tenantId,
          projectId: schedule.project_id,
          seedKeyword: schedule.seed_keyword ?? undefined,
        },
      });

      return { ok: true };
    } finally {
      await scheduler.close();
      redis.disconnect();
    }
    },
  );

  fastify.post(
    '/api/schedules/:id/run',
    {
      schema: {
        tags: ['schedules'],
        description:
          'Run a scheduled flow immediately.\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -X POST -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:3001/api/schedules/<SCHEDULE_ID>/run\n' +
          '```\n',
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: true },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (req) => {
    const { id: scheduleId } = scheduleParamsSchema.parse(req.params as unknown);

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

    const row = await req.dbClient.query(
      'SELECT id, flow_name, project_id, seed_keyword FROM schedules WHERE id = $1 AND tenant_id = $2 LIMIT 1',
      [scheduleId, tenantId],
    );

    if (row.rowCount === 0) {
      const error = new Error('Schedule not found');
      (error as Error & { statusCode: number }).statusCode = 404;
      throw error;
    }

    const schedule = row.rows[0] as {
      id: string;
      flow_name: string;
      project_id: string;
      seed_keyword: string | null;
    };

    const flowName = z.literal('seo-content-pipeline').parse(schedule.flow_name);

    const redis = createRedisConnection({ url: env.REDIS_URL });
    const engine = new OrchestratorEngine({ redis, prefix: 'aiseo' });

    try {
      const result = await engine.startFlow(flowName, {
        tenantId,
        projectId: schedule.project_id,
        seedKeyword: schedule.seed_keyword ?? undefined,
      });

      return { ok: true, result };
    } finally {
      await engine.close();
      redis.disconnect();
    }
    },
  );
};
