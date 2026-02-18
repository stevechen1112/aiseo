import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

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

type AlertRow = {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  message: string;
  page: string;
  createdAt: string;
};

export const alertsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/alerts',
    {
      schema: {
        tags: ['alerts'],
        description:
          'List recent alerts for the default project.\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:3001/api/alerts\n' +
          '```\n',
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                type: { type: 'string', enum: ['success', 'info', 'warning', 'error'] },
                message: { type: 'string' },
                page: { type: 'string' },
                createdAt: { type: 'string' },
              },
              required: ['id', 'type', 'message', 'page', 'createdAt'],
              additionalProperties: true,
            },
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);

    const auditAlerts = await client.query(
      `SELECT
         id,
         url,
         audited_at,
         critical_count
       FROM audit_results
       WHERE project_id = $1
         AND critical_count > 0
       ORDER BY audited_at DESC
       LIMIT 20`,
      [projectId],
    );

    const psiAlerts = await client.query(
      `SELECT
         audit_id,
         url,
         audited_at,
         (lighthouse_scores->>'performance')::int AS performance
       FROM pagespeed_audits
       WHERE project_id = $1
         AND (lighthouse_scores->>'performance') IS NOT NULL
       ORDER BY audited_at DESC
       LIMIT 20`,
      [projectId],
    );

    const alerts: AlertRow[] = [];

    for (const row of auditAlerts.rows) {
      alerts.push({
        id: `audit:${row.id}`,
        type: 'error',
        message: `Technical audit found ${Number(row.critical_count ?? 0)} critical issue(s)`,
        page: String(row.url ?? ''),
        createdAt: (row.audited_at ?? new Date()).toISOString(),
      });
    }

    for (const row of psiAlerts.rows) {
      const perf = row.performance === null || row.performance === undefined ? null : Number(row.performance);
      if (perf === null) continue;

      alerts.push({
        id: `pagespeed:${row.audit_id}`,
        type: perf < 50 ? 'warning' : 'info',
        message: `PageSpeed performance score: ${perf}/100`,
        page: String(row.url ?? ''),
        createdAt: (row.audited_at ?? new Date()).toISOString(),
      });
    }

    alerts.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
    return alerts.slice(0, 20);
    },
  );

  const alertsSettingsSchema = z.object({
    rankDropThreshold: z.coerce.number().int().min(1).max(100).default(5),
    slackWebhookUrl: z.string().url().optional().or(z.literal('')).transform((v) => (v ? v : undefined)),
    emailRecipients: z
      .array(z.string().email())
      .optional()
      .default([]),
  });

  fastify.get(
    '/api/alerts/settings',
    {
      schema: {
        tags: ['alerts'],
        description:
          'Get alert settings for the default project.\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:3001/api/alerts/settings\n' +
          '```\n',
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);

    const row = await client.query('SELECT settings FROM projects WHERE id = $1 LIMIT 1', [projectId]);
    const settings = (row.rows[0]?.settings as unknown) ?? {};
    const alerts =
      settings && typeof settings === 'object' && 'alerts' in (settings as any)
        ? (settings as any).alerts
        : {};

    const parsed = alertsSettingsSchema.safeParse(alerts);
    const value = parsed.success ? parsed.data : alertsSettingsSchema.parse({});

    return {
      projectId,
      ...value,
    };
    },
  );

  fastify.post(
    '/api/alerts/settings',
    {
      schema: {
        tags: ['alerts'],
        description:
          'Update alert settings for the default project.\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -X POST \\\n+  -H "Authorization: Bearer <ACCESS_TOKEN>" \\\n+  -H "Content-Type: application/json" \\\n+  -d "{\"rankDropThreshold\":5,\"emailRecipients\":[\"you@example.com\"]}" \\\n+  http://localhost:3001/api/alerts/settings\n' +
          '```\n',
        body: { type: 'object', additionalProperties: true },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);

    const input = alertsSettingsSchema.parse(req.body ?? {});

    const row = await client.query('SELECT settings FROM projects WHERE id = $1 LIMIT 1', [projectId]);
    const currentSettings = (row.rows[0]?.settings as unknown) ?? {};
    const nextSettings = {
      ...(currentSettings && typeof currentSettings === 'object' ? (currentSettings as Record<string, unknown>) : {}),
      alerts: {
        rankDropThreshold: input.rankDropThreshold,
        slackWebhookUrl: input.slackWebhookUrl,
        emailRecipients: input.emailRecipients,
      },
    };

    await client.query('UPDATE projects SET settings = $2::jsonb, updated_at = now() WHERE id = $1', [projectId, nextSettings]);

    return { ok: true, projectId, settings: nextSettings.alerts };
    },
  );
};
