import type { SerpProvider, SerpQuery, SerpRankResult } from '../types.js';

type GscSearchAnalyticsResponse = {
  rows?: Array<{
    keys: string[]; // [query]
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
};

export class GoogleSearchConsoleProvider implements SerpProvider {
  readonly id = 'gsc';
  private readonly apiKey: string;
  private readonly siteUrl: string;
  private readonly baseUrl = 'https://searchconsole.googleapis.com/v1';

  constructor(apiKey: string, siteUrl: string) {
    if (!apiKey) {
      throw new Error('Google Search Console API key is required');
    }
    if (!siteUrl) {
      throw new Error('Site URL is required for Google Search Console');
    }
    this.apiKey = apiKey;
    this.siteUrl = siteUrl;
  }

  async getRank(query: SerpQuery): Promise<SerpRankResult> {
    const keyword = query.keyword.trim();
    const locale = query.locale ?? 'zh-TW';

    // GSC API requires site property to be URL-encoded
    const encodedSiteUrl = encodeURIComponent(this.siteUrl);
    const url = `${this.baseUrl}/webmasters/v3/sites/${encodedSiteUrl}/searchAnalytics/query`;

    const requestBody = {
      startDate: this.getDateDaysAgo(7), // Last 7 days
      endDate: this.getDateDaysAgo(0), // Today
      dimensions: ['query'],
      dimensionFilterGroups: [
        {
          filters: [
            {
              dimension: 'query',
              expression: keyword,
              operator: 'equals',
            },
          ],
        },
      ],
      rowLimit: 1,
      startRow: 0,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GSC API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = (await response.json()) as GscSearchAnalyticsResponse;

      if (data.rows && data.rows.length > 0) {
        const row = data.rows[0];
        // GSC returns average position (float), round to nearest integer
        const rank = Math.round(row.position);

        return {
          provider: 'gsc',
          keyword,
          locale,
          domain: this.siteUrl,
          rank,
          resultUrl: this.siteUrl, // GSC doesn't provide specific result URL
        };
      }

      // Keyword not found in GSC data
      return {
        provider: 'gsc',
        keyword,
        locale,
        domain: this.siteUrl,
        rank: 0, // 0 indicates no data
        resultUrl: undefined,
      };
    } catch (error) {
      throw new Error(
        `Failed to get rank from Google Search Console: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private getDateDaysAgo(daysAgo: number): string {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
  }
}
