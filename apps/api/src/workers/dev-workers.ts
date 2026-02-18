import 'dotenv/config';

import http from 'node:http';

import {
  createDefaultToolRegistry,
  createIsolatedWorkspace,
  CronScheduler,
  createRedisConnection,
  EventBus,
  KeywordResearcherAgent,
  OrchestratorEngine,
  postSlackWebhook,
  SerpClient,
} from '@aiseo/core';
import { type Job, Queue, Worker } from 'bullmq';

import { env } from '../config/env.js';
import { pool, setAuthContext } from '../db/pool.js';
import { computeTenantQuotas } from '../quotas/tenant-quotas.js';
import { emitQuotaExceeded, getKeywordCapacity, getTenantUsage, reserveSerpJobsOrThrow } from '../quotas/usage.js';

const redis = createRedisConnection({ url: env.REDIS_URL });
const engine = new OrchestratorEngine({ redis, prefix: 'aiseo' });
const scheduler = new CronScheduler({ redis, prefix: 'aiseo' });
const eventBus = new EventBus({ redis, prefix: 'aiseo' });

const smartAgentsQueue = new Queue('smart-agents', { connection: redis, prefix: 'aiseo' });
const autoTasksQueue = new Queue('auto-tasks', { connection: redis, prefix: 'aiseo' });

const keywordResearcher = new KeywordResearcherAgent();

