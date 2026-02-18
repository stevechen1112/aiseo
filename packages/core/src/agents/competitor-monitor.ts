/**
 * CompetitorMonitorAgent — Real competitive analysis via SEMrush + HTTP fetch + LLM
 */

import { BaseAgent } from './base.js';
import type { AgentContext } from './types.js';
import type { SemrushDomainOrganicOutput, SemrushDomainOverviewOutput } from '../plugins/builtins/semrush.js';

export type CompetitorMonitorInput = {
  competitorDomain: string;
  ownDomain: string;
  analysisType?: Array<'keywords' | 'backlinks' | 'content' | 'traffic'>;
};

export type KeywordGap = {
  keyword: string;
  competitorRank: number;
  ownRank: number | null;
  searchVolume: number;
  difficulty: number;
  opportunity: 'high' | 'medium' | 'low';
};

export type BacklinkGap = {
  domain: string;
  domainRating: number;
  linkType: 'dofollow' | 'nofollow';
  competitorHas: boolean;
  ownHas: boolean;
};

export type ContentAnalysis = {
  url: string;
  title: string;
  wordCount: number;
  keywords: string[];
  topics: string[];
  contentType: 'blog' | 'product' | 'guide' | 'landing-page' | 'other';
};

export type TrafficEstimate = {
  organicTraffic: number;
  paidTraffic: number;
  topPages: Array<{
    url: string;
    traffic: number;
    keywords: number;
  }>;
};

export type CompetitorMonitorOutput = {
  competitorDomain: string;
  ownDomain: string;
  analyzedAt: string;
  keywordGaps?: KeywordGap[];
  backlinkGaps?: BacklinkGap[];
  contentAnalysis?: ContentAnalysis[];
  trafficEstimate?: TrafficEstimate;
  recommendations: Array<{
    category: 'keywords' | 'backlinks' | 'content' | 'technical';
    priority: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    actionItems: string[];
  }>;
  summary: {
    totalKeywordGaps: number;
    highOpportunityKeywords: number;
    backlinkGapsCount: number;
    competitorContentPieces: number;
  };
};

export class CompetitorMonitorAgent extends BaseAgent<CompetitorMonitorInput, CompetitorMonitorOutput> {
  readonly id = 'competitor-monitor';
  readonly description = 'Competitive analysis agent for keyword gaps, backlink opportunities, and content insights.';

