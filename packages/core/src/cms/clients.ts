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

    const response = await fetch(`${this.baseUrl}/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.authHeader,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`WordPress publish failed (${response.status}): ${errBody}`);
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
    const response = await fetch(`${this.baseUrl}/posts/${postId}`, {
      headers: { Authorization: this.authHeader },
    });

    if (!response.ok) {
      throw new Error(`WordPress getPost failed (${response.status})`);
    }

    return response.json() as Promise<{ id: number; status: string; link: string }>;
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
    const blogRes = await fetch(`${this.baseUrl}/blogs.json?limit=1`, {
      headers: { 'X-Shopify-Access-Token': this.config.accessToken },
    });

    if (!blogRes.ok) {
      throw new Error(`Shopify blogs list failed (${blogRes.status})`);
    }

    const blogData = (await blogRes.json()) as { blogs: Array<{ id: number }> };
    const blogId = blogData.blogs[0]?.id;
    if (!blogId) throw new Error('No Shopify blog found');

    const response = await fetch(`${this.baseUrl}/blogs/${blogId}/articles.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': this.config.accessToken,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`Shopify publish failed (${response.status}): ${errBody}`);
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
