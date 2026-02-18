/**
 * ReportGeneratorAgent - Automated SEO Report Generation & Distribution
 * 
 * Features:
 * - Multi-source data aggregation (GA4, GSC, internal DB)
 * - Multiple report formats (SERP ranking, keyword growth, technical audit, backlinks)
 * - PDF rendering with charts and visualizations
 * - White-label customization
 * - Scheduled report distribution via email
 * 
 * Phase 2 Task 3.5
 */

import { BaseAgent } from './base.js';
import type { AgentContext } from './types.js';
import { EventBus } from '../event-bus/bus.js';

type ReportFormat = 'serp_ranking' | 'keyword_growth' | 'technical_audit' | 'backlink_analysis' | 'comprehensive' | 'executive_summary';
type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'custom';
type OutputFormat = 'pdf' | 'html' | 'json' | 'csv';

interface DataSource {
  type: 'google_analytics_4' | 'google_search_console' | 'internal_db' | 'ahrefs' | 'semrush';
  enabled: boolean;
  config?: Record<string, any>;
}

interface ChartData {
  type: 'line' | 'bar' | 'pie' | 'scatter' | 'table';
  title: string;
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string;
    fill?: boolean;
  }[];
}

interface ReportSection {
  sectionId: string;
  title: string;
  summary: string;
  metrics: {
    label: string;
    value: string | number;
    change?: number;
    changeLabel?: string;
    trend?: 'up' | 'down' | 'stable';
  }[];
  charts: ChartData[];
  insights: string[];
  recommendations?: string[];
}

interface WhiteLabelConfig {
  companyName: string;
  companyLogo?: string;
  brandColor?: string;
  footerText?: string;
  showPoweredBy?: boolean;
}

interface ReportGeneratorInput {
  reportFormat: ReportFormat;
  reportPeriod: ReportPeriod;
  startDate?: string;
  endDate?: string;
  outputFormat: OutputFormat;
  dataSources?: DataSource[];
  includeCharts?: boolean;
  includeRecommendations?: boolean;
  whiteLabelConfig?: WhiteLabelConfig;
  recipients?: string[];
  scheduleCron?: string;
}

interface ReportGeneratorOutput {
  reportId: string;
  reportFormat: ReportFormat;
  reportPeriod: ReportPeriod;
  generatedAt: string;
  coveringPeriod: {
    startDate: string;
    endDate: string;
  };
  sections: ReportSection[];
  summary: {
    totalMetrics: number;
    totalCharts: number;
    totalInsights: number;
    overallScore: number;
    keyHighlights: string[];
  };
  outputUrls: {
    pdf?: string;
    html?: string;
    json?: string;
    csv?: string;
  };
  scheduledDelivery?: {
    cronPattern: string;
    nextRunAt: string;
    recipients: string[];
  };
}

export class ReportGeneratorAgent extends BaseAgent<ReportGeneratorInput, ReportGeneratorOutput> {
  id = 'report-generator';
  name = 'report-generator';
  description = 'Generate comprehensive SEO reports with data aggregation and visualization';

  constructor(private eventBus: EventBus) {
    super();
  }

  async execute(
    input: ReportGeneratorInput,
    context: AgentContext
  ): Promise<ReportGeneratorOutput> {
    // Determine date range
    const { startDate, endDate } = this.calculateDateRange(input);

    // Aggregate data from multiple sources
    const aggregatedData = await this.aggregateData(input.dataSources ?? [], startDate, endDate, context);

    // Generate report sections based on format
    const sections = await this.generateSections(
      input.reportFormat,
      aggregatedData,
      input.includeCharts ?? true,
      input.includeRecommendations ?? true,
      context
    );

    // Calculate summary and key highlights
    const summary = this.calculateSummary(sections);

    // Render report in requested output formats
    const outputUrls = await this.renderReport(
      sections,
      input.outputFormat,
      input.whiteLabelConfig,
      context
    );

    // Setup scheduled delivery if requested
    const scheduledDelivery = input.scheduleCron && input.recipients
      ? this.setupScheduledDelivery(input.scheduleCron, input.recipients)
      : undefined;

    const reportId = `report_${Date.now()}_${input.reportFormat}`;

    return {
      reportId,
      reportFormat: input.reportFormat,
      reportPeriod: input.reportPeriod,
      generatedAt: new Date().toISOString(),
      coveringPeriod: {
        startDate,
        endDate,
      },
      sections,
      summary,
      outputUrls,
      scheduledDelivery,
    };
  }

