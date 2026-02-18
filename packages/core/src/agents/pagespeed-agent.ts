/**
 * PageSpeedAgent - PageSpeed Insights Integration & Performance Monitoring
 * 
 * Features:
 * - PageSpeed Insights API integration (Lighthouse scores + Field data)
 * - Core Web Vitals tracking with TimescaleDB time-series
 * - Performance threshold alerts (CWV degradation notifications)
 * - Historical performance trends
 * - Mobile vs Desktop comparison
 * 
 * Phase 2 Task 3.8
 */

import { BaseAgent } from './base.js';
import type { AgentContext } from './types.js';
import { EventBus } from '../event-bus/bus.js';

interface CoreWebVitals {
  lcp: number; // Largest Contentful Paint (ms)
  fid: number; // First Input Delay (ms)
  cls: number; // Cumulative Layout Shift (score)
  fcp: number; // First Contentful Paint (ms)
  ttfb: number; // Time to First Byte (ms)
  tbt: number; // Total Blocking Time (ms)
}

interface LighthouseScores {
  performance: number; // 0-100
  accessibility: number; // 0-100
  bestPractices: number; // 0-100
  seo: number; // 0-100
  pwa?: number; // 0-100
}

interface PerformanceResult {
  url: string;
  device: 'mobile' | 'desktop';
  lighthouseScores: LighthouseScores;
  labCoreWebVitals: CoreWebVitals;
  fieldCoreWebVitals?: CoreWebVitals; // Real User Monitoring data from CrUX
  opportunities: {
    title: string;
    description: string;
    impact: 'high' | 'medium' | 'low';
    potentialSavingsMs: number;
  }[];
  diagnostics: {
    title: string;
    description: string;
    severity: 'error' | 'warning' | 'info';
  }[];
  loadingExperience: {
    overallCategory: 'FAST' | 'AVERAGE' | 'SLOW';
    metrics: {
      lcp: { category: string; percentile: number };
      fid: { category: string; percentile: number };
      cls: { category: string; percentile: number };
    };
  };
}

interface PerformanceAlert {
  alertId: string;
  alertType: 'cwv_degradation' | 'lighthouse_drop' | 'threshold_breach';
  url: string;
  device: 'mobile' | 'desktop';
  severity: 'critical' | 'warning';
  metric: string;
  previousValue: number;
  currentValue: number;
  change: number;
  threshold: number;
  message: string;
  recommendations: string[];
  triggeredAt: string;
}

interface PageSpeedAgentInput {
  operation: 'audit' | 'monitor' | 'compare' | 'alert_check';
  urls: string[];
  device?: 'mobile' | 'desktop' | 'both';
  strategy?: 'mobile' | 'desktop';
  category?: ('performance' | 'accessibility' | 'best-practices' | 'seo' | 'pwa')[];
  thresholds?: {
    lighthouse?: { performance?: number; accessibility?: number; seo?: number };
    cwv?: { lcp?: number; fid?: number; cls?: number };
  };
}

interface PageSpeedAgentOutput {
  operation: string;
  results: PerformanceResult[];
  alerts?: PerformanceAlert[];
  summary: {
    totalUrls: number;
    avgLighthousePerformance: number;
    avgLcp: number;
    avgFid: number;
    avgCls: number;
    passedThresholds: number;
    failedThresholds: number;
    criticalIssues: number;
  };
  recommendations: {
    priority: 'high' | 'medium' | 'low';
    category: 'image_optimization' | 'code_splitting' | 'caching' | 'server_response' | 'rendering';
    title: string;
    description: string;
    estimatedImpact: string;
  }[];
}

export class PageSpeedAgent extends BaseAgent<PageSpeedAgentInput, PageSpeedAgentOutput> {
  id = 'pagespeed-agent';
  name = 'pagespeed-agent';
  description = 'Monitor page speed performance and Core Web Vitals with PageSpeed Insights';

  constructor(private eventBus: EventBus) {
    super();
  }

