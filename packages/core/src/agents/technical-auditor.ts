import { BaseAgent } from './base.js';
import type { AgentContext } from './types.js';
import * as cheerio from 'cheerio';

export type TechnicalAuditorInput = {
  url: string;
  checks?: Array<'lighthouse' | 'links' | 'meta' | 'mobile' | 'speed'>;
};

export type AuditIssue = {
  severity: 'critical' | 'warning' | 'info';
  category: 'performance' | 'seo' | 'accessibility' | 'best-practices' | 'structure';
  title: string;
  description: string;
  recommendation?: string;
  impact?: string;
};

export type LighthouseScores = {
  performance: number;
  seo: number;
  accessibility: number;
  bestPractices: number;
};

export type TechnicalAuditorOutput = {
  url: string;
  auditedAt: string;
  lighthouseScores?: LighthouseScores;
  issues: AuditIssue[];
  brokenLinks: string[];
  missingMetaTags: string[];
  mobileIssues: string[];
  coreWebVitals: {
    lcp?: number; // Largest Contentful Paint (ms)
    fid?: number; // First Input Delay (ms)
    cls?: number; // Cumulative Layout Shift
  };
  summary: {
    totalIssues: number;
    criticalCount: number;
    warningCount: number;
    infoCount: number;
  };
};

export class TechnicalAuditorAgent extends BaseAgent<TechnicalAuditorInput, TechnicalAuditorOutput> {
  readonly id = 'technical-auditor';
  readonly description = 'Automated technical SEO auditor using Lighthouse, link checker, and meta tag validation.';

