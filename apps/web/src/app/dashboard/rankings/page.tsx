
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';

import { useAlertSettings, useKeywordDistribution, useKeywords, useSerpFeatures, useUpdateAlertSettings } from '@/lib/queries';

export default function RankingsPage() {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data: distribution, isLoading: distLoading } = useKeywordDistribution(timeRange);
  const { data: keywordsData, isLoading: keywordsLoading } = useKeywords(page, limit);

  const { data: featureData, isLoading: featuresLoading } = useSerpFeatures(50);
  const { data: alertSettings, isLoading: alertSettingsLoading } = useAlertSettings();
  const updateAlertSettings = useUpdateAlertSettings();

  const [rankDropThreshold, setRankDropThreshold] = useState('5');
  const [slackWebhookUrl, setSlackWebhookUrl] = useState('');
  const [emailRecipients, setEmailRecipients] = useState('');

  useEffect(() => {
    if (!alertSettings) return;
    setRankDropThreshold(String(alertSettings.rankDropThreshold ?? 5));
    setSlackWebhookUrl(alertSettings.slackWebhookUrl ?? '');
    setEmailRecipients((alertSettings.emailRecipients ?? []).join(', '));
  }, [alertSettings]);

  const serpFeatureRows = featureData?.rows ?? [];
  const serpFeaturesSummary = useMemo(() => {
    const total = serpFeatureRows.length || 1;
    const sum = {
      featuredSnippet: 0,
      peopleAlsoAsk: 0,
      video: 0,
      images: 0,
      localPack: 0,
    };

    for (const row of serpFeatureRows) {
      if (row.features.featuredSnippet) sum.featuredSnippet += 1;
      if (row.features.peopleAlsoAsk) sum.peopleAlsoAsk += 1;
      if (row.features.video) sum.video += 1;
      if (row.features.images) sum.images += 1;
      if (row.features.localPack) sum.localPack += 1;
    }

    return {
      total: serpFeatureRows.length,
      featuredSnippet: sum.featuredSnippet,
      peopleAlsoAsk: sum.peopleAlsoAsk,
      video: sum.video,
      images: sum.images,
      localPack: sum.localPack,
      pct: {
        featuredSnippet: (sum.featuredSnippet / total) * 100,
        peopleAlsoAsk: (sum.peopleAlsoAsk / total) * 100,
        video: (sum.video / total) * 100,
        images: (sum.images / total) * 100,
        localPack: (sum.localPack / total) * 100,
      },
    };
  }, [serpFeatureRows]);

  const total = distribution
    ? distribution.topThree + distribution.topTen + distribution.topTwenty + distribution.topHundred
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Rank Tracker</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Implements Phase 3 task plan section 4.5 only</p>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Ranking Distribution</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Top 3 / Top 10 / Top 20 / 20+</p>
          </div>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as '7d' | '30d' | '90d')}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-white"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {distLoading ? (
            <>
              <DistributionCard title="Top 3" loading />
              <DistributionCard title="Top 10" loading />
              <DistributionCard title="Top 20" loading />
              <DistributionCard title="20+" loading />
            </>
          ) : distribution ? (
            <>
              <DistributionCard title="Top 3" count={distribution.topThree} percentage={total ? (distribution.topThree / total) * 100 : 0} dotClass="bg-green-500" />
              <DistributionCard title="Top 10" count={distribution.topTen} percentage={total ? (distribution.topTen / total) * 100 : 0} dotClass="bg-blue-500" />
              <DistributionCard title="Top 20" count={distribution.topTwenty} percentage={total ? (distribution.topTwenty / total) * 100 : 0} dotClass="bg-yellow-500" />
              <DistributionCard title="20+" count={distribution.topHundred} percentage={total ? (distribution.topHundred / total) * 100 : 0} dotClass="bg-gray-400" />
            </>
          ) : (
            <div className="col-span-4 text-center text-sm text-gray-500">Failed to load distribution</div>
          )}
        </div>
      </div>

      {/* SERP Feature Tracking */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="border-b border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">SERP Feature Tracking</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Featured Snippet / People Also Ask / Video / Images / Local Pack</p>
        </div>

        <div className="p-6">
          {featuresLoading ? (
            <div className="text-sm text-gray-500">Loading…</div>
          ) : serpFeatureRows.length === 0 ? (
            <div className="text-sm text-gray-500">No feature data</div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <FeatureStat label="Featured Snippet" value={`${serpFeaturesSummary.featuredSnippet}/${serpFeaturesSummary.total}`} sub={`${serpFeaturesSummary.pct.featuredSnippet.toFixed(0)}%`} />
                <FeatureStat label="People Also Ask" value={`${serpFeaturesSummary.peopleAlsoAsk}/${serpFeaturesSummary.total}`} sub={`${serpFeaturesSummary.pct.peopleAlsoAsk.toFixed(0)}%`} />
                <FeatureStat label="Video" value={`${serpFeaturesSummary.video}/${serpFeaturesSummary.total}`} sub={`${serpFeaturesSummary.pct.video.toFixed(0)}%`} />
                <FeatureStat label="Images" value={`${serpFeaturesSummary.images}/${serpFeaturesSummary.total}`} sub={`${serpFeaturesSummary.pct.images.toFixed(0)}%`} />
                <FeatureStat label="Local Pack" value={`${serpFeaturesSummary.localPack}/${serpFeaturesSummary.total}`} sub={`${serpFeaturesSummary.pct.localPack.toFixed(0)}%`} />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Keyword</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">FS</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">PAA</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Video</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Images</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Local</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {serpFeatureRows.slice(0, 20).map((row) => (
                      <tr key={row.keywordId} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{row.keyword}</td>
                        <td className="px-4 py-3"><FeatureCell present={row.features.featuredSnippet} owned={row.owned.featuredSnippet} /></td>
                        <td className="px-4 py-3"><FeatureCell present={row.features.peopleAlsoAsk} owned={row.owned.peopleAlsoAsk} /></td>
                        <td className="px-4 py-3"><FeatureCell present={row.features.video} owned={row.owned.video} /></td>
                        <td className="px-4 py-3"><FeatureCell present={row.features.images} owned={row.owned.images} /></td>
                        <td className="px-4 py-3"><FeatureCell present={row.features.localPack} owned={row.owned.localPack} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-500">Legend: gray = not present, blue = present, green = our site present in the feature</p>
            </div>
          )}
        </div>
      </div>

      {/* Alert Settings */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="border-b border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Alert Settings</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Ranking drop threshold + Slack / Email notifications</p>
        </div>

        <div className="p-6 space-y-4">
          {alertSettingsLoading ? (
            <div className="text-sm text-gray-500">Loading…</div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Ranking drop threshold</label>
                  <input
                    value={rankDropThreshold}
                    onChange={(e) => setRankDropThreshold(e.target.value)}
                    inputMode="numeric"
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-white"
                    placeholder="5"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">Example: drop ≥ 5 positions</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Slack webhook URL</label>
                  <input
                    value={slackWebhookUrl}
                    onChange={(e) => setSlackWebhookUrl(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-white"
                    placeholder="https://hooks.slack.com/services/..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email recipients</label>
                <input
                  value={emailRecipients}
                  onChange={(e) => setEmailRecipients(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-white"
                  placeholder="a@company.com, b@company.com"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">Comma-separated</p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    const threshold = Number(rankDropThreshold);
                    const recipients = emailRecipients
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean);

                    updateAlertSettings.mutate({
                      rankDropThreshold: Number.isFinite(threshold) && threshold > 0 ? Math.floor(threshold) : 5,
                      slackWebhookUrl: slackWebhookUrl.trim() || undefined,
                      emailRecipients: recipients,
                    });
                  }}
                  disabled={updateAlertSettings.isPending}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save Settings
                </button>

                {updateAlertSettings.isError ? (
                  <span className="text-sm text-red-600 dark:text-red-400">{(updateAlertSettings.error as Error).message}</span>
                ) : null}

                {updateAlertSettings.isSuccess ? (
                  <span className="text-sm text-green-600 dark:text-green-400">Saved</span>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="border-b border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Daily Ranking Changes</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Keyword / current position / yesterday / change</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Keyword</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Current</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Yesterday</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {keywordsLoading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-sm text-gray-500">Loading…</td>
                </tr>
              ) : keywordsData && keywordsData.data.length > 0 ? (
                keywordsData.data.map((k) => (
                  <RankingRow key={k.id} keyword={k.keyword} position={k.position} change={k.change} />
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-sm text-gray-500">No rankings found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {keywordsData ? (
                <>
                  Showing {(page - 1) * limit + 1}-{Math.min(page * limit, keywordsData.total)} of {keywordsData.total.toLocaleString()} keywords
                </>
              ) : (
                'Loading…'
              )}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!keywordsData || page * limit >= keywordsData.total}
                className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</div>
      <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
      <div className="mt-1 text-xs text-gray-500 dark:text-gray-500">{sub}</div>
    </div>
  );
}

function FeatureCell({ present, owned }: { present: boolean; owned: boolean }) {
  const base = 'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold';
  if (!present) {
    return <span className={`${base} bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300`}>—</span>;
  }
  if (owned) {
    return <span className={`${base} bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300`}>✓</span>;
  }
  return <span className={`${base} bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300`}>•</span>;
}

function DistributionCard({
  title,
  count,
  percentage,
  dotClass,
  loading,
}: {
  title: string;
  count?: number;
  percentage?: number;
  dotClass?: string;
  loading?: boolean;
}) {
  return (
    <div className={`rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 ${loading ? 'animate-pulse' : ''}`}>
      <div className="flex items-center gap-3">
        <div className={`h-3 w-3 rounded-full ${loading ? 'bg-gray-300 dark:bg-gray-600' : dotClass}`} />
        <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">{title}</h3>
      </div>
      <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{loading ? '—' : (count ?? 0).toLocaleString()}</div>
      <div className="mt-1 text-sm text-gray-500 dark:text-gray-500">{loading ? '—' : `${(percentage ?? 0).toFixed(1)}% of total`}</div>
    </div>
  );
}

function RankingRow({ keyword, position, change }: { keyword: string; position: number; change: number }) {
  const previousPosition = position + change;

  const changeColor = change > 0 ? 'text-green-600 dark:text-green-400' : change < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400';
  const icon = change > 0 ? <TrendingUp className="h-4 w-4" /> : change < 0 ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />;

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
      <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{keyword}</td>
      <td className="px-6 py-4 text-2xl font-bold text-gray-900 dark:text-white">{position}</td>
      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{previousPosition}</td>
      <td className="px-6 py-4">
        <div className={`flex items-center gap-1 ${changeColor}`}>
          {icon}
          <span className="text-sm font-medium">{change > 0 ? '+' : ''}{change}</span>
        </div>
      </td>
    </tr>
  );
}