const smartAgentsWorker = new Worker(
  smartAgentsQueue.name,
  async (job: Job) => {
    if (job.name !== 'keyword-researcher') {
      return { ok: true, ignored: true, jobName: job.name };
    }

    const tenantId =
      job.data && typeof job.data === 'object' && 'tenantId' in job.data
        ? String((job.data as Record<string, unknown>).tenantId)
        : undefined;
    const projectId =
      job.data && typeof job.data === 'object' && 'projectId' in job.data
        ? String((job.data as Record<string, unknown>).projectId)
        : undefined;
    const seedKeyword =
      job.data && typeof job.data === 'object' && 'seedKeyword' in job.data
        ? String((job.data as Record<string, unknown>).seedKeyword)
        : undefined;

    if (!tenantId || !projectId) {
      throw new Error('keyword-researcher requires tenantId, projectId');
    }

    const workspace = await createIsolatedWorkspace({ agentId: job.name });
    const tools = createDefaultToolRegistry();

    await eventBus.publish({
      tenantId,
      projectId,
      type: 'agent.task.started',
      payload: { kind: 'job', queue: smartAgentsQueue.name, jobName: job.name, jobId: job.id },
    });

    const client = await pool.connect();
    try {
      await setAuthContext(client, { tenantId, role: 'admin' });

      const output = await keywordResearcher.run(
        { seedKeyword },
        {
          tenantId,
          projectId,
          agentId: keywordResearcher.id,
          workspacePath: workspace.path,
          tools,
          eventBus,
        },
      );

      const keywords = output.keywords.map((k) => k.trim()).filter(Boolean).slice(0, 200);

      const tenantCfg = await client.query('SELECT plan, settings FROM tenants WHERE id = $1 LIMIT 1', [tenantId]);
      const quotas = computeTenantQuotas(tenantCfg.rows[0]?.plan, tenantCfg.rows[0]?.settings);

      let insertList = keywords;
      if (quotas.keywordsMax !== null) {
        const cap = await getKeywordCapacity(client, tenantId, quotas.keywordsMax);
        const remaining = cap.remaining ?? 0;
        if (remaining <= 0) {
          const usage = await getTenantUsage(client as any, tenantId);
          await emitQuotaExceeded(client as any, tenantId, {
            tenantId,
            period: usage.period,
            kind: 'keywords_max',
            limit: quotas.keywordsMax,
            current: cap.current,
          });
          insertList = [];
        } else {
          insertList = keywords.slice(0, remaining);
        }
      }

      if (insertList.length > 0) {
        await client.query(
          `INSERT INTO keywords (project_id, keyword)
           SELECT $1, x FROM unnest($2::text[]) AS x
           ON CONFLICT (project_id, keyword)
           DO NOTHING`,
          [projectId, insertList],
        );
      }

      await eventBus.publish({
        tenantId,
        projectId,
        type: 'agent.task.completed',
        payload: {
          kind: 'job',
          queue: smartAgentsQueue.name,
          jobName: job.name,
          jobId: job.id,
          inserted: insertList.length,
        },
      });

      return { ok: true, seedKeyword: output.seedKeyword, keywordsCount: insertList.length };
    } catch (error) {
      await eventBus.publish({
        tenantId,
        projectId,
        type: 'agent.task.failed',
        payload: {
          kind: 'job',
          queue: smartAgentsQueue.name,
          jobName: job.name,
          jobId: job.id,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    } finally {
      client.release();
      await workspace.cleanup();
    }
  },
  { connection: redis, prefix: 'aiseo' },
);

const autoTasksWorker = new Worker(
  autoTasksQueue.name,
  async (job: Job) => {
    // Handle daily bulk SERP tracking for all keywords in a project
    if (job.name === 'serp-daily-tracker') {
      const tenantId =
        job.data && typeof job.data === 'object' && 'tenantId' in job.data
          ? String((job.data as Record<string, unknown>).tenantId)
          : undefined;
      const projectId =
        job.data && typeof job.data === 'object' && 'projectId' in job.data
          ? String((job.data as Record<string, unknown>).projectId)
          : undefined;

      if (!tenantId || !projectId) {
        throw new Error('serp-daily-tracker requires tenantId, projectId');
      }

      const client = await pool.connect();
      try {
        await setAuthContext(client, { tenantId, role: 'admin' });

        const tenantCfg = await client.query('SELECT plan, settings FROM tenants WHERE id = $1 LIMIT 1', [tenantId]);
        const quotas = computeTenantQuotas(tenantCfg.rows[0]?.plan, tenantCfg.rows[0]?.settings);

        // Fetch all keywords for this project
        const keywordsResult = await client.query(
          'SELECT id, keyword FROM keywords WHERE project_id = $1',
          [projectId],
        );

        const keywords = keywordsResult.rows as Array<{ id: string; keyword: string }>;

        // Enforce monthly SERP quota: reserve what we are about to enqueue.
        if (quotas.serpJobsPerMonth !== null) {
          const usage = await getTenantUsage(client as any, tenantId);
          const remaining = Math.max(0, quotas.serpJobsPerMonth - usage.serpJobs);
          if (remaining <= 0) {
            await emitQuotaExceeded(client as any, tenantId, {
              tenantId,
              period: usage.period,
              kind: 'serp_jobs',
              limit: quotas.serpJobsPerMonth,
              current: usage.serpJobs,
              requested: keywords.length,
            });
            return { ok: false, skipped: true, reason: 'serp_quota_exceeded' };
          }
          if (keywords.length > remaining) {
            keywords.splice(remaining);
          }
        }

        if (keywords.length > 0) {
          await reserveSerpJobsOrThrow(client as any, tenantId, keywords.length, quotas);
        }

        // Enqueue individual tracking jobs
        const jobs = keywords.map((kw) => ({
          name: 'serp-tracker',
          data: { tenantId, projectId, keyword: kw.keyword, locale: 'zh-TW', checkAnomaly: true },
        }));

        if (jobs.length > 0) {
          await autoTasksQueue.addBulk(jobs);
        }

        await eventBus.publish({
          tenantId,
          projectId,
          type: 'agent.task.completed',
          payload: { kind: 'serp-daily-tracker', keywordsEnqueued: keywords.length },
        });

        return { ok: true, keywordsEnqueued: keywords.length };
      } finally {
        client.release();
      }
    }

    if (job.name !== 'serp-tracker') {
      return {
        ok: true,
        ignored: true,
        jobName: job.name,
      };
    }

    const tenantId =
      job.data && typeof job.data === 'object' && 'tenantId' in job.data
        ? String((job.data as Record<string, unknown>).tenantId)
        : undefined;
    const projectId =
      job.data && typeof job.data === 'object' && 'projectId' in job.data
        ? String((job.data as Record<string, unknown>).projectId)
        : undefined;
    const keyword =
      job.data && typeof job.data === 'object' && 'keyword' in job.data
        ? String((job.data as Record<string, unknown>).keyword)
        : undefined;
    const locale =
      job.data && typeof job.data === 'object' && 'locale' in job.data
        ? String((job.data as Record<string, unknown>).locale)
        : 'zh-TW';
    const checkAnomaly =
      job.data && typeof job.data === 'object' && 'checkAnomaly' in job.data
        ? Boolean((job.data as Record<string, unknown>).checkAnomaly)
        : false;

    if (!tenantId || !projectId || !keyword) {
      throw new Error('serp-tracker requires tenantId, projectId, keyword');
    }

    await eventBus.publish({
      tenantId,
      projectId,
      type: 'agent.task.started',
      payload: { kind: 'serp-tracker', keyword, locale, jobId: job.id },
    });

    const client = await pool.connect();
    try {
      await setAuthContext(client, { tenantId, role: 'admin' });

      const tenantCfg = await client.query('SELECT plan, settings FROM tenants WHERE id = $1 LIMIT 1', [tenantId]);
      const quotas = computeTenantQuotas(tenantCfg.rows[0]?.plan, tenantCfg.rows[0]?.settings);

      // Ensure keyword row exists.
      if (quotas.keywordsMax !== null) {
        const exists = await client.query(
          `SELECT 1
           FROM keywords k
           WHERE k.project_id = $1 AND k.keyword = $2
           LIMIT 1`,
          [projectId, keyword],
        );

        if ((exists.rowCount ?? 0) === 0) {
          const cap = await getKeywordCapacity(client, tenantId, quotas.keywordsMax);
          const remaining = cap.remaining ?? 0;
          if (remaining <= 0) {
            const usage = await getTenantUsage(client as any, tenantId);
            await emitQuotaExceeded(client as any, tenantId, {
              tenantId,
              period: usage.period,
              kind: 'keywords_max',
              limit: quotas.keywordsMax,
              current: cap.current,
            });
            return { ok: false, skipped: true, reason: 'keyword_limit_reached' };
          }
        }
      }
      const keywordRow = await client.query(
        `INSERT INTO keywords (project_id, keyword)
         VALUES ($1, $2)
         ON CONFLICT (project_id, keyword)
         DO UPDATE SET keyword = EXCLUDED.keyword
         RETURNING id`,
        [projectId, keyword],
      );

      const keywordId = keywordRow.rows[0]?.id as string;

      // Get previous rank for anomaly detection
      let previousRank: number | null = null;
      if (checkAnomaly) {
        const prevResult = await client.query(
          `SELECT rank FROM keyword_ranks WHERE keyword_id = $1 ORDER BY checked_at DESC LIMIT 1`,
          [keywordId],
        );
        if (prevResult.rows.length > 0) {
          previousRank = prevResult.rows[0].rank as number;
        }
      }

      const projectRow = await client.query('SELECT domain FROM projects WHERE id = $1 LIMIT 1', [projectId]);
      const domain = (projectRow.rows[0]?.domain as string | undefined) ?? undefined;

      const providerType = (env.SERP_PROVIDER ?? 'mock') as 'mock' | 'valueserp' | 'scaleserp' | 'gsc' | 'crawler';
      const serp = new SerpClient({
        provider: providerType,
        valueSerpApiKey: env.VALUESERP_API_KEY,
        scaleSerpApiKey: env.SCALESERP_API_KEY,
        gscApiKey: env.GSC_API_KEY,
        gscSiteUrl: env.GSC_SITE_URL,
      });
      const serpResult = await serp.getRank({ keyword, locale, domain });

      const rank = serpResult.rank;

      const inserted = await client.query(
        `INSERT INTO keyword_ranks (keyword_id, rank, result_url)
         VALUES ($1, $2, $3)
         RETURNING id, keyword_id, rank, result_url, checked_at`,
        [keywordId, rank, serpResult.resultUrl ?? null],
      );

      // Check for rank anomaly (significant drop)
      let anomaly = false;
      if (checkAnomaly && previousRank !== null && previousRank > 0 && rank > 0) {
        const rankDrop = rank - previousRank;

        const settingsRow = await client.query('SELECT settings FROM projects WHERE id = $1 LIMIT 1', [projectId]);
        const projectSettings = (settingsRow.rows[0]?.settings as unknown) ?? {};
        const alertsSettings =
          projectSettings && typeof projectSettings === 'object' && 'alerts' in (projectSettings as any)
            ? (projectSettings as any).alerts
            : {};

        const thresholdRaw =
          alertsSettings && typeof alertsSettings === 'object' && 'rankDropThreshold' in (alertsSettings as any)
            ? Number((alertsSettings as any).rankDropThreshold)
            : 5;
        const threshold = Number.isFinite(thresholdRaw) && thresholdRaw > 0 ? Math.floor(thresholdRaw) : 5;

        if (rankDrop >= threshold) {
          anomaly = true;
          await eventBus.publish({
            tenantId,
            projectId,
            type: 'serp.rank.anomaly',
            payload: {
              keyword,
              locale,
              previousRank,
              currentRank: rank,
              drop: rankDrop,
              threshold,
              url: serpResult.resultUrl,
            },
          });

          const slackWebhookUrl =
            alertsSettings && typeof alertsSettings === 'object' && 'slackWebhookUrl' in (alertsSettings as any)
              ? String((alertsSettings as any).slackWebhookUrl || '')
              : '';

          if (slackWebhookUrl) {
            const text = `*[AISEO]* SERP rank anomaly\nkeyword=${keyword}\nprev=${previousRank} current=${rank} drop=${rankDrop} (threshold=${threshold})`;
            void postSlackWebhook(slackWebhookUrl, { text }).catch(() => {
              // best-effort in dev worker
            });
          }

          const emailRecipients =
            alertsSettings && typeof alertsSettings === 'object' && Array.isArray((alertsSettings as any).emailRecipients)
              ? ((alertsSettings as any).emailRecipients as unknown[]).map(String).filter(Boolean)
              : [];

          if (emailRecipients.length > 0) {
            await client.query('INSERT INTO events_outbox (event_type, payload) VALUES ($1, $2::jsonb)', [
              'alert.email.queued',
              {
                tenantId,
                projectId,
                kind: 'serp.rank.anomaly',
                to: emailRecipients,
                subject: `[AISEO] Ranking drop detected: ${keyword}`,
                text: `Keyword: ${keyword}\nPrevious rank: ${previousRank}\nCurrent rank: ${rank}\nDrop: ${rankDrop} (threshold=${threshold})`,
              },
            ]);
          }
        }
      }

      await eventBus.publish({
        tenantId,
        projectId,
        type: 'agent.task.completed',
        payload: { kind: 'serp-tracker', keyword, locale, rank, provider: serpResult.provider, row: inserted.rows[0], anomaly },
      });

      return { ok: true, keywordId, rank, row: inserted.rows[0], anomaly };
    } catch (error) {
      await eventBus.publish({
        tenantId,
        projectId,
        type: 'agent.task.failed',
        payload: { kind: 'serp-tracker', keyword, locale, error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    } finally {
      client.release();
    }
  },
  { connection: redis, prefix: 'aiseo' },
);

const workers = [
  engine.createDevWorker('orchestrator'),
  // Generic agent runners — skip jobs that are handled by DB-persisting workers below.
  engine.createDevWorker('smartAgents', { skipJobNames: ['keyword-researcher'] }),
  engine.createDevWorker('autoTasks', { skipJobNames: ['serp-daily-tracker', 'serp-tracker'] }),
  smartAgentsWorker,
  autoTasksWorker,
  scheduler.createWorker(engine),
];

// eslint-disable-next-line no-console
console.log('[workers] dev workers started');

// ── Minimal /health HTTP server for K8s liveness / readiness probes (port 3002) ──
const HEALTH_PORT = Number(process.env.WORKER_HEALTH_PORT ?? 3002);
let _healthy = true;

const healthServer = http.createServer((_req, res) => {
  if (_healthy) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
  } else {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'stopping' }));
  }
});
healthServer.listen(HEALTH_PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[workers] health server listening on :${HEALTH_PORT}`);
});

process.on('SIGINT', async () => {
  // eslint-disable-next-line no-console
  console.log('[workers] stopping...');

  _healthy = false;
  healthServer.close();
  await Promise.all(workers.map((w) => w.close()));
  await engine.close();
  await scheduler.close();
  await smartAgentsQueue.close();
  await autoTasksQueue.close();
  redis.disconnect();
  process.exit(0);
});
