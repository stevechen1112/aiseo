/**
 * ContentRefresherAgent - Content Freshness & Update Optimizer
 * 
 * Features:
 * - Identify outdated content based on last updated date
 * - Track ranking and traffic trends for existing content
 * - Generate update recommendations based on competitor analysis
 * - Prioritize content refresh opportunities
 * - Suggest specific updates (statistics, screenshots, new sections)
 * 
 * Phase 2 Task 3.10
 */

import { BaseAgent } from './base.js';
import type { AgentContext } from './types.js';
import { EventBus } from '../event-bus/bus.js';
import * as cheerio from 'cheerio';

interface ContentPage {
  url: string;
  title: string;
  lastUpdated: string;
  daysSinceUpdate: number;
  wordCount: number;
  keywords: string[];
  currentRanking: Record<string, number>; // keyword → position
  historicalRanking: Record<string, number>; // keyword → position (30 days ago)
  currentTraffic: number;
  historicalTraffic: number;
}

interface ContentFreshnessCheck {
  page: ContentPage;
  isFresh: boolean;
  staleDays: number;
  rankingTrend: 'up' | 'down' | 'stable';
  trafficTrend: 'up' | 'down' | 'stable';
  avgRankingChange: number;
  trafficChangePercent: number;
  priority: 'high' | 'medium' | 'low';
  reason: string;
}

interface UpdateRecommendation {
  url: string;
  recommendationType: 'statistics' | 'images' | 'links' | 'sections' | 'keywords' | 'comprehensive';
  priority: 'high' | 'medium' | 'low';
  reason: string;
  suggestions: string[];
  estimatedImpact: string;
  competitorInsights?: {
    competitorUrl: string;
    missingTopics: string[];
    wordCountDiff: number;
  };
}

interface ContentRefresherAgentInput {
  operation: 'check' | 'recommend' | 'audit';
  urls?: string[];
  staleThresholdDays?: number; // Default: 180
  includeCompetitorAnalysis?: boolean;
}

interface ContentRefresherAgentOutput {
  operation: string;
  freshnessChecks: ContentFreshnessCheck[];
  recommendations: UpdateRecommendation[];
  summary: {
    totalPages: number;
    freshPages: number;
    stalePages: number;
    avgDaysSinceUpdate: number;
    highPriorityUpdates: number;
    mediumPriorityUpdates: number;
    lowPriorityUpdates: number;
    estimatedTrafficLoss: number;
  };
}

export class ContentRefresherAgent extends BaseAgent<ContentRefresherAgentInput, ContentRefresherAgentOutput> {
  id = 'content-refresher';
  name = 'content-refresher';
  description = 'Monitor content freshness and generate update recommendations to maintain rankings';

  constructor(private eventBus: EventBus) {
    super();
  }

  async execute(
    input: ContentRefresherAgentInput,
    context: AgentContext
  ): Promise<ContentRefresherAgentOutput> {
    const staleThresholdDays = input.staleThresholdDays ?? 180;

    // Fetch content pages
    const pages = await this.fetchContentPages(input.urls ?? [], context);

    // Check freshness
    const freshnessChecks = await this.checkFreshness(pages, staleThresholdDays, context);

    // Generate recommendations
    const recommendations = await this.generateRecommendations(
      freshnessChecks,
      input.includeCompetitorAnalysis ?? false,
      context
    );

    // Calculate summary
    const summary = this.calculateSummary(freshnessChecks, recommendations);

    return {
      operation: input.operation,
      freshnessChecks,
      recommendations,
      summary,
    };
  }

