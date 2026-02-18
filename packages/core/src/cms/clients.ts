/**
 * CMS publish integration — WordPress REST API + Shopify Admin API clients.
 * Provides a unified publish interface for approved content drafts.
 */

export interface CmsPublishInput {
  title: string;
  content: string;                // HTML or Markdown
  excerpt?: string;
  status?: 'draft' | 'publish';
  categories?: string[];
  tags?: string[];
  metaDescription?: string;
  slug?: string;
}

export interface CmsPublishResult {
  ok: boolean;
  provider: 'wordpress' | 'shopify';
  externalId: string;
  url: string;
  publishedAt: string;
}

// ── Structured CMS error ───────────────────────────────────────────
export class CmsError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly provider: 'wordpress' | 'shopify',
    public readonly body?: string,
  ) {
    super(message);
    this.name = 'CmsError';
  }

  /** True when the caller should not retry (auth error, bad request). */
  get isTerminal(): boolean {
    return this.statusCode === 401 || this.statusCode === 403 || this.statusCode === 404 || (this.statusCode >= 400 && this.statusCode < 500);
  }

  /** True when the caller may retry (rate-limit, server error). */
  get isRetryable(): boolean {
    return this.statusCode === 429 || this.statusCode >= 500;
  }
}

// ── Fetch with timeout + retry helper ─────────────────────────────
const DEFAULT_FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 3;
const RETRY_BACKOFF_BASE_MS = 500;

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: { maxRetries?: number; timeoutMs?: number } = {},
): Promise<Response> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;

  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });

      // On rate-limit or 5xx, retry after backoff (unless terminal attempt)
      if ((response.status === 429 || response.status >= 500) && attempt < maxRetries - 1) {
        const retryAfter = Number(response.headers.get('Retry-After') ?? 0) * 1000;
        const backoff = retryAfter || RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }

      return response;
    } catch (err) {
      lastError = err;
      if (err instanceof Error && err.name === 'AbortError') {
        lastError = new Error(`CMS request timed out after ${timeoutMs}ms`);
      }
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt)));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}

// ── WordPress REST API Client ──────────────────────────────────────
export interface WordPressConfig {
  siteUrl: string;        // e.g. https://example.com
  username: string;
  applicationPassword: string;  // WP Application Password
}

export class WordPressClient {
  constructor(private readonly config: WordPressConfig) {}

  private get baseUrl() {
    return `${this.config.siteUrl.replace(/\/$/, '')}/wp-json/wp/v2`;
  }

  private get authHeader() {
    const encoded = Buffer.from(`${this.config.username}:${this.config.applicationPassword}`).toString('base64');
    return `Basic ${encoded}`;
  }

