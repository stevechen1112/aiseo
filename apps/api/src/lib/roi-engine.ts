/**
 * ROI Calculation Engine v2
 *
 * Brand vs Non-Brand CTR Curves (AHREFS 2024 + Sistrix 2023)
 * + Position-based Conversion Multipliers
 * + Taiwan market Seasonality Index
 *
 * Pure functions — no I/O, no side-effects.
 */

// ── CTR Curves ─────────────────────────────────────────────────────────────

/** Non-brand (informational / commercial / transactional) */
const NON_BRAND_CTR: Record<number, number> = {
  1: 0.285, 2: 0.157, 3: 0.110, 4: 0.080, 5: 0.072,
  6: 0.051, 7: 0.040, 8: 0.032, 9: 0.028, 10: 0.025,
};

/** Brand (navigational) — Pos1 reaches 60% because user already knows the target */
const BRAND_CTR: Record<number, number> = {
  1: 0.600, 2: 0.120, 3: 0.065, 4: 0.040, 5: 0.030,
  6: 0.020, 7: 0.015, 8: 0.010, 9: 0.008, 10: 0.006,
};

export function getCTR(position: number, isBrand = false): number {
  if (position <= 0) return 0;
  const curve = isBrand ? BRAND_CTR : NON_BRAND_CTR;
  if (position <= 10) return curve[position] ?? 0.025;
  if (position <= 20) return 0.005;
  return 0.001;
}

// ── Conversion Multiplier ──────────────────────────────────────────────────

/**
 * Pages ranked higher earn higher user trust → higher conversion.
 * Pos1 = 1.8×, Pos10 = 0.9×, Pos11-20 = 0.7×, Pos21+ = 0.5×
 */
const CONVERSION_MULTIPLIER: Record<number, number> = {
  1: 1.8, 2: 1.5, 3: 1.3, 4: 1.1, 5: 1.1,
  6: 1.0, 7: 1.0, 8: 1.0, 9: 0.9, 10: 0.9,
};

export function getConversionMultiplier(position: number): number {
  if (position <= 0) return 0;
  if (position <= 10) return CONVERSION_MULTIPLIER[position] ?? 0.9;
  if (position <= 20) return 0.7;
  return 0.5;
}

// ── Seasonality Index (Taiwan market) ───────────────────────────────────────

/**
 * Monthly search-volume multiplier vs annual average (=1.0).
 * Nov/Dec e-commerce peaks; Jul/Aug mid-year promotions.
 */
const SEASONALITY_INDEX: Record<number, number> = {
  1: 1.05, 2: 0.95, 3: 1.00, 4: 1.00, 5: 1.05,
  6: 1.10, 7: 1.05, 8: 1.00, 9: 1.05, 10: 1.10,
  11: 1.20, 12: 1.15,
};

export function getSeasonalityFactor(month?: number): number {
  const m = month ?? (new Date().getMonth() + 1);
  return SEASONALITY_INDEX[m] ?? 1.0;
}

// ── Per-keyword ROI ────────────────────────────────────────────────────────

export interface KeywordROIInput {
  keyword: string;
  searchVolume: number;
  currentPosition: number;
  targetPosition: number;
  kd?: number;
  isBrand?: boolean;
  conversionRate?: number;
  avgOrderValue?: number;
  month?: number;
}

export interface KeywordROIResult {
  keyword: string;
  searchVolume: number;
  currentPosition: number;
  targetPosition: number;
  kd: number;
  isBrand: boolean;
  currentCTR: number;
  targetCTR: number;
  currentMonthlyTraffic: number;
  targetMonthlyTraffic: number;
  trafficDelta: number;
  opportunityScore: number;
  /** v1 simple revenue (no multipliers, for backwards compat) */
  monthlyRevenueV1: number;
  /** v2 adjusted revenue (conversion multiplier + seasonality) */
  adjustedMonthlyRevenue: number;
  annualRevenueV2: number;
  conversionMultiplierCurrent: number;
  conversionMultiplierTarget: number;
  seasonalityFactor: number;
  conversionRate: number;
  avgOrderValue: number;
}

export function calculateKeywordROI(input: KeywordROIInput): KeywordROIResult {
  const {
    keyword,
    searchVolume,
    currentPosition,
    targetPosition,
  } = input;
  const kd = input.kd ?? 0;
  const isBrand = input.isBrand ?? false;
  const conversionRate = input.conversionRate ?? 0.02;
  const avgOrderValue = input.avgOrderValue ?? 1200;

  const currentCTR = getCTR(currentPosition, isBrand);
  const targetCTR = getCTR(targetPosition, isBrand);

  const currentMonthlyTraffic = Math.round(searchVolume * currentCTR);
  const targetMonthlyTraffic = Math.round(searchVolume * targetCTR);
  const trafficDelta = targetMonthlyTraffic - currentMonthlyTraffic;

  const opportunityScore =
    kd > 0
      ? Math.round((searchVolume * (targetCTR - currentCTR) * 1000) / kd)
      : Math.round(searchVolume * (targetCTR - currentCTR) * 1000);

  // v1 (simple, no position/seasonality adjustments)
  const monthlyRevenueV1 = Math.round(trafficDelta * conversionRate * avgOrderValue);

  // v2 (position-based conversion multiplier + Taiwan seasonality)
  const cmCurrent = getConversionMultiplier(currentPosition);
  const cmTarget = getConversionMultiplier(targetPosition);
  const seasonal = getSeasonalityFactor(input.month);

  const currentRevenue = Math.round(
    currentMonthlyTraffic * conversionRate * cmCurrent * avgOrderValue * seasonal,
  );
  const targetRevenue = Math.round(
    targetMonthlyTraffic * conversionRate * cmTarget * avgOrderValue * seasonal,
  );
  const adjustedMonthlyRevenue = targetRevenue - currentRevenue;
  const annualRevenueV2 = adjustedMonthlyRevenue * 12;

  return {
    keyword,
    searchVolume,
    currentPosition,
    targetPosition,
    kd,
    isBrand,
    currentCTR,
    targetCTR,
    currentMonthlyTraffic,
    targetMonthlyTraffic,
    trafficDelta,
    opportunityScore,
    monthlyRevenueV1,
    adjustedMonthlyRevenue,
    annualRevenueV2,
    conversionMultiplierCurrent: cmCurrent,
    conversionMultiplierTarget: cmTarget,
    seasonalityFactor: seasonal,
    conversionRate,
    avgOrderValue,
  };
}

// ── Portfolio-level summary ────────────────────────────────────────────────

export interface ROISummary {
  totalTrafficDelta: number;
  totalMonthlyRevenueV2: number;
  totalAnnualRevenueV2: number;
  avgOpportunityScore: number;
}

export function summariseROI(keywords: KeywordROIResult[]): ROISummary {
  const totalTrafficDelta = keywords.reduce((s, k) => s + k.trafficDelta, 0);
  const totalMonthlyRevenueV2 = keywords.reduce((s, k) => s + k.adjustedMonthlyRevenue, 0);
  const totalAnnualRevenueV2 = totalMonthlyRevenueV2 * 12;
  const avgOpportunityScore =
    keywords.length > 0
      ? Math.round(keywords.reduce((s, k) => s + k.opportunityScore, 0) / keywords.length)
      : 0;
  return { totalTrafficDelta, totalMonthlyRevenueV2, totalAnnualRevenueV2, avgOpportunityScore };
}
