import type { SerpProvider, SerpQuery, SerpRankResult } from '../types.js';

type ScaleSerpResponse = {
  request_info: {
    success: boolean;
  };
  search_parameters: {
    q: string;
    google_domain: string;
    hl: string;
    gl: string;
  };
  organic_results?: Array<{
    position: number;
    title: string;
    link: string;
    domain: string;
  }>;
};

export class ScaleSerpProvider implements SerpProvider {
  readonly id = 'scaleserp';
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.scaleserp.com/search';

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('ScaleSERP API key is required');
    }
    this.apiKey = apiKey;
  }

  async getRank(query: SerpQuery): Promise<SerpRankResult> {
    const keyword = query.keyword.trim();
    const locale = query.locale ?? 'zh-TW';
    const domain = query.domain;

    const params = new URLSearchParams({
      api_key: this.apiKey,
      q: keyword,
      gl: this.mapLocaleToCountry(locale),
      hl: this.mapLocaleToLanguage(locale),
      num: '100', // Get up to 100 results to find our domain
    });

    try {
      const response = await fetch(`${this.baseUrl}?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`ScaleSERP API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as ScaleSerpResponse;

      if (!data.request_info.success) {
        throw new Error('ScaleSERP request failed');
      }

      // Find the target domain in organic results
      if (data.organic_results && domain) {
        for (const result of data.organic_results) {
          if (this.matchesDomain(result.link, domain)) {
            return {
              provider: 'scaleserp',
              keyword,
              locale,
              domain,
              rank: result.position,
              resultUrl: result.link,
            };
          }
        }
      }

      // Domain not found in top 100 results
      return {
        provider: 'scaleserp',
        keyword,
        locale,
        domain,
        rank: 0, // 0 indicates not ranked
        resultUrl: undefined,
      };
    } catch (error) {
      throw new Error(
        `Failed to get rank from ScaleSERP: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private mapLocaleToCountry(locale: string): string {
    const map: Record<string, string> = {
      'zh-TW': 'tw',
      'zh-CN': 'cn',
      'en-US': 'us',
      'en-GB': 'gb',
      'ja-JP': 'jp',
    };
    return map[locale] ?? 'us';
  }

  private mapLocaleToLanguage(locale: string): string {
    const map: Record<string, string> = {
      'zh-TW': 'zh-TW',
      'zh-CN': 'zh-CN',
      'en-US': 'en',
      'en-GB': 'en',
      'ja-JP': 'ja',
    };
    return map[locale] ?? 'en';
  }

  private matchesDomain(url: string, targetDomain: string): boolean {
    try {
      const urlObj = new URL(url);
      const urlDomain = urlObj.hostname.replace(/^www\./, '');
      const target = targetDomain.replace(/^www\./, '');
      return urlDomain === target || urlDomain.endsWith(`.${target}`);
    } catch {
      return false;
    }
  }
}
