import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createEmailService } from '@aiseo/core';
import { env } from '../config/env.js';

// ── Helpers ────────────────────────────────────────────────────────
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

function safeJsonObject(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

function safeBranding(settings: unknown): { logoDataUrl?: string; primaryColor?: string; headerText?: string; footerText?: string; companyName?: string } {
  const obj = safeJsonObject(settings);
  const brand = safeJsonObject(obj.brand);
  return {
    logoDataUrl: typeof brand.logoDataUrl === 'string' ? String(brand.logoDataUrl) : undefined,
    primaryColor: typeof brand.primaryColor === 'string' ? String(brand.primaryColor) : undefined,
    headerText: typeof brand.headerText === 'string' ? String(brand.headerText) : undefined,
    footerText: typeof brand.footerText === 'string' ? String(brand.footerText) : undefined,
  };
}

// ── Schemas ────────────────────────────────────────────────────────
const scheduleBodySchema = z.object({
  templateId: z.string().min(1),
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  emailRecipients: z.array(z.string().email()).min(1),
  dayOfWeek: z.number().int().min(0).max(6).optional(), // 0=Sun for weekly
  dayOfMonth: z.number().int().min(1).max(28).optional(), // for monthly
  hour: z.number().int().min(0).max(23).default(9),
  enabled: z.boolean().default(true),
});

const scheduleIdSchema = z.object({ id: z.string().min(1) });

const generateBodySchema = z.object({
  templateId: z.string().min(1),
  sendEmail: z.boolean().default(false),
  emailRecipients: z.array(z.string().email()).optional(),
});

// ── Routes ─────────────────────────────────────────────────────────
export const reportScheduleRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/reports/schedules
   * Lists all report delivery schedules for the current project.
   */
  fastify.get(
    '/api/reports/schedules',
    {
      schema: {
        tags: ['reports'],
        description:
          'List report delivery schedules for the default project.\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:3001/api/reports/schedules\n' +
          '```\n',
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              projectId: { type: 'string', format: 'uuid' },
              schedules: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
            required: ['ok', 'projectId', 'schedules'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);

    const projRow = await client.query('SELECT settings FROM projects WHERE id = $1', [projectId]);
    const settings = safeJsonObject(projRow.rows[0]?.settings);
    const reportSettings = safeJsonObject(settings.reports);
    const schedules = Array.isArray(reportSettings.schedules) ? (reportSettings.schedules as unknown[]) : [];

    return {
      ok: true,
      projectId,
      schedules: schedules.map((s) => safeJsonObject(s)),
    };
    },
  );

  /**
   * POST /api/reports/schedules
   * Creates or updates a report delivery schedule.
   */
  fastify.post(
    '/api/reports/schedules',
    {
      schema: {
        tags: ['reports'],
        description:
          'Create a report delivery schedule.\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -X POST \\\n+  -H "Authorization: Bearer <ACCESS_TOKEN>" \\\n+  -H "Content-Type: application/json" \\\n+  -d "{\"templateId\":\"tpl_...\",\"frequency\":\"weekly\",\"dayOfWeek\":1,\"hour\":9,\"emailRecipients\":[\"you@example.com\"],\"enabled\":true}" \\\n+  http://localhost:3001/api/reports/schedules\n' +
          '```\n',
        body: {
          type: 'object',
          properties: {
            templateId: { type: 'string' },
            frequency: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
            emailRecipients: { type: 'array', items: { type: 'string' } },
            dayOfWeek: { type: 'number' },
            dayOfMonth: { type: 'number' },
            hour: { type: 'number' },
            enabled: { type: 'boolean' },
          },
          required: ['templateId', 'frequency', 'emailRecipients'],
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: { ok: { type: 'boolean' }, projectId: { type: 'string', format: 'uuid' }, schedule: { type: 'object', additionalProperties: true } },
            required: ['ok', 'projectId', 'schedule'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);
    const input = scheduleBodySchema.parse(req.body ?? {});

    const projRow = await client.query('SELECT settings FROM projects WHERE id = $1', [projectId]);
    const settings = safeJsonObject(projRow.rows[0]?.settings);
    const reportSettings = safeJsonObject(settings.reports);
    const schedules = Array.isArray(reportSettings.schedules) ? (reportSettings.schedules as Record<string, unknown>[]) : [];

    // Build cron expression
    let cron: string;
    switch (input.frequency) {
      case 'daily':
        cron = `0 ${input.hour} * * *`;
        break;
      case 'weekly':
        cron = `0 ${input.hour} * * ${input.dayOfWeek ?? 1}`;
        break;
      case 'monthly':
        cron = `0 ${input.hour} ${input.dayOfMonth ?? 1} * *`;
        break;
    }

    const schedule = {
      id: `rpt_sched_${Date.now()}`,
      templateId: input.templateId,
      frequency: input.frequency,
      cron,
      emailRecipients: input.emailRecipients,
      dayOfWeek: input.dayOfWeek,
      dayOfMonth: input.dayOfMonth,
      hour: input.hour,
      enabled: input.enabled,
      createdAt: new Date().toISOString(),
    };

    schedules.push(schedule);
    reportSettings.schedules = schedules;
    settings.reports = reportSettings;

    await client.query(
      'UPDATE projects SET settings = $2::jsonb, updated_at = now() WHERE id = $1',
      [projectId, JSON.stringify(settings)],
    );

    return { ok: true, projectId, schedule };
    },
  );

  /**
   * DELETE /api/reports/schedules/:id
   * Removes a report delivery schedule.
   */
  fastify.delete(
    '/api/reports/schedules/:id',
    {
      schema: {
        tags: ['reports'],
        description:
          'Delete a report schedule.\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -X DELETE -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:3001/api/reports/schedules/<SCHEDULE_ID>\n' +
          '```\n',
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: true },
        response: {
          200: {
            type: 'object',
            properties: { ok: { type: 'boolean' }, projectId: { type: 'string', format: 'uuid' }, deletedId: { type: 'string' } },
            required: ['ok', 'projectId', 'deletedId'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);
    const params = scheduleIdSchema.parse((req as any).params ?? {});

    const projRow = await client.query('SELECT settings FROM projects WHERE id = $1', [projectId]);
    const settings = safeJsonObject(projRow.rows[0]?.settings);
    const reportSettings = safeJsonObject(settings.reports);
    const schedules = Array.isArray(reportSettings.schedules) ? (reportSettings.schedules as Record<string, unknown>[]) : [];

    const filtered = schedules.filter((s) => s.id !== params.id);
    if (filtered.length === schedules.length) {
      const error = new Error('Schedule not found');
      (error as Error & { statusCode: number }).statusCode = 404;
      throw error;
    }

    reportSettings.schedules = filtered;
    settings.reports = reportSettings;

    await client.query(
      'UPDATE projects SET settings = $2::jsonb, updated_at = now() WHERE id = $1',
      [projectId, JSON.stringify(settings)],
    );

    return { ok: true, projectId, deletedId: params.id };
    },
  );

  /**
   * POST /api/reports/generate
   * Generates a report from a saved template and optionally emails it.
   */
  fastify.post(
    '/api/reports/generate',
    {
      schema: {
        tags: ['reports'],
        description:
          'Generate a report from a template and optionally email it.\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -X POST \\\n+  -H "Authorization: Bearer <ACCESS_TOKEN>" \\\n+  -H "Content-Type: application/json" \\\n+  -d "{\"templateId\":\"tpl_...\",\"sendEmail\":false}" \\\n+  http://localhost:3001/api/reports/generate\n' +
          '```\n',
        body: {
          type: 'object',
          properties: {
            templateId: { type: 'string' },
            sendEmail: { type: 'boolean' },
            emailRecipients: { type: 'array', items: { type: 'string' } },
          },
          required: ['templateId'],
          additionalProperties: true,
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);
    const input = generateBodySchema.parse(req.body ?? {});

    // Get template
    const projRow = await client.query('SELECT settings FROM projects WHERE id = $1', [projectId]);
    const settings = safeJsonObject(projRow.rows[0]?.settings);
    const reportSettings = safeJsonObject(settings.reports);
    const templates = Array.isArray(reportSettings.templates) ? (reportSettings.templates as Record<string, unknown>[]) : [];

    const template = templates.find((t) => t.id === input.templateId);
    if (!template) {
      const error = new Error('Template not found');
      (error as Error & { statusCode: number }).statusCode = 404;
      throw error;
    }

    const range = String(template.range ?? '30d');
    const modules = Array.isArray(template.modules) ? (template.modules as string[]) : [];
    const now = new Date();
    const daysMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };
    const days = daysMap[range] ?? 30;
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // Generate report record
    const reportId = `rpt_${Date.now()}`;
    const inserted = await client.query(
      `INSERT INTO generated_reports (project_id, report_id, report_format, report_period, start_date, end_date, output_format, output_url, generated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, now())
       RETURNING id`,
      [
        projectId,
        reportId,
        // Must satisfy DB CHECK constraint (see drizzle/0007_phase2_batch_b.sql)
        'comprehensive',
        // UI ranges are 7d/30d/90d; DB constraint expects daily/weekly/monthly/quarterly/custom.
        'custom',
        startDate.toISOString().slice(0, 10),
        now.toISOString().slice(0, 10),
        'pdf',
      ],
    );

    const generatedId = String(inserted.rows[0]?.id);
    const outputUrl = `/api/reports/${generatedId}/download`;
    await client.query('UPDATE generated_reports SET output_url = $2 WHERE id = $1', [generatedId, outputUrl]);

    // Send email if requested
    if (input.sendEmail && input.emailRecipients && input.emailRecipients.length > 0) {
      const tenantId = (req as any).tenantId as string | undefined;
      let brand = { logoDataUrl: undefined as string | undefined, primaryColor: undefined as string | undefined, headerText: undefined as string | undefined, footerText: undefined as string | undefined, companyName: undefined as string | undefined };
      if (tenantId) {
        const tenantRow = await client.query('SELECT name, settings FROM tenants WHERE id = $1 LIMIT 1', [tenantId]);
        if ((tenantRow.rowCount ?? 0) > 0) {
          const t = tenantRow.rows[0] as any;
          brand = { ...brand, ...safeBranding(t.settings), companyName: String(t.name ?? '') };
        }
      }

      const origin = typeof req.headers.origin === 'string' && req.headers.origin.trim().length > 0
        ? req.headers.origin.trim().replace(/\/$/, '')
        : 'http://127.0.0.1:3000';
      const downloadUrl = `${origin}${outputUrl}`;
      const primary = brand.primaryColor ?? '#3b82f6';
      const headerText = brand.headerText ?? (brand.companyName ? `Report for ${brand.companyName}` : 'Report Ready');
      const footerText = brand.footerText ?? 'Generated by AISEO Platform';
      const logoHtml = brand.logoDataUrl
        ? `<img src="${brand.logoDataUrl}" alt="Logo" style="max-height:40px;" />`
        : '';

      const emailService = createEmailService({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
        from: env.SMTP_FROM,
      });

      await emailService.send({
        to: input.emailRecipients,
        subject: `[${brand.companyName || 'AISEO'}] Report Ready: ${template.name ?? reportId}`,
        text: `${headerText}\n\nReport: ${template.name ?? reportId}\nModules: ${modules.join(', ')}\nPeriod: ${startDate.toISOString().slice(0, 10)} to ${now.toISOString().slice(0, 10)}\nDownload: ${downloadUrl}\n\n${footerText}`,
        html: `
<div style="font-family:Segoe UI,Tahoma,Arial,sans-serif;color:#111827;line-height:1.4;">
  <div style="border-bottom:3px solid ${primary};padding-bottom:12px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
    <div>${logoHtml}</div>
    <div style="text-align:right;">
      <div style="font-size:18px;font-weight:700;color:${primary};">${headerText}</div>
      <div style="font-size:12px;color:#6b7280;">${startDate.toISOString().slice(0, 10)} — ${now.toISOString().slice(0, 10)}</div>
    </div>
  </div>
  <p>Your report <strong>${template.name ?? reportId}</strong> has been generated.</p>
  <p style="margin:0 0 12px 0;">Modules: ${modules.join(', ')}</p>
  <p><a href="${downloadUrl}" style="display:inline-block;background:${primary};color:white;text-decoration:none;padding:10px 14px;border-radius:8px;">Download PDF</a></p>
  <div style="margin-top:24px;border-top:1px solid #e5e7eb;padding-top:12px;font-size:12px;color:#6b7280;">${footerText}</div>
</div>`,
      });
    }

    return {
      ok: true,
      projectId,
      id: generatedId,
      reportId,
      outputUrl,
      template: { id: template.id, name: template.name },
      range,
      modules,
      startDate: startDate.toISOString().slice(0, 10),
      endDate: now.toISOString().slice(0, 10),
      emailSent: !!(input.sendEmail && input.emailRecipients?.length),
    };
  });
};