  async execute(
    input: PageSpeedAgentInput,
    context: AgentContext
  ): Promise<PageSpeedAgentOutput> {
    const device = input.device ?? 'mobile';

    // Run PageSpeed Insights audits for each URL
    const results: PerformanceResult[] = [];
    for (const url of input.urls) {
      if (device === 'both') {
        const mobileResult = await this.runPageSpeedInsights(url, 'mobile', context);
        const desktopResult = await this.runPageSpeedInsights(url, 'desktop', context);
        results.push(mobileResult, desktopResult);
      } else {
        const result = await this.runPageSpeedInsights(url, device, context);
        results.push(result);
      }
    }

    // Check for alerts if thresholds are provided
    const alerts: PerformanceAlert[] = [];
    if (input.thresholds) {
      for (const result of results) {
        const resultAlerts = this.checkThresholds(result, input.thresholds);
        alerts.push(...resultAlerts);
      }
    }

    // Calculate summary statistics
    const summary = this.calculateSummary(results, input.thresholds);

    // Generate optimization recommendations
    const recommendations = this.generateRecommendations(results);

    // Publish alerts to event bus
    for (const alert of alerts.filter(a => a.severity === 'critical')) {
      await this.eventBus.publish({
        tenantId: context.tenantId,
        projectId: context.projectId,
        type: 'pagespeed.alert.critical',
        payload: {
          alertId: alert.alertId,
          url: alert.url,
          metric: alert.metric,
          currentValue: alert.currentValue,
          threshold: alert.threshold,
          message: alert.message,
        },
      });
    }

    return {
      operation: input.operation,
      results,
      alerts: alerts.length > 0 ? alerts : undefined,
      summary,
      recommendations,
    };
  }

  /**
   * Run PageSpeed Insights audit via real Google PSI API v5
   */
  private async runPageSpeedInsights(
    url: string,
    device: 'mobile' | 'desktop',
    context: AgentContext
  ): Promise<PerformanceResult> {
    // 1) Call real PSI API via the registered tool
    const psiResult = await context.tools.run<
      import('../plugins/builtins/pagespeed-insights.js').PsiInput,
      import('../plugins/builtins/pagespeed-insights.js').PsiOutput
    >('google.pagespeedInsights', {
      url,
      strategy: device,
      categories: ['performance', 'accessibility', 'best-practices', 'seo'],
    }, context);

    // 2) Map PSI tool output → PerformanceResult
    const lighthouseScores: LighthouseScores = {
      performance: psiResult.lighthouseScores.performance,
      accessibility: psiResult.lighthouseScores.accessibility,
      bestPractices: psiResult.lighthouseScores.bestPractices,
      seo: psiResult.lighthouseScores.seo,
    };

    const labCoreWebVitals: CoreWebVitals = {
      lcp: psiResult.coreWebVitals.lcp,
      fid: psiResult.coreWebVitals.fid,
      cls: psiResult.coreWebVitals.cls,
      fcp: psiResult.coreWebVitals.fcp,
      ttfb: psiResult.coreWebVitals.ttfb,
      tbt: psiResult.coreWebVitals.tbt,
    };

    // Field data from CrUX (may be unavailable for low-traffic sites)
    let fieldCoreWebVitals: CoreWebVitals | undefined;
    if (psiResult.fieldData) {
      fieldCoreWebVitals = {
        lcp: psiResult.fieldData.lcp?.percentile ?? labCoreWebVitals.lcp,
        fid: psiResult.fieldData.fid?.percentile ?? labCoreWebVitals.fid,
        cls: psiResult.fieldData.cls?.percentile ?? labCoreWebVitals.cls,
        fcp: labCoreWebVitals.fcp,
        ttfb: labCoreWebVitals.ttfb,
        tbt: labCoreWebVitals.tbt,
      };
    }

    // Loading experience category
    const overallCategory: 'FAST' | 'AVERAGE' | 'SLOW' =
      psiResult.fieldData?.overallCategory ??
      (labCoreWebVitals.lcp < 2500 && labCoreWebVitals.fid < 100 && labCoreWebVitals.cls < 0.1
        ? 'FAST'
        : labCoreWebVitals.lcp < 4000 && labCoreWebVitals.fid < 300 && labCoreWebVitals.cls < 0.25
        ? 'AVERAGE'
        : 'SLOW');

    const opportunities = this.generateOpportunities(lighthouseScores, labCoreWebVitals);
    const diagnostics = this.generateDiagnostics(lighthouseScores, labCoreWebVitals);

    return {
      url,
      device,
      lighthouseScores,
      labCoreWebVitals,
      fieldCoreWebVitals,
      opportunities,
      diagnostics,
      loadingExperience: {
        overallCategory,
        metrics: {
          lcp: {
            category: labCoreWebVitals.lcp < 2500 ? 'FAST' : labCoreWebVitals.lcp < 4000 ? 'AVERAGE' : 'SLOW',
            percentile: Math.round(labCoreWebVitals.lcp),
          },
          fid: {
            category: labCoreWebVitals.fid < 100 ? 'FAST' : labCoreWebVitals.fid < 300 ? 'AVERAGE' : 'SLOW',
            percentile: Math.round(labCoreWebVitals.fid),
          },
          cls: {
            category: labCoreWebVitals.cls < 0.1 ? 'FAST' : labCoreWebVitals.cls < 0.25 ? 'AVERAGE' : 'SLOW',
            percentile: Math.round(labCoreWebVitals.cls * 100) / 100,
          },
        },
      },
    };
  }

