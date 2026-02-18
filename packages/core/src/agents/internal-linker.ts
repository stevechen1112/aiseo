/**
 * InternalLinkerAgent - Internal Link Analysis & Recommendation Engine
 * 
 * Features:
 * - Crawl website to build internal link graph
 * - Detect orphan pages (pages with no internal links pointing to them)
 * - Generate semantic-based internal link suggestions
 * - Recommend optimal anchor text for internal links
 * - Track internal link health metrics
 * 
 * Phase 2 Task 3.7
 */

import { BaseAgent } from './base.js';
import type { AgentContext } from './types.js';
import { EventBus } from '../event-bus/bus.js';
import { parsePage } from '../plugins/builtins/web-crawler.js';

interface PageNode {
  url: string;
  title: string;
  wordCount: number;
  keywords: string[];
  inboundLinks: number;
  outboundLinks: number;
  isOrphan: boolean;
  pageDepth: number;
}

interface InternalLink {
  fromUrl: string;
  toUrl: string;
  anchorText: string;
  context: string;
  isNoFollow: boolean;
}

interface LinkSuggestion {
  suggestionId: string;
  fromPage: PageNode;
  toPage: PageNode;
  relevanceScore: number;
  priority: 'high' | 'medium' | 'low';
  reason: string;
  suggestedAnchorTexts: string[];
  suggestedContext: string;
  expectedBenefits: string[];
}

interface InternalLinkerInput {
  operation: 'analyze' | 'suggest' | 'detect_orphans' | 'audit';
  siteUrl: string;
  maxDepth?: number;
  maxPages?: number;
  includeExternal?: boolean;
  filters?: {
    includePattern?: string;
    excludePattern?: string;
    minWordCount?: number;
  };
}

interface InternalLinkerOutput {
  operation: string;
  siteUrl: string;
  crawlSummary: {
    totalPages: number;
    totalInternalLinks: number;
    orphanPages: number;
    avgLinksPerPage: number;
    maxDepthReached: number;
    crawlDuration: number;
  };
  pages?: PageNode[];
  links?: InternalLink[];
  orphanPages?: PageNode[];
  suggestions?: LinkSuggestion[];
  healthMetrics?: {
    orphanPagesRatio: number;
    avgInboundLinksPerPage: number;
    avgOutboundLinksPerPage: number;
    pagesWithNoOutboundLinks: number;
    pagesWithTooManyLinks: number;
    recommendedActions: string[];
  };
}

export class InternalLinkerAgent extends BaseAgent<InternalLinkerInput, InternalLinkerOutput> {
  id = 'internal-linker';
  name = 'internal-linker';
  description = 'Analyze internal links structure and generate linking recommendations';

  constructor(private eventBus: EventBus) {
    super();
  }

  async execute(
    input: InternalLinkerInput,
    context: AgentContext
  ): Promise<InternalLinkerOutput> {
    const maxDepth = input.maxDepth ?? 5;
    const maxPages = input.maxPages ?? 1000;

    const startTime = Date.now();

    // Crawl website to build page graph
    const { pages, links } = await this.crawlSite(
      input.siteUrl,
      maxDepth,
      maxPages,
      input.filters,
      context
    );

    // Calculate link metrics
    pages.forEach(page => {
      page.inboundLinks = links.filter(link => link.toUrl === page.url).length;
      page.outboundLinks = links.filter(link => link.fromUrl === page.url).length;
      page.isOrphan = page.inboundLinks === 0 && page.url !== input.siteUrl;
    });

    const orphanPages = pages.filter(p => p.isOrphan);

    const crawlDuration = Date.now() - startTime;
    const crawlSummary = {
      totalPages: pages.length,
      totalInternalLinks: links.length,
      orphanPages: orphanPages.length,
      avgLinksPerPage: pages.length > 0 ? links.length / pages.length : 0,
      maxDepthReached: Math.max(...pages.map(p => p.pageDepth), 0),
      crawlDuration,
    };

    const output: InternalLinkerOutput = {
      operation: input.operation,
      siteUrl: input.siteUrl,
      crawlSummary,
    };

    switch (input.operation) {
      case 'analyze':
        output.pages = pages;
        output.links = links;
        output.healthMetrics = this.calculateHealthMetrics(pages, links);
        break;

      case 'suggest':
        output.suggestions = await this.generateLinkSuggestions(pages, links, context);
        break;

      case 'detect_orphans':
        output.orphanPages = orphanPages;
        break;

      case 'audit':
        output.pages = pages;
        output.links = links;
        output.orphanPages = orphanPages;
        output.healthMetrics = this.calculateHealthMetrics(pages, links);
        output.suggestions = await this.generateLinkSuggestions(pages, links, context);
        break;
    }

    return output;
  }

