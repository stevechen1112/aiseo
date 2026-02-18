'use client';

import { useState } from 'react';
import { TrendingUp, DollarSign, Users, Target, Plus, Trash2, Calculator } from 'lucide-react';
import { useROIEstimate } from '@/lib/queries';
import type { ROIKeywordInput, ROIKeywordResult } from '@/lib/api';

// ── Default keyword row ────────────────────────────────────────────────────

interface KeywordRow extends ROIKeywordInput {
  id: string;
}

const DEFAULT_ROW = (): KeywordRow => ({
  id: crypto.randomUUID(),
  keyword: '',
  searchVolume: 1000,
  currentPosition: 10,
  targetPosition: 3,
  kd: 40,
  isBrand: false,
});

// ── Helper ─────────────────────────────────────────────────────────────────

function fmtNumber(n: number) {
  return new Intl.NumberFormat('zh-TW').format(n);
}

function fmtCurrency(n: number, currency = 'TWD') {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SummaryCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex items-start gap-4">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
        {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function ROIDashboardPage() {
  const [rows, setRows] = useState<KeywordRow[]>([DEFAULT_ROW()]);
  const [conversionRate, setConversionRate] = useState(0.02);
  const [avgOrderValue, setAvgOrderValue] = useState(1200);
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);

  const estimate = useROIEstimate();

  const addRow = () => setRows((r) => [...r, DEFAULT_ROW()]);

  const removeRow = (id: string) =>
    setRows((r) => (r.length > 1 ? r.filter((row) => row.id !== id) : r));

  const updateRow = (id: string, field: keyof KeywordRow, value: string | number | boolean) =>
    setRows((r) => r.map((row) => (row.id === id ? { ...row, [field]: value } : row)));

  const handleCalculate = () => {
    const validRows = rows.filter((r) => r.keyword.trim() && r.searchVolume > 0 && r.targetPosition > 0);
    if (validRows.length === 0) return;
    estimate.mutate({
      keywords: validRows.map(({ id: _id, ...rest }) => rest),
      conversionRate,
      avgOrderValue,
      month,
    });
  };

  const results = estimate.data;

  const MONTHS = [
    '1月', '2月', '3月', '4月', '5月', '6月',
    '7月', '8月', '9月', '10月', '11月', '12月',
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">ROI Calculator</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Estimate revenue impact of ranking improvements using CTR v2 + seasonality model
        </p>
      </div>

      {/* Global settings */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Global Settings</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Conversion Rate
            </label>
            <div className="relative">
              <input
                type="number"
                min={0.001}
                max={1}
                step={0.001}
                value={conversionRate}
                onChange={(e) => setConversionRate(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                {pct(conversionRate)}
              </span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Avg Order Value (TWD)
            </label>
            <input
              type="number"
              min={1}
              value={avgOrderValue}
              onChange={(e) => setAvgOrderValue(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Month (seasonality)
            </label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
            >
              {MONTHS.map((m, i) => (
                <option key={i + 1} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Keyword input table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Keywords</h2>
          <button
            onClick={addRow}
            className="flex items-center gap-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add row
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Keyword</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Volume</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Current Pos</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Target Pos</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">KD</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">Brand</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <td className="px-4 py-2">
                  <input
                    type="text"
                    placeholder="keyword..."
                    value={row.keyword}
                    onChange={(e) => updateRow(row.id, 'keyword', e.target.value)}
                    className="w-full min-w-[140px] rounded border border-gray-200 dark:border-gray-600 bg-transparent px-2 py-1 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    min={0}
                    value={row.searchVolume}
                    onChange={(e) => updateRow(row.id, 'searchVolume', Number(e.target.value))}
                    className="w-24 rounded border border-gray-200 dark:border-gray-600 bg-transparent px-2 py-1 text-right text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    min={1}
                    value={row.currentPosition}
                    onChange={(e) => updateRow(row.id, 'currentPosition', Number(e.target.value))}
                    className="w-20 rounded border border-gray-200 dark:border-gray-600 bg-transparent px-2 py-1 text-right text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    min={1}
                    value={row.targetPosition}
                    onChange={(e) => updateRow(row.id, 'targetPosition', Number(e.target.value))}
                    className="w-20 rounded border border-gray-200 dark:border-gray-600 bg-transparent px-2 py-1 text-right text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={row.kd ?? 0}
                    onChange={(e) => updateRow(row.id, 'kd', Number(e.target.value))}
                    className="w-16 rounded border border-gray-200 dark:border-gray-600 bg-transparent px-2 py-1 text-right text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={row.isBrand ?? false}
                    onChange={(e) => updateRow(row.id, 'isBrand', e.target.checked)}
                    className="rounded border-gray-300 text-blue-600"
                  />
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => removeRow(row.id)}
                    disabled={rows.length === 1}
                    className="text-gray-400 hover:text-red-500 disabled:opacity-30 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="p-5">
          <button
            onClick={handleCalculate}
            disabled={estimate.isPending}
            className="flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-5 py-2.5 text-sm font-semibold text-white transition-colors"
          >
            <Calculator className="h-4 w-4" />
            {estimate.isPending ? 'Calculating…' : 'Calculate ROI'}
          </button>
          {estimate.isError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              Error: {String(estimate.error)}
            </p>
          )}
        </div>
      </div>

      {/* Results */}
      {results && (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              icon={<Users className="h-5 w-5 text-blue-600" />}
              label="Total Traffic Delta"
              value={`+${fmtNumber(results.summary.totalTrafficDelta)}`}
              sub="visits / month"
              color="bg-blue-50 dark:bg-blue-900/20"
            />
            <SummaryCard
              icon={<DollarSign className="h-5 w-5 text-green-600" />}
              label="Monthly Revenue (v2)"
              value={fmtCurrency(results.summary.totalMonthlyRevenueV2)}
              sub="with pos multiplier + seasonality"
              color="bg-green-50 dark:bg-green-900/20"
            />
            <SummaryCard
              icon={<TrendingUp className="h-5 w-5 text-purple-600" />}
              label="Annual Revenue (v2)"
              value={fmtCurrency(results.summary.totalAnnualRevenueV2)}
              sub="projected 12-month total"
              color="bg-purple-50 dark:bg-purple-900/20"
            />
            <SummaryCard
              icon={<Target className="h-5 w-5 text-orange-600" />}
              label="Avg Opportunity Score"
              value={fmtNumber(results.summary.avgOpportunityScore)}
              sub="volume × CTR gain / KD"
              color="bg-orange-50 dark:bg-orange-900/20"
            />
          </div>

          {/* Per-keyword table */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
            <div className="p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Per-keyword Breakdown</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Keyword</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">CTR now → target</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Traffic Δ</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Conv ×</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Seasonal</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Monthly Rev (v2)</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Annual Rev (v2)</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Opp Score</th>
                </tr>
              </thead>
              <tbody>
                {results.keywords.map((kw: ROIKeywordResult, i: number) => (
                  <tr
                    key={i}
                    className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      {kw.keyword}
                      {kw.isBrand && (
                        <span className="ml-2 rounded-full bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 text-xs text-blue-700 dark:text-blue-300">
                          brand
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                      {pct(kw.currentCTR)} → {pct(kw.targetCTR)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={
                          kw.trafficDelta >= 0
                            ? 'text-green-600 dark:text-green-400 font-medium'
                            : 'text-red-600 dark:text-red-400 font-medium'
                        }
                      >
                        {kw.trafficDelta >= 0 ? '+' : ''}{fmtNumber(kw.trafficDelta)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                      {kw.conversionMultiplierCurrent}× → {kw.conversionMultiplierTarget}×
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                      {kw.seasonalityFactor}×
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                      {fmtCurrency(kw.adjustedMonthlyRevenue)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-purple-700 dark:text-purple-300">
                      {fmtCurrency(kw.annualRevenueV2)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                      {fmtNumber(kw.opportunityScore)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Model note */}
          <p className="text-xs text-gray-400 dark:text-gray-500">
            v2 model: CTR based on AHREFS 2024 + Sistrix 2023 · Position conversion multiplier (Pos1=1.8×, Pos10=0.9×) ·
            Taiwan market seasonality index · Conversion rate {pct(conversionRate)} · AOV {fmtCurrency(avgOrderValue)}
          </p>
        </>
      )}
    </div>
  );
}
