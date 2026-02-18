import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import {
  BRAND_CTR,
  NON_BRAND_CTR,
  SEASONALITY_INDEX,
  calculateKeywordROI,
  summariseROI,
  type KeywordROIInput,
} from '../lib/roi-engine.js';

// ── Validation ────────────────────────────────────────────────────────────

const keywordInputSchema = z.object({
  keyword: z.string().min(1),
  searchVolume: z.number().int().nonnegative(),
  currentPosition: z.number().nonnegative(),
  targetPosition: z.number().positive(),
  kd: z.number().min(0).max(100).optional(),
  isBrand: z.boolean().optional(),
  conversionRate: z.number().gt(0).lte(1).optional(),
  avgOrderValue: z.number().positive().optional(),
});

const estimateBodySchema = z.object({
  keywords: z.array(keywordInputSchema).min(1).max(200),
  /** Global conversion rate override — individual keyword values take priority */
  conversionRate: z.number().gt(0).lte(1).optional(),
  /** Global AOV override (TWD by default) */
  avgOrderValue: z.number().positive().optional(),
  /** Month 1-12 for seasonality (defaults to current month) */
  month: z.number().int().min(1).max(12).optional(),
});

// ── Route plugin ──────────────────────────────────────────────────────────

export const roiRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /api/roi/estimate
   *
   * Compute ROI v2 projections for a list of keywords.
   * Auth: Bearer JWT (tenant-scoped via RLS middleware).
   */
  fastify.post('/api/roi/estimate', async (req, reply) => {
    const parsed = estimateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: parsed.error.flatten() });
    }

    const { keywords, conversionRate, avgOrderValue, month } = parsed.data;

    const results = keywords.map((kw) => {
      const input: KeywordROIInput = {
        keyword: kw.keyword,
        searchVolume: kw.searchVolume,
        currentPosition: kw.currentPosition,
        targetPosition: kw.targetPosition,
        kd: kw.kd,
        isBrand: kw.isBrand,
        // Per-keyword overrides first, then request-level defaults
        conversionRate: kw.conversionRate ?? conversionRate,
        avgOrderValue: kw.avgOrderValue ?? avgOrderValue,
        month,
      };
      return calculateKeywordROI(input);
    });

    const summary = summariseROI(results);

    return reply.send({ ok: true, summary, keywords: results });
  });

  /**
   * GET /api/roi/ctr-curves
   *
   * Return the CTR tables used by the engine (useful for frontend chart overlays).
   */
  fastify.get('/api/roi/ctr-curves', async (_req, reply) => {
    return reply.send({
      ok: true,
      nonBrand: NON_BRAND_CTR,
      brand: BRAND_CTR,
      seasonalityIndex: SEASONALITY_INDEX,
    });
  });
};