  /**
   * Generate optimization opportunities
   */
  private generateOpportunities(
    scores: LighthouseScores,
    cwv: CoreWebVitals
  ): PerformanceResult['opportunities'] {
    const opportunities: PerformanceResult['opportunities'] = [];

    if (cwv.lcp > 2500) {
      opportunities.push({
        title: '優化最大內容繪製（LCP）',
        description: 'LCP 超過 2.5 秒，影響使用者體驗。考慮優化圖片大小、伺服器回應時間。',
        impact: 'high' as const,
        potentialSavingsMs: Math.round(cwv.lcp - 2000),
      });
    }

    if (cwv.fid > 100) {
      opportunities.push({
        title: '減少 JavaScript 執行時間',
        description: 'FID 超過 100ms，頁面互動反應慢。減少主執行緒工作量，分割大型 JS 檔案。',
        impact: 'high' as const,
        potentialSavingsMs: Math.round(cwv.fid - 80),
      });
    }

    if (cwv.cls > 0.1) {
      opportunities.push({
        title: '減少版面配置偏移（CLS）',
        description: 'CLS 超過 0.1，頁面元素會意外移動。為圖片和廣告保留空間，避免動態內容插入。',
        impact: 'medium' as const,
        potentialSavingsMs: 0,
      });
    }

    if (cwv.ttfb > 600) {
      opportunities.push({
        title: '優化伺服器回應時間（TTFB）',
        description: 'TTFB 超過 600ms。啟用 CDN、優化資料庫查詢、使用快取。',
        impact: 'high' as const,
        potentialSavingsMs: Math.round(cwv.ttfb - 400),
      });
    }

    if (scores.performance < 50) {
      opportunities.push({
        title: '圖片優化',
        description: '使用現代圖片格式（WebP、AVIF），壓縮圖片大小，啟用 lazy loading。',
        impact: 'high' as const,
        potentialSavingsMs: 1000,
      });
    }

    return opportunities;
  }

  /**
   * Generate diagnostics
   */
  private generateDiagnostics(
    scores: LighthouseScores,
    cwv: CoreWebVitals
  ): PerformanceResult['diagnostics'] {
    const diagnostics: PerformanceResult['diagnostics'] = [];

    if (cwv.tbt > 300) {
      diagnostics.push({
        title: '主執行緒阻塞時間過長',
        description: `總阻塞時間 ${Math.round(cwv.tbt)}ms，建議 <300ms`,
        severity: 'warning' as const,
      });
    }

    if (cwv.fcp > 1800) {
      diagnostics.push({
        title: '首次內容繪製緩慢',
        description: `FCP ${Math.round(cwv.fcp)}ms，建議 <1800ms`,
        severity: 'warning' as const,
      });
    }

    if (scores.accessibility < 80) {
      diagnostics.push({
        title: '無障礙功能需改善',
        description: 'Accessibility 分數低於 80，部分使用者可能無法正常使用網站',
        severity: 'warning' as const,
      });
    }

    return diagnostics;
  }