  protected async execute(input: CompetitorMonitorInput, ctx: AgentContext): Promise<CompetitorMonitorOutput> {
    const competitorDomain = input.competitorDomain.trim();
    const ownDomain = input.ownDomain.trim();

    if (!competitorDomain || !ownDomain) {
      throw new Error('Both competitor domain and own domain are required');
    }

    const analysisType = input.analysisType ?? ['keywords', 'backlinks', 'content', 'traffic'];
    const recommendations: CompetitorMonitorOutput['recommendations'] = [];

    // Keyword gap analysis
    let keywordGaps: KeywordGap[] | undefined;
    if (analysisType.includes('keywords')) {
      keywordGaps = await this.analyzeKeywordGaps(competitorDomain, ownDomain, ctx);
      
      const highOpportunity = keywordGaps.filter((k) => k.opportunity === 'high');
      if (highOpportunity.length > 0) {
        recommendations.push({
          category: 'keywords',
          priority: 'high',
          title: `發現 ${highOpportunity.length} 個高價值關鍵字機會`,
          description: '競爭對手在這些關鍵字上排名良好，但您尚未優化',
          actionItems: highOpportunity
            .slice(0, 5)
            .map((k) => `針對 "${k.keyword}" 創建內容 (搜尋量: ${k.searchVolume}, 難度: ${k.difficulty})`),
        });
      }
    }

    // Backlink gap analysis
    let backlinkGaps: BacklinkGap[] | undefined;
    if (analysisType.includes('backlinks')) {
      backlinkGaps = await this.analyzeBacklinkGaps(competitorDomain, ownDomain, ctx);
      
      const highQualityGaps = backlinkGaps.filter((b) => b.domainRating >= 50 && !b.ownHas);
      if (highQualityGaps.length > 0) {
        recommendations.push({
          category: 'backlinks',
          priority: 'high',
          title: `發現 ${highQualityGaps.length} 個高品質反向連結機會`,
          description: '競爭對手擁有來自這些高權威網站的連結',
          actionItems: highQualityGaps
            .slice(0, 5)
            .map((b) => `爭取來自 ${b.domain} 的 ${b.linkType} 連結 (DR: ${b.domainRating})`),
        });
      }
    }

    // Content analysis
    let contentAnalysis: ContentAnalysis[] | undefined;
    if (analysisType.includes('content')) {
      contentAnalysis = await this.analyzeContent(competitorDomain, ctx);
      
      if (contentAnalysis.length > 0) {
        const avgWordCount = Math.round(
          contentAnalysis.reduce((sum, c) => sum + c.wordCount, 0) / contentAnalysis.length,
        );
        recommendations.push({
          category: 'content',
          priority: 'medium',
          title: '內容策略洞察',
          description: `競爭對手平均內容長度為 ${avgWordCount} 字`,
          actionItems: [
            '分析表現最佳的內容類型並複製成功模式',
            '確保您的內容長度至少達到平均水平',
            '覆蓋競爭對手尚未深入探討的主題',
          ],
        });
      }
    }

    // Traffic estimate
    let trafficEstimate: TrafficEstimate | undefined;
    if (analysisType.includes('traffic')) {
      trafficEstimate = await this.estimateTraffic(competitorDomain, ctx);
      
      if (trafficEstimate && trafficEstimate.topPages.length > 0) {
        recommendations.push({
          category: 'content',
          priority: 'medium',
          title: '競爭對手流量來源分析',
          description: `前 5 個頁面貢獻了主要流量`,
          actionItems: trafficEstimate.topPages
            .slice(0, 3)
            .map((p) => `研究並創建類似 ${p.url} 的內容 (預估流量: ${p.traffic})`),
        });
      }
    }

    const summary = {
      totalKeywordGaps: keywordGaps?.length ?? 0,
      highOpportunityKeywords: keywordGaps?.filter((k) => k.opportunity === 'high').length ?? 0,
      backlinkGapsCount: backlinkGaps?.filter((b) => !b.ownHas).length ?? 0,
      competitorContentPieces: contentAnalysis?.length ?? 0,
    };

    return {
      competitorDomain,
      ownDomain,
      analyzedAt: new Date().toISOString(),
      keywordGaps,
      backlinkGaps,
      contentAnalysis,
      trafficEstimate,
      recommendations,
      summary,
    };
  }

  private async analyzeKeywordGaps(
    competitorDomain: string,
    ownDomain: string,
    ctx: AgentContext,
  ): Promise<KeywordGap[]> {
    // Use SEMrush domain_organic to get both domains' keywords, then compute gap
    let competitorKeywords: SemrushDomainOrganicOutput['keywords'] = [];
    let ownKeywords: SemrushDomainOrganicOutput['keywords'] = [];

    try {
      const compResult = await ctx.tools.run<
        { domain: string; database?: string; limit?: number },
        SemrushDomainOrganicOutput
      >('semrush.domainOrganic', { domain: competitorDomain, limit: 50 }, ctx);
      competitorKeywords = compResult.keywords;
    } catch { /* SEMrush quota or error */ }

    try {
      const ownResult = await ctx.tools.run<
        { domain: string; database?: string; limit?: number },
        SemrushDomainOrganicOutput
      >('semrush.domainOrganic', { domain: ownDomain, limit: 50 }, ctx);
      ownKeywords = ownResult.keywords;
    } catch { /* SEMrush quota or error */ }

    // Build own keyword position map
    const ownMap = new Map<string, number>();
    for (const k of ownKeywords) {
      ownMap.set(k.keyword.toLowerCase(), k.position);
    }

    // Compute gaps
    return competitorKeywords.map((k) => {
      const ownRank = ownMap.get(k.keyword.toLowerCase()) ?? null;
      let opportunity: 'high' | 'medium' | 'low' = 'low';

      if (ownRank === null && k.searchVolume > 500 && k.position <= 10) {
        opportunity = 'high';
      } else if (ownRank === null || (ownRank !== null && ownRank - k.position > 10)) {
        opportunity = 'medium';
      }

      return {
        keyword: k.keyword,
        competitorRank: k.position,
        ownRank,
        searchVolume: k.searchVolume,
        difficulty: 0, // KDI not provided by domain_organic; could be fetched separately
        opportunity,
      };
    });
  }