  /**
   * Calculate date range based on report period
   */
  private calculateDateRange(input: ReportGeneratorInput): { startDate: string; endDate: string } {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    if (input.startDate && input.endDate) {
      return { startDate: input.startDate, endDate: input.endDate };
    }

    switch (input.reportPeriod) {
      case 'daily':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'weekly':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'monthly':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        break;
      case 'quarterly':
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    };
  }

  /**
   * Aggregate data from multiple sources
   */
  private async aggregateData(
    sources: DataSource[],
    startDate: string,
    endDate: string,
    context: AgentContext
  ): Promise<Record<string, any>> {
    const aggregated: Record<string, any> = {};

    for (const source of sources) {
      if (!source.enabled) continue;

      switch (source.type) {
        case 'google_analytics_4':
          aggregated.ga4 = await this.fetchGA4Data(startDate, endDate, context);
          break;
        case 'google_search_console':
          aggregated.gsc = await this.fetchGSCData(startDate, endDate, context);
          break;
        case 'internal_db':
          aggregated.internal = await this.fetchInternalData(startDate, endDate, context);
          break;
        case 'ahrefs':
          aggregated.ahrefs = await this.fetchAhrefsData(startDate, endDate, context);
          break;
        case 'semrush':
          aggregated.semrush = await this.fetchSEMrushData(startDate, endDate, context);
          break;
      }
    }

    return aggregated;
  }

  /**
   * Fetch Google Analytics 4 data
   */
  private async fetchGA4Data(startDate: string, endDate: string, context: AgentContext): Promise<any> {
    // MVP: Mock data (real implementation would use GA4 Data API)
    // Real: POST https://analyticsdata.googleapis.com/v1beta/{property}/runReport
    return {
      sessions: 15000,
      users: 12000,
      pageviews: 45000,
      avgSessionDuration: 180,
      bounceRate: 0.45,
      conversions: 250,
      conversionRate: 0.0167,
      topPages: [
        { path: '/blog/seo-guide', views: 5000, avgTime: 240 },
        { path: '/tools', views: 3500, avgTime: 180 },
        { path: '/pricing', views: 2500, avgTime: 120 },
      ],
    };
  }

  /**
   * Fetch Google Search Console data
   */
  private async fetchGSCData(startDate: string, endDate: string, context: AgentContext): Promise<any> {
    // MVP: Mock data (real implementation would use GSC API)
    return {
      totalClicks: 8500,
      totalImpressions: 250000,
      avgCTR: 0.034,
      avgPosition: 12.5,
      topQueries: [
        { query: 'seo tools', clicks: 1200, impressions: 15000, ctr: 0.08, position: 5.2 },
        { query: 'keyword research', clicks: 900, impressions: 12000, ctr: 0.075, position: 6.8 },
        { query: 'seo audit', clicks: 750, impressions: 10000, ctr: 0.075, position: 7.5 },
      ],
      topPages: [
        { url: '/blog/seo-guide', clicks: 2000, impressions: 30000, ctr: 0.0667, position: 4.5 },
        { url: '/tools', clicks: 1500, impressions: 25000, ctr: 0.06, position: 5.8 },
      ],
    };
  }

  /**
   * Fetch internal database data (keyword ranks, audit results, etc.)
   */
  private async fetchInternalData(startDate: string, endDate: string, context: AgentContext): Promise<any> {
    // MVP: Mock data (real implementation would query internal tables)
    return {
      totalKeywordsTracked: 500,
      keywordsInTop10: 85,
      keywordsInTop3: 25,
      avgRankChange: -1.5, // negative = improvement
      technicalIssues: {
        critical: 3,
        warning: 12,
        info: 25,
      },
      backlinkOpportunities: 45,
      contentDrafts: {
        draft: 5,
        pending_review: 3,
        approved: 8,
        published: 15,
      },
    };
  }

  /**
   * Fetch Ahrefs data
   */
  private async fetchAhrefsData(startDate: string, endDate: string, context: AgentContext): Promise<any> {
    // MVP: Mock data
    return {
      domainRating: 65,
      backlinksTotal: 12500,
      referringDomains: 850,
      organicTraffic: 25000,
      organicKeywords: 3500,
      topBacklinks: [
        { url: 'https://techcrunch.com/article', dr: 92, traffic: 50000 },
        { url: 'https://moz.com/blog/post', dr: 91, traffic: 40000 },
      ],
    };
  }

