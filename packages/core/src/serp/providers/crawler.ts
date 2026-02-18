import type { SerpProvider, SerpQuery, SerpRankResult } from '../types.js';

/**
 * Self-hosted crawler provider (L3 tier - fallback)
 * Uses basic fetch to scrape Google SERP and parse results.
 * Warning: This is a best-effort implementation and may break if Google changes their HTML structure.
 * Use L1 (GSC) or L2 (ValueSERP/ScaleSERP) providers for production workloads.
 */
export class SelfHostedCrawlerProvider implements SerpProvider {
  readonly id = 'crawler';

  async getRank(query: SerpQuery): Promise<SerpRankResult> {
    const keyword = query.keyword.trim();
    const locale = query.locale ?? 'zh-TW';
    const domain = query.domain;

    if (!domain) {
      throw new Error('Domain is required for self-hosted crawler');
    }

    const googleDomain = this.getGoogleDomain(locale);
    const searchUrl = `https://${googleDomain}/search?q=${encodeURIComponent(keyword)}&num=100&hl=${this.getLanguageCode(locale)}`;

    try {
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': this.getLanguageCode(locale),
        },
      });

      if (!response.ok) {
        throw new Error(`Google search failed: ${response.status} ${response.statusText}`);
      }

      const html = await response.text();

      // Parse organic results from HTML
      const rank = this.parseRankFromHtml(html, domain);

      if (rank > 0) {
        return {
          provider: 'crawler',
          keyword,
          locale,
          domain,
          rank,
          resultUrl: `https://${domain}`, // We don't have the exact URL from simple parsing
        };
      }

      // Domain not found in results
      return {
        provider: 'crawler',
        keyword,
        locale,
        domain,
        rank: 0,
        resultUrl: undefined,
      };
    } catch (error) {
      throw new Error(
        `Failed to crawl Google SERP: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private getGoogleDomain(locale: string): string {
    const map: Record<string, string> = {
      'zh-TW': 'www.google.com.tw',
      'zh-CN': 'www.google.com.hk', // Mainland China blocks Google
      'en-US': 'www.google.com',
      'en-GB': 'www.google.co.uk',
      'ja-JP': 'www.google.co.jp',
    };
    return map[locale] ?? 'www.google.com';
  }

  private getLanguageCode(locale: string): string {
    const map: Record<string, string> = {
      'zh-TW': 'zh-TW',
      'zh-CN': 'zh-CN',
      'en-US': 'en',
      'en-GB': 'en',
      'ja-JP': 'ja',
    };
    return map[locale] ?? 'en';
  }

  private parseRankFromHtml(html: string, targetDomain: string): number {
    // Simple regex-based parsing (fragile but works for basic cases)
    // Look for organic result links in Google's HTML structure
    const linkPattern = /<a[^>]+href="([^"]+)"[^>]*>/gi;
    const matches = Array.from(html.matchAll(linkPattern));

    let position = 0;
    for (const match of matches) {
      const url = match[1];
      if (!url) continue;

      // Skip Google internal links and ads
      if (url.includes('google.com') || url.startsWith('/') || url.includes('googleadservices')) {
        continue;
      }

      // Check if URL matches target domain
      try {
        const urlObj = new URL(url);
        const urlDomain = urlObj.hostname.replace(/^www\./, '');
        const target = targetDomain.replace(/^www\./, '');
        
        position++;
        
        if (urlDomain === target || urlDomain.endsWith(`.${target}`)) {
          return position;
        }
      } catch {
        // Invalid URL, skip
        continue;
      }
    }

    return 0; // Not found
  }
}
