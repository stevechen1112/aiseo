import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { buildReportHtml, createMinimalPdf, renderHtmlToPdf, type WhiteLabelConfig } from '@aiseo/core';
import { AppError, requireDb, resolveDefaultProjectId } from '../utils/index.js';

// ---------------------------------------------------------------------------
// CSV helper
// ---------------------------------------------------------------------------
function toCsvRow(cells: (string | number | null | undefined)[]): string {
  return cells
    .map((c) => {
      const s = c === null || c === undefined ? '' : String(c);
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(',');
}

function buildCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  return [toCsvRow(headers), ...rows.map(toCsvRow)].join('\r\n');
}

function safeJsonObject(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

function getSettingsSection(settings: unknown, key: string): Record<string, unknown> {
  const obj = safeJsonObject(settings);
  return safeJsonObject(obj[key]);
}

function setSettingsSection(settings: unknown, key: string, section: Record<string, unknown>) {
  return {
    ...safeJsonObject(settings),
    [key]: section,
  };
}

const listReportsQuery = z.object({
  type: z.string().optional(),
  range: z.enum(['7d', '30d', '90d', 'all']).optional().default('30d'),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
});

const reportIdParams = z.object({ id: z.string().uuid() });
const reportIdOrKeyParams = z.object({ id: z.string().min(1) });

const saveTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  modules: z.array(z.enum(['rankings', 'traffic', 'content', 'backlinks'])).min(1),
  range: z.enum(['7d', '30d', '90d']).default('30d'),
});

