import type { Page, Route } from '@playwright/test';

export type MockContext = {
  tenantId: string;
  projectId: string;
};

export async function installAuthState(page: Page, ctx: MockContext) {
  await page.addInitScript(({ tenantId, projectId }) => {
    // AuthProvider reads token from cookie + user from localStorage.
    document.cookie = `aiseo_token=e2e-token; path=/; samesite=strict`;
    document.cookie = `aiseo_refresh_token=e2e-refresh; path=/; samesite=strict`;

    localStorage.setItem(
      'aiseo_user',
      JSON.stringify({
        id: '00000000-0000-0000-0000-000000000001',
        email: 'e2e@example.com',
        tenantId,
        projectId,
      }),
    );

    // Prevent noisy reconnect loops during E2E (we validate UI, not WS transport).
    class StubWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      readyState = StubWebSocket.OPEN;
      url: string;
      onopen: ((ev: any) => any) | null = null;
      onmessage: ((ev: any) => any) | null = null;
      onerror: ((ev: any) => any) | null = null;
      onclose: ((ev: any) => any) | null = null;

      constructor(url: string) {
        this.url = url;
        setTimeout(() => this.onopen?.({ type: 'open' }), 0);
      }

      send() {
        // no-op
      }

      close() {
        this.readyState = StubWebSocket.CLOSED;
        setTimeout(() => this.onclose?.({ type: 'close' }), 0);
      }

      addEventListener() {
        // no-op
      }

      removeEventListener() {
        // no-op
      }
    }

    // @ts-expect-error override for E2E
    window.WebSocket = StubWebSocket;
  }, ctx);
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function okNowIso() {
  return new Date().toISOString();
}

