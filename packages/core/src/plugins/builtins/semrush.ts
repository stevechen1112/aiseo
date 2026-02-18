import type { ToolContext, ToolDefinition } from '../registry.js';
import { assertUrlHostAllowed, getEffectiveNetworkAllowlist } from '../registry.js';

// ── Domain Analytics types ────────────────────────────────────────────
export type SemrushDomainOverviewInput = {
  domain: string;
  database?: string;
};

export type SemrushDomainOverviewOutput = {
  domain: string;
  organicKeywords: number;
  organicTraffic: number;
  organicCost: number;
  paidKeywords: number;
  paidTraffic: number;
  paidCost: number;
};

export type SemrushDomainOrganicInput = {
  domain: string;
  database?: string;
  limit?: number;
};

export type SemrushDomainOrganicKeyword = {
  keyword: string;
  position: number;
  previousPosition: number;
  searchVolume: number;
  cpc: number;
  url: string;
  traffic: number;
  trafficPercent: number;
};

export type SemrushDomainOrganicOutput = {
  domain: string;
  keywords: SemrushDomainOrganicKeyword[];
};

// ── Keyword types ─────────────────────────────────────────────────────
export type SemrushKeywordMetricsInput = {
  keywords: string[];
  database?: string; // SEMrush database (e.g., 'us', 'tw', 'cn')
};

export type SemrushKeywordMetric = {
  keyword: string;
  searchVolume: number;
  keywordDifficulty: number;
  cpc: number;
  competition: number;
  trend: number[];
};

export type SemrushKeywordMetricsOutput = {
  metrics: SemrushKeywordMetric[];
};

export type SemrushKeywordIdeasInput = {
  keyword: string;
  database?: string;
  kind: 'related' | 'questions';
  limit?: number;
};

export type SemrushKeywordIdeasOutput = {
  keywords: string[];
};

function parseSemrushCsv(text: string): Array<Record<string, string>> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = lines[0].split(';').map((h) => h.trim());
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split(';');
    if (fields.length < 2) continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < Math.min(headers.length, fields.length); j++) {
      row[headers[j]] = fields[j].trim();
    }
    rows.push(row);
  }

  return rows;
}