  protected async execute(input: TechnicalAuditorInput, ctx: AgentContext): Promise<TechnicalAuditorOutput> {
    const url = input.url.trim();
    if (!url) {
      throw new Error('URL is required for technical audit');
    }

    const checks = input.checks ?? ['lighthouse', 'links', 'meta', 'mobile', 'speed'];
    const issues: AuditIssue[] = [];
    let lighthouseScores: LighthouseScores | undefined;
    let brokenLinks: string[] = [];
    let missingMetaTags: string[] = [];
    let mobileIssues: string[] = [];
    let coreWebVitals: { lcp?: number; fid?: number; cls?: number } = {};

    // Run Lighthouse audit if requested
    if (checks.includes('lighthouse')) {
      try {
        const lighthouseResult = await this.runLighthouseAudit(url, ctx);
        lighthouseScores = lighthouseResult.scores;
        issues.push(...lighthouseResult.issues);
        coreWebVitals = lighthouseResult.coreWebVitals;
      } catch (error) {
        issues.push({
          severity: 'warning',
          category: 'best-practices',
          title: 'Lighthouse 審計失敗',
          description: `無法執行 Lighthouse 審計: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    // Check for broken links
    if (checks.includes('links')) {
      brokenLinks = await this.checkBrokenLinks(url, ctx);
      if (brokenLinks.length > 0) {
        issues.push({
          severity: brokenLinks.length > 10 ? 'critical' : 'warning',
          category: 'structure',
          title: '發現損壞連結',
          description: `網站包含 ${brokenLinks.length} 個無效連結`,
          recommendation: '檢查並修復所有損壞的內部和外部連結',
          impact: '損壞的連結會影響使用者體驗和 SEO 排名',
        });
      }
    }

    // Validate meta tags
    if (checks.includes('meta')) {
      missingMetaTags = await this.checkMetaTags(url, ctx);
      if (missingMetaTags.length > 0) {
        issues.push({
          severity: 'warning',
          category: 'seo',
          title: '缺少關鍵 Meta 標籤',
          description: `缺少以下 meta 標籤: ${missingMetaTags.join(', ')}`,
          recommendation: '添加所有缺少的 meta 標籤以提升 SEO 效果',
          impact: 'Meta 標籤對搜尋引擎理解頁面內容至關重要',
        });
      }
    }

    // Check mobile usability
    if (checks.includes('mobile')) {
      mobileIssues = await this.checkMobileUsability(url, ctx);
      if (mobileIssues.length > 0) {
        issues.push({
          severity: 'warning',
          category: 'accessibility',
          title: '行動裝置可用性問題',
          description: `發現 ${mobileIssues.length} 個行動裝置相關問題`,
          recommendation: '優化行動裝置體驗，確保響應式設計',
          impact: 'Google 優先索引行動版本，行動裝置體驗直接影響排名',
        });
      }
    }

    // Calculate summary
    const summary = {
      totalIssues: issues.length,
      criticalCount: issues.filter((i) => i.severity === 'critical').length,
      warningCount: issues.filter((i) => i.severity === 'warning').length,
      infoCount: issues.filter((i) => i.severity === 'info').length,
    };

    return {
      url,
      auditedAt: new Date().toISOString(),
      lighthouseScores,
      issues,
      brokenLinks,
      missingMetaTags,
      mobileIssues,
      coreWebVitals,
      summary,
    };
  }

  private async runLighthouseAudit(
    url: string,
    ctx: AgentContext,
  ): Promise<{
    scores: LighthouseScores;
    issues: AuditIssue[];
    coreWebVitals: { lcp?: number; fid?: number; cls?: number };
  }> {
    // Call the real PageSpeed Insights API via registered tool
    const psi = await ctx.tools.run<
      import('../plugins/builtins/pagespeed-insights.js').PsiInput,
      import('../plugins/builtins/pagespeed-insights.js').PsiOutput
    >('google.pagespeedInsights', {
      url,
      strategy: 'mobile',
      categories: ['performance', 'accessibility', 'best-practices', 'seo'],
    }, ctx);

    const scores: LighthouseScores = {
      performance: psi.lighthouseScores.performance,
      seo: psi.lighthouseScores.seo,
      accessibility: psi.lighthouseScores.accessibility,
      bestPractices: psi.lighthouseScores.bestPractices,
    };

    const issues: AuditIssue[] = [];

    if (scores.performance < 50) {
      issues.push({
        severity: 'critical',
        category: 'performance',
        title: '效能分數過低',
        description: `效能分數僅 ${scores.performance}/100`,
        recommendation: '優化圖片、減少 JavaScript、啟用快取',
        impact: '緩慢的頁面速度會導致高跳出率和較低的轉換率',
      });
    } else if (scores.performance < 70) {
      issues.push({
        severity: 'warning',
        category: 'performance',
        title: '效能需要改善',
        description: `效能分數為 ${scores.performance}/100`,
        recommendation: '考慮壓縮資源、優化關鍵渲染路徑',
      });
    }

    if (scores.seo < 70) {
      issues.push({
        severity: 'critical',
        category: 'seo',
        title: 'SEO 分數不足',
        description: `SEO 分數僅 ${scores.seo}/100`,
        recommendation: '檢查 meta 標籤、結構化資料、標題層級',
        impact: 'SEO 問題會直接影響搜尋引擎排名',
      });
    }

    const coreWebVitals = {
      lcp: psi.coreWebVitals.lcp,
      fid: psi.coreWebVitals.fid,
      cls: psi.coreWebVitals.cls,
    };

    if (coreWebVitals.lcp > 2500) {
      issues.push({
        severity: 'warning',
        category: 'performance',
        title: 'LCP 需要優化',
        description: `Largest Contentful Paint (LCP) 為 ${Math.round(coreWebVitals.lcp)}ms (目標 < 2500ms)`,
        recommendation: '優化主要內容載入速度',
      });
    }

    if (coreWebVitals.cls > 0.1) {
      issues.push({
        severity: 'warning',
        category: 'performance',
        title: 'CLS 需要改善',
        description: `Cumulative Layout Shift (CLS) 為 ${coreWebVitals.cls.toFixed(3)} (目標 < 0.1)`,
        recommendation: '為圖片和嵌入內容設定明確尺寸',
      });
    }

    // Add opportunity-based issues from PSI
    for (const opp of psi.opportunities.slice(0, 5)) {
      issues.push({
        severity: opp.potentialSavingsMs > 500 ? 'warning' : 'info',
        category: 'performance',
        title: opp.title,
        description: opp.description,
        recommendation: `可節省約 ${opp.potentialSavingsMs}ms`,
      });
    }

    return { scores, issues, coreWebVitals };
  }

  private async checkBrokenLinks(url: string, ctx: AgentContext): Promise<string[]> {
    // Fetch the page HTML and check all links for broken ones
    const brokenLinks: string[] = [];
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'AISEO-Auditor/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return [];
      const html = await res.text();
      const $ = cheerio.load(html);

      const links: string[] = [];
      $('a[href]').each((_i, el) => {
        const href = $(el).attr('href') ?? '';
        try {
          const resolved = new URL(href, url);
          if (resolved.protocol.startsWith('http')) {
            links.push(resolved.href);
          }
        } catch { /* skip invalid */ }
      });

      // Check up to 20 links in parallel (HEAD requests)
      const uniqueLinks = [...new Set(links)].slice(0, 20);
      const results = await Promise.allSettled(
        uniqueLinks.map(async (link) => {
          const r = await fetch(link, {
            method: 'HEAD',
            redirect: 'follow',
            signal: AbortSignal.timeout(8000),
          });
          if (r.status >= 400) return link;
          return null;
        }),
      );

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          brokenLinks.push(r.value);
        } else if (r.status === 'rejected') {
          // Network error = effectively broken
        }
      }
    } catch { /* page fetch failed */ }

    return brokenLinks;
  }

  private async checkMetaTags(url: string, ctx: AgentContext): Promise<string[]> {
    // Fetch page and check for important meta tags using Cheerio
    const missingTags: string[] = [];
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'AISEO-Auditor/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return ['(page unreachable)'];
      const html = await res.text();
      const $ = cheerio.load(html);

      if (!$('title').text().trim()) missingTags.push('title');
      if (!$('meta[name="description"]').attr('content')?.trim()) missingTags.push('meta description');
      if (!$('meta[name="viewport"]').attr('content')?.trim()) missingTags.push('viewport');
      if (!$('link[rel="canonical"]').attr('href')?.trim()) missingTags.push('canonical');
      if (!$('meta[property="og:title"]').attr('content')?.trim()) missingTags.push('og:title');
      if (!$('meta[property="og:description"]').attr('content')?.trim()) missingTags.push('og:description');
      if (!$('meta[property="og:image"]').attr('content')?.trim()) missingTags.push('og:image');
      if (!$('meta[name="twitter:card"]').attr('content')?.trim()) missingTags.push('twitter:card');

      // Check heading structure
      const h1Count = $('h1').length;
      if (h1Count === 0) missingTags.push('h1 (缺少主標題)');
      else if (h1Count > 1) missingTags.push(`h1 (使用了 ${h1Count} 個，建議僅 1 個)`);
    } catch { /* page fetch failed */ }

    return missingTags;
  }

  private async checkMobileUsability(url: string, ctx: AgentContext): Promise<string[]> {
    // Use PSI mobile strategy to detect mobile issues
    const issues: string[] = [];
    try {
      const psi = await ctx.tools.run<
        import('../plugins/builtins/pagespeed-insights.js').PsiInput,
        import('../plugins/builtins/pagespeed-insights.js').PsiOutput
      >('google.pagespeedInsights', {
        url,
        strategy: 'mobile',
        categories: ['performance', 'accessibility'],
      }, ctx);

      if (psi.lighthouseScores.performance < 50) {
        issues.push(`行動版效能分數過低: ${psi.lighthouseScores.performance}/100`);
      }
      if (psi.coreWebVitals.lcp > 4000) {
        issues.push(`行動版 LCP 過慢: ${Math.round(psi.coreWebVitals.lcp)}ms`);
      }
      if (psi.coreWebVitals.cls > 0.25) {
        issues.push(`行動版 CLS 過高: ${psi.coreWebVitals.cls.toFixed(3)}`);
      }
      if (psi.coreWebVitals.tbt > 600) {
        issues.push(`行動版 TBT 過高: ${Math.round(psi.coreWebVitals.tbt)}ms`);
      }
    } catch (err) {
      issues.push(`無法取得行動版數據: ${err instanceof Error ? err.message : String(err)}`);
    }
    return issues;
  }
}
