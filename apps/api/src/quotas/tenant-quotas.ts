export type TenantQuotaConfig = {
  keywordsMax: number | null;
  apiCallsPerMonth: number | null;
  serpJobsPerMonth: number | null;
  crawlJobsPerMonth: number | null;
};

const DEFAULTS: Record<string, TenantQuotaConfig> = {
  starter: {
    keywordsMax: 500,
    apiCallsPerMonth: 50_000,
    serpJobsPerMonth: 5_000,
    crawlJobsPerMonth: 200,
  },
  pro: {
    keywordsMax: 2_000,
    apiCallsPerMonth: 200_000,
    serpJobsPerMonth: 25_000,
    crawlJobsPerMonth: 1_000,
  },
  team: {
    keywordsMax: 10_000,
    apiCallsPerMonth: 1_000_000,
    serpJobsPerMonth: 200_000,
    crawlJobsPerMonth: 5_000,
  },
  enterprise: {
    keywordsMax: null,
    apiCallsPerMonth: null,
    serpJobsPerMonth: null,
    crawlJobsPerMonth: null,
  },
};

function readNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.floor(value);
  if (typeof value === 'string' && value.trim().length > 0) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return undefined;
}

export function computeTenantQuotas(plan: unknown, settings: unknown): TenantQuotaConfig {
  const planKey = typeof plan === 'string' && plan.trim().length > 0 ? plan.trim().toLowerCase() : 'starter';
  const base = DEFAULTS[planKey] ?? DEFAULTS.starter;

  const quotasRaw =
    settings && typeof settings === 'object' && 'quotas' in (settings as any)
      ? (settings as any).quotas
      : undefined;

  const override = quotasRaw && typeof quotasRaw === 'object' ? quotasRaw : undefined;

  const keywordsMax = override ? readNumber((override as any).keywordsMax) : undefined;
  const apiCallsPerMonth = override ? readNumber((override as any).apiCallsPerMonth) : undefined;
  const serpJobsPerMonth = override ? readNumber((override as any).serpJobsPerMonth) : undefined;
  const crawlJobsPerMonth = override ? readNumber((override as any).crawlJobsPerMonth) : undefined;

  return {
    keywordsMax: keywordsMax === undefined ? base!.keywordsMax : keywordsMax,
    apiCallsPerMonth: apiCallsPerMonth === undefined ? base!.apiCallsPerMonth : apiCallsPerMonth,
    serpJobsPerMonth: serpJobsPerMonth === undefined ? base!.serpJobsPerMonth : serpJobsPerMonth,
    crawlJobsPerMonth: crawlJobsPerMonth === undefined ? base!.crawlJobsPerMonth : crawlJobsPerMonth,
  };
}

export function currentUsagePeriodKey(now = new Date()): string {
  // YYYY-MM in UTC
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