  async publish(input: CmsPublishInput): Promise<CmsPublishResult> {
    const body: Record<string, unknown> = {
      title: input.title,
      content: input.content,
      status: input.status ?? 'draft',
    };

    if (input.excerpt) body.excerpt = input.excerpt;
    if (input.slug) body.slug = input.slug;

    const response = await fetchWithRetry(`${this.baseUrl}/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.authHeader,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new CmsError(`WordPress publish failed (${response.status}): ${errBody}`, response.status, 'wordpress', errBody);
    }

    const data = (await response.json()) as { id: number; link: string; date: string };

    return {
      ok: true,
      provider: 'wordpress',
      externalId: String(data.id),
      url: data.link,
      publishedAt: data.date,
    };
  }

  async getPost(postId: string): Promise<{ id: number; status: string; link: string }> {
    const response = await fetchWithRetry(`${this.baseUrl}/posts/${postId}`, {
      headers: { Authorization: this.authHeader },
    });

    if (!response.ok) {
      throw new CmsError(`WordPress getPost failed (${response.status})`, response.status, 'wordpress');
    }

    return response.json() as Promise<{ id: number; status: string; link: string }>;
  }

  /** Verify credentials by fetching the /users/me endpoint. */
  async testConnection(): Promise<{ ok: boolean; displayName?: string }> {
    try {
      const response = await fetchWithRetry(`${this.baseUrl}/users/me`, {
        headers: { Authorization: this.authHeader },
      }, { maxRetries: 1 });

      if (!response.ok) {
        return { ok: false };
      }
      const data = (await response.json()) as { name?: string };
      return { ok: true, displayName: data.name };
    } catch {
      return { ok: false };
    }
  }
}

// ── Shopify Admin API Client ───────────────────────────────────────
export interface ShopifyConfig {
  shopDomain: string;      // e.g. my-store.myshopify.com
  accessToken: string;     // Shopify Admin API access token
  apiVersion?: string;     // e.g. 2024-01
}

export class ShopifyClient {
  private readonly apiVersion: string;

  constructor(private readonly config: ShopifyConfig) {
    this.apiVersion = config.apiVersion ?? '2024-01';
  }

  private get baseUrl() {
    return `https://${this.config.shopDomain}/admin/api/${this.apiVersion}`;
  }

  async publish(input: CmsPublishInput): Promise<CmsPublishResult> {
    const body = {
      article: {
        title: input.title,
        body_html: input.content,
        published: input.status === 'publish',
        summary_html: input.excerpt ?? '',
        tags: input.tags?.join(', ') ?? '',
      },
    };

    // Get first blog ID
    const blogRes = await fetchWithRetry(`${this.baseUrl}/blogs.json?limit=1`, {
      headers: { 'X-Shopify-Access-Token': this.config.accessToken },
    });

    if (!blogRes.ok) {
      const errBody = await blogRes.text().catch(() => '');
      throw new CmsError(`Shopify blogs list failed (${blogRes.status}): ${errBody}`, blogRes.status, 'shopify', errBody);
    }

    const blogData = (await blogRes.json()) as { blogs: Array<{ id: number }> };
    const blogId = blogData.blogs[0]?.id;
    if (!blogId) throw new CmsError('No Shopify blog found', 404, 'shopify');

    const response = await fetchWithRetry(`${this.baseUrl}/blogs/${blogId}/articles.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': this.config.accessToken,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new CmsError(`Shopify publish failed (${response.status}): ${errBody}`, response.status, 'shopify', errBody);
    }

    const data = (await response.json()) as {
      article: { id: number; published_at: string };
    };

    return {
      ok: true,
      provider: 'shopify',
      externalId: String(data.article.id),
      url: `https://${this.config.shopDomain}/blogs/${blogId}/articles/${data.article.id}`,
      publishedAt: data.article.published_at ?? new Date().toISOString(),
    };
  }

  /** Verify credentials by listing blogs (1 result). */
  async testConnection(): Promise<{ ok: boolean; shopName?: string }> {
    try {
      const response = await fetchWithRetry(`${this.baseUrl}/shop.json`, {
        headers: { 'X-Shopify-Access-Token': this.config.accessToken },
      }, { maxRetries: 1 });

      if (!response.ok) return { ok: false };
      const data = (await response.json()) as { shop?: { name?: string } };
      return { ok: true, shopName: data.shop?.name };
    } catch {
      return { ok: false };
    }
  }
}

// ── Unified CMS publish function ───────────────────────────────────
export type CmsProvider = 'wordpress' | 'shopify';

export interface CmsConfig {
  provider: CmsProvider;
  wordpress?: WordPressConfig;
  shopify?: ShopifyConfig;
}

export async function publishToCms(config: CmsConfig, input: CmsPublishInput): Promise<CmsPublishResult> {
  switch (config.provider) {
    case 'wordpress': {
      if (!config.wordpress) throw new Error('WordPress config missing');
      const wp = new WordPressClient(config.wordpress);
      return wp.publish(input);
    }
    case 'shopify': {
      if (!config.shopify) throw new Error('Shopify config missing');
      const shopify = new ShopifyClient(config.shopify);
      return shopify.publish(input);
    }
    default:
      throw new Error(`Unsupported CMS provider: ${config.provider}`);
  }
}