  private async analyzeBacklinkGaps(
    competitorDomain: string,
    ownDomain: string,
    ctx: AgentContext,
  ): Promise<BacklinkGap[]> {
    // Backlink gap analysis requires Ahrefs / SEMrush Backlinks API (not available on Standard plan)
    // Return informational placeholder until Backlinks API is wired
    return [
      {
        domain: '(backlink API not available on current SEMrush plan)',
        domainRating: 0,
        linkType: 'dofollow',
        competitorHas: false,
        ownHas: false,
      },
    ];
  }

  private async analyzeContent(competitorDomain: string, ctx: AgentContext): Promise<ContentAnalysis[]> {
    // Use SEMrush domain_organic top pages + HTTP fetch for content analysis
    let topPages: SemrushDomainOrganicOutput['keywords'] = [];
    try {
      const result = await ctx.tools.run<
        { domain: string; database?: string; limit?: number },
        SemrushDomainOrganicOutput
      >('semrush.domainOrganic', { domain: competitorDomain, limit: 10 }, ctx);
      topPages = result.keywords;
    } catch { /* SEMrush error */ }

    // Deduplicate by URL
    const uniqueUrls = [...new Set(topPages.filter((p) => p.url).map((p) => p.url))].slice(0, 5);

    const analyses: ContentAnalysis[] = [];
    for (const pageUrl of uniqueUrls) {
      try {
        const res = await fetch(pageUrl, {
          headers: { 'User-Agent': 'AISEO-CompetitorAnalyzer/1.0' },
          signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) continue;
        const ct = res.headers.get('content-type') ?? '';
        if (!ct.includes('text/html')) continue;

        const html = await res.text();
        // Simple extraction using regex (lightweight, no cheerio import needed here)
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const bodyText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const wordCount = bodyText.split(/\s+/).length;

        // Determine content type from URL structure
        let contentType: ContentAnalysis['contentType'] = 'other';
        if (/blog|article|post/i.test(pageUrl)) contentType = 'blog';
        else if (/product|shop|item/i.test(pageUrl)) contentType = 'product';
        else if (/guide|tutorial|how-to/i.test(pageUrl)) contentType = 'guide';
        else if (/pricing|landing|feature/i.test(pageUrl)) contentType = 'landing-page';

        // Collect keywords for this URL from SEMrush data
        const pageKeywords = topPages
          .filter((p) => p.url === pageUrl)
          .map((p) => p.keyword);

        analyses.push({
          url: pageUrl,
          title: titleMatch?.[1]?.trim() ?? '',
          wordCount,
          keywords: pageKeywords,
          topics: pageKeywords.slice(0, 3),
          contentType,
        });
      } catch { /* page fetch failed */ }
    }

    return analyses;
  }

  private async estimateTraffic(competitorDomain: string, ctx: AgentContext): Promise<TrafficEstimate> {
    // Use SEMrush domain_ranks for traffic overview + domain_organic for top pages
    let organicTraffic = 0;
    let paidTraffic = 0;

    try {
      const overview = await ctx.tools.run<
        { domain: string; database?: string },
        SemrushDomainOverviewOutput
      >('semrush.domainOverview', { domain: competitorDomain }, ctx);

      organicTraffic = overview.organicTraffic;
      paidTraffic = overview.paidTraffic;
    } catch { /* SEMrush error */ }

    // Get top pages by organic traffic
    let topPages: { url: string; traffic: number; keywords: number }[] = [];
    try {
      const organic = await ctx.tools.run<
        { domain: string; database?: string; limit?: number },
        SemrushDomainOrganicOutput
      >('semrush.domainOrganic', { domain: competitorDomain, limit: 20 }, ctx);

      // Group by URL
      const urlMap = new Map<string, { traffic: number; keywords: number }>();
      for (const k of organic.keywords) {
        if (!k.url) continue;
        const existing = urlMap.get(k.url) ?? { traffic: 0, keywords: 0 };
        existing.traffic += k.traffic;
        existing.keywords += 1;
        urlMap.set(k.url, existing);
      }

      topPages = [...urlMap.entries()]
        .map(([url, data]) => ({ url, ...data }))
        .sort((a, b) => b.traffic - a.traffic)
        .slice(0, 10);
    } catch { /* SEMrush error */ }

    return { organicTraffic, paidTraffic, topPages };
  }
}