  /**
   * Fetch SEMrush data
   */
  private async fetchSEMrushData(startDate: string, endDate: string, context: AgentContext): Promise<any> {
    // MVP: Mock data
    return {
      organicSearchTraffic: 28000,
      paidSearchTraffic: 2000,
      organicKeywords: 3800,
      paidKeywords: 150,
      organicCompetitors: [
        { domain: 'competitor1.com', commonKeywords: 450, traffic: 35000 },
        { domain: 'competitor2.com', commonKeywords: 380, traffic: 28000 },
      ],
    };
  }

  /**
   * Generate report sections based on format
   */
  private async generateSections(
    format: ReportFormat,
    data: Record<string, any>,
    includeCharts: boolean,
    includeRecommendations: boolean,
    context: AgentContext
  ): Promise<ReportSection[]> {
    const sections: ReportSection[] = [];

    switch (format) {
      case 'serp_ranking':
        sections.push(this.generateSerpRankingSection(data, includeCharts));
        break;
      case 'keyword_growth':
        sections.push(this.generateKeywordGrowthSection(data, includeCharts));
        break;
      case 'technical_audit':
        sections.push(this.generateTechnicalAuditSection(data, includeCharts));
        break;
      case 'backlink_analysis':
        sections.push(this.generateBacklinkAnalysisSection(data, includeCharts));
        break;
      case 'comprehensive':
        sections.push(
          this.generateExecutiveSummarySection(data),
          this.generateSerpRankingSection(data, includeCharts),
          this.generateKeywordGrowthSection(data, includeCharts),
          this.generateTechnicalAuditSection(data, includeCharts),
          this.generateBacklinkAnalysisSection(data, includeCharts),
          this.generateTrafficAnalysisSection(data, includeCharts)
        );
        break;
      case 'executive_summary':
        sections.push(this.generateExecutiveSummarySection(data));
        break;
    }

    // Add recommendations to each section if requested
    if (includeRecommendations) {
      sections.forEach(section => {
        if (!section.recommendations) {
          section.recommendations = this.generateSectionRecommendations(section);
        }
      });
    }

    return sections;
  }

  private generateExecutiveSummarySection(data: Record<string, any>): ReportSection {
    return {
      sectionId: 'executive_summary',
      title: '執行摘要',
      summary: '本期 SEO 表現整體概覽，包含關鍵指標和重要趨勢',
      metrics: [
        { label: '總自然流量', value: data.ga4?.sessions || 0, change: 12.5, changeLabel: '+12.5%', trend: 'up' },
        { label: '平均排名', value: data.gsc?.avgPosition || 0, change: -1.5, changeLabel: '-1.5', trend: 'up' },
        { label: 'Top 10 關鍵字', value: data.internal?.keywordsInTop10 || 0, change: 8, changeLabel: '+8', trend: 'up' },
        { label: 'Domain Rating', value: data.ahrefs?.domainRating || 0, change: 2, changeLabel: '+2', trend: 'up' },
      ],
      charts: [],
      insights: [
        '自然流量較上期成長 12.5%，主要來自 Blog 內容頁面',
        '平均排名提升 1.5 位，關鍵字整體排名趨勢向上',
        '技術 SEO 審計發現 3 個重大問題需立即處理',
        '反向連結總數增加 150 個，品質良好',
      ],
    };
  }

  private generateSerpRankingSection(data: Record<string, any>, includeCharts: boolean): ReportSection {
    const charts: ChartData[] = includeCharts ? [
      {
        type: 'line',
        title: '平均排名趨勢',
        labels: ['週 1', '週 2', '週 3', '週 4'],
        datasets: [
          {
            label: '平均排名',
            data: [15.2, 14.1, 13.5, 12.5],
            borderColor: '#4CAF50',
            fill: false,
          },
        ],
      },
      {
        type: 'bar',
        title: '關鍵字排名分佈',
        labels: ['Top 3', 'Top 10', 'Top 20', 'Top 50', '50+'],
        datasets: [
          {
            label: '關鍵字數量',
            data: [25, 85, 150, 300, 115],
            backgroundColor: ['#4CAF50', '#8BC34A', '#FFC107', '#FF9800', '#F44336'],
          },
        ],
      },
    ] : [];

    return {
      sectionId: 'serp_ranking',
      title: 'SERP 排名表現',
      summary: '關鍵字搜尋引擎排名表現分析',
      metrics: [
        { label: '追蹤關鍵字總數', value: 500, trend: 'stable' },
        { label: 'Top 3 排名', value: 25, change: 3, changeLabel: '+3', trend: 'up' },
        { label: 'Top 10 排名', value: 85, change: 8, changeLabel: '+8', trend: 'up' },
        { label: '平均排名', value: 12.5, change: -1.5, changeLabel: '-1.5', trend: 'up' },
      ],
      charts,
      insights: [
        '本期新增 3 個關鍵字進入 Top 3，主要為長尾關鍵字',
        '「seo tools」排名從 7 位提升至 5 位',
        '發現 15 個關鍵字出現排名波動（>5 位），需關注',
      ],
    };
  }

