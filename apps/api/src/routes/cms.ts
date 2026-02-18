import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { requirePermission } from '../utils/authz.js';

// ── Helpers ────────────────────────────────────────────────────────
async function requireDb(req: { dbClient?: import('pg').PoolClient }) {
  if (!req.dbClient) {
    const error = new Error('DB not available');
    (error as Error & { statusCode: number }).statusCode = 500;
    throw error;
  }
  return req.dbClient;
}

async function resolveDefaultProjectId(client: import('pg').PoolClient): Promise<string> {
  const row = await client.query('SELECT id FROM projects ORDER BY updated_at DESC, created_at DESC LIMIT 1');
  if (row.rowCount === 0) {
    const error = new Error('No project found for tenant');
    (error as Error & { statusCode: number }).statusCode = 404;
    throw error;
  }
  return String(row.rows[0].id);
}

function safeJsonObject(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

// ── Schemas ────────────────────────────────────────────────────────
const publishParamsSchema = z.object({
  id: z.string().uuid(),
});

const publishBodySchema = z.object({
  provider: z.enum(['wordpress', 'shopify']),
  publishStatus: z.enum(['draft', 'publish']).default('draft'),
});

const cmsConfigSchema = z.object({
  provider: z.enum(['wordpress', 'shopify']),
  wordpress: z
    .object({
      siteUrl: z.string().url(),
      username: z.string().min(1),
      applicationPassword: z.string().min(1),
    })
    .optional(),
  shopify: z
    .object({
      shopDomain: z.string().min(1),
      accessToken: z.string().min(1),
      apiVersion: z.string().optional(),
    })
    .optional(),
});

// ── Routes ─────────────────────────────────────────────────────────
export const cmsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /api/content/:id/publish
   * Publishes an approved content draft to the configured CMS.
   */
  fastify.post(
    '/api/content/:id/publish',
    {
      schema: {
        tags: ['cms'],
        description: 'Publish an approved content draft to the configured CMS (or mock publish in MVP).',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
          additionalProperties: true,
        },
        body: {
          type: 'object',
          properties: {
            provider: { type: 'string', enum: ['wordpress', 'shopify'] },
            publishStatus: { type: 'string', enum: ['draft', 'publish'], default: 'draft' },
          },
          required: ['provider'],
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              id: { type: 'string' },
              provider: { type: 'string' },
              externalId: { type: 'string' },
              url: { type: 'string' },
              publishedAt: { type: 'string' },
            },
            required: ['ok', 'id', 'provider', 'externalId', 'url', 'publishedAt'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    requirePermission(req, 'content.publish');
    const client = await requireDb(req);
    const params = publishParamsSchema.parse((req as any).params ?? {});
    const body = publishBodySchema.parse(req.body ?? {});

    // Get the draft
    const draftRow = await client.query(
      `SELECT id, project_id, title, sections, meta_description, primary_keyword, status
       FROM content_drafts WHERE id = $1 LIMIT 1`,
      [params.id],
    );

    if ((draftRow.rowCount ?? 0) === 0) {
      const error = new Error('Content draft not found');
      (error as Error & { statusCode: number }).statusCode = 404;
      throw error;
    }

    const draft = draftRow.rows[0] as any;

    if (draft.status !== 'approved' && draft.status !== 'published') {
      const error = new Error(`Cannot publish: status is '${draft.status}', must be 'approved'`);
      (error as Error & { statusCode: number }).statusCode = 400;
      throw error;
    }

    // Get CMS config from project settings
    const projRow = await client.query('SELECT settings FROM projects WHERE id = $1', [draft.project_id]);
    const settings = safeJsonObject(projRow.rows[0]?.settings);
    const cmsSettings = safeJsonObject(settings.cms);

    // Build content from sections
    const sections = Array.isArray(draft.sections) ? draft.sections : [];
    const htmlContent = sections
      .map((s: any) => {
        const content = s?.content ?? '';
        return `<div>${String(content).replace(/\n/g, '<br/>')}</div>`;
      })
      .join('\n');

    // Attempt CMS publish (MVP: mock response when no real CMS configured)
    const hasCmsConfig = cmsSettings.provider && (cmsSettings.wordpress || cmsSettings.shopify);

    let publishResult: { externalId: string; url: string; publishedAt: string };

    if (hasCmsConfig) {
      try {
        const { publishToCms } = await import('@aiseo/core');
        const config = cmsConfigSchema.parse(cmsSettings);
        const result = await publishToCms(config, {
          title: String(draft.title),
          content: htmlContent,
          excerpt: draft.meta_description ? String(draft.meta_description) : undefined,
          status: body.publishStatus,
          slug: String(draft.primary_keyword ?? draft.title).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        });
        publishResult = { externalId: result.externalId, url: result.url, publishedAt: result.publishedAt };
      } catch (err) {
        const error = new Error(`CMS publish failed: ${err instanceof Error ? err.message : String(err)}`);
        (error as Error & { statusCode: number }).statusCode = 502;
        throw error;
      }
    } else {
      // MVP fallback: simulate publish
      publishResult = {
        externalId: `mock-${Date.now()}`,
        url: `https://example.com/blog/${String(draft.primary_keyword ?? 'post').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        publishedAt: new Date().toISOString(),
      };
    }

    // Update draft status to published + store publish URL
    await client.query(
      `UPDATE content_drafts
       SET status = 'published',
           published_url = $2,
           published_at = now(),
           updated_at = now()
       WHERE id = $1`,
      [params.id, publishResult.url],
    );

    return {
      ok: true,
      id: params.id,
      provider: body.provider,
      externalId: publishResult.externalId,
      url: publishResult.url,
      publishedAt: publishResult.publishedAt,
    };
    },
  );

  /**
   * GET /api/cms/config
   * Returns the CMS integration config for the current project.
   */
  fastify.get(
    '/api/cms/config',
    {
      schema: {
        tags: ['cms'],
        description: 'Get CMS integration config for the default project.',
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              projectId: { type: 'string' },
              cms: { type: 'object', additionalProperties: true },
            },
            required: ['ok', 'projectId', 'cms'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    requirePermission(req, 'cms.configure');
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);

    const projRow = await client.query('SELECT settings FROM projects WHERE id = $1', [projectId]);
    const settings = safeJsonObject(projRow.rows[0]?.settings);
    const cmsSettings = safeJsonObject(settings.cms);

    return { ok: true, projectId, cms: cmsSettings };
    },
  );

  /**
   * POST /api/cms/config
   * Saves CMS integration config to project settings.
   */
  fastify.post(
    '/api/cms/config',
    {
      schema: {
        tags: ['cms'],
        description: 'Save CMS integration config to the default project settings.',
        body: {
          type: 'object',
          properties: {
            provider: { type: 'string', enum: ['wordpress', 'shopify'] },
            wordpress: { type: 'object', additionalProperties: true },
            shopify: { type: 'object', additionalProperties: true },
          },
          required: ['provider'],
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              projectId: { type: 'string' },
              cms: { type: 'object', additionalProperties: true },
            },
            required: ['ok', 'projectId', 'cms'],
            additionalProperties: true,
          },
        },
      },
    },
    async (req) => {
    requirePermission(req, 'cms.configure');
    const client = await requireDb(req);
    const projectId = await resolveDefaultProjectId(client);
    const input = cmsConfigSchema.parse(req.body ?? {});

    const projRow = await client.query('SELECT settings FROM projects WHERE id = $1', [projectId]);
    const settings = safeJsonObject(projRow.rows[0]?.settings);
    settings.cms = input;

    await client.query(
      'UPDATE projects SET settings = $2::jsonb, updated_at = now() WHERE id = $1',
      [projectId, JSON.stringify(settings)],
    );

    return { ok: true, projectId, cms: input };
    },
  );
};