function pickNumber(row: Record<string, string>, candidates: string[]): number | undefined {
  for (const key of candidates) {
    const v = row[key];
    if (v === undefined) continue;
    const n = Number(String(v).replace(/,/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function pickString(row: Record<string, string>, candidates: string[]): string | undefined {
  for (const key of candidates) {
    const v = row[key];
    if (v) return v;
  }
  return undefined;
}

function pickDifficultyFromRow(row: Record<string, string>): number | undefined {
  const direct = pickNumber(row, [
    'Keyword Difficulty',
    'Keyword Difficulty Index',
    'KD',
    'KDI',
    'Difficulty',
  ]);
  if (direct !== undefined) return Math.max(0, Math.min(100, Math.round(direct)));

  // Fallback: find any column containing "difficulty"
  const key = Object.keys(row).find((k) => k.toLowerCase().includes('difficulty'));
  if (!key) return undefined;
  const n = Number(String(row[key]).replace(/,/g, ''));
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * SEMrush Keyword Metrics Tool
 * Gets keyword data from SEMrush Standard API including:
 * - Search volume
 * - Keyword difficulty
 * - CPC (cost per click)
 * - Competition level
 * - Search volume trend
 */
export const semrushKeywordMetricsTool: ToolDefinition<SemrushKeywordMetricsInput, SemrushKeywordMetricsOutput> = {
  id: 'semrush.keywordMetrics',
  description: 'Get keyword metrics from SEMrush API including search volume, keyword difficulty, CPC, and competition data',
  permissions: {
    networkAllowlist: ['api.semrush.com'],
    fileSystem: 'read-only',
  },
  execute: async (input: SemrushKeywordMetricsInput, ctx: ToolContext): Promise<SemrushKeywordMetricsOutput> => {
    const apiKey = process.env.SEMRUSH_API_KEY;
    if (!apiKey) {
      throw new Error('SEMRUSH_API_KEY environment variable is not set');
    }

    // Help TS narrow inside inner helper functions.
    const apiKeyRequired: string = apiKey;

    const keywords = input.keywords.slice(0, 100); // Process in batches
    const database = input.database ?? 'tw'; // Default to Taiwan

    const metrics: SemrushKeywordMetric[] = [];

    async function fetchPhraseThis(keyword: string) {
      const url = 'https://api.semrush.com/';
      const urlObj = new URL(url);
      const effectiveAllowlist = getEffectiveNetworkAllowlist(semrushKeywordMetricsTool.permissions, ctx);
      assertUrlHostAllowed(urlObj, effectiveAllowlist);

      const params = new URLSearchParams({
        type: 'phrase_this',
        key: apiKeyRequired,
        phrase: keyword,
        database: database,
        export_columns: 'Ph,Nq,Cp,Co,Nr,Td',
        display_limit: '1',
      });

      const response = await fetch(`${url}?${params.toString()}`);
      if (!response.ok) {
        if (response.status === 402) throw new Error('SEMrush API quota exceeded');
        return undefined;
      }
      const text = await response.text();
      const rows = parseSemrushCsv(text);
      return rows[0];
    }

    async function fetchPhraseKdi(keyword: string): Promise<number | undefined> {
      const url = 'https://api.semrush.com/';
      const urlObj = new URL(url);
      const effectiveAllowlist = getEffectiveNetworkAllowlist(semrushKeywordMetricsTool.permissions, ctx);
      assertUrlHostAllowed(urlObj, effectiveAllowlist);

      // Try the common endpoint used by SEMrush Standard API for KD index.
      const params = new URLSearchParams({
        type: 'phrase_kdi',
        key: apiKeyRequired,
        phrase: keyword,
        database: database,
        // Keep export_columns minimal if supported; if not, SEMrush may ignore it.
        export_columns: 'Ph,Kd',
        display_limit: '1',
      });

      const response = await fetch(`${url}?${params.toString()}`);
      if (!response.ok) {
        return undefined;
      }

      const text = await response.text();
      const rows = parseSemrushCsv(text);
      if (rows.length === 0) return undefined;
      return pickDifficultyFromRow(rows[0]);
    }

    // SEMrush API processes keywords one at a time
    for (const keyword of keywords) {
      try {
        const row = await fetchPhraseThis(keyword);
        if (!row) continue;

        const resolvedKeyword =
          pickString(row, ['Keyword', 'Ph', 'Phrase']) ??
          keyword;

        const searchVolume = pickNumber(row, ['Search Volume', 'Nq']) ?? 0;
        const cpc = pickNumber(row, ['CPC', 'Cp']) ?? 0;
        const competition = pickNumber(row, ['Competition', 'Co']) ?? 0;
        const trendData = pickString(row, ['Trends', 'Td']) ?? '';
        const trend = trendData
          .split(',')
          .map((v) => Number(v) || 0)
          .slice(0, 12);

        // Try to fetch real KD (KDI) from SEMrush. If unavailable, fall back to estimation.
        let keywordDifficulty = await fetchPhraseKdi(keyword);
        // KD=0 is usually "missing" for most commercial datasets; fall back to estimate.
        if (keywordDifficulty === undefined || (keywordDifficulty === 0 && searchVolume > 0)) {
          keywordDifficulty = Math.min(
            100,
            Math.round(competition * 70 + (searchVolume > 10000 ? 30 : searchVolume / 333)),
          );
        }

        metrics.push({
          keyword: resolvedKeyword,
          searchVolume,
          keywordDifficulty,
          cpc,
          competition,
          trend,
        });

        // Rate limiting: SEMrush allows ~10 requests/sec; we do 2 calls/keyword
        await new Promise((resolve) => setTimeout(resolve, 120));
      } catch (error) {
        // Continue with next keyword on error
      }
    }

    // Return whatever we have — may be empty if none of the keywords exist in the database
    return { metrics };
  },
};

/**
 * SEMrush Keyword Ideas Tool
 * Fetches keyword expansion ideas via SEMrush Standard API.
 * - related: phrase_related
 * - questions: phrase_questions
 */
export const semrushKeywordIdeasTool: ToolDefinition<SemrushKeywordIdeasInput, SemrushKeywordIdeasOutput> = {
  id: 'semrush.keywordIdeas',
  description: 'Expand a seed keyword using SEMrush related keywords or questions endpoints',
  permissions: {
    networkAllowlist: ['api.semrush.com'],
    fileSystem: 'read-only',
  },
  execute: async (input: SemrushKeywordIdeasInput, ctx: ToolContext): Promise<SemrushKeywordIdeasOutput> => {
    const apiKey = process.env.SEMRUSH_API_KEY;
    if (!apiKey) {
      throw new Error('SEMRUSH_API_KEY environment variable is not set');
    }

    const keyword = input.keyword.trim();
    if (!keyword) {
      throw new Error('keyword is required');
    }

    const database = input.database ?? process.env.SEMRUSH_DATABASE ?? 'tw';
    const limit = Math.min(100, Math.max(1, input.limit ?? 20));
    const kind = input.kind;

    const url = 'https://api.semrush.com/';
    const urlObj = new URL(url);
    const effectiveAllowlist = getEffectiveNetworkAllowlist(semrushKeywordIdeasTool.permissions, ctx);
    assertUrlHostAllowed(urlObj, effectiveAllowlist);

    const type = kind === 'questions' ? 'phrase_questions' : 'phrase_related';

    const params = new URLSearchParams({
      type,
      key: apiKey,
      phrase: keyword,
      database,
      export_columns: 'Ph',
      display_limit: String(limit),
    });

    const res = await fetch(`${url}?${params.toString()}`);
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`SEMrush keyword ideas error: ${res.status} ${res.statusText}${t ? ` - ${t.substring(0, 200)}` : ''}`);
    }

    const text = await res.text();
    const rows = parseSemrushCsv(text);
    const keywords = rows
      .map((r) => pickString(r, ['Keyword', 'Ph', 'Phrase']))
      .filter((k): k is string => Boolean(k))
      .map((k) => k.trim())
      .filter(Boolean);

    return { keywords };
  },
};

// ── Domain Analytics Tools ────────────────────────────────────────────

/**
 * SEMrush Domain Overview Tool
 * Returns high-level traffic & keyword stats for a domain.
 * API type: domain_ranks
 */
export const semrushDomainOverviewTool: ToolDefinition<SemrushDomainOverviewInput, SemrushDomainOverviewOutput> = {
  id: 'semrush.domainOverview',
  description: 'Get domain-level overview from SEMrush: organic/paid traffic, keywords, cost',
  permissions: {
    networkAllowlist: ['api.semrush.com'],
    fileSystem: 'read-only',
  },
  execute: async (input, ctx) => {
    const apiKey = process.env.SEMRUSH_API_KEY;
    if (!apiKey) throw new Error('SEMRUSH_API_KEY environment variable is not set');

    const database = input.database ?? process.env.SEMRUSH_DATABASE ?? 'tw';

    const urlObj = new URL('https://api.semrush.com/');
    const effectiveAllowlist = getEffectiveNetworkAllowlist(semrushDomainOverviewTool.permissions, ctx);
    assertUrlHostAllowed(urlObj, effectiveAllowlist);

    const params = new URLSearchParams({
      type: 'domain_ranks',
      key: apiKey,
      domain: input.domain,
      database,
      export_columns: 'Dn,Or,Ot,Oc,Ad,At,Ac',
    });

    const res = await fetch(`${urlObj.href}?${params.toString()}`);
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`SEMrush domain_ranks error: ${res.status} ${t.substring(0, 200)}`);
    }

    const text = await res.text();
    const rows = parseSemrushCsv(text);
    const row = rows[0] ?? {};

    return {
      domain: input.domain,
      organicKeywords: pickNumber(row, ['Or', 'Organic Keywords']) ?? 0,
      organicTraffic: pickNumber(row, ['Ot', 'Organic Traffic']) ?? 0,
      organicCost: pickNumber(row, ['Oc', 'Organic Cost']) ?? 0,
      paidKeywords: pickNumber(row, ['Ad', 'Adwords Keywords']) ?? 0,
      paidTraffic: pickNumber(row, ['At', 'Adwords Traffic']) ?? 0,
      paidCost: pickNumber(row, ['Ac', 'Adwords Cost']) ?? 0,
    };
  },
};

/**
 * SEMrush Domain Organic Keywords Tool
 * Returns the top organic keywords a domain ranks for.
 * API type: domain_organic
 */
export const semrushDomainOrganicTool: ToolDefinition<SemrushDomainOrganicInput, SemrushDomainOrganicOutput> = {
  id: 'semrush.domainOrganic',
  description: 'Get organic keywords a domain ranks for, with positions, volume, traffic',
  permissions: {
    networkAllowlist: ['api.semrush.com'],
    fileSystem: 'read-only',
  },
  execute: async (input, ctx) => {
    const apiKey = process.env.SEMRUSH_API_KEY;
    if (!apiKey) throw new Error('SEMRUSH_API_KEY environment variable is not set');

    const database = input.database ?? process.env.SEMRUSH_DATABASE ?? 'tw';
    const limit = Math.min(100, Math.max(1, input.limit ?? 20));

    const urlObj = new URL('https://api.semrush.com/');
    const effectiveAllowlist = getEffectiveNetworkAllowlist(semrushDomainOrganicTool.permissions, ctx);
    assertUrlHostAllowed(urlObj, effectiveAllowlist);

    const params = new URLSearchParams({
      type: 'domain_organic',
      key: apiKey,
      domain: input.domain,
      database,
      export_columns: 'Ph,Po,Pp,Nq,Cp,Ur,Tr,Tc',
      display_limit: String(limit),
      display_sort: 'tr_desc',
    });

    const res = await fetch(`${urlObj.href}?${params.toString()}`);
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`SEMrush domain_organic error: ${res.status} ${t.substring(0, 200)}`);
    }

    const text = await res.text();
    const rows = parseSemrushCsv(text);

    const keywords: SemrushDomainOrganicKeyword[] = rows.map((row) => ({
      keyword: pickString(row, ['Ph', 'Keyword', 'Phrase']) ?? '',
      position: pickNumber(row, ['Po', 'Position']) ?? 0,
      previousPosition: pickNumber(row, ['Pp', 'Previous Position']) ?? 0,
      searchVolume: pickNumber(row, ['Nq', 'Search Volume']) ?? 0,
      cpc: pickNumber(row, ['Cp', 'CPC']) ?? 0,
      url: pickString(row, ['Ur', 'Url']) ?? '',
      traffic: pickNumber(row, ['Tr', 'Traffic']) ?? 0,
      trafficPercent: pickNumber(row, ['Tc', 'Traffic Cost']) ?? 0,
    }));

    return { domain: input.domain, keywords };
  },
};