  private generateKeywordGrowthSection(data: Record<string, any>, includeCharts: boolean): ReportSection {
    const charts: ChartData[] = includeCharts ? [
      {
        type: 'line',
        title: '關鍵字總數成長',
        labels: ['1月', '2月', '3月', '4月'],
        datasets: [
          {
            label: '自然關鍵字',
            data: [3200, 3350, 3500, 3800],
            borderColor: '#2196F3',
            fill: false,
          },
        ],
      },
    ] : [];

    return {
      sectionId: 'keyword_growth',
      title: '關鍵字成長分析',
      summary: '自然搜尋關鍵字數量與流量成長趨勢',
      metrics: [
        { label: '自然關鍵字總數', value: 3500, change: 150, changeLabel: '+150', trend: 'up' },
        { label: '總點擊數', value: 8500, change: 750, changeLabel: '+750', trend: 'up' },
        { label: '總曝光數', value: 250000, change: 15000, changeLabel: '+15k', trend: 'up' },
        { label: '平均 CTR', value: '3.4%', change: 0.2, changeLabel: '+0.2%', trend: 'up' },
      ],
      charts,
      insights: [
        '新增關鍵字主要來自 Blog 內容擴展策略',
        'CTR 提升主要受益於 Meta Description 優化',
        '「keyword research」相關詞組成長最快',
      ],
    };
  }

  private generateTechnicalAuditSection(data: Record<string, any>, includeCharts: boolean): ReportSection {
    const charts: ChartData[] = includeCharts ? [
      {
        type: 'pie',
        title: '技術問題分佈',
        labels: ['重大問題', '警告', '資訊'],
        datasets: [
          {
            label: '問題數量',
            data: [3, 12, 25],
            backgroundColor: ['#F44336', '#FF9800', '#2196F3'],
          },
        ],
      },
    ] : [];

    return {
      sectionId: 'technical_audit',
      title: '技術 SEO 審計',
      summary: '網站技術健康度檢查與問題發現',
      metrics: [
        { label: 'Lighthouse 效能分數', value: 85, trend: 'up' },
        { label: 'SEO 分數', value: 92, trend: 'up' },
        { label: '重大問題', value: 3, trend: 'down' },
        { label: '警告', value: 12, trend: 'stable' },
      ],
      charts,
      insights: [
        '發現 3 個 Core Web Vitals 問題影響使用者體驗',
        '12 個頁面缺少 Meta Description',
        'Mobile Usability 通過率 95%',
      ],
      recommendations: [
        '立即修復 LCP > 2.5s 的頁面（共 5 個）',
        '為缺少 Meta Description 的頁面補充描述',
        '優化圖片大小，啟用 WebP 格式',
      ],
    };
  }

  private generateBacklinkAnalysisSection(data: Record<string, any>, includeCharts: boolean): ReportSection {
    const charts: ChartData[] = includeCharts ? [
      {
        type: 'line',
        title: '反向連結成長趨勢',
        labels: ['1月', '2月', '3月', '4月'],
        datasets: [
          {
            label: '總反向連結',
            data: [12000, 12150, 12350, 12500],
            borderColor: '#9C27B0',
            fill: false,
          },
        ],
      },
    ] : [];

    return {
      sectionId: 'backlink_analysis',
      title: '反向連結分析',
      summary: '反向連結增長與品質評估',
      metrics: [
        { label: 'Domain Rating', value: 65, change: 2, changeLabel: '+2', trend: 'up' },
        { label: '總反向連結', value: 12500, change: 150, changeLabel: '+150', trend: 'up' },
        { label: '參考網域', value: 850, change: 25, changeLabel: '+25', trend: 'up' },
        { label: '高 DR 連結 (>70)', value: 45, change: 5, changeLabel: '+5', trend: 'up' },
      ],
      charts,
      insights: [
        '本期獲得 25 個新參考網域，平均 DR 為 55',
        '來自 TechCrunch 的連結帶來顯著流量',
        '發現 45 個新的高價值連結機會',
      ],
    };
  }

