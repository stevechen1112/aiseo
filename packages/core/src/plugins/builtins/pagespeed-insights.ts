/**
 * PageSpeed Insights API v5 Plugin
 *
 * Free tier: unlimited calls without API key (rate-limited)
 * With API key: 25,000 calls/day
 *
 * @see https://developers.google.com/speed/docs/insights/v5/get-started
 */

import type { ToolContext, ToolDefinition } from '../registry.js';

export interface PsiInput {
  url: string;
  strategy?: 'mobile' | 'desktop';
  categories?: ('performance' | 'accessibility' | 'best-practices' | 'seo')[];
}

export interface PsiOutput {
  url: string;
  strategy: 'mobile' | 'desktop';
  lighthouseScores: {
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number;
  };
  coreWebVitals: {
    lcp: number;
    fid: number;
    cls: number;
    fcp: number;
    ttfb: number;
    tbt: number;
  };
  fieldData?: {
    overallCategory: 'FAST' | 'AVERAGE' | 'SLOW';
    lcp?: { category: string; percentile: number };
    fid?: { category: string; percentile: number };
    cls?: { category: string; percentile: number };
  };
  opportunities: {
    title: string;
    description: string;
    potentialSavingsMs: number;
  }[];
  diagnostics: {
    title: string;
    description: string;
  }[];
}

export const pagespeedInsightsTool: ToolDefinition<PsiInput, PsiOutput> = {
  id: 'google.pagespeedInsights',
  description: 'Run Google PageSpeed Insights (Lighthouse) audit on a URL. Free, no API key required.',
  permissions: {
    networkAllowlist: ['www.googleapis.com'],
    fileSystem: 'read-only',
  },
  execute: async (input, _ctx: ToolContext) => {
    const strategy = input.strategy ?? 'mobile';
    const categories = input.categories ?? ['performance', 'accessibility', 'best-practices', 'seo'];

    const params = new URLSearchParams({
      url: input.url,
      strategy,
    });
    for (const cat of categories) {
      params.append('category', cat);
    }
    // Optional: use API key for higher quota
    const apiKey = process.env.GOOGLE_PSI_API_KEY;
    if (apiKey) {
      params.set('key', apiKey);
    }

    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`;
    const response = await fetch(apiUrl);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PageSpeed Insights API error: ${response.status} — ${errorText.substring(0, 300)}`);
    }

    const data = (await response.json()) as any;

    // Extract Lighthouse scores (0-100)
    const lhCategories = data.lighthouseResult?.categories ?? {};
    const lighthouseScores = {
      performance: Math.round((lhCategories.performance?.score ?? 0) * 100),
      accessibility: Math.round((lhCategories.accessibility?.score ?? 0) * 100),
      bestPractices: Math.round((lhCategories['best-practices']?.score ?? 0) * 100),
      seo: Math.round((lhCategories.seo?.score ?? 0) * 100),
    };

    // Extract Core Web Vitals from Lighthouse audits
    const audits = data.lighthouseResult?.audits ?? {};
    const coreWebVitals = {
      lcp: audits['largest-contentful-paint']?.numericValue ?? 0,
      fid: audits['max-potential-fid']?.numericValue ?? 0,
      cls: audits['cumulative-layout-shift']?.numericValue ?? 0,
      fcp: audits['first-contentful-paint']?.numericValue ?? 0,
      ttfb: audits['server-response-time']?.numericValue ?? 0,
      tbt: audits['total-blocking-time']?.numericValue ?? 0,
    };

    // Extract field data (CrUX) if available
    let fieldData: PsiOutput['fieldData'];
    const loadingExperience = data.loadingExperience;
    if (loadingExperience?.overall_category) {
      fieldData = {
        overallCategory: loadingExperience.overall_category as 'FAST' | 'AVERAGE' | 'SLOW',
        lcp: loadingExperience.metrics?.LARGEST_CONTENTFUL_PAINT_MS
          ? { category: loadingExperience.metrics.LARGEST_CONTENTFUL_PAINT_MS.category, percentile: loadingExperience.metrics.LARGEST_CONTENTFUL_PAINT_MS.percentile }
          : undefined,
        fid: loadingExperience.metrics?.FIRST_INPUT_DELAY_MS
          ? { category: loadingExperience.metrics.FIRST_INPUT_DELAY_MS.category, percentile: loadingExperience.metrics.FIRST_INPUT_DELAY_MS.percentile }
          : undefined,
        cls: loadingExperience.metrics?.CUMULATIVE_LAYOUT_SHIFT_SCORE
          ? { category: loadingExperience.metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE.category, percentile: loadingExperience.metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 }
          : undefined,
      };
    }

    // Extract performance opportunities
    const opportunities: PsiOutput['opportunities'] = [];
    for (const [, audit] of Object.entries(audits) as [string, any][]) {
      if (audit.details?.type === 'opportunity' && audit.details?.overallSavingsMs > 0) {
        opportunities.push({
          title: audit.title ?? '',
          description: audit.description ?? '',
          potentialSavingsMs: Math.round(audit.details.overallSavingsMs),
        });
      }
    }
    opportunities.sort((a, b) => b.potentialSavingsMs - a.potentialSavingsMs);

    // Extract diagnostics
    const diagnostics: PsiOutput['diagnostics'] = [];
    for (const [, audit] of Object.entries(audits) as [string, any][]) {
      if (audit.details?.type === 'table' && audit.score !== null && audit.score < 0.9) {
        diagnostics.push({
          title: audit.title ?? '',
          description: audit.description ?? '',
        });
      }
    }

    return {
      url: input.url,
      strategy,
      lighthouseScores,
      coreWebVitals,
      fieldData,
      opportunities: opportunities.slice(0, 10),
      diagnostics: diagnostics.slice(0, 10),
    };
  },
};
