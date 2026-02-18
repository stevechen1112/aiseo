import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { env } from '../config/env.js';
import { requireRole } from '../utils/authz.js';

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

const notificationTypeSchema = z.enum(['alerts', 'reviews', 'completions']);

const notificationSettingsSchema = z.object({
  slackWebhookUrl: z.string().url().optional().or(z.literal('')).transform((v) => (v ? v : undefined)),
  emailRecipients: z.array(z.string().email()).optional().default([]),
  types: z.array(notificationTypeSchema).optional().default(['alerts']),
});

export const notificationsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/notifications/settings',
    {
      schema: {
        tags: ['notifications'],
        description:
          'Get notification settings for the default project (admin/manager).\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:3001/api/notifications/settings\n' +
          '```\n',
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              projectId: { type: 'string', format: 'uuid' },
              slackWebhookUrl: { type: 'string' },
              emailRecipients: { type: 'array', items: { type: 'string' } },
              types: { type: 'array', items: { type: 'string' } },
            },
            required: ['ok', 'projectId', 'emailRecipients', 'types'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    requireRole(req, ['admin', 'manager']);
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);

    const row = await client.query('SELECT settings FROM projects WHERE id = $1 LIMIT 1', [projectId]);
    const settings = (row.rows[0]?.settings as unknown) ?? {};
    const notifications =
      settings && typeof settings === 'object' && 'notifications' in (settings as any)
        ? (settings as any).notifications
        : {};

    const parsed = notificationSettingsSchema.safeParse(notifications);
    const value = parsed.success ? parsed.data : notificationSettingsSchema.parse({});

    return {
      ok: true,
      projectId,
      slackWebhookUrl: value.slackWebhookUrl ?? env.SLACK_WEBHOOK_URL ?? undefined,
      emailRecipients: value.emailRecipients,
      types: value.types,
    };
    },
  );

  fastify.post(
    '/api/notifications/settings',
    {
      schema: {
        tags: ['notifications'],
        description:
          'Update notification settings for the default project (admin/manager).\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -X POST \\\n+  -H "Authorization: Bearer <ACCESS_TOKEN>" \\\n+  -H "Content-Type: application/json" \\\n+  -d "{\"slackWebhookUrl\":\"https://hooks.slack.com/...\",\"emailRecipients\":[\"you@example.com\"],\"types\":[\"alerts\"]}" \\\n+  http://localhost:3001/api/notifications/settings\n' +
          '```\n',
        body: {
          type: 'object',
          properties: {
            slackWebhookUrl: { type: 'string' },
            emailRecipients: { type: 'array', items: { type: 'string' } },
            types: { type: 'array', items: { type: 'string', enum: ['alerts', 'reviews', 'completions'] } },
          },
          additionalProperties: true,
        },
        response: {
          200: { type: 'object', properties: { ok: { type: 'boolean' }, projectId: { type: 'string', format: 'uuid' }, settings: { type: 'object', additionalProperties: true } }, required: ['ok', 'projectId', 'settings'], additionalProperties: true },
        },
      },
    },
    async (req) => {
    requireRole(req, ['admin', 'manager']);
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);

    const input = notificationSettingsSchema.parse(req.body ?? {});

    const row = await client.query('SELECT settings FROM projects WHERE id = $1 LIMIT 1', [projectId]);
    const currentSettings = (row.rows[0]?.settings as unknown) ?? {};
    const nextSettings = {
      ...(currentSettings && typeof currentSettings === 'object' ? (currentSettings as Record<string, unknown>) : {}),
      notifications: {
        slackWebhookUrl: input.slackWebhookUrl,
        emailRecipients: input.emailRecipients,
        types: input.types,
      },
    };

    await client.query('UPDATE projects SET settings = $2::jsonb, updated_at = now() WHERE id = $1', [projectId, nextSettings]);

    return { ok: true, projectId, settings: nextSettings.notifications };
    },
  );
};
