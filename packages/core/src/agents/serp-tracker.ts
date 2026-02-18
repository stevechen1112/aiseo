/**
 * SerpTrackerAgent — Real SERP position tracking via ValueSERP API
 *
 * Retrieves live Google search results for a given keyword and returns:
 * - Top 10 organic results with position, title, snippet, domain
 * - Featured snippet, People Also Ask, knowledge panel info
 * - The tracked domain's current position (if found)
 */

import { BaseAgent } from './base.js';
import type { AgentContext } from './types.js';

export type SerpTrackerInput = {
  keyword: string;
  locale?: string;
  /** Optional: google domain (e.g. 'google.com.tw'), defaults to 'google.com.tw' */
  googleDomain?: string;
  /** Optional: domain to track position for */
  trackDomain?: string;
  /** Number of organic results to return (default: 10, max: 100) */
  numResults?: number;
};

export type SerpOrganicResult = {
  position: number;
  title: string;
  link: string;
  domain: string;
  snippet: string;
};

export type SerpTrackerOutput = {
  keyword: string;
  locale: string;
  searchedAt: string;
  totalResults: number;
  organicResults: SerpOrganicResult[];
  featuredSnippet?: {
    title: string;
    link: string;
    snippet: string;
  };
  peopleAlsoAsk?: string[];
  trackedPosition?: {
    domain: string;
    position: number | null;
    url: string | null;
    inTop10: boolean;
    inTop3: boolean;
  };
};

export class SerpTrackerAgent extends BaseAgent<SerpTrackerInput, SerpTrackerOutput> {
  readonly id = 'serp-tracker';
  readonly description = 'Live SERP position tracking agent using ValueSERP API.';

  protected async execute(input: SerpTrackerInput, ctx: AgentContext): Promise<SerpTrackerOutput> {
    const apiKey = process.env.VALUESERP_API_KEY;
    if (!apiKey) {
      throw new Error('VALUESERP_API_KEY environment variable is not set');
    }

    const keyword = input.keyword.trim();
    if (!keyword) throw new Error('keyword is required');

    const locale = input.locale ?? 'zh-TW';
    const googleDomain = input.googleDomain ?? 'google.com.tw';
    const numResults = Math.min(input.numResults ?? 10, 100);

    // Map locale to ValueSERP gl / hl parameters
    // ValueSERP expects hl as a lowercase language code (e.g. "en") or language-region (e.g. "zh-tw").
    const [langRaw, regionRaw] = locale.split(/[-_]/);
    const lang = (langRaw ?? 'zh').toLowerCase();
    const region = regionRaw?.toLowerCase();

    const gl = region ?? 'tw';
    const hl = region ? `${lang}-${region}` : lang;

    const params = new URLSearchParams({
      api_key: apiKey,
      q: keyword,
      google_domain: googleDomain,
      gl,
      hl,
      num: String(numResults),
      output: 'json',
    });

    const response = await fetch(`https://api.valueserp.com/search?${params.toString()}`, {
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`ValueSERP API error: ${response.status} — ${body.substring(0, 300)}`);
    }

    const data = (await response.json()) as any;

    // Parse organic results
    const organicResults: SerpOrganicResult[] = (data.organic_results ?? [])
      .slice(0, numResults)
      .map((r: any, i: number) => ({
        position: r.position ?? i + 1,
        title: r.title ?? '',
        link: r.link ?? '',
        domain: r.domain ?? '',
        snippet: r.snippet ?? '',
      }));

    // Featured snippet
    let featuredSnippet: SerpTrackerOutput['featuredSnippet'];
    if (data.answer_box) {
      featuredSnippet = {
        title: data.answer_box.title ?? '',
        link: data.answer_box.link ?? '',
        snippet: data.answer_box.answer ?? data.answer_box.snippet ?? '',
      };
    }

    // People Also Ask
    const peopleAlsoAsk = (data.related_questions ?? [])
      .map((q: any) => q.question ?? '')
      .filter(Boolean)
      .slice(0, 8) as string[];

    const totalResults = data.search_information?.total_results ?? organicResults.length;

    // Track specific domain position
    let trackedPosition: SerpTrackerOutput['trackedPosition'];
    if (input.trackDomain) {
      const trackDomainClean = input.trackDomain.replace(/^www\./, '').toLowerCase();
      const found = organicResults.find(
        (r) => r.domain.replace(/^www\./, '').toLowerCase() === trackDomainClean,
      );
      trackedPosition = {
        domain: input.trackDomain,
        position: found?.position ?? null,
        url: found?.link ?? null,
        inTop10: found ? found.position <= 10 : false,
        inTop3: found ? found.position <= 3 : false,
      };
    }

    return {
      keyword,
      locale,
      searchedAt: new Date().toISOString(),
      totalResults,
      organicResults,
      featuredSnippet: featuredSnippet?.title ? featuredSnippet : undefined,
      peopleAlsoAsk: peopleAlsoAsk.length > 0 ? peopleAlsoAsk : undefined,
      trackedPosition,
    };
  }
}
