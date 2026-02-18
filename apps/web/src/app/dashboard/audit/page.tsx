'use client';

import { useMemo, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Treemap } from 'recharts';

import { useAuditHealth, useAuditIssues, useCrawlMap, useCwvTrends, useResolveAuditIssue } from '@/lib/queries';
import { formatRelativeTime } from '@/lib/utils';

type Severity = 'critical' | 'warning' | 'info';

export default function AuditPage() {
  const { data: health, isLoading: healthLoading } = useAuditHealth();
  const { data: issuesData, isLoading: issuesLoading } = useAuditIssues(200);
  const resolveIssue = useResolveAuditIssue();

  const [cwvRange, setCwvRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [cwvDevice, setCwvDevice] = useState<'all' | 'mobile' | 'desktop'>('all');
  const { data: cwvData, isLoading: cwvLoading } = useCwvTrends({
    range: cwvRange,
    device: cwvDevice === 'all' ? undefined : cwvDevice,
  });

  const { data: crawlData, isLoading: crawlLoading } = useCrawlMap(500);

  const issues = issuesData?.items ?? [];

  const counts = useMemo(() => {
    const out: Record<Severity, number> = { critical: 0, warning: 0, info: 0 };
    for (const i of issues) out[i.severity] += 1;
    return out;
  }, [issues]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Technical Audit Viewer</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Implements Phase 3 task plan section 4.7 only</p>
      </div>

      {/* Health Score */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Site Health Score</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Overall + Technical / Content / UX</p>
          </div>
          <div className="text-sm text-gray-500">
            {health?.auditedAt ? `Audited ${formatRelativeTime(health.auditedAt)}` : ''}
          </div>
        </div>

        {healthLoading ? (
          <div className="mt-6 text-sm text-gray-500">Loading…</div>
        ) : health ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-4">
            <ScoreCard label="Overall" score={health.overall} accent="blue" />
            <ScoreCard label="Technical" score={health.breakdown.technical} accent="green" />
            <ScoreCard label="Content" score={health.breakdown.content} accent="yellow" />
            <ScoreCard label="UX" score={health.breakdown.ux} accent="purple" />
          </div>
        ) : (
          <div className="mt-6 text-sm text-gray-500">No audit score</div>
        )}

        {health ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <MiniStat label="Issues" value={health.issues.total.toLocaleString()} />
            <MiniStat label="Critical" value={health.issues.critical.toLocaleString()} />
            <MiniStat label="Warning" value={health.issues.warning.toLocaleString()} />
          </div>
        ) : null}
      </div>

      {/* Issues List */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="border-b border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Issues</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Critical / Warning / Info · Mark as resolved</p>
        </div>

        <div className="p-6">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge tone="red" text={`Critical ${counts.critical}`} />
            <Badge tone="yellow" text={`Warning ${counts.warning}`} />
            <Badge tone="gray" text={`Info ${counts.info}`} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Severity</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Issue</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">URL</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Audited</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {issuesLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-500">Loading…</td>
                </tr>
              ) : issues.length > 0 ? (
                issues.slice(0, 100).map((i) => (
                  <tr key={i.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-6 py-4">
                      <SeverityPill severity={i.severity} resolved={i.resolved} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{i.title}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-500">{i.category}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 max-w-[360px] truncate">{i.url}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{formatRelativeTime(i.auditedAt)}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => resolveIssue.mutate({ issueId: i.id, resolved: !i.resolved })}
                        disabled={resolveIssue.isPending}
                        className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {i.resolved ? 'Reopen' : 'Mark resolved'}
                      </button>
                      {i.resolvedAt ? (
                        <div className="mt-1 text-[11px] text-gray-500">Resolved {formatRelativeTime(i.resolvedAt)}</div>
                      ) : null}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-500">No issues</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CWV Trends */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Core Web Vitals</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">LCP / FID / CLS trends</p>
          </div>

          <div className="flex gap-2">
            <select
              value={cwvRange}
              onChange={(e) => setCwvRange(e.target.value as '7d' | '30d' | '90d')}
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-white"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>

            <select
              value={cwvDevice}
              onChange={(e) => setCwvDevice(e.target.value as 'all' | 'mobile' | 'desktop')}
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-white"
            >
              <option value="all">All</option>
              <option value="mobile">Mobile</option>
              <option value="desktop">Desktop</option>
            </select>
          </div>
        </div>

        <div className="mt-6 h-80">
          {cwvLoading ? (
            <div className="text-sm text-gray-500">Loading…</div>
          ) : cwvData && cwvData.points.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cwvData.points}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                <XAxis dataKey="date" stroke="#9ca3af" style={{ fontSize: '12px' }} />
                <YAxis stroke="#9ca3af" style={{ fontSize: '12px' }} />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }} />
                <Line type="monotone" dataKey="lcp" stroke="#3b82f6" strokeWidth={2} name="LCP (ms)" dot={false} />
                <Line type="monotone" dataKey="fid" stroke="#10b981" strokeWidth={2} name="FID (ms)" dot={false} />
                <Line type="monotone" dataKey="cls" stroke="#f59e0b" strokeWidth={2} name="CLS" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-sm text-gray-500">No CWV data</div>
          )}
        </div>
      </div>

      {/* Crawl Coverage Treemap */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Crawl Coverage Map</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Treemap by site sections · color indicates crawl status</p>
        </div>

        <div className="mt-6 h-96">
          {crawlLoading ? (
            <div className="text-sm text-gray-500">Loading…</div>
          ) : crawlData && crawlData.data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <Treemap
                data={crawlData.data as any}
                dataKey="size"
                nameKey="name"
                stroke="#111827"
                content={<CrawlTreemapCell />}
              />
            </ResponsiveContainer>
          ) : (
            <div className="text-sm text-gray-500">No crawl map data</div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <LegendDot label="Good" className="bg-green-500" />
          <LegendDot label="Warn" className="bg-yellow-500" />
          <LegendDot label="Bad" className="bg-red-500" />
        </div>
      </div>
    </div>
  );
}

function ScoreCard({ label, score, accent }: { label: string; score: number; accent: 'blue' | 'green' | 'yellow' | 'purple' }) {
  const accentMap: Record<string, string> = {
    blue: 'bg-blue-600',
    green: 'bg-green-600',
    yellow: 'bg-yellow-500',
    purple: 'bg-purple-600',
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
      <div className="text-sm font-medium text-gray-600 dark:text-gray-400">{label}</div>
      <div className="mt-2 text-4xl font-bold text-gray-900 dark:text-white">{score}</div>
      <div className="mt-4 h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
        <div className={`h-2 rounded-full ${accentMap[accent]}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className="text-xs text-gray-500 dark:text-gray-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}

function SeverityPill({ severity, resolved }: { severity: Severity; resolved: boolean }) {
  const base = 'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium';
  const tone =
    severity === 'critical'
      ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
      : severity === 'warning'
        ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300'
        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200';
  return <span className={`${base} ${tone}`}>{resolved ? 'Resolved' : severity}</span>;
}

function Badge({ tone, text }: { tone: 'red' | 'yellow' | 'gray'; text: string }) {
  const map: Record<string, string> = {
    red: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300',
    yellow: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300',
    gray: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200',
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${map[tone]}`}>{text}</span>;
}

function LegendDot({ label, className }: { label: string; className: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${className}`} />
      <span className="text-gray-600 dark:text-gray-400">{label}</span>
    </span>
  );
}

function CrawlTreemapCell(props: any) {
  const { x, y, width, height, payload } = props;
  const status = payload?.status as 'good' | 'warn' | 'bad' | undefined;
  const fill = status === 'good' ? '#22c55e' : status === 'warn' ? '#eab308' : '#ef4444';

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} style={{ fill, fillOpacity: 0.18, stroke: '#111827', strokeOpacity: 0.12 }} />
      {width > 80 && height > 22 ? (
        <text x={x + 8} y={y + 18} fill="#111827" fontSize={12} style={{ pointerEvents: 'none' }}>
          {String(payload?.name ?? '')}
        </text>
      ) : null}
    </g>
  );
}
