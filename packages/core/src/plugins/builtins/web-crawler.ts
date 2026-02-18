/**
 * Web Crawler Plugin - Lightweight site crawler using http-fetch + Cheerio
 *
 * Recursively crawls pages within the same domain, extracting:
 * - Title, meta tags (description, og:*, twitter:*, canonical, robots)
 * - All internal/external links with anchor text
 * - Word count, h1/h2 headings
 * - Structured data (JSON-LD scripts)
 * - Language, status code
 *
 * Uses a BFS approach with depth/page limits and politeness delay.
 */

import * as cheerio from 'cheerio';
import type { ToolContext, ToolDefinition } from '../registry.js';

export interface CrawlPageInput {
  url: string;
  /** Max pages to crawl (default 50) */
  maxPages?: number;
  /** Max link depth (default 3) */
  maxDepth?: number;
  /** Include URL pattern (regex string). Only crawl URLs matching this pattern. */
  includePattern?: string;
  /** Exclude URL pattern (regex string). Skip URLs matching this pattern. */
  excludePattern?: string;
  /** Politeness delay between requests in ms (default 300) */
  delayMs?: number;
}

export interface CrawledPage {
  url: string;
  status: number;
  title: string;
  metaDescription: string;
  h1: string[];
  h2: string[];
  wordCount: number;
  lang: string;
  canonical: string;
  robots: string;
  ogTags: Record<string, string>;
  twitterTags: Record<string, string>;
  jsonLdSchemas: Record<string, unknown>[];
  internalLinks: { href: string; anchorText: string; isNoFollow: boolean }[];
  externalLinks: { href: string; anchorText: string; isNoFollow: boolean }[];
  depth: number;
}

export interface CrawlPageOutput {
  startUrl: string;
  pages: CrawledPage[];
  errors: { url: string; error: string }[];
  stats: {
    totalPages: number;
    totalInternalLinks: number;
    totalExternalLinks: number;
    maxDepthReached: number;
    durationMs: number;
  };
}

/** Parse a single HTML page and extract SEO-relevant data */
export function parsePage(
  url: string,
  html: string,
  status: number,
  depth: number,
  baseDomain: string,
): CrawledPage {
  const $ = cheerio.load(html);

  // Title
  const title = $('title').first().text().trim();

  // Meta tags
  const metaDescription = $('meta[name="description"]').attr('content')?.trim() ?? '';
  const canonical = $('link[rel="canonical"]').attr('href')?.trim() ?? '';
  const robots = $('meta[name="robots"]').attr('content')?.trim() ?? '';
  const lang = $('html').attr('lang')?.trim() ?? '';

  // OG tags
  const ogTags: Record<string, string> = {};
  $('meta[property^="og:"]').each((_i, el) => {
    const prop = $(el).attr('property') ?? '';
    const content = $(el).attr('content') ?? '';
    if (prop) ogTags[prop] = content;
  });

  // Twitter tags
  const twitterTags: Record<string, string> = {};
  $('meta[name^="twitter:"]').each((_i, el) => {
    const name = $(el).attr('name') ?? '';
    const content = $(el).attr('content') ?? '';
    if (name) twitterTags[name] = content;
  });

  // Headings
  const h1: string[] = [];
  $('h1').each((_i, el) => { h1.push($(el).text().trim()); });
  const h2: string[] = [];
  $('h2').each((_i, el) => { h2.push($(el).text().trim()); });

  // Word count (body text)
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const wordCount = bodyText.length > 0 ? bodyText.split(/\s+/).length : 0;

  // JSON-LD structured data
  const jsonLdSchemas: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_i, el) => {
    try {
      const raw = $(el).html();
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          jsonLdSchemas.push(...parsed);
        } else {
          jsonLdSchemas.push(parsed);
        }
      }
    } catch {
      // Skip malformed JSON-LD
    }
  });

  // Links
  const internalLinks: CrawledPage['internalLinks'] = [];
  const externalLinks: CrawledPage['externalLinks'] = [];

  $('a[href]').each((_i, el) => {
    const raw = $(el).attr('href') ?? '';
    const anchorText = $(el).text().trim().substring(0, 200);
    const rel = ($(el).attr('rel') ?? '').toLowerCase();
    const isNoFollow = rel.includes('nofollow');

    try {
      const resolved = new URL(raw, url);
      // Skip non-http(s), fragment-only, javascript: etc.
      if (!resolved.protocol.startsWith('http')) return;
      // Remove fragment
      resolved.hash = '';

      const linkDomain = resolved.hostname.replace(/^www\./, '');
      const cleanBaseDomain = baseDomain.replace(/^www\./, '');

      if (linkDomain === cleanBaseDomain || linkDomain.endsWith('.' + cleanBaseDomain)) {
        internalLinks.push({ href: resolved.href, anchorText, isNoFollow });
      } else {
        externalLinks.push({ href: resolved.href, anchorText, isNoFollow });
      }
    } catch {
      // Skip invalid URLs
    }
  });

  return {
    url,
    status,
    title,
    metaDescription,
    h1,
    h2,
    wordCount,
    lang,
    canonical,
    robots,
    ogTags,
    twitterTags,
    jsonLdSchemas,
    internalLinks,
    externalLinks,
    depth,
  };
}

