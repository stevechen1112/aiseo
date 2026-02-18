import type { PoolClient } from 'pg';

import type { TenantQuotaConfig } from './tenant-quotas.js';
import { currentUsagePeriodKey } from './tenant-quotas.js';

export type UsageKind = 'api_calls' | 'serp_jobs' | 'crawl_jobs';

export type QuotaExceededKind = UsageKind | 'keywords_max';

export type QuotaExceededMeta = {
  kind: QuotaExceededKind;
  period: string;
  limit: number | null;
  current: number;
  requested?: number;
};

function quotaExceededError(message: string, meta: QuotaExceededMeta) {
  const error = new Error(message) as Error & {
    statusCode: number;
    code: 'QUOTA_EXCEEDED';
    kind: 'quota_exceeded';
    quota: QuotaExceededMeta;
  };
  error.statusCode = 429;
  error.code = 'QUOTA_EXCEEDED';
  error.kind = 'quota_exceeded';
  error.quota = meta;
  return error;
}

export async function ensureTenantUsageRow(client: PoolClient, tenantId: string, period = currentUsagePeriodKey()) {
  await client.query(
    `INSERT INTO tenant_usage (tenant_id, period)
     VALUES ($1, $2)
     ON CONFLICT (tenant_id, period)
     DO NOTHING`,
    [tenantId, period],
  );
}

export async function getTenantUsage(client: PoolClient, tenantId: string, period = currentUsagePeriodKey()) {
  const row = await client.query(
    `SELECT tenant_id, period, api_calls, serp_jobs, crawl_jobs, last_alert_at
     FROM tenant_usage
     WHERE tenant_id = $1 AND period = $2
     LIMIT 1`,
    [tenantId, period],
  );
  if ((row.rowCount ?? 0) === 0) {
    return {
      tenantId,
      period,
      apiCalls: 0,
      serpJobs: 0,
      crawlJobs: 0,
      lastAlertAt: null as string | null,
    };
  }
  const r = row.rows[0] as any;
  return {
    tenantId,
    period: String(r.period),
    apiCalls: Number(r.api_calls ?? 0),
    serpJobs: Number(r.serp_jobs ?? 0),
    crawlJobs: Number(r.crawl_jobs ?? 0),
    lastAlertAt: r.last_alert_at ? new Date(r.last_alert_at).toISOString() : null,
  };
}

async function maybeEmitQuotaEvent(client: PoolClient, tenantId: string, payload: any) {
  // Prevent spamming: at most once per hour per tenant.
  const row = await client.query(
    `UPDATE tenant_usage
     SET last_alert_at = NOW(), updated_at = NOW()
     WHERE tenant_id = $1 AND period = $2
       AND (last_alert_at IS NULL OR last_alert_at < NOW() - INTERVAL '1 hour')
     RETURNING last_alert_at`,
    [tenantId, payload.period],
  );

  if ((row.rowCount ?? 0) === 0) return;

  await client.query(
    `INSERT INTO events_outbox (event_type, payload)
     VALUES ($1, $2::jsonb)`,
    ['quota.exceeded', JSON.stringify(payload)],
  );
}

export async function emitQuotaExceeded(client: PoolClient, tenantId: string, payload: any) {
  await ensureTenantUsageRow(client, tenantId, payload.period);
  await maybeEmitQuotaEvent(client, tenantId, payload);
}

export async function incrementApiCallsOrThrow(
  client: PoolClient,
  tenantId: string,
  quotas: TenantQuotaConfig,
  period = currentUsagePeriodKey(),
) {
  const limit = quotas.apiCallsPerMonth;
  if (limit === null) {
    await ensureTenantUsageRow(client, tenantId, period);
    await client.query(
      `UPDATE tenant_usage
       SET api_calls = api_calls + 1, updated_at = NOW()
       WHERE tenant_id = $1 AND period = $2`,
      [tenantId, period],
    );
    return;
  }

  await ensureTenantUsageRow(client, tenantId, period);

  const updated = await client.query(
    `UPDATE tenant_usage
     SET api_calls = api_calls + 1, updated_at = NOW()
     WHERE tenant_id = $1 AND period = $2 AND api_calls < $3
     RETURNING api_calls`,
    [tenantId, period, limit],
  );

  if ((updated.rowCount ?? 0) > 0) return;

  const usage = await getTenantUsage(client, tenantId, period);
  await maybeEmitQuotaEvent(client, tenantId, {
    tenantId,
    period,
    kind: 'api_calls',
    limit,
    current: usage.apiCalls,
  });
  throw quotaExceededError('API quota exceeded', {
    kind: 'api_calls',
    period,
    limit,
    current: usage.apiCalls,
    requested: 1,
  });
}

