import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import {
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
      nonBrand: {
        1: 0.285, 2: 0.157, 3: 0.110, 4: 0.080, 5: 0.072,
        6: 0.051, 7: 0.040, 8: 0.032, 9: 0.028, 10: 0.025,
      },
      brand: {
        1: 0.600, 2: 0.120, 3: 0.065, 4: 0.040, 5: 0.030,
        6: 0.020, 7: 0.015, 8: 0.010, 9: 0.008, 10: 0.006,
      },
      seasonalityIndex: {
        1: 1.05, 2: 0.95, 3: 1.00, 4: 1.00, 5: 1.05,
        6: 1.10, 7: 1.05, 8: 1.00, 9: 1.05, 10: 1.10,
        11: 1.20, 12: 1.15,
      },
    });
  });
};