  /**
   * Crawl website to build internal link graph using real HTTP fetches + Cheerio
   */
  private async crawlSite(
    siteUrl: string,
    maxDepth: number,
    maxPages: number,
    filters: InternalLinkerInput['filters'] | undefined,
    context: AgentContext
  ): Promise<{ pages: PageNode[]; links: InternalLink[] }> {
    const baseDomain = new URL(siteUrl).hostname.replace(/^www\./, '');
    const visited = new Set<string>();
    const pages: PageNode[] = [];
    const links: InternalLink[] = [];

    const includeRe = filters?.includePattern ? new RegExp(filters.includePattern, 'i') : undefined;
    const excludeRe = filters?.excludePattern ? new RegExp(filters.excludePattern, 'i') : undefined;

    // BFS queue
    const queue: { url: string; depth: number }[] = [{ url: siteUrl, depth: 0 }];

    while (queue.length > 0 && pages.length < Math.min(maxPages, 100)) {
      const item = queue.shift()!;
      if (item.depth > maxDepth) continue;

      let normalizedUrl = item.url;
      if (normalizedUrl.endsWith('/') && new URL(normalizedUrl).pathname !== '/') {
        normalizedUrl = normalizedUrl.slice(0, -1);
      }
      if (visited.has(normalizedUrl)) continue;
      visited.add(normalizedUrl);

      if (includeRe && !includeRe.test(normalizedUrl)) continue;
      if (excludeRe && excludeRe.test(normalizedUrl)) continue;

      try {
        const res = await fetch(normalizedUrl, {
          headers: { 'User-Agent': 'AISEO-Linker/1.0', Accept: 'text/html,*/*;q=0.8' },
          redirect: 'follow',
          signal: AbortSignal.timeout(12000),
        });

        const ct = res.headers.get('content-type') ?? '';
        if (!ct.includes('text/html')) continue;

        const html = await res.text();
        const crawled = parsePage(normalizedUrl, html, res.status, item.depth, baseDomain);

        // Apply min word count filter
        if (filters?.minWordCount && crawled.wordCount < filters.minWordCount) continue;

        // Extract top keywords from headings and title
        const titleWords = (crawled.title + ' ' + crawled.h1.join(' ') + ' ' + crawled.h2.join(' '))
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 1);
        const keywordFreq = new Map<string, number>();
        for (const w of titleWords) keywordFreq.set(w, (keywordFreq.get(w) ?? 0) + 1);
        const topKeywords = [...keywordFreq.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([k]) => k);

        const pageNode: PageNode = {
          url: normalizedUrl,
          title: crawled.title,
          wordCount: crawled.wordCount,
          keywords: topKeywords,
          inboundLinks: 0,
          outboundLinks: crawled.internalLinks.length,
          isOrphan: false,
          pageDepth: item.depth,
        };
        pages.push(pageNode);

        // Collect internal links with surrounding context
        for (const link of crawled.internalLinks) {
          links.push({
            fromUrl: normalizedUrl,
            toUrl: link.href,
            anchorText: link.anchorText.substring(0, 100),
            context: `Link from "${crawled.title}"`,
            isNoFollow: link.isNoFollow,
          });

          // Enqueue for further crawling
          if (item.depth < maxDepth && !visited.has(link.href) && !visited.has(link.href.replace(/\/$/, ''))) {
            queue.push({ url: link.href, depth: item.depth + 1 });
          }
        }

        // Politeness delay
        await new Promise((r) => setTimeout(r, 250));
      } catch {
        // Skip unreachable pages
      }
    }

