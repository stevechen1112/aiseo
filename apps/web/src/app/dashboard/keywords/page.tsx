'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useKeywordDistribution, useKeywords, useStartSeoContentPipeline, useTriggerKeywordResearch } from '@/lib/queries';
import { formatRelativeTime } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { useWebSocket, WebSocketEvents } from '@/lib/websocket';

export default function KeywordsPage() {
  const [page, setPage] = useState(1);
  const limit = 20;
  
  const { data: distribution, isLoading: distLoading } = useKeywordDistribution();
  const { data: keywordsData, isLoading: keywordsLoading } = useKeywords(page, limit);
  const { data: quickWinData, isLoading: quickWinLoading } = useKeywords(1, 200);
  const startOptimization = useStartSeoContentPipeline();
  const triggerKeywordResearch = useTriggerKeywordResearch();

  const opportunities = useMemo(() => {
    const candidates = (quickWinData?.data ?? [])
      .filter((k) => k.position >= 11 && k.position <= 20)
      .map((k) => {
        const positionFactor = 21 - k.position;
        const score = k.volume * positionFactor;
        return { ...k, score };
      })
      .sort((a, b) => b.score - a.score);

    return candidates.slice(0, 10);
  }, [quickWinData]);
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Keyword Tracking</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Monitor keyword rankings and discover new opportunities
          </p>
        </div>
      </div>

      {/* Distribution Overview */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {distLoading ? (
          <>
            <DistributionSkeleton />
            <DistributionSkeleton />
            <DistributionSkeleton />
            <DistributionSkeleton />
          </>
        ) : distribution ? (
          <>
            <DistributionCard
              title="Top 3"
              count={distribution.topThree}
              percentage={(distribution.topThree / (distribution.topThree + distribution.topTen + distribution.topTwenty + distribution.topHundred)) * 100}
              color="bg-green-500"
            />
            <DistributionCard
              title="Top 10"
              count={distribution.topTen}
              percentage={(distribution.topTen / (distribution.topThree + distribution.topTen + distribution.topTwenty + distribution.topHundred)) * 100}
              color="bg-blue-500"
            />
            <DistributionCard
              title="Top 20"
              count={distribution.topTwenty}
              percentage={(distribution.topTwenty / (distribution.topThree + distribution.topTen + distribution.topTwenty + distribution.topHundred)) * 100}
              color="bg-yellow-500"
            />
            <DistributionCard
              title="Top 100"
              count={distribution.topHundred}
              percentage={(distribution.topHundred / (distribution.topThree + distribution.topTen + distribution.topTwenty + distribution.topHundred)) * 100}
              color="bg-gray-400"
            />
          </>
        ) : (
          <div className="col-span-4 text-center text-gray-500">Failed to load distribution</div>
        )}
      </div>

      {/* Quick Win Panel */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="border-b border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Quick Win Opportunities</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Auto score: position 11–20 + high search volume</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Keyword</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Position</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Volume</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Opportunity Score</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {quickWinLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-500">Loading…</td>
                </tr>
              ) : opportunities.length > 0 ? (
                opportunities.map((k) => (
                  <tr key={k.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{k.keyword}</td>
                    <td className="px-6 py-4 text-2xl font-bold text-gray-900 dark:text-white">{k.position}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{k.volume.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{k.score.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => startOptimization.mutate(k.keyword)}
                        disabled={startOptimization.isPending}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Optimize
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-500">No quick wins found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {startOptimization.isError ? (
          <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 text-sm text-red-600 dark:text-red-400">
            Failed to trigger optimization: {(startOptimization.error as Error).message}
          </div>
        ) : null}

        {startOptimization.isSuccess ? (
          <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 text-sm text-green-600 dark:text-green-400">
            Optimization triggered.
          </div>
        ) : null}
      </div>

      {/* Topic Cluster Visualization */}
      <TopicClusterPanel keywords={quickWinData?.data ?? []} loading={quickWinLoading} />

      {/* Keyword Research Trigger */}
      <KeywordResearchTriggerPanel
        onTrigger={(seed) => triggerKeywordResearch.mutate(seed)}
        isPending={triggerKeywordResearch.isPending}
        triggerError={triggerKeywordResearch.isError ? (triggerKeywordResearch.error as Error).message : null}
        triggeredJobId={triggerKeywordResearch.data?.jobId ?? null}
      />

      {/* Keywords Table */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="border-b border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-3">
            <Search className="h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search keywords..."
              className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder:text-gray-400 outline-none"
            />
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Keyword
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Position
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Change
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Volume
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Difficulty
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  URL
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Last Updated
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {keywordsLoading ? (
                <>
                  <KeywordRowSkeleton />
                  <KeywordRowSkeleton />
                  <KeywordRowSkeleton />
                  <KeywordRowSkeleton />
                  <KeywordRowSkeleton />
                </>
              ) : keywordsData && keywordsData.data.length > 0 ? (
                keywordsData.data.map((keyword) => (
                  <KeywordRow
                    key={keyword.id}
                    keyword={keyword.keyword}
                    position={keyword.position}
                    change={keyword.change}
                    volume={keyword.volume}
                    difficulty={keyword.difficulty}
                    url={keyword.url}
                    lastUpdated={formatRelativeTime(keyword.lastUpdated)}
                  />
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-sm text-gray-500">
                    No keywords found
                  </td>
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
                  Showing {(page - 1) * limit + 1}-{Math.min(page * limit, keywordsData.total)} of{' '}
                  {keywordsData.total.toLocaleString()} keywords
                </>
              ) : (
                'Loading...'
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

function KeywordResearchTriggerPanel({
  onTrigger,
  isPending,
  triggerError,
  triggeredJobId,
}: {
  onTrigger: (seedKeyword: string) => void;
  isPending: boolean;
  triggerError: string | null;
  triggeredJobId: string | number | null;
}) {
  const { token } = useAuth();
  const [seed, setSeed] = useState('');
  const [statusText, setStatusText] = useState<string>('');
  const [activeJobId, setActiveJobId] = useState<string | number | null>(null);

  useEffect(() => {
    if (triggeredJobId !== null && triggeredJobId !== undefined) {
      setActiveJobId(triggeredJobId);
      setStatusText('Queued…');
    }
  }, [triggeredJobId]);

  useWebSocket({
    token: token || undefined,
    enabled: !!token,
    onMessage: (message) => {
      if (
        message.type !== WebSocketEvents.AGENT_TASK_CREATED &&
        message.type !== WebSocketEvents.AGENT_TASK_STARTED &&
        message.type !== WebSocketEvents.AGENT_TASK_COMPLETED &&
        message.type !== WebSocketEvents.AGENT_TASK_FAILED
      ) {
        return;
      }

      const data = message.data as any;
      const payload = data?.payload;
      const jobName = payload?.jobName;
      const jobId = payload?.jobId;

      if (!activeJobId) return;
      if (jobName !== 'keyword-researcher') return;
      if (String(jobId) !== String(activeJobId)) return;

      if (message.type === WebSocketEvents.AGENT_TASK_CREATED) {
        setStatusText('Queued…');
      } else if (message.type === WebSocketEvents.AGENT_TASK_STARTED) {
        setStatusText('Running…');
      } else if (message.type === WebSocketEvents.AGENT_TASK_COMPLETED) {
        const inserted = payload?.inserted;
        setStatusText(typeof inserted === 'number' ? `Completed (+${inserted} keywords)` : 'Completed');
      } else if (message.type === WebSocketEvents.AGENT_TASK_FAILED) {
        setStatusText(payload?.error ? `Failed: ${payload.error}` : 'Failed');
      }
    },
  });

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="border-b border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Keyword Research Trigger</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Enter a seed keyword to trigger keyword-researcher</p>
      </div>

      <div className="p-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="Seed keyword"
            className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-4 py-2 text-sm text-gray-900 dark:text-white"
          />
          <button
            onClick={() => onTrigger(seed)}
            disabled={isPending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Trigger Research
          </button>
        </div>

        {triggerError ? <div className="text-sm text-red-600 dark:text-red-400">{triggerError}</div> : null}
        {statusText ? <div className="text-sm text-gray-600 dark:text-gray-400">{statusText}</div> : null}
      </div>
    </div>
  );
}

function DistributionSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 animate-pulse">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-3 w-3 rounded-full bg-gray-300 dark:bg-gray-600" />
        <div className="h-4 w-16 bg-gray-300 dark:bg-gray-600 rounded" />
      </div>
      <div className="h-9 w-20 bg-gray-300 dark:bg-gray-600 rounded mb-2" />
      <div className="h-4 w-24 bg-gray-300 dark:bg-gray-600 rounded" />
    </div>
  );
}

function KeywordRowSkeleton() {
  return (
    <tr className="animate-pulse">
      <td className="px-6 py-4">
        <div className="h-4 w-48 bg-gray-300 dark:bg-gray-600 rounded" />
      </td>
      <td className="px-6 py-4">
        <div className="h-8 w-8 bg-gray-300 dark:bg-gray-600 rounded" />
      </td>
      <td className="px-6 py-4">
        <div className="h-4 w-12 bg-gray-300 dark:bg-gray-600 rounded" />
      </td>
      <td className="px-6 py-4">
        <div className="h-4 w-16 bg-gray-300 dark:bg-gray-600 rounded" />
      </td>
      <td className="px-6 py-4">
        <div className="h-6 w-10 bg-gray-300 dark:bg-gray-600 rounded-full" />
      </td>
      <td className="px-6 py-4">
        <div className="h-4 w-32 bg-gray-300 dark:bg-gray-600 rounded" />
      </td>
      <td className="px-6 py-4">
        <div className="h-4 w-20 bg-gray-300 dark:bg-gray-600 rounded" />
      </td>
    </tr>
  );
}

function DistributionCard({
  title,
  count,
  percentage,
  color,
}: {
  title: string;
  count: number;
  percentage: number;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className={`h-3 w-3 rounded-full ${color}`} />
        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
          {title}
        </span>
      </div>
      <div className="text-3xl font-bold text-gray-900 dark:text-white">
        {count.toLocaleString()}
      </div>
      <div className="mt-1 text-sm text-gray-500 dark:text-gray-500">
        {percentage}% of total
      </div>
    </div>
  );
}

function KeywordRow({
  keyword,
  position,
  change,
  volume,
  difficulty,
  url,
  lastUpdated,
}: {
  keyword: string;
  position: number;
  change: number;
  volume: number;
  difficulty: number;
  url: string;
  lastUpdated: string;
}) {
  const getChangeColor = () => {
    if (change > 0) return 'text-green-600 dark:text-green-400';
    if (change < 0) return 'text-red-600 dark:text-red-400';
    return 'text-gray-400';
  };
  
  const getChangeIcon = () => {
    if (change > 0) return <TrendingUp className="h-4 w-4" />;
    if (change < 0) return <TrendingDown className="h-4 w-4" />;
    return <Minus className="h-4 w-4" />;
  };
  
  const getDifficultyColor = () => {
    if (difficulty >= 70) return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20';
    if (difficulty >= 50) return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20';
    return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20';
  };
  
  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
      <td className="px-6 py-4">
        <div className="text-sm font-medium text-gray-900 dark:text-white">
          {keyword}
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-gray-900 dark:text-white">
            {position}
          </span>
        </div>
      </td>
      <td className="px-6 py-4">
        <div className={`flex items-center gap-1 ${getChangeColor()}`}>
          {getChangeIcon()}
          <span className="text-sm font-medium">
            {change > 0 ? '+' : ''}{change}
          </span>
        </div>
      </td>
      <td className="px-6 py-4">
        <span className="text-sm text-gray-900 dark:text-white">
          {volume.toLocaleString()}
        </span>
      </td>
      <td className="px-6 py-4">
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getDifficultyColor()}`}>
          {difficulty}
        </span>
      </td>
      <td className="px-6 py-4">
        <span className="text-sm text-gray-600 dark:text-gray-400 truncate max-w-xs block">
          {url}
        </span>
      </td>
      <td className="px-6 py-4">
        <span className="text-sm text-gray-500 dark:text-gray-500">
          {lastUpdated}
        </span>
      </td>
    </tr>
  );
}

type ClusterKeyword = {
  id: string;
  keyword: string;
  position: number;
  change: number;
  volume: number;
  difficulty: number;
  url: string;
  lastUpdated: string;
};

function TopicClusterPanel({ keywords, loading }: { keywords: ClusterKeyword[]; loading: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<any>(null);
  const [selected, setSelected] = useState<
    | { type: 'cluster'; clusterKey: string; count: number }
    | { type: 'keyword'; item: ClusterKeyword }
    | null
  >(null);

  const { elements, clusterCounts } = useMemo(() => {
    const groups = new Map<string, ClusterKeyword[]>();

    for (const item of keywords) {
      const firstToken = (item.keyword ?? '').trim().split(/\s+/)[0]?.toLowerCase();
      const key = firstToken && firstToken.length > 0 ? firstToken : 'other';
      const list = groups.get(key) ?? [];
      list.push(item);
      groups.set(key, list);
    }

    const counts = new Map<string, number>();
    const els: Array<any> = [];

    for (const [key, list] of groups) {
      counts.set(key, list.length);
      els.push({ data: { id: `cluster:${key}`, label: `${key} (${list.length})`, kind: 'cluster', clusterKey: key } });

      for (const item of list) {
        els.push({
          data: {
            id: `kw:${item.id}`,
            label: item.keyword,
            kind: 'keyword',
            keywordId: item.id,
          },
        });
        els.push({ data: { id: `edge:${key}:${item.id}`, source: `cluster:${key}`, target: `kw:${item.id}` } });
      }
    }

    return { elements: els, clusterCounts: counts };
  }, [keywords]);

  useEffect(() => {
    let canceled = false;

    async function init() {
      if (!containerRef.current) return;
      const cytoscape = (await import('cytoscape')).default;
      if (canceled) return;

      cyRef.current?.destroy?.();

      const cy = cytoscape({
        container: containerRef.current,
        elements,
        style: [
          {
            selector: 'node',
            style: {
              label: 'data(label)',
              'font-size': 10,
              color: '#111827',
              'text-wrap': 'wrap',
              'text-max-width': '120px',
              'text-valign': 'center',
              'text-halign': 'center',
              'background-color': '#e5e7eb',
              width: 24,
              height: 24,
            },
          },
          {
            selector: 'node[kind = "cluster"]',
            style: {
              'background-color': '#bfdbfe',
              width: 44,
              height: 44,
              'font-size': 11,
              'font-weight': 600,
            },
          },
          {
            selector: 'edge',
            style: {
              width: 1,
              'line-color': '#d1d5db',
              'curve-style': 'haystack',
              opacity: 0.8,
            },
          },
          {
            selector: ':selected',
            style: {
              'border-width': 2,
              'border-color': '#2563eb',
            },
          },
        ],
        layout: {
          name: 'cose',
          animate: false,
          fit: true,
          padding: 20,
        },
      });

      cy.on('tap', (evt: any) => {
        if (evt.target === cy) {
          setSelected(null);
        }
      });

      cy.on('tap', 'node', (evt: any) => {
        const node = evt.target;
        const kind = node.data('kind') as string;

        if (kind === 'cluster') {
          const clusterKey = node.data('clusterKey') as string;
          setSelected({ type: 'cluster', clusterKey, count: clusterCounts.get(clusterKey) ?? 0 });
          return;
        }

        if (kind === 'keyword') {
          const keywordId = node.data('keywordId') as string;
          const item = keywords.find((k) => k.id === keywordId);
          if (item) setSelected({ type: 'keyword', item });
        }
      });

      cyRef.current = cy;
    }

    init();

    return () => {
      canceled = true;
      cyRef.current?.destroy?.();
      cyRef.current = null;
    };
  }, [elements, keywords, clusterCounts]);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="border-b border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Topic Cluster</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Click a node to view details</p>
      </div>

      <div className="grid gap-6 p-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="h-[420px] w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            {loading ? (
              <div className="h-full w-full animate-pulse" />
            ) : keywords.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">No keywords</div>
            ) : (
              <div ref={containerRef} className="h-full w-full" />
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Details</h3>
          <div className="mt-3 text-sm text-gray-600 dark:text-gray-400">
            {!selected ? (
              <p>Select a node</p>
            ) : selected.type === 'cluster' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Cluster</span>
                  <span className="text-gray-900 dark:text-white font-medium">{selected.clusterKey}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Keywords</span>
                  <span className="text-gray-900 dark:text-white font-medium">{selected.count.toLocaleString()}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-gray-900 dark:text-white font-medium">{selected.item.keyword}</div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Position</span>
                  <span className="text-gray-900 dark:text-white font-medium">{selected.item.position}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Volume</span>
                  <span className="text-gray-900 dark:text-white font-medium">{selected.item.volume.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Difficulty</span>
                  <span className="text-gray-900 dark:text-white font-medium">{selected.item.difficulty}</span>
                </div>
                <div className="pt-2 text-xs text-gray-500 dark:text-gray-500 break-all">{selected.item.url}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