  /**
   * Check performance thresholds and generate alerts
   */
  private checkThresholds(
    result: PerformanceResult,
    thresholds: PageSpeedAgentInput['thresholds']
  ): PerformanceAlert[] {
    const alerts: PerformanceAlert[] = [];

    // Check Lighthouse thresholds
    if (thresholds?.lighthouse?.performance) {
      if (result.lighthouseScores.performance < thresholds.lighthouse.performance) {
        alerts.push({
          alertId: `alert_${Date.now()}_lighthouse_perf`,
          alertType: 'threshold_breach' as const,
          url: result.url,
          device: result.device,
          severity: 'warning' as const,
          metric: 'Lighthouse Performance',
          previousValue: thresholds.lighthouse.performance,
          currentValue: result.lighthouseScores.performance,
          change: result.lighthouseScores.performance - thresholds.lighthouse.performance,
          threshold: thresholds.lighthouse.performance,
          message: `Lighthouse Performance 分數 ${result.lighthouseScores.performance} 低於門檻值 ${thresholds.lighthouse.performance}`,
          recommendations: [
            '檢查最近的程式碼變更',
            '檢視 PageSpeed Insights 詳細報告',
            '優化關鍵渲染路徑',
          ],
          triggeredAt: new Date().toISOString(),
        });
      }
    }

    // Check CWV thresholds
    if (thresholds?.cwv) {
      if (thresholds.cwv.lcp && result.labCoreWebVitals.lcp > thresholds.cwv.lcp) {
        alerts.push({
          alertId: `alert_${Date.now()}_lcp`,
          alertType: 'cwv_degradation' as const,
          url: result.url,
          device: result.device,
          severity: result.labCoreWebVitals.lcp > 4000 ? 'critical' as const : 'warning' as const,
          metric: 'LCP',
          previousValue: thresholds.cwv.lcp,
          currentValue: result.labCoreWebVitals.lcp,
          change: result.labCoreWebVitals.lcp - thresholds.cwv.lcp,
          threshold: thresholds.cwv.lcp,
          message: `LCP ${Math.round(result.labCoreWebVitals.lcp)}ms 超過門檻值 ${thresholds.cwv.lcp}ms`,
          recommendations: [
            '優化圖片載入',
            '減少伺服器回應時間',
            '移除阻塞渲染的資源',
          ],
          triggeredAt: new Date().toISOString(),
        });
      }

      if (thresholds.cwv.fid && result.labCoreWebVitals.fid > thresholds.cwv.fid) {
        alerts.push({
          alertId: `alert_${Date.now()}_fid`,
          alertType: 'cwv_degradation' as const,
          url: result.url,
          device: result.device,
          severity: result.labCoreWebVitals.fid > 300 ? 'critical' as const : 'warning' as const,
          metric: 'FID',
          previousValue: thresholds.cwv.fid,
          currentValue: result.labCoreWebVitals.fid,
          change: result.labCoreWebVitals.fid - thresholds.cwv.fid,
          threshold: thresholds.cwv.fid,
          message: `FID ${Math.round(result.labCoreWebVitals.fid)}ms 超過門檻值 ${thresholds.cwv.fid}ms`,
          recommendations: [
            '減少主執行緒 JavaScript 工作量',
            '分割大型 JS bundles',
            '延遲載入非必要的腳本',
          ],
          triggeredAt: new Date().toISOString(),
        });
      }

      if (thresholds.cwv.cls && result.labCoreWebVitals.cls > thresholds.cwv.cls) {
        alerts.push({
          alertId: `alert_${Date.now()}_cls`,
          alertType: 'cwv_degradation' as const,
          url: result.url,
          device: result.device,
          severity: result.labCoreWebVitals.cls > 0.25 ? 'critical' as const : 'warning' as const,
          metric: 'CLS',
          previousValue: thresholds.cwv.cls,
          currentValue: result.labCoreWebVitals.cls,
          change: result.labCoreWebVitals.cls - thresholds.cwv.cls,
          threshold: thresholds.cwv.cls,
          message: `CLS ${result.labCoreWebVitals.cls.toFixed(3)} 超過門檻值 ${thresholds.cwv.cls}`,
          recommendations: [
            '為圖片和廣告元素設定明確尺寸',
            '避免在現有內容上方插入內容',
            '使用 font-display: swap',
          ],
          triggeredAt: new Date().toISOString(),
        });
      }
    }

    return alerts;
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(
    results: PerformanceResult[],
    thresholds: PageSpeedAgentInput['thresholds'] | undefined
  ): PageSpeedAgentOutput['summary'] {
    if (results.length === 0) {
      return {
        totalUrls: 0,
        avgLighthousePerformance: 0,
        avgLcp: 0,
        avgFid: 0,
        avgCls: 0,
        passedThresholds: 0,
        failedThresholds: 0,
        criticalIssues: 0,
      };
    }

    const avgPerf = results.reduce((sum, r) => sum + r.lighthouseScores.performance, 0) / results.length;
    const avgLcp = results.reduce((sum, r) => sum + r.labCoreWebVitals.lcp, 0) / results.length;
    const avgFid = results.reduce((sum, r) => sum + r.labCoreWebVitals.fid, 0) / results.length;
    const avgCls = results.reduce((sum, r) => sum + r.labCoreWebVitals.cls, 0) / results.length;

    let passedThresholds = 0;
    let failedThresholds = 0;
    let criticalIssues = 0;

    if (thresholds) {
      results.forEach(result => {
        if (thresholds.lighthouse?.performance) {
          if (result.lighthouseScores.performance >= thresholds.lighthouse.performance) {
            passedThresholds++;
          } else {
            failedThresholds++;
          }
        }

        if (result.labCoreWebVitals.lcp > 4000 || result.labCoreWebVitals.fid > 300 || result.labCoreWebVitals.cls > 0.25) {
          criticalIssues++;
        }
      });
    }

    return {
      totalUrls: results.length,
      avgLighthousePerformance: Math.round(avgPerf),
      avgLcp: Math.round(avgLcp),
      avgFid: Math.round(avgFid),
      avgCls: Math.round(avgCls * 1000) / 1000,
      passedThresholds,
      failedThresholds,
      criticalIssues,
    };
  }

  /**
   * Generate optimization recommendations
   */
  private generateRecommendations(
    results: PerformanceResult[]
  ): PageSpeedAgentOutput['recommendations'] {
    const recommendations: PageSpeedAgentOutput['recommendations'] = [];

    // Analyze common issues across all results
    const avgLcp = results.reduce((sum, r) => sum + r.labCoreWebVitals.lcp, 0) / results.length;
    const avgFid = results.reduce((sum, r) => sum + r.labCoreWebVitals.fid, 0) / results.length;
    const avgCls = results.reduce((sum, r) => sum + r.labCoreWebVitals.cls, 0) / results.length;
    const avgTtfb = results.reduce((sum, r) => sum + r.labCoreWebVitals.ttfb, 0) / results.length;

    if (avgLcp > 2500) {
      recommendations.push({
        priority: 'high' as const,
        category: 'image_optimization' as const,
        title: '優化圖片載入',
        description: '平均 LCP 超過 2.5 秒，主要肇因通常是大型圖片',
        estimatedImpact: `可改善 LCP ${Math.round(avgLcp - 2000)}ms`,
      });
    }

    if (avgFid > 100) {
      recommendations.push({
        priority: 'high' as const,
        category: 'code_splitting' as const,
        title: '減少 JavaScript 執行時間',
        description: '平均 FID 超過 100ms，JavaScript 執行時間過長',
        estimatedImpact: `可改善 FID ${Math.round(avgFid - 80)}ms`,
      });
    }

    if (avgCls > 0.1) {
      recommendations.push({
        priority: 'medium' as const,
        category: 'rendering' as const,
        title: '修復版面配置偏移',
        description: '平均 CLS 超過 0.1，需為動態元素保留空間',
        estimatedImpact: `改善使用者體驗和 SEO 排名`,
      });
    }

    if (avgTtfb > 600) {
      recommendations.push({
        priority: 'high' as const,
        category: 'server_response' as const,
        title: '優化伺服器回應時間',
        description: '平均 TTFB 超過 600ms，伺服器回應過慢',
        estimatedImpact: `可改善所有 CWV 指標`,
      });
    }

    return recommendations;
  }
}