    return { pages, links };
  }

  /**
   * Generate internal link suggestions based on semantic relevance
   */
  private async generateLinkSuggestions(
    pages: PageNode[],
    existingLinks: InternalLink[],
    context: AgentContext
  ): Promise<LinkSuggestion[]> {
    const suggestions: LinkSuggestion[] = [];

    // Find pages that could benefit from more internal links
    const lowLinkPages = pages.filter(p => p.inboundLinks < 3 && !p.isOrphan);
    const orphanPages = pages.filter(p => p.isOrphan);

    // Priority 1: Link to orphan pages
    for (const orphan of orphanPages) {
      const relevantPages = pages.filter(p => 
        !p.isOrphan && 
        p.url !== orphan.url &&
        this.calculateSemanticRelevance(p, orphan) > 0.3
      ).slice(0, 3);

      relevantPages.forEach(fromPage => {
        const relevanceScore = this.calculateSemanticRelevance(fromPage, orphan);
        suggestions.push({
          suggestionId: `ls_${Date.now()}_${suggestions.length}`,
          fromPage,
          toPage: orphan,
          relevanceScore,
          priority: 'high' as const,
          reason: `Orphan page "${orphan.title}" needs internal links`,
          suggestedAnchorTexts: this.generateAnchorTextSuggestions(orphan),
          suggestedContext: `Consider adding a link to ${orphan.title} in a relevant section`,
          expectedBenefits: [
            'Helps search engines discover the page',
            'Improves internal PageRank distribution',
            'Better user navigation',
          ],
        });
      });
    }

    // Priority 2: Strengthen connections for low-link pages
    for (const page of lowLinkPages) {
      const relevantPages = pages.filter(p => 
        p.url !== page.url &&
        p.outboundLinks < 10 && // Don't suggest pages that already have too many links
        this.calculateSemanticRelevance(p, page) > 0.4 &&
        !existingLinks.some(link => link.fromUrl === p.url && link.toUrl === page.url)
      ).slice(0, 2);

      relevantPages.forEach(fromPage => {
        const relevanceScore = this.calculateSemanticRelevance(fromPage, page);
        suggestions.push({
          suggestionId: `ls_${Date.now()}_${suggestions.length}`,
          fromPage,
          toPage: page,
          relevanceScore,
          priority: 'medium' as const,
          reason: `Page "${page.title}" has only ${page.inboundLinks} internal links`,
          suggestedAnchorTexts: this.generateAnchorTextSuggestions(page),
          suggestedContext: `This ${fromPage.title} page discusses related topics`,
          expectedBenefits: [
            'Strengthens topical relevance',
            'Improves crawl efficiency',
            'Better content discoverability',
          ],
        });
      });
    }

    // Sort by priority and relevance
    return suggestions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return b.relevanceScore - a.relevanceScore;
    });
  }

  /**
   * Calculate semantic relevance between two pages (0-1)
   */
  private calculateSemanticRelevance(page1: PageNode, page2: PageNode): number {
    // Simple keyword overlap algorithm (real implementation would use embeddings/NLP)
    const keywords1 = new Set(page1.keywords);
    const keywords2 = new Set(page2.keywords);

    const intersection = new Set([...keywords1].filter(k => keywords2.has(k)));
    const union = new Set([...keywords1, ...keywords2]);

    const jaccardSimilarity = intersection.size / union.size;
    return jaccardSimilarity;
  }

  /**
   * Generate anchor text suggestions based on page content
   */
  private generateAnchorTextSuggestions(page: PageNode): string[] {
    // MVP: Use page title and keywords (real implementation would analyze content)
    const suggestions: string[] = [];

    // Use page title (truncated)
    if (page.title) {
      suggestions.push(page.title);
      const shortTitle = (page.title.split('-')[0] ?? page.title).trim();
      if (shortTitle !== page.title) {
        suggestions.push(shortTitle);
      }
    }

    // Use top keywords
    if (page.keywords.length > 0) {
      suggestions.push(page.keywords.slice(0, 2).join(' '));
      suggestions.push(page.keywords[0]!);
    }

    // Add semantic variations
    if (page.keywords.includes('seo')) {
      suggestions.push('SEO optimization');
      suggestions.push('search engine optimization');
    }

    return [...new Set(suggestions)].slice(0, 5);
  }

  /**
   * Calculate internal link health metrics
   */
  private calculateHealthMetrics(
    pages: PageNode[],
    links: InternalLink[]
  ): InternalLinkerOutput['healthMetrics'] {
    const orphanPages = pages.filter(p => p.isOrphan).length;
    const pagesWithNoOutbound = pages.filter(p => p.outboundLinks === 0).length;
    const pagesWithTooManyLinks = pages.filter(p => p.outboundLinks > 100).length;

    const avgInbound = pages.length > 0
      ? pages.reduce((sum, p) => sum + p.inboundLinks, 0) / pages.length
      : 0;

    const avgOutbound = pages.length > 0
      ? pages.reduce((sum, p) => sum + p.outboundLinks, 0) / pages.length
      : 0;

    const orphanRatio = pages.length > 0 ? orphanPages / pages.length : 0;

    const recommendedActions: string[] = [];

    if (orphanRatio > 0.1) {
      recommendedActions.push(`修復 ${orphanPages} 個 Orphan Pages（佔 ${(orphanRatio * 100).toFixed(1)}%）`);
    }

    if (avgInbound < 2) {
      recommendedActions.push('增加內部連結數量，提升頁面可見度');
    }

    if (pagesWithNoOutbound > pages.length * 0.2) {
      recommendedActions.push(`${pagesWithNoOutbound} 個頁面沒有任何 Outbound Links，考慮加入相關連結`);
    }

    if (pagesWithTooManyLinks > 0) {
      recommendedActions.push(`${pagesWithTooManyLinks} 個頁面連結過多（>100），可能稀釋 Link Equity`);
    }

    if (avgOutbound < 3) {
      recommendedActions.push('增加內部連結深度，改善網站結構');
    }

    return {
      orphanPagesRatio: orphanRatio,
      avgInboundLinksPerPage: Math.round(avgInbound * 10) / 10,
      avgOutboundLinksPerPage: Math.round(avgOutbound * 10) / 10,
      pagesWithNoOutboundLinks: pagesWithNoOutbound,
      pagesWithTooManyLinks: pagesWithTooManyLinks,
      recommendedActions,
    };
  }
}