function safeBranding(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

export const reportsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/reports',
    {
      schema: {
        tags: ['reports'],
        description:
          'List generated reports for the default project.\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -H "Authorization: Bearer <ACCESS_TOKEN>" "http://localhost:3001/api/reports?range=30d&limit=50"\n' +
          '```\n',
        querystring: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            range: { type: 'string', enum: ['7d', '30d', '90d', 'all'] },
            limit: { type: 'number' },
          },
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              projectId: { type: 'string', format: 'uuid' },
              reports: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
            required: ['ok', 'projectId', 'reports'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);
    const q = listReportsQuery.parse(req.query ?? {});

    const intervalText = q.range === '7d' ? '7 days' : q.range === '90d' ? '90 days' : q.range === 'all' ? null : '30 days';
    const whereRange = intervalText ? 'AND generated_at >= now() - $2::interval' : '';
    const params: unknown[] = [projectId];
    if (intervalText) params.push(intervalText);

    const whereType = q.type ? `AND report_format = $${params.length + 1}` : '';
    if (q.type) params.push(q.type);

    const limitParam = `$${params.length + 1}`;
    params.push(q.limit);

    const rows = await client.query(
      `SELECT
         id,
         report_id,
         report_format,
         report_period,
         start_date,
         end_date,
         output_format,
         output_url,
         generated_at
       FROM generated_reports
       WHERE project_id = $1
       ${whereRange}
       ${whereType}
       ORDER BY generated_at DESC
       LIMIT ${limitParam}`,
      params as any,
    );

    return {
      ok: true,
      projectId,
      reports: (rows.rows as any[]).map((r) => ({
        id: String(r.id),
        reportId: String(r.report_id),
        format: String(r.report_format),
        period: String(r.report_period),
        startDate: String(r.start_date),
        endDate: String(r.end_date),
        outputFormat: String(r.output_format),
        outputUrl: r.output_url ? String(r.output_url) : null,
        generatedAt: new Date(r.generated_at ?? new Date()).toISOString(),
      })),
    };
    },
  );

  fastify.get(
    '/api/reports/:id/download',
    {
      schema: {
        tags: ['reports'],
        description:
          'Download a report in PDF or CSV format.\n\n' +
          'Add `?format=csv` for CSV output (default: pdf).\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -L -H "Authorization: Bearer <ACCESS_TOKEN>" "http://localhost:3001/api/reports/<ID>/download?format=pdf" --output report.pdf\n' +
          'curl -L -H "Authorization: Bearer <ACCESS_TOKEN>" "http://localhost:3001/api/reports/<ID>/download?format=csv" --output report.csv\n' +
          '```\n',
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
          additionalProperties: true,
        },
        querystring: {
          type: 'object',
          properties: { format: { type: 'string', enum: ['pdf', 'csv'], default: 'pdf' } },
          additionalProperties: true,
        },
        response: {
          200: { description: 'File binary', type: 'string', format: 'binary' },
        },
      },
    },
    async (req, reply) => {
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);
    const params = reportIdOrKeyParams.parse((req as any).params ?? {});
    const format = ((req as any).query?.format ?? 'pdf') as 'pdf' | 'csv';

    const isUuid = reportIdParams.safeParse(params).success;
    const row = isUuid
      ? await client.query(
          `SELECT id, report_id, report_format, start_date, end_date, generated_at
           FROM generated_reports
           WHERE id = $1 AND project_id = $2
           LIMIT 1`,
          [params.id, projectId],
        )
      : await client.query(
          `SELECT id, report_id, report_format, start_date, end_date, generated_at
           FROM generated_reports
           WHERE report_id = $1 AND project_id = $2
           ORDER BY generated_at DESC
           LIMIT 1`,
          [params.id, projectId],
        );

    if (row.rowCount === 0) {
      throw AppError.notFound('Report not found');
    }

    const r = row.rows[0] as any;
    const reportId = String(r.report_id);
    const range = { start: String(r.start_date), end: String(r.end_date) };

    // ------------------------------------------------------------------
    // CSV format
    // ------------------------------------------------------------------
    if (format === 'csv') {
      const csvData = buildCsv(
        ['report_id', 'report_format', 'start_date', 'end_date', 'generated_at'],
        [[reportId, String(r.report_format), range.start, range.end, String(r.generated_at ?? '')]],
      );
      const buf = Buffer.from(csvData, 'utf-8');
      reply.header('content-type', 'text/csv; charset=utf-8');
      reply.header('content-disposition', `attachment; filename="${reportId}.csv"`);
      reply.header('content-length', String(buf.byteLength));
      return reply.send(buf);
    }

    // ------------------------------------------------------------------
    // PDF format (existing logic)
    // ------------------------------------------------------------------
    const tenantId = req.tenantId;
    let branding: WhiteLabelConfig | undefined;
    if (tenantId) {
      const tenantRow = await client.query('SELECT name, settings FROM tenants WHERE id = $1 LIMIT 1', [tenantId]);
      if ((tenantRow.rowCount ?? 0) > 0) {
        const t = tenantRow.rows[0] as any;
        const settings = t.settings;
        const brand = safeBranding(settings && typeof settings === 'object' ? (settings as any).brand : undefined);
        branding = {
          companyName: String(t.name ?? 'AISEO Platform'),
          logoUrl: typeof brand.logoDataUrl === 'string' ? String(brand.logoDataUrl) : undefined,
          primaryColor: typeof brand.primaryColor === 'string' ? String(brand.primaryColor) : undefined,
          footerText: typeof brand.footerText === 'string' ? String(brand.footerText) : undefined,
        };
      }
    }

    const title = typeof (branding as any)?.companyName === 'string' ? `${branding!.companyName} Report` : 'AISEO Report';
    const sections = [
      {
        heading: 'Summary',
        content: `<table>
  <tr><th>Report ID</th><td>${reportId}</td></tr>
  <tr><th>Format</th><td>${String(r.report_format)}</td></tr>
  <tr><th>Period</th><td>${range.start} to ${range.end}</td></tr>
</table>`,
      },
    ];

    let pdf: Buffer;
    try {
      const html = buildReportHtml({
        title,
        sections,
        branding,
        dateRange: range,
      });
      pdf = await renderHtmlToPdf({ html, format: 'A4' });
    } catch (err) {
      req.log?.warn?.({ err }, 'renderHtmlToPdf failed; falling back to minimal PDF');
      const fallbackText = `${title}\nReport ${reportId} | ${String(r.report_format)}\n${range.start} to ${range.end}`;
      pdf = createMinimalPdf(fallbackText);
    }

    reply.header('content-type', 'application/pdf');
    reply.header('content-disposition', `attachment; filename="${reportId}.pdf"`);
    reply.header('content-length', String(pdf.byteLength));
    return reply.send(pdf);
    },
  );

  fastify.get(
    '/api/reports/templates',
    {
      schema: {
        tags: ['reports'],
        description:
          'List saved report templates from project settings.\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:3001/api/reports/templates\n' +
          '```\n',
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              projectId: { type: 'string', format: 'uuid' },
              templates: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
            required: ['ok', 'projectId', 'templates'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);

    const row = await client.query('SELECT settings FROM projects WHERE id = $1 LIMIT 1', [projectId]);
    const settings = (row.rows[0]?.settings as unknown) ?? {};
    const reportSettings = getSettingsSection(settings, 'reports');
    const templates = Array.isArray(reportSettings.templates) ? (reportSettings.templates as unknown[]) : [];

    return {
      ok: true,
      projectId,
      templates: templates.map((t) => safeJsonObject(t)),
    };
    },
  );

  fastify.post(
    '/api/reports/templates',
    {
      schema: {
        tags: ['reports'],
        description:
          'Save a report template into project settings.\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -X POST \\\n+  -H "Authorization: Bearer <ACCESS_TOKEN>" \\\n+  -H "Content-Type: application/json" \\\n+  -d "{\"name\":\"Monthly\",\"modules\":[\"rankings\",\"traffic\"],\"range\":\"30d\"}" \\\n+  http://localhost:3001/api/reports/templates\n' +
          '```\n',
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            modules: { type: 'array', items: { type: 'string', enum: ['rankings', 'traffic', 'content', 'backlinks'] } },
            range: { type: 'string', enum: ['7d', '30d', '90d'] },
          },
          required: ['name', 'modules'],
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              projectId: { type: 'string', format: 'uuid' },
              template: { type: 'object', additionalProperties: true },
            },
            required: ['ok', 'projectId', 'template'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);
    const input = saveTemplateSchema.parse(req.body ?? {});

    const row = await client.query('SELECT settings FROM projects WHERE id = $1 LIMIT 1', [projectId]);
    const settings = (row.rows[0]?.settings as unknown) ?? {};
    const reportSettings = getSettingsSection(settings, 'reports');
    const templates = Array.isArray(reportSettings.templates) ? (reportSettings.templates as unknown[]) : [];

    const template = {
      id: `tpl_${Date.now()}`,
      name: input.name,
      modules: input.modules,
      range: input.range,
      createdAt: new Date().toISOString(),
    };

    const nextSettings = setSettingsSection(settings, 'reports', {
      ...reportSettings,
      templates: [template, ...templates].slice(0, 50),
    });

    await client.query('UPDATE projects SET settings = $2::jsonb, updated_at = now() WHERE id = $1', [projectId, nextSettings]);

    return { ok: true, projectId, template };
    },
  );

  // ────────────────────────────────────────────────────────────────────────────
  // INFRA-03: Dedicated CSV export endpoints
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * GET /api/reports/export/keywords
   * Export all keyword rankings as CSV.
   */
  fastify.get(
    '/api/reports/export/keywords',
    {
      schema: {
        tags: ['reports'],
        description:
          'Export keyword rankings as CSV.\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -L -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:3001/api/reports/export/keywords --output keywords.csv\n' +
          '```\n',
        querystring: {
          type: 'object',
          properties: { limit: { type: 'number', default: 5000 } },
          additionalProperties: true,
        },
      },
    },
    async (req, reply) => {
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);
    const limit = Math.min(Number((req as any).query?.limit ?? 5000), 50_000);

    const rows = await client.query(
      `SELECT k.keyword, k.search_volume, k.difficulty, k.cpc,
              kr.rank AS latest_rank, kr.checked_at AS rank_checked_at,
              k.created_at
       FROM keywords k
       LEFT JOIN LATERAL (
         SELECT rank, checked_at FROM keyword_ranks
         WHERE keyword_id = k.id
         ORDER BY checked_at DESC LIMIT 1
       ) kr ON true
       WHERE k.project_id = $1
       ORDER BY k.created_at DESC
       LIMIT $2`,
      [projectId, limit],
    );

    const csv = buildCsv(
      ['keyword', 'search_volume', 'difficulty', 'cpc', 'latest_rank', 'rank_checked_at', 'created_at'],
      rows.rows.map((r: any) => [
        r.keyword,
        r.search_volume,
        r.difficulty,
        r.cpc,
        r.latest_rank,
        r.rank_checked_at,
        r.created_at,
      ]),
    );

    const buf = Buffer.from(csv, 'utf-8');
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', 'attachment; filename="keywords.csv"');
    reply.header('content-length', String(buf.byteLength));
    return reply.send(buf);
    },
  );

  /**
   * GET /api/reports/export/backlinks
   * Export backlinks as CSV.
   */
  fastify.get(
    '/api/reports/export/backlinks',
    {
      schema: {
        tags: ['reports'],
        description:
          'Export backlinks as CSV.\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -L -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:3001/api/reports/export/backlinks --output backlinks.csv\n' +
          '```\n',
        querystring: {
          type: 'object',
          properties: { limit: { type: 'number', default: 5000 } },
          additionalProperties: true,
        },
      },
    },
    async (req, reply) => {
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);
    const limit = Math.min(Number((req as any).query?.limit ?? 5000), 50_000);

    const rows = await client.query(
      `SELECT source_url, target_url, anchor_text, domain_rating,
              is_follow, is_active, first_seen, last_seen
       FROM backlinks
       WHERE project_id = $1
       ORDER BY first_seen DESC
       LIMIT $2`,
      [projectId, limit],
    );

    const csv = buildCsv(
      ['source_url', 'target_url', 'anchor_text', 'domain_rating', 'is_follow', 'is_active', 'first_seen', 'last_seen'],
      rows.rows.map((r: any) => [
        r.source_url,
        r.target_url,
        r.anchor_text,
        r.domain_rating,
        r.is_follow,
        r.is_active,
        r.first_seen,
        r.last_seen,
      ]),
    );

    const buf = Buffer.from(csv, 'utf-8');
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', 'attachment; filename="backlinks.csv"');
    reply.header('content-length', String(buf.byteLength));
    return reply.send(buf);
    },
  );

  /**
   * GET /api/reports/export/audit
   * Export audit issues as CSV.
   */
  fastify.get(
    '/api/reports/export/audit',
    {
      schema: {
        tags: ['reports'],
        description:
          'Export audit issues as CSV.\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -L -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:3001/api/reports/export/audit --output audit.csv\n' +
          '```\n',
        querystring: {
          type: 'object',
          properties: { limit: { type: 'number', default: 5000 } },
          additionalProperties: true,
        },
      },
    },
    async (req, reply) => {
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);
    const limit = Math.min(Number((req as any).query?.limit ?? 5000), 50_000);

    const rows = await client.query(
      `SELECT url, issue_type, severity, description, recommendation, detected_at
       FROM audit_issues
       WHERE project_id = $1
       ORDER BY
         CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
         detected_at DESC
       LIMIT $2`,
      [projectId, limit],
    );

    const csv = buildCsv(
      ['url', 'issue_type', 'severity', 'description', 'recommendation', 'detected_at'],
      rows.rows.map((r: any) => [
        r.url,
        r.issue_type,
        r.severity,
        r.description,
        r.recommendation,
        r.detected_at,
      ]),
    );

    const buf = Buffer.from(csv, 'utf-8');
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', 'attachment; filename="audit-issues.csv"');
    reply.header('content-length', String(buf.byteLength));
    return reply.send(buf);
    },
  );
};