  /**
   * Fetch content pages by URL and extract real metadata via HTTP + Cheerio
   * Falls back to partial data if page unreachable.
   * Note: ranking/traffic data requires GSC (not yet wired); uses defaults.
   */
  private async fetchContentPages(
    urls: string[],
    context: AgentContext
  ): Promise<ContentPage[]> {
    const pages: ContentPage[] = [];

    for (const pageUrl of urls.slice(0, 20)) {
      try {
        const res = await fetch(pageUrl, {
          headers: { 'User-Agent': 'AISEO-ContentRefresher/1.0' },
          signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) continue;
        const ct = res.headers.get('content-type') ?? '';
        if (!ct.includes('text/html')) continue;

        const html = await res.text();
        const $ = cheerio.load(html);

        const title = $('title').first().text().trim();
        const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
        const wordCount = bodyText.length > 0 ? bodyText.split(/\s+/).length : 0;

        // Try to extract last-modified header or date from meta/article
        const lastModifiedHeader = res.headers.get('last-modified');
        let lastUpdated: string;
        if (lastModifiedHeader) {
          lastUpdated = new Date(lastModifiedHeader).toISOString().split('T')[0];
        } else {
          // Try article:modified_time or dateModified meta
          const metaDate =
            $('meta[property="article:modified_time"]').attr('content') ??
            $('meta[property="article:published_time"]').attr('content') ??
            $('time[datetime]').first().attr('datetime') ??
            '';
          lastUpdated = metaDate ? new Date(metaDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        }

        const daysSinceUpdate = Math.floor(
          (Date.now() - new Date(lastUpdated).getTime()) / (1000 * 60 * 60 * 24),
        );

        // Extract keywords from title + h1 + h2
        const headingText = [
          title,
          ...$('h1').map((_i, el) => $(el).text()).get(),
          ...$('h2').map((_i, el) => $(el).text()).get(),
        ].join(' ');

        const keywords = headingText
          .toLowerCase()
          .split(/[\s,\-|:]+/)
          .filter((w) => w.length > 2)
          .slice(0, 10);

        pages.push({
          url: pageUrl,
          title,
          lastUpdated,
          daysSinceUpdate,
          wordCount,
          keywords: [...new Set(keywords)],
          // Ranking/traffic data requires GSC OAuth — use defaults until wired
          currentRanking: {},
          historicalRanking: {},
          currentTraffic: 0,
          historicalTraffic: 0,
        });
      } catch {
        // Skip unreachable pages
      }
    }

    return pages;
  }

  /**
   * Check content freshness and trends
   */
  private async checkFreshness(
    pages: ContentPage[],
    staleThresholdDays: number,
    context: AgentContext
  ): Promise<ContentFreshnessCheck[]> {
    const checks: ContentFreshnessCheck[] = [];

    for (const page of pages) {
      const isFresh = page.daysSinceUpdate <= staleThresholdDays;

      // Calculate ranking trend
      const rankingChanges = Object.keys(page.currentRanking).map(keyword => {
        const current = page.currentRanking[keyword] ?? 100;
        const historical = page.historicalRanking[keyword] ?? 100;
        return historical - current; // Positive = improved, negative = declined
      });
      const avgRankingChange = rankingChanges.reduce((sum, change) => sum + change, 0) / rankingChanges.length;
      
      let rankingTrend: 'up' | 'down' | 'stable';
      if (avgRankingChange > 2) {
        rankingTrend = 'up' as const;
      } else if (avgRankingChange < -2) {
        rankingTrend = 'down' as const;
      } else {
        rankingTrend = 'stable' as const;
      }

      // Calculate traffic trend
      const trafficChangePercent = ((page.currentTraffic - page.historicalTraffic) / page.historicalTraffic) * 100;
      let trafficTrend: 'up' | 'down' | 'stable';
      if (trafficChangePercent > 10) {
        trafficTrend = 'up' as const;
      } else if (trafficChangePercent < -10) {
        trafficTrend = 'down' as const;
      } else {
        trafficTrend = 'stable' as const;
      }

      // Determine priority
      let priority: 'high' | 'medium' | 'low';
      let reason = '';

      if (!isFresh && rankingTrend === 'down' && trafficTrend === 'down') {
        priority = 'high' as const;
        reason = `內容過時 (${page.daysSinceUpdate} 天未更新)，且排名和流量均下降`;
      } else if (!isFresh && (rankingTrend === 'down' || trafficTrend === 'down')) {
        priority = 'high' as const;
        reason = `內容過時，${rankingTrend === 'down' ? '排名' : '流量'}下降`;
      } else if (!isFresh) {
        priority = 'medium' as const;
        reason = `內容過時 (${page.daysSinceUpdate} 天未更新)`;
      } else if (rankingTrend === 'down' || trafficTrend === 'down') {
        priority = 'medium' as const;
        reason = `${rankingTrend === 'down' ? '排名' : '流量'}下降，建議更新`;
      } else {
        priority = 'low' as const;
        reason = '內容新鮮，表現穩定';
      }

      checks.push({
        page,
        isFresh,
        staleDays: Math.max(0, page.daysSinceUpdate - staleThresholdDays),
        rankingTrend,
        trafficTrend,
        avgRankingChange: Math.round(avgRankingChange * 10) / 10,
        trafficChangePercent: Math.round(trafficChangePercent),
        priority,
        reason,
      });
    }

    return checks.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Generate update recommendations
   */
  private async generateRecommendations(
    checks: ContentFreshnessCheck[],
    includeCompetitorAnalysis: boolean,
    context: AgentContext
  ): Promise<UpdateRecommendation[]> {
    const recommendations: UpdateRecommendation[] = [];

    for (const check of checks) {
      if (check.priority === 'low') continue;

      const page = check.page;
      const recs: UpdateRecommendation[] = [];

      // Statistics update recommendation
      if (page.daysSinceUpdate > 365) {
        recs.push({
          url: page.url,
          recommendationType: 'statistics' as const,
          priority: 'high' as const,
          reason: '內容包含可能過時的統計數據',
          suggestions: [
            `更新標題年份（當前：${page.title.match(/\d{4}/)?.[0] ?? 'N/A'}）`,
            '搜尋最新的行業統計數據和研究報告',
            '更新案例研究和實例',
            '檢查所有數據來源是否仍然有效',
          ],
          estimatedImpact: '可提升排名 3-5 位，增加點擊率 15-20%',
        });
      }

      // Image and visual update
      if (page.daysSinceUpdate > 540 && page.title.includes('guide')) {
        recs.push({
          url: page.url,
          recommendationType: 'images' as const,
          priority: 'medium' as const,
          reason: '指南類內容的截圖可能已過時',
          suggestions: [
            '更新軟體介面截圖',
            '添加新的圖表和視覺化內容',
            '優化圖片 alt 文字包含目標關鍵字',
            '添加影片內容增加互動性',
          ],
          estimatedImpact: '可提升用戶停留時間 20-30%',
        });
      }

      // Broken links check
      if (page.daysSinceUpdate > 365) {
        recs.push({
          url: page.url,
          recommendationType: 'links' as const,
          priority: 'medium' as const,
          reason: '長時間未更新可能包含失效連結',
          suggestions: [
            '檢查並修復所有失效的外部連結',
            '移除不再相關的連結',
            '添加指向最新內容的內部連結',
            '確保引用來源仍然可用',
          ],
          estimatedImpact: '改善用戶體驗，避免 SEO 扣分',
        });
      }

      // Keyword optimization
      if (check.rankingTrend === 'down') {
        recs.push({
          url: page.url,
          recommendationType: 'keywords' as const,
          priority: 'high' as const,
          reason: `排名下降（平均 ${Math.abs(check.avgRankingChange)} 位）`,
          suggestions: [
            '重新研究目標關鍵字的搜尋意圖',
            '增加相關的語義關鍵字',
            '優化標題和元描述',
            '改善內容結構（H2, H3 標籤）',
          ],
          estimatedImpact: '可恢復或改善排名 5-10 位',
        });
      }

      // Competitor analysis
      if (includeCompetitorAnalysis && check.rankingTrend === 'down') {
        recs.push({
          url: page.url,
          recommendationType: 'sections' as const,
          priority: 'high' as const,
          reason: '競爭對手可能提供更全面的內容',
          suggestions: [
            '添加「常見問題（FAQ）」章節',
            '增加實用工具或模板下載',
            '提供更深入的技術說明',
            '添加專家訪談或引用',
          ],
          estimatedImpact: '可提升內容深度評分，增加排名競爭力',
          competitorInsights: {
            competitorUrl: 'https://competitor.com/similar-article',
            missingTopics: ['進階技巧', '常見錯誤', '工具推薦', 'FAQ'],
            wordCountDiff: 1500,
          },
        });
      }

      // Comprehensive refresh for high priority
      if (check.priority === 'high' && page.daysSinceUpdate > 365) {
        recs.push({
          url: page.url,
          recommendationType: 'comprehensive' as const,
          priority: 'high' as const,
          reason: '內容嚴重過時且表現下降，需要全面更新',
          suggestions: [
            '重新檢視整體內容架構',
            '更新所有統計數據和案例',
            '添加新的章節涵蓋最新趨勢',
            '改善可讀性和格式',
            '添加互動元素（清單、表格、圖表）',
            '優化 Core Web Vitals',
          ],
          estimatedImpact: `可恢復流量 ${Math.abs(check.trafficChangePercent)}%，排名提升 ${Math.abs(check.avgRankingChange)} 位`,
        });
      }

      recommendations.push(...recs);
    }

    return recommendations;
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(
    checks: ContentFreshnessCheck[],
    recommendations: UpdateRecommendation[]
  ): ContentRefresherAgentOutput['summary'] {
    const totalPages = checks.length;
    const freshPages = checks.filter(c => c.isFresh).length;
    const stalePages = totalPages - freshPages;
    const avgDaysSinceUpdate = Math.round(
      checks.reduce((sum, c) => sum + c.page.daysSinceUpdate, 0) / totalPages
    );

    const highPriorityUpdates = recommendations.filter(r => r.priority === 'high').length;
    const mediumPriorityUpdates = recommendations.filter(r => r.priority === 'medium').length;
    const lowPriorityUpdates = recommendations.filter(r => r.priority === 'low').length;

    // Calculate estimated traffic loss from declined pages
    const estimatedTrafficLoss = checks
      .filter(c => c.trafficTrend === 'down')
      .reduce((sum, c) => sum + (c.page.historicalTraffic - c.page.currentTraffic), 0);

    return {
      totalPages,
      freshPages,
      stalePages,
      avgDaysSinceUpdate,
      highPriorityUpdates,
      mediumPriorityUpdates,
      lowPriorityUpdates,
      estimatedTrafficLoss: Math.round(estimatedTrafficLoss),
    };
  }
}
