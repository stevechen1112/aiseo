import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

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

function clampScore(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function safeJsonObject(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

function getSettingsSection(settings: unknown, key: string): Record<string, unknown> {
  const obj = safeJsonObject(settings);
  const value = obj[key];
  return safeJsonObject(value);
}

function setSettingsSection(settings: unknown, key: string, section: Record<string, unknown>) {
  return {
    ...safeJsonObject(settings),
    [key]: section,
  };
}

const cwvQuerySchema = z.object({
  range: z.enum(['7d', '30d', '90d']).optional().default('30d'),
  device: z.enum(['mobile', 'desktop']).optional(),
});

const crawlQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(2000).optional().default(500),
});

const issuesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).optional().default(200),
});

const resolveParamsSchema = z.object({
  issueId: z.string().min(1),
});

const resolveBodySchema = z.object({
  resolved: z.boolean().default(true),
});

const auditLogsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).optional().default(100),
  before: z.string().datetime().optional(),
  projectId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  action: z.string().max(200).optional(),
});

const auditLogsExportQuerySchema = auditLogsQuerySchema.extend({
  format: z.enum(['json', 'csv']).optional().default('json'),
});

export const auditRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/audit/health',
    {
      schema: {
        tags: ['audit'],
        description:
          'Return an aggregate audit health score for the tenant\'s most recent project (MVP default project resolution).',
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              projectId: { type: 'string' },
              overall: { type: 'number' },
              breakdown: {
                type: 'object',
                properties: {
                  technical: { type: 'number' },
                  content: { type: 'number' },
                  ux: { type: 'number' },
                },
                required: ['technical', 'content', 'ux'],
                additionalProperties: false,
              },
              issues: {
                type: 'object',
                properties: {
                  total: { type: 'number' },
                  critical: { type: 'number' },
                  warning: { type: 'number' },
                },
                required: ['total', 'critical', 'warning'],
                additionalProperties: false,
              },
              auditedAt: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            },
            required: ['ok', 'projectId', 'overall', 'breakdown', 'issues', 'auditedAt'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);

    const latestAudit = await client.query(
      `SELECT
         audited_at,
         lighthouse_performance,
         lighthouse_seo,
         lighthouse_best_practices,
         total_issues,
         critical_count,
         warning_count
       FROM audit_results
       WHERE project_id = $1
       ORDER BY audited_at DESC
       LIMIT 1`,
      [projectId],
    );

    const contentScore = await client.query(
      `SELECT COALESCE(AVG(seo_score), 0) AS avg_seo
       FROM content_drafts
       WHERE project_id = $1 AND status = 'published'`,
      [projectId],
    );

    const latestPagespeed = await client.query(
      `SELECT performance_score
       FROM cwv_timeseries
       WHERE project_id = $1
       ORDER BY measured_at DESC
       LIMIT 1`,
      [projectId],
    );

    const auditRow = latestAudit.rows[0] as
      | {
          audited_at: Date;
          lighthouse_performance: number | null;
          lighthouse_seo: number | null;
          lighthouse_best_practices: number | null;
          total_issues: number | null;
          critical_count: number | null;
          warning_count: number | null;
        }
      | undefined;

    const technical = clampScore(auditRow?.lighthouse_best_practices ?? auditRow?.lighthouse_seo ?? 0);
    const content = clampScore(contentScore.rows[0]?.avg_seo ?? 0);
    const ux = clampScore(auditRow?.lighthouse_performance ?? latestPagespeed.rows[0]?.performance_score ?? 0);
    const overall = clampScore((technical + content + ux) / 3);

    return {
      ok: true,
      projectId,
      overall,
      breakdown: {
        technical,
        content,
        ux,
      },
      issues: {
        total: Number(auditRow?.total_issues ?? 0),
        critical: Number(auditRow?.critical_count ?? 0),
        warning: Number(auditRow?.warning_count ?? 0),
      },
      auditedAt: auditRow?.audited_at ? new Date(auditRow.audited_at).toISOString() : null,
    };
    },
  );

  fastify.get(
    '/api/audit/issues',
    {
      schema: {
        tags: ['audit'],
        description: 'List normalized audit issues from the most recent audits for the default project.',
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', minimum: 1, maximum: 500, default: 200 },
          },
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              projectId: { type: 'string' },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    url: { type: 'string' },
                    auditedAt: { type: 'string' },
                    severity: { type: 'string', enum: ['critical', 'warning', 'info'] },
                    category: { type: 'string' },
                    title: { type: 'string' },
                    description: { type: 'string' },
                    recommendation: { type: 'string' },
                    resolved: { type: 'boolean' },
                    resolvedAt: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                  },
                  required: ['id', 'url', 'auditedAt', 'severity', 'category', 'title', 'description', 'recommendation', 'resolved', 'resolvedAt'],
                  additionalProperties: true,
                },
              },
            },
            required: ['ok', 'projectId', 'items'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);
    const q = issuesQuerySchema.parse(req.query ?? {});

    const rows = await client.query(
      `SELECT id, url, audited_at, issues
       FROM audit_results
       WHERE project_id = $1
       ORDER BY audited_at DESC
       LIMIT 10`,
      [projectId],
    );

    const projectRow = await client.query('SELECT settings FROM projects WHERE id = $1 LIMIT 1', [projectId]);
    const settings = (projectRow.rows[0]?.settings as unknown) ?? {};
    const auditSettings = getSettingsSection(settings, 'audit');
    const issueStatusMap = safeJsonObject(auditSettings.issueStatus);

    const items: Array<{
      id: string;
      url: string;
      auditedAt: string;
      severity: 'critical' | 'warning' | 'info';
      category: string;
      title: string;
      description: string;
      recommendation: string;
      resolved: boolean;
      resolvedAt: string | null;
    }> = [];

    for (const r of rows.rows as any[]) {
      const issues = Array.isArray(r.issues) ? r.issues : [];
      for (let i = 0; i < issues.length; i++) {
        const issue = issues[i] as any;
        const issueId = `audit:${String(r.id)}:${i}`;
        const status = safeJsonObject(issueStatusMap[issueId]);

        const resolved = Boolean(status.resolved ?? false);
        const resolvedAt = status.resolvedAt ? String(status.resolvedAt) : null;

        const severityRaw = String(issue?.severity ?? 'info').toLowerCase();
        const severity: 'critical' | 'warning' | 'info' =
          severityRaw === 'critical' || severityRaw === 'warning' || severityRaw === 'info' ? severityRaw : 'info';

        items.push({
          id: issueId,
          url: String(r.url ?? ''),
          auditedAt: new Date(r.audited_at ?? new Date()).toISOString(),
          severity,
          category: String(issue?.category ?? ''),
          title: String(issue?.title ?? ''),
          description: String(issue?.description ?? ''),
          recommendation: String(issue?.recommendation ?? ''),
          resolved,
          resolvedAt,
        });
      }
    }

    // newest audit first, and unresolved first within same timestamp
    items.sort((a, b) => {
      if (a.auditedAt !== b.auditedAt) return a.auditedAt > b.auditedAt ? -1 : 1;
      if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
      return a.id.localeCompare(b.id);
    });

    return {
      ok: true,
      projectId,
      items: items.slice(0, q.limit),
    };
    },
  );

  // Phase 4 - 5.6.2 Audit logs
  fastify.get(
    '/api/audit/logs',
    {
      schema: {
        tags: ['audit'],
        description:
          'List audit log entries for the current tenant (admin/manager).\n\n' +
          'curl:\n' +
          '```bash\n' +
          'curl -H "Authorization: Bearer <ACCESS_TOKEN>" "http://localhost:3001/api/audit/logs?limit=100"\n' +
          '```\n',
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', minimum: 1, maximum: 500, default: 100 },
            before: { type: 'string', description: 'ISO datetime cursor; returns logs created before this timestamp.' },
            projectId: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            action: { type: 'string' },
          },
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              items: { type: 'array', items: { type: 'object', additionalProperties: true } },
              nextCursor: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            },
            required: ['ok', 'items', 'nextCursor'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
      requireRole(req, ['admin', 'manager']);
      const client = await requireDb(req);
      const q = auditLogsQuerySchema.parse(req.query ?? {});

      const where: string[] = [];
      const params: Array<string | number> = [];

      if (q.before) {
        params.push(q.before);
        where.push(`al.created_at < $${params.length}::timestamptz`);
      }
      if (q.projectId) {
        params.push(q.projectId);
        where.push(`al.project_id = $${params.length}::uuid`);
      }
      if (q.userId) {
        params.push(q.userId);
        where.push(`al.user_id = $${params.length}::uuid`);
      }
      if (q.action) {
        params.push(q.action);
        where.push(`al.action = $${params.length}`);
      }

      params.push(q.limit);
      const limitParam = `$${params.length}`;

      const sql =
        `SELECT al.id, al.action, al.resource_type, al.resource_id, al.metadata, al.created_at, ` +
        `al.user_id, u.email AS user_email, u.name AS user_name, ` +
        `al.project_id, p.name AS project_name, p.domain AS project_domain ` +
        `FROM audit_logs al ` +
        `LEFT JOIN users u ON u.id = al.user_id ` +
        `LEFT JOIN projects p ON p.id = al.project_id ` +
        `${where.length ? 'WHERE ' + where.join(' AND ') : ''} ` +
        `ORDER BY al.created_at DESC ` +
        `LIMIT ${limitParam}`;

      const rows = await client.query(sql, params);

      const items = (rows.rows ?? []).map((r: any) => ({
        id: String(r.id),
        action: String(r.action),
        resourceType: String(r.resource_type),
        resourceId: r.resource_id ? String(r.resource_id) : null,
        metadata: (r.metadata as unknown) ?? {},
        createdAt: (r.created_at ?? new Date()).toISOString(),
        actor: r.user_id
          ? { userId: String(r.user_id), email: String(r.user_email ?? ''), name: String(r.user_name ?? '') }
          : null,
        project: r.project_id
          ? { projectId: String(r.project_id), name: String(r.project_name ?? ''), domain: String(r.project_domain ?? '') }
          : null,
      }));

      const nextCursor = items.length > 0 ? String(items[items.length - 1]!.createdAt) : null;
      return { ok: true, items, nextCursor };
    },
  );

  fastify.get(
    '/api/audit/logs/export',
    {
      schema: {
        tags: ['audit'],
        description:
          'Export audit logs for the current tenant (admin/manager).\n\n' +
          'curl (json):\n' +
          '```bash\n' +
          'curl -H "Authorization: Bearer <ACCESS_TOKEN>" "http://localhost:3001/api/audit/logs/export?format=json&limit=500"\n' +
          '```\n' +
          '\n' +
          'curl (csv):\n' +
          '```bash\n' +
          'curl -H "Authorization: Bearer <ACCESS_TOKEN>" "http://localhost:3001/api/audit/logs/export?format=csv&limit=500"\n' +
          '```\n',
        querystring: {
          type: 'object',
          properties: {
            format: { type: 'string', enum: ['json', 'csv'], default: 'json' },
            limit: { type: 'number', minimum: 1, maximum: 500, default: 100 },
            before: { type: 'string' },
            projectId: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            action: { type: 'string' },
          },
          additionalProperties: true,
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async (req, reply) => {
      requireRole(req, ['admin', 'manager']);
      const client = await requireDb(req);
      const q = auditLogsExportQuerySchema.parse(req.query ?? {});

      const where: string[] = [];
      const params: Array<string | number> = [];

      if (q.before) {
        params.push(q.before);
        where.push(`al.created_at < $${params.length}::timestamptz`);
      }
      if (q.projectId) {
        params.push(q.projectId);
        where.push(`al.project_id = $${params.length}::uuid`);
      }
      if (q.userId) {
        params.push(q.userId);
        where.push(`al.user_id = $${params.length}::uuid`);
      }
      if (q.action) {
        params.push(q.action);
        where.push(`al.action = $${params.length}`);
      }

      params.push(q.limit);
      const limitParam = `$${params.length}`;

      const sql =
        `SELECT al.id, al.created_at, al.action, al.resource_type, al.resource_id, ` +
        `u.email AS user_email, u.name AS user_name, p.name AS project_name, p.domain AS project_domain, al.metadata ` +
        `FROM audit_logs al ` +
        `LEFT JOIN users u ON u.id = al.user_id ` +
        `LEFT JOIN projects p ON p.id = al.project_id ` +
        `${where.length ? 'WHERE ' + where.join(' AND ') : ''} ` +
        `ORDER BY al.created_at DESC ` +
        `LIMIT ${limitParam}`;

      const rows = await client.query(sql, params);

      if (q.format === 'csv') {
        const header = ['createdAt', 'action', 'resourceType', 'resourceId', 'userEmail', 'userName', 'projectName', 'projectDomain', 'metadata'];
        const sanitizeForCsv = (s: string) => {
          // Prevent CSV injection in Excel/Sheets.
          if (/^[=+\-@]/.test(s)) return `'${s}`;
          return s;
        };
        const escape = (value: unknown) => {
          const raw = value === null || value === undefined ? '' : String(value);
          const s = sanitizeForCsv(raw);
          if (/[",\n\r]/.test(s)) return '"' + s.replaceAll('"', '""') + '"';
          return s;
        };
        const lines = [header.join(',')];
        for (const r of rows.rows as any[]) {
          lines.push(
            [
              (r.created_at ?? new Date()).toISOString(),
              String(r.action),
              String(r.resource_type),
              r.resource_id ? String(r.resource_id) : '',
              r.user_email ? String(r.user_email) : '',
              r.user_name ? String(r.user_name) : '',
              r.project_name ? String(r.project_name) : '',
              r.project_domain ? String(r.project_domain) : '',
              JSON.stringify((r.metadata as unknown) ?? {}),
            ]
              .map(escape)
              .join(','),
          );
        }
        reply.header('content-type', 'text/csv; charset=utf-8');
        return reply.send(lines.join('\n'));
      }

      return reply.send({
        ok: true,
        items: (rows.rows ?? []).map((r: any) => ({
          id: String(r.id),
          createdAt: (r.created_at ?? new Date()).toISOString(),
          action: String(r.action),
          resourceType: String(r.resource_type),
          resourceId: r.resource_id ? String(r.resource_id) : null,
          actorEmail: r.user_email ? String(r.user_email) : null,
          actorName: r.user_name ? String(r.user_name) : null,
          projectName: r.project_name ? String(r.project_name) : null,
          projectDomain: r.project_domain ? String(r.project_domain) : null,
          metadata: (r.metadata as unknown) ?? {},
        })),
      });
    },
  );

  fastify.post(
    '/api/audit/issues/:issueId/resolve',
    {
      schema: {
        tags: ['audit'],
        description: 'Mark a normalized audit issue as resolved/unresolved for the project (stored in project settings).',
        params: {
          type: 'object',
          properties: {
            issueId: { type: 'string' },
          },
          required: ['issueId'],
          additionalProperties: true,
        },
        body: {
          type: 'object',
          properties: {
            resolved: { type: 'boolean', default: true },
          },
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              projectId: { type: 'string' },
              issueId: { type: 'string' },
              resolved: { type: 'boolean' },
            },
            required: ['ok', 'projectId', 'issueId', 'resolved'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);

    const params = resolveParamsSchema.parse((req as any).params ?? {});
    const body = resolveBodySchema.parse(req.body ?? {});

    const projectRow = await client.query('SELECT settings FROM projects WHERE id = $1 LIMIT 1', [projectId]);
    const settings = (projectRow.rows[0]?.settings as unknown) ?? {};
    const auditSettings = getSettingsSection(settings, 'audit');
    const issueStatusMap = safeJsonObject(auditSettings.issueStatus);

    const now = new Date().toISOString();
    const nextMap = {
      ...issueStatusMap,
      [params.issueId]: {
        resolved: body.resolved,
        resolvedAt: body.resolved ? now : null,
      },
    };

    const nextAuditSettings = {
      ...auditSettings,
      issueStatus: nextMap,
    };
    const nextSettings = setSettingsSection(settings, 'audit', nextAuditSettings);

    await client.query('UPDATE projects SET settings = $2::jsonb, updated_at = now() WHERE id = $1', [projectId, nextSettings]);

    return {
      ok: true,
      projectId,
      issueId: params.issueId,
      resolved: body.resolved,
    };
    },
  );

  fastify.get(
    '/api/audit/cwv',
    {
      schema: {
        tags: ['audit'],
        description: 'Return Core Web Vitals time series points for the default project.',
        querystring: {
          type: 'object',
          properties: {
            range: { type: 'string', enum: ['7d', '30d', '90d'], default: '30d' },
            device: { type: 'string', enum: ['mobile', 'desktop'] },
          },
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              projectId: { type: 'string' },
              range: { type: 'string' },
              device: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              points: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    date: { type: 'string' },
                    lcp: { type: 'number' },
                    fid: { type: 'number' },
                    cls: { type: 'number' },
                  },
                  required: ['date', 'lcp', 'fid', 'cls'],
                  additionalProperties: false,
                },
              },
            },
            required: ['ok', 'projectId', 'range', 'device', 'points'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);
    const q = cwvQuerySchema.parse(req.query ?? {});
    const intervalText = q.range === '7d' ? '7 days' : q.range === '90d' ? '90 days' : '30 days';

    const params: unknown[] = [projectId, intervalText];
    const deviceClause = q.device ? 'AND device = $3' : '';
    if (q.device) params.push(q.device);

    const rows = await client.query(
      `SELECT
         date_trunc('day', measured_at) AS day,
         AVG(lcp) AS lcp,
         AVG(fid) AS fid,
         AVG(cls) AS cls
       FROM cwv_timeseries
       WHERE project_id = $1
         AND measured_at >= now() - $2::interval
         ${deviceClause}
       GROUP BY day
       ORDER BY day ASC`,
      params as any,
    );

    return {
      ok: true,
      projectId,
      range: q.range,
      device: q.device ?? null,
      points: (rows.rows as any[]).map((r) => ({
        date: new Date(r.day).toISOString().slice(0, 10),
        lcp: Number(r.lcp ?? 0),
        fid: Number(r.fid ?? 0),
        cls: Number(r.cls ?? 0),
      })),
    };
    },
  );

  fastify.get(
    '/api/audit/crawl-map',
    {
      schema: {
        tags: ['audit'],
        description: 'Return a grouped crawl map (segment -> list of leaf URLs) for the default project.',
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', minimum: 1, maximum: 2000, default: 500 },
          },
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              projectId: { type: 'string' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    children: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          size: { type: 'number' },
                          status: { type: 'string', enum: ['good', 'warn', 'bad'] },
                        },
                        required: ['name', 'size', 'status'],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ['name', 'children'],
                  additionalProperties: false,
                },
              },
            },
            required: ['ok', 'projectId', 'data'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);
    const q = crawlQuerySchema.parse(req.query ?? {});

    const rows = await client.query(
      `SELECT from_url, COALESCE(MIN(page_depth), 99) AS depth, COUNT(*)::int AS out_links
       FROM internal_links
       WHERE project_id = $1
       GROUP BY from_url
       ORDER BY out_links DESC
       LIMIT $2`,
      [projectId, q.limit],
    );

    type Leaf = { name: string; size: number; status: 'good' | 'warn' | 'bad' };
    const groups = new Map<string, Leaf[]>();

    for (const r of rows.rows as any[]) {
      const fromUrl = String(r.from_url ?? '');
      const depth = Number(r.depth ?? 99);
      const outLinks = Number(r.out_links ?? 0);

      let segment = '/';
      try {
        const u = new URL(fromUrl);
        const parts = u.pathname.split('/').filter(Boolean);
        segment = parts.length > 0 ? `/${parts[0]}` : '/';
      } catch {
        segment = '/';
      }

      const status: Leaf['status'] = depth <= 2 ? 'good' : depth <= 5 ? 'warn' : 'bad';
      const leaf: Leaf = { name: fromUrl, size: Math.max(1, outLinks), status };
      const arr = groups.get(segment) ?? [];
      arr.push(leaf);
      groups.set(segment, arr);
    }

    const data = Array.from(groups.entries()).map(([name, children]) => ({
      name,
      children,
    }));

    return { ok: true, projectId, data };
    },
  );
};
