import type { ToolContext, ToolDefinition } from '../registry.js';
import { assertUrlHostAllowed, getEffectiveNetworkAllowlist } from '../registry.js';

export type AhrefsKeywordMetricsInput = {
  keywords: string[];
  country?: string;
};

export type AhrefsKeywordMetric = {
  keyword: string;
  searchVolume: number;
  keywordDifficulty: number;
  cpc: number;
  clicksPerMonth: number;
  trafficPotential: number;
};

export type AhrefsKeywordMetricsOutput = {
  metrics: AhrefsKeywordMetric[];
};

export const ahrefsKeywordMetricsTool: ToolDefinition<AhrefsKeywordMetricsInput, AhrefsKeywordMetricsOutput> = {
  id: 'ahrefs.keywordMetrics',
  description: 'Get keyword metrics from Ahrefs API including search volume, keyword difficulty, and CPC data',
  permissions: {
    networkAllowlist: ['api.ahrefs.com'],
    fileSystem: 'read-only',
  },
  execute: async (input: AhrefsKeywordMetricsInput, ctx: ToolContext): Promise<AhrefsKeywordMetricsOutput> => {
    const apiKey = process.env.AHREFS_API_KEY;
    if (!apiKey) {
      throw new Error('AHREFS_API_KEY environment variable is not set');
    }

    const keywords = input.keywords.slice(0, 1000); // Ahrefs API limit
    const country = input.country ?? 'tw';

    // Ahrefs API v3 endpoint (batch keyword overview)
    const url = 'https://api.ahrefs.com/v3/site-explorer/overview-keywords';

    const urlObj = new URL(url);
    const effectiveAllowlist = getEffectiveNetworkAllowlist(ahrefsKeywordMetricsTool.permissions, ctx);
    assertUrlHostAllowed(urlObj, effectiveAllowlist);

    const params = new URLSearchParams({
      select: 'keyword,search_volume,keyword_difficulty,cpc,clicks,traffic',
      target: keywords.join(','),
      country: country.toUpperCase(),
      mode: 'exact',
      output: 'json',
    });

    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
    };

    try {
      const response = await fetch(`${url}?${params.toString()}`, { headers });

      if (!response.ok) {
        throw new Error(`Ahrefs API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as { keywords?: Array<{
        keyword: string;
        search_volume?: number;
        keyword_difficulty?: number;
        cpc?: number;
        clicks?: number;
        traffic?: number;
      }> };

      const metrics: AhrefsKeywordMetric[] = (data.keywords ?? []).map((kw) => ({
        keyword: kw.keyword,
        searchVolume: kw.search_volume ?? 0,
        keywordDifficulty: kw.keyword_difficulty ?? 0,
        cpc: kw.cpc ?? 0,
        clicksPerMonth: kw.clicks ?? 0,
        trafficPotential: kw.traffic ?? 0,
      }));

      return { metrics };
    } catch (error) {
      throw new Error(
        `Failed to fetch Ahrefs keyword metrics: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
};