export async function reserveSerpJobsOrThrow(
  client: PoolClient,
  tenantId: string,
  requested: number,
  quotas: TenantQuotaConfig,
  period = currentUsagePeriodKey(),
) {
  const limit = quotas.serpJobsPerMonth;
  if (requested <= 0) return;

  if (limit === null) {
    await ensureTenantUsageRow(client, tenantId, period);
    await client.query(
      `UPDATE tenant_usage
       SET serp_jobs = serp_jobs + $3, updated_at = NOW()
       WHERE tenant_id = $1 AND period = $2`,
      [tenantId, period, requested],
    );
    return;
  }

  await ensureTenantUsageRow(client, tenantId, period);

  const updated = await client.query(
    `UPDATE tenant_usage
     SET serp_jobs = serp_jobs + $3, updated_at = NOW()
     WHERE tenant_id = $1 AND period = $2 AND (serp_jobs + $3) <= $4
     RETURNING serp_jobs`,
    [tenantId, period, requested, limit],
  );

  if ((updated.rowCount ?? 0) > 0) return;

  const usage = await getTenantUsage(client, tenantId, period);
  await maybeEmitQuotaEvent(client, tenantId, {
    tenantId,
    period,
    kind: 'serp_jobs',
    limit,
    current: usage.serpJobs,
    requested,
  });
  throw quotaExceededError('SERP quota exceeded', {
    kind: 'serp_jobs',
    period,
    limit,
    current: usage.serpJobs,
    requested,
  });
}

export async function reserveCrawlJobsOrThrow(
  client: PoolClient,
  tenantId: string,
  requested: number,
  quotas: TenantQuotaConfig,
  period = currentUsagePeriodKey(),
) {
  const limit = quotas.crawlJobsPerMonth;
  if (requested <= 0) return;

  if (limit === null) {
    await ensureTenantUsageRow(client, tenantId, period);
    await client.query(
      `UPDATE tenant_usage
       SET crawl_jobs = crawl_jobs + $3, updated_at = NOW()
       WHERE tenant_id = $1 AND period = $2`,
      [tenantId, period, requested],
    );
    return;
  }

  await ensureTenantUsageRow(client, tenantId, period);

  const updated = await client.query(
    `UPDATE tenant_usage
     SET crawl_jobs = crawl_jobs + $3, updated_at = NOW()
     WHERE tenant_id = $1 AND period = $2 AND (crawl_jobs + $3) <= $4
     RETURNING crawl_jobs`,
    [tenantId, period, requested, limit],
  );

  if ((updated.rowCount ?? 0) > 0) return;

  const usage = await getTenantUsage(client, tenantId, period);
  await maybeEmitQuotaEvent(client, tenantId, {
    tenantId,
    period,
    kind: 'crawl_jobs',
    limit,
    current: usage.crawlJobs,
    requested,
  });
  throw quotaExceededError('Crawl quota exceeded', {
    kind: 'crawl_jobs',
    period,
    limit,
    current: usage.crawlJobs,
    requested,
  });
}

export async function getKeywordCapacity(
  client: PoolClient,
  tenantId: string,
  keywordsMax: number | null,
): Promise<{ remaining: number | null; current: number }> {
  const row = await client.query(
    `SELECT COUNT(*)::int AS total
     FROM keywords k
     JOIN projects p ON p.id = k.project_id
     WHERE p.tenant_id = $1`,
    [tenantId],
  );

  const current = Number(row.rows[0]?.total ?? 0);
  if (keywordsMax === null) {
    return { remaining: null, current };
  }

  const remaining = Math.max(0, keywordsMax - current);
  return { remaining, current };
}

export async function assertKeywordCapacity(
  client: PoolClient,
  tenantId: string,
  keywordsMax: number | null,
): Promise<{ remaining: number | null; current: number }> {
  const cap = await getKeywordCapacity(client, tenantId, keywordsMax);
  if (cap.remaining !== null && cap.remaining <= 0) {
    const usage = await getTenantUsage(client, tenantId);
    await emitQuotaExceeded(client, tenantId, {
      tenantId,
      period: usage.period,
      kind: 'keywords_max',
      limit: keywordsMax,
      current: cap.current,
    });
    throw quotaExceededError('Keyword limit reached', {
      kind: 'keywords_max',
      period: usage.period,
      limit: keywordsMax,
      current: cap.current,
      requested: 1,
    });
  }
  return cap;
}

export async function assertKeywordCapacityForRequested(
  client: PoolClient,
  tenantId: string,
  keywordsMax: number | null,
  requested: number,
): Promise<{ remaining: number | null; current: number }> {
  if (requested <= 0) {
    return getKeywordCapacity(client, tenantId, keywordsMax);
  }

  const cap = await getKeywordCapacity(client, tenantId, keywordsMax);
  if (cap.remaining !== null && requested > cap.remaining) {
    const usage = await getTenantUsage(client, tenantId);
    await emitQuotaExceeded(client, tenantId, {
      tenantId,
      period: usage.period,
      kind: 'keywords_max',
      limit: keywordsMax,
      current: cap.current,
      requested,
    });
    throw quotaExceededError('Keyword limit reached', {
      kind: 'keywords_max',
      period: usage.period,
      limit: keywordsMax,
      current: cap.current,
      requested,
    });
  }
  return cap;
}

// Backward compatible alias.
export const enforceKeywordCapacity = assertKeywordCapacity;