export const webCrawlerTool: ToolDefinition<CrawlPageInput, CrawlPageOutput> = {
  id: 'web.crawler',
  description: 'Crawl a website (BFS) extracting SEO data: titles, meta, links, headings, structured data, word count.',
  permissions: {
    networkAllowlist: [], // All hosts allowed (dynamic crawling)
    fileSystem: 'read-only',
  },
  execute: async (input, _ctx: ToolContext) => {
    const maxPages = Math.min(input.maxPages ?? 50, 200);
    const maxDepth = Math.min(input.maxDepth ?? 3, 10);
    const delayMs = input.delayMs ?? 300;

    const startUrl = new URL(input.url);
    const baseDomain = startUrl.hostname;

    const includeRe = input.includePattern ? new RegExp(input.includePattern, 'i') : undefined;
    const excludeRe = input.excludePattern ? new RegExp(input.excludePattern, 'i') : undefined;

    const visited = new Set<string>();
    const pages: CrawledPage[] = [];
    const errors: CrawlPageOutput['errors'] = [];

    // BFS queue
    const queue: { url: string; depth: number }[] = [{ url: startUrl.href, depth: 0 }];

    const startTime = Date.now();

    while (queue.length > 0 && pages.length < maxPages) {
      const item = queue.shift()!;
      if (item.depth > maxDepth) continue;

      // Normalize URL (strip trailing slash for dedup, except root)
      let normalizedUrl = item.url;
      if (normalizedUrl.endsWith('/') && new URL(normalizedUrl).pathname !== '/') {
        normalizedUrl = normalizedUrl.slice(0, -1);
      }
      if (visited.has(normalizedUrl)) continue;
      visited.add(normalizedUrl);

      // Apply include/exclude patterns
      if (includeRe && !includeRe.test(normalizedUrl)) continue;
      if (excludeRe && excludeRe.test(normalizedUrl)) continue;

      try {
        const response = await fetch(normalizedUrl, {
          headers: {
            'User-Agent': 'AISEO-Crawler/1.0 (+https://aiseo.dev)',
            Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(15000),
        });

        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
          // Skip non-HTML resources
          continue;
        }

        const html = await response.text();
        const page = parsePage(normalizedUrl, html, response.status, item.depth, baseDomain);
        pages.push(page);

        // Enqueue internal links
        if (item.depth < maxDepth) {
          for (const link of page.internalLinks) {
            if (!visited.has(link.href) && !visited.has(link.href.replace(/\/$/, ''))) {
              queue.push({ url: link.href, depth: item.depth + 1 });
            }
          }
        }

        // Politeness delay
        if (delayMs > 0 && queue.length > 0) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      } catch (err) {
        errors.push({
          url: normalizedUrl,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const totalInternalLinks = pages.reduce((sum, p) => sum + p.internalLinks.length, 0);
    const totalExternalLinks = pages.reduce((sum, p) => sum + p.externalLinks.length, 0);
    const maxDepthReached = pages.length > 0 ? Math.max(...pages.map((p) => p.depth)) : 0;

    return {
      startUrl: input.url,
      pages,
      errors,
      stats: {
        totalPages: pages.length,
        totalInternalLinks,
        totalExternalLinks,
        maxDepthReached,
        durationMs: Date.now() - startTime,
      },
    };
  },
};