function safePostDataJSON(route: Route): any {
  try {
    // Playwright's postDataJSON() is synchronous and may throw if body is empty/invalid.
    return route.request().postDataJSON();
  } catch {
    const raw = route.request().postData();
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
}

export async function installApiMocks(page: Page, ctx: MockContext) {
  // The web app prefers same-origin requests and relies on Next rewrites.
  // In E2E we mock at the browser layer, so we must intercept both:
  // - http://127.0.0.1:3000/api/* (Next dev server)
  // - http://127.0.0.1:3001/api/* (direct API)
  const apiRe = /https?:\/\/(localhost|127\.0\.0\.1):(3000|3001)\/api\/.*/i;

  // Stateful mocks: allow UI to reflect pause/resume and schedule creation.
  const now = () => new Date().toISOString();

  const agentIds = [
    'keyword-researcher',
    'serp-tracker',
    'content-writer',
    'technical-auditor',
    'competitor-monitor',
    'backlink-builder',
    'report-generator',
    'schema-agent',
    'internal-linker',
    'pagespeed-agent',
    'local-seo',
    'content-refresher',
  ];

  const scheduleState = new Map<string, { enabled: boolean; cron: string; updatedAt: string }>();
  for (const id of agentIds) {
    scheduleState.set(id, { enabled: true, cron: '0 6 * * *', updatedAt: now() });
  }

  let reportSchedules: Array<{ id: string; templateId: string; frequency: 'daily' | 'weekly' | 'monthly'; recipients: string[]; createdAt: string }> = [];
  let reportScheduleSeq = 1;

  await page.route(apiRe, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    // Dashboard
    if (path === '/api/dashboard/metrics') {
      return json(route, {
        organicTraffic: { value: 12000, change: 12, trend: 'up' },
        topRankings: { value: 42, change: 5, trend: 'up' },
        trackedKeywords: { value: 300, change: 10, trend: 'up' },
        contentPublished: { value: 8, change: 1, trend: 'up' },
      });
    }

    if (path === '/api/agents/activities') {
      return json(route, [
        {
          id: 'act_1',
          agentName: 'keyword-researcher',
          status: 'completed',
          task: 'Seed research',
          startedAt: okNowIso(),
          completedAt: okNowIso(),
        },
      ]);
    }

    if (path === '/api/alerts') {
      return json(route, [
        {
          id: 'alert_1',
          type: 'info',
          message: 'E2E mock alert',
          page: '/',
          createdAt: okNowIso(),
        },
      ]);
    }

    if (path === '/api/workflows/status') {
      return json(route, [
        { id: 'wf_1', name: 'seo-content-pipeline', stage: 'idle', progress: 0, status: 'completed' },
      ]);
    }

    // Schedules
    if (path === '/api/schedules') {
      const createdAt = now();
      const schedules = agentIds.map((id) => {
        const state = scheduleState.get(id) ?? { enabled: true, cron: '0 6 * * *', updatedAt: createdAt };
        return {
          id,
          flow_name: 'seo-content-pipeline',
          project_id: ctx.projectId,
          seed_keyword: null,
          cron: state.cron,
          timezone: null,
          enabled: state.enabled,
          created_at: createdAt,
          updated_at: state.updatedAt,
        };
      });
      return json(route, { ok: true, schedules });
    }

    if (path.startsWith('/api/schedules/') && (path.endsWith('/pause') || path.endsWith('/resume') || path.endsWith('/run'))) {
      const parts = path.split('/');
      const id = parts[3] ?? '';
      const state = scheduleState.get(id) ?? { enabled: true, cron: '0 6 * * *', updatedAt: now() };

      if (path.endsWith('/pause') && method === 'POST') {
        state.enabled = false;
        state.updatedAt = now();
        scheduleState.set(id, state);
        return json(route, { ok: true });
      }

      if (path.endsWith('/resume') && method === 'POST') {
        state.enabled = true;
        state.updatedAt = now();
        scheduleState.set(id, state);
        return json(route, { ok: true });
      }

      if (path.endsWith('/run') && method === 'POST') {
        return json(route, { ok: true, result: { jobId: `run_${id}_${Date.now()}` } });
      }
    }

    if (path === '/api/schedules/flow') {
      return json(route, { ok: true });
    }

    // Flows
    if (path === '/api/flows/start' && method === 'POST') {
      return json(route, { ok: true, flowId: `flow_${Date.now()}` });
    }

    // Keyword Research trigger
    if (path === '/api/agents/keyword-research' && method === 'POST') {
      return json(route, { ok: true, jobId: `job_${Date.now()}` });
    }

    // Keywords
    if (path === '/api/keywords/distribution') {
      return json(route, {
        topThree: 5,
        topTen: 25,
        topTwenty: 60,
        topHundred: 110,
      });
    }

    if (path === '/api/keywords') {
      const pageParam = Number(url.searchParams.get('page') ?? '1');
      const limitParam = Number(url.searchParams.get('limit') ?? '20');
      const start = (pageParam - 1) * limitParam;

      const rows = Array.from({ length: limitParam }, (_, i) => {
        const idx = start + i + 1;
        return {
          id: `kw_${idx}`,
          keyword: `keyword ${idx}`,
          position: 15,
          change: 1,
          volume: 100,
          difficulty: 20,
          url: `https://example.com/p/${idx}`,
          lastUpdated: okNowIso(),
        };
      });

      return json(route, { data: rows, total: 200 });
    }

    // Alerts settings (Rankings page)
    if (path === '/api/alerts/settings') {
      if (route.request().method() === 'POST') {
        return json(route, { ok: true, projectId: ctx.projectId, settings: safePostDataJSON(route) });
      }
      return json(route, {
        projectId: ctx.projectId,
        rankDropThreshold: 5,
        slackWebhookUrl: '',
        emailRecipients: [],
      });
    }

    // SERP
    if (path === '/api/serp/features') {
      return json(route, {
        ok: true,
        rows: [
          {
            keywordId: 'kw_1',
            keyword: 'keyword 1',
            features: { featuredSnippet: true, peopleAlsoAsk: true, video: false, images: false, localPack: false },
            owned: { featuredSnippet: false, peopleAlsoAsk: false, video: false, images: false, localPack: false },
          },
        ],
      });
    }

    // Content
    if (path === '/api/content/status') {
      return json(route, {
        published: 3,
        draft: 2,
        pending: 1,
        scheduled: 1,
      });
    }

    if (path === '/api/content') {
      return json(route, {
        data: [
          {
            id: 'c_1',
            title: 'E2E Draft',
            excerpt: 'Excerpt',
            status: 'draft',
            wordCount: 900,
            lastModified: okNowIso(),
            author: 'ai',
            targetKeyword: 'aiseo',
          },
        ],
        total: 1,
      });
    }

    if (path.startsWith('/api/content/performance')) {
      return json(route, {
        ok: true,
        projectId: ctx.projectId,
        range: url.searchParams.get('range') ?? '30d',
        data: [
          {
            id: 'c_p_1',
            title: 'Published Article',
            tag: 'seo',
            publishedAt: okNowIso(),
            traffic: 1234,
            rank: 7,
            conversions: 12,
            author: 'ai',
          },
        ],
      });
    }

    if (path.startsWith('/api/content/')) {
      const id = path.split('/').pop() || 'unknown';
      if (route.request().method() === 'POST') {
        return json(route, {
          ok: true,
          draft: {
            id,
            projectId: ctx.projectId,
            title: 'E2E Draft',
            metaDescription: 'meta',
            status: 'draft',
            primaryKeyword: 'aiseo',
            markdown: '# Hello',
            totalWordCount: 2,
            createdAt: okNowIso(),
            updatedAt: okNowIso(),
          },
        });
      }

      return json(route, {
        ok: true,
        draft: {
          id,
          projectId: ctx.projectId,
          title: 'E2E Draft',
          metaDescription: 'meta',
          status: 'draft',
          primaryKeyword: 'aiseo',
          markdown: '# Hello',
          totalWordCount: 2,
          createdAt: okNowIso(),
          updatedAt: okNowIso(),
        },
      });
    }

    // Audit
    if (path === '/api/audit/health') {
      return json(route, {
        ok: true,
        projectId: ctx.projectId,
        overall: 86,
        breakdown: { technical: 82, content: 88, ux: 90 },
        issues: { total: 12, critical: 2, warning: 7 },
        auditedAt: okNowIso(),
      });
    }

    if (path === '/api/audit/issues') {
      return json(route, {
        ok: true,
        projectId: ctx.projectId,
        items: [
          {
            id: 'issue_1',
            url: 'https://example.com/',
            auditedAt: okNowIso(),
            severity: 'warning',
            category: 'meta',
            title: 'Missing meta description',
            description: 'Desc',
            recommendation: 'Add one',
            resolved: false,
            resolvedAt: null,
          },
        ],
      });
    }

    if (path.startsWith('/api/audit/issues/') && path.endsWith('/resolve')) {
      const issueId = path.split('/')[4];
      return json(route, { ok: true, projectId: ctx.projectId, issueId, resolved: true });
    }

    if (path === '/api/audit/cwv') {
      return json(route, {
        ok: true,
        projectId: ctx.projectId,
        range: url.searchParams.get('range') ?? '30d',
        device: url.searchParams.get('device') ?? null,
        points: [
          { date: '2026-02-10', lcp: 2.1, fid: 40, cls: 0.05 },
          { date: '2026-02-11', lcp: 2.0, fid: 38, cls: 0.04 },
        ],
      });
    }

    if (path === '/api/audit/crawl-map') {
      return json(route, {
        ok: true,
        projectId: ctx.projectId,
        data: [
          {
            name: 'Root',
            children: [
              { name: '/', size: 10, status: 'good' },
              { name: '/blog', size: 6, status: 'warn' },
              { name: '/pricing', size: 4, status: 'bad' },
            ],
          },
        ],
      });
    }

    // Backlinks
    if (path === '/api/backlinks/profile') {
      return json(route, {
        ok: true,
        projectId: ctx.projectId,
        totals: { backlinks: 120, referringDomains: 45 },
        daBuckets: [
          { bucket: '0-20', count: 30 },
          { bucket: '21-40', count: 50 },
          { bucket: '41-60', count: 30 },
          { bucket: '61+', count: 10 },
        ],
      });
    }

    if (path === '/api/backlinks/timeline') {
      return json(route, {
        ok: true,
        projectId: ctx.projectId,
        range: url.searchParams.get('range') ?? '30d',
        points: [
          { date: '2026-02-10', new: 2, lost: 0 },
          { date: '2026-02-11', new: 1, lost: 1 },
        ],
      });
    }

    if (path === '/api/backlinks/outreach') {
      return json(route, {
        ok: true,
        projectId: ctx.projectId,
        campaigns: [
          {
            id: 'oc_1',
            campaignId: 'camp_1',
            targetDomain: 'site.com',
            contactEmail: 'editor@site.com',
            subject: 'Backlink opportunity',
            status: 'draft',
            createdAt: okNowIso(),
            updatedAt: okNowIso(),
          },
        ],
      });
    }

    if (path.startsWith('/api/backlinks/outreach/')) {
      const id = path.split('/').pop() || 'unknown';
      return json(route, { ok: true, id, status: 'sent' });
    }

    if (path === '/api/backlinks/gap') {
      return json(route, {
        ok: true,
        projectId: ctx.projectId,
        opportunities: [
          {
            id: 'gap_1',
            targetDomain: 'news.com',
            targetUrl: 'https://news.com/article',
            domainRating: 70,
            priority: 'high',
            competitors: ['comp-a.com', 'comp-b.com'],
            status: 'new',
            discoveredAt: okNowIso(),
          },
        ],
      });
    }

    // Reports
    if (path === '/api/reports') {
      return json(route, {
        ok: true,
        projectId: ctx.projectId,
        reports: [
          {
            id: 'rep_1',
            reportId: 'weekly',
            format: 'weekly',
            period: 'weekly',
            startDate: '2026-02-01',
            endDate: '2026-02-07',
            outputFormat: 'pdf',
            outputUrl: null,
            generatedAt: okNowIso(),
          },
        ],
      });
    }

    if (path === '/api/reports/generate' && method === 'POST') {
      return json(route, { ok: true, reportId: `rep_gen_${Date.now()}`, url: 'https://example.com/report.pdf' });
    }

    if (path === '/api/reports/schedules') {
      if (method === 'POST') {
        const body = safePostDataJSON(route);
        const schedule = {
          id: `rs_${reportScheduleSeq++}`,
          templateId: String((body as any)?.templateId ?? 'tpl_1'),
          frequency: ((body as any)?.frequency ?? 'weekly') as 'daily' | 'weekly' | 'monthly',
          recipients: Array.isArray((body as any)?.recipients) ? ((body as any).recipients as string[]) : [],
          createdAt: now(),
        };
        reportSchedules = [...reportSchedules, schedule];
        return json(route, { ok: true, schedule });
      }

      return json(route, { ok: true, schedules: reportSchedules });
    }

    if (path.startsWith('/api/reports/schedules/') && method === 'DELETE') {
      const id = path.split('/')[4] ?? '';
      reportSchedules = reportSchedules.filter((s) => s.id !== id);
      return json(route, { ok: true, id });
    }

    if (path === '/api/reports/templates') {
      if (route.request().method() === 'POST') {
        const body = safePostDataJSON(route);
        return json(route, {
          ok: true,
          projectId: ctx.projectId,
          template: {
            id: 'tpl_1',
            name: body?.name ?? 'Template',
            modules: body?.modules ?? ['rankings'],
            range: body?.range ?? '30d',
            createdAt: okNowIso(),
          },
        });
      }

      return json(route, {
        ok: true,
        projectId: ctx.projectId,
        templates: [
          { id: 'tpl_1', name: 'Weekly', modules: ['rankings', 'traffic'], range: '30d', createdAt: okNowIso() },
        ],
      });
    }

    // Settings
    if (path === '/api/projects') {
      if (route.request().method() === 'POST') {
        const body = safePostDataJSON(route);
        return json(route, {
          ok: true,
          project: {
            id: 'p_new',
            name: body?.name ?? 'New',
            domain: body?.domain ?? 'example.com',
            settings: { targetKeywords: body?.targetKeywords ?? [] },
            createdAt: okNowIso(),
            updatedAt: okNowIso(),
          },
        });
      }

      return json(route, {
        ok: true,
        projects: [
          {
            id: ctx.projectId,
            name: 'E2E Project',
            domain: 'example.com',
            settings: { targetKeywords: ['aiseo'] },
            createdAt: okNowIso(),
            updatedAt: okNowIso(),
          },
        ],
      });
    }

    if (path.startsWith('/api/projects/')) {
      const id = path.split('/').pop() || ctx.projectId;
      if (route.request().method() === 'DELETE') {
        return json(route, { ok: true, id });
      }
      return json(route, {
        ok: true,
        project: {
          id,
          name: 'E2E Project',
          domain: 'example.com',
          settings: { targetKeywords: ['aiseo'] },
          createdAt: okNowIso(),
          updatedAt: okNowIso(),
        },
      });
    }

    if (path === '/api/api-keys') {
      if (route.request().method() === 'POST') {
        return json(route, {
          ok: true,
          secret: 'aiseo_e2e_secret_key',
          apiKey: {
            id: 'ak_1',
            projectId: ctx.projectId,
            name: 'E2E Key',
            maskedKey: 'aiseo_e2e...key',
            permissions: { scopes: ['keywords'] },
            revokedAt: null,
            createdAt: okNowIso(),
          },
        });
      }

      return json(route, {
        ok: true,
        apiKeys: [
          {
            id: 'ak_1',
            projectId: ctx.projectId,
            name: 'E2E Key',
            maskedKey: 'aiseo_e2e...key',
            permissions: { scopes: ['keywords', 'content'] },
            revokedAt: null,
            createdAt: okNowIso(),
          },
        ],
      });
    }

    if (path.startsWith('/api/api-keys/') && path.endsWith('/reveal')) {
      const id = path.split('/')[3];
      return json(route, { ok: true, id, secret: 'aiseo_e2e_secret_key' });
    }

    if (path.startsWith('/api/api-keys/') && path.endsWith('/revoke')) {
      const id = path.split('/')[3];
      return json(route, { ok: true, id, revokedAt: okNowIso() });
    }

    if (path.startsWith('/api/api-keys/')) {
      const id = path.split('/')[3];
      return json(route, { ok: true, id });
    }

    if (path === '/api/notifications/settings') {
      if (route.request().method() === 'POST') {
        return json(route, { ok: true, projectId: ctx.projectId, settings: safePostDataJSON(route) });
      }
      return json(route, {
        ok: true,
        projectId: ctx.projectId,
        slackWebhookUrl: '',
        emailRecipients: [],
        types: ['alerts'],
      });
    }

    if (path === '/api/rbac/users') {
      if (route.request().method() === 'POST') {
        return json(route, { ok: true, userId: 'u_2' });
      }

      return json(route, {
        ok: true,
        users: [
          {
            id: 'u_1',
            email: 'admin@example.com',
            name: 'Admin',
            role: 'admin',
            createdAt: okNowIso(),
            updatedAt: okNowIso(),
          },
        ],
      });
    }

    if (path.startsWith('/api/rbac/users/')) {
      const id = path.split('/')[4] ?? 'u_1';
      return json(route, { ok: true, userId: id });
    }

    if (path === '/api/rbac/permissions-matrix') {
      return json(route, {
        ok: true,
        roles: ['admin', 'manager', 'analyst'],
        permissions: [
          { key: 'projects', label: 'Projects', admin: true, manager: true, analyst: true },
          { key: 'apiKeys', label: 'API Keys', admin: true, manager: false, analyst: false },
          { key: 'notifications', label: 'Notifications', admin: true, manager: true, analyst: false },
          { key: 'users', label: 'Users & Roles', admin: true, manager: false, analyst: false },
          { key: 'export', label: 'Backup / Export', admin: true, manager: true, analyst: true },
        ],
      });
    }

    if (path.startsWith('/api/backup/export')) {
      return json(route, {
        ok: true,
        export: {
          project: {
            id: ctx.projectId,
            name: 'E2E Project',
            domain: 'example.com',
            settings: {},
            createdAt: okNowIso(),
            updatedAt: okNowIso(),
          },
          keywords: ['aiseo'],
          schedules: [],
        },
      });
    }

    if (path === '/api/backup/import') {
      return json(route, { ok: true, projectId: 'p_imported' });
    }

    // Default: keep tests strict so missing mocks are obvious.
    return json(route, { message: `No mock for ${path}` }, 501);
  });
}