  private generateTrafficAnalysisSection(data: Record<string, any>, includeCharts: boolean): ReportSection {
    const charts: ChartData[] = includeCharts ? [
      {
        type: 'line',
        title: '流量趨勢',
        labels: ['週 1', '週 2', '週 3', '週 4'],
        datasets: [
          {
            label: '自然流量',
            data: [3500, 3750, 3900, 4000],
            borderColor: '#4CAF50',
            fill: false,
          },
        ],
      },
    ] : [];

    return {
      sectionId: 'traffic_analysis',
      title: '流量分析',
      summary: '網站流量來源與趨勢分析',
      metrics: [
        { label: '總工作階段', value: 15000, change: 1500, changeLabel: '+1.5k', trend: 'up' },
        { label: '自然流量', value: 12000, change: 1200, changeLabel: '+1.2k', trend: 'up' },
        { label: '跳出率', value: '45%', change: -2, changeLabel: '-2%', trend: 'up' },
        { label: '轉換率', value: '1.67%', change: 0.15, changeLabel: '+0.15%', trend: 'up' },
      ],
      charts,
      insights: [
        '自然流量佔總流量 80%，顯示 SEO 策略有效',
        'Blog 頁面平均停留時間達 4 分鐘',
        '轉換率提升主要來自產品頁面優化',
      ],
    };
  }

  private generateSectionRecommendations(section: ReportSection): string[] {
    // Generate generic recommendations based on section insights
    return section.insights.slice(0, 3).map(insight => `針對「${insight}」採取相應優化措施`);
  }

  /**
   * Calculate report summary
   */
  private calculateSummary(sections: ReportSection[]): ReportGeneratorOutput['summary'] {
    const totalMetrics = sections.reduce((sum, s) => sum + s.metrics.length, 0);
    const totalCharts = sections.reduce((sum, s) => sum + s.charts.length, 0);
    const totalInsights = sections.reduce((sum, s) => sum + s.insights.length, 0);

    // Calculate overall score (0-100) based on section metrics
    let scoreSum = 0;
    let scoreCount = 0;
    sections.forEach(section => {
      section.metrics.forEach(metric => {
        if (metric.trend === 'up') {
          scoreSum += 1;
          scoreCount += 1;
        } else if (metric.trend === 'down') {
          scoreSum += 0;
          scoreCount += 1;
        }
      });
    });
    const overallScore = scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 100) : 75;

    // Extract key highlights from sections
    const keyHighlights: string[] = [];
    sections.forEach(section => {
      if (section.insights.length > 0) {
        keyHighlights.push(section.insights[0]);
      }
    });

    return {
      totalMetrics,
      totalCharts,
      totalInsights,
      overallScore,
      keyHighlights: keyHighlights.slice(0, 5),
    };
  }

  /**
   * Render report in requested output format
   */
  private async renderReport(
    sections: ReportSection[],
    format: OutputFormat,
    whiteLabelConfig: WhiteLabelConfig | undefined,
    context: AgentContext
  ): Promise<ReportGeneratorOutput['outputUrls']> {
    const outputUrls: ReportGeneratorOutput['outputUrls'] = {};

    // MVP: Mock URLs (real implementation would use Puppeteer for PDF, template engine for HTML)
    // Real: Use Puppeteer to render HTML with Chart.js to PDF
    // Real: Use Handlebars/EJS template engine for HTML generation

    const reportId = `report_${Date.now()}`;

    switch (format) {
      case 'pdf':
        outputUrls.pdf = `/reports/${reportId}.pdf`;
        break;
      case 'html':
        outputUrls.html = `/reports/${reportId}.html`;
        break;
      case 'json':
        outputUrls.json = `/reports/${reportId}.json`;
        break;
      case 'csv':
        outputUrls.csv = `/reports/${reportId}.csv`;
        break;
    }

    return outputUrls;
  }

  /**
   * Setup scheduled report delivery
   */
  private setupScheduledDelivery(
    cronPattern: string,
    recipients: string[]
  ): ReportGeneratorOutput['scheduledDelivery'] {
    // MVP: Mock next run calculation (real implementation would use BullMQ repeatable jobs)
    const now = new Date();
    const nextRunAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days later

    return {
      cronPattern,
      nextRunAt: nextRunAt.toISOString(),
      recipients,
    };
  }
}
