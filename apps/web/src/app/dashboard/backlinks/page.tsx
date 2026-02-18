'use client';

import { useMemo, useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as ReTooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';

import { useBacklinkGap, useBacklinkProfile, useBacklinkTimeline, useOutreachCampaigns, useUpdateOutreachCampaignStatus } from '@/lib/queries';
import { formatRelativeTime } from '@/lib/utils';

type Column = { id: 'draft' | 'sent' | 'replied' | 'accepted'; title: string; statuses: Array<'draft' | 'sent' | 'opened' | 'replied' | 'accepted' | 'rejected'> };

const COLUMNS: Column[] = [
  { id: 'draft', title: 'To send', statuses: ['draft'] },
  { id: 'sent', title: 'Sent', statuses: ['sent', 'opened'] },
  { id: 'replied', title: 'Responded', statuses: ['replied'] },
  { id: 'accepted', title: 'Link acquired', statuses: ['accepted'] },
];

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#6b7280', '#8b5cf6', '#ef4444'];

export default function BacklinksPage() {
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d');
  const { data: profile, isLoading: profileLoading } = useBacklinkProfile();
  const { data: timeline, isLoading: timelineLoading } = useBacklinkTimeline(range);
  const { data: outreach, isLoading: outreachLoading } = useOutreachCampaigns();
  const updateOutreach = useUpdateOutreachCampaignStatus();
  const { data: gap, isLoading: gapLoading } = useBacklinkGap(50);

  const daData = profile?.daBuckets ?? [];
  const campaigns = outreach?.campaigns ?? [];

  const grouped = useMemo(() => {
    const by: Record<string, typeof campaigns> = { draft: [], sent: [], replied: [], accepted: [] };
    for (const c of campaigns) {
      const col = COLUMNS.find((x) => x.statuses.includes(c.status))?.id ?? 'draft';
      by[col].push(c);
    }
    return by;
  }, [campaigns]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Backlink Manager</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Implements Phase 3 task plan section 4.8 only</p>
        </div>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value as '7d' | '30d' | '90d')}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-white"
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Profile Overview */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Backlink Profile Overview</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">DA distribution + totals</p>

          {profileLoading ? (
            <div className="mt-6 text-sm text-gray-500">Loading…</div>
          ) : profile ? (
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={daData} dataKey="count" nameKey="bucket" outerRadius={80}>
                      {daData.map((_, idx) => (
                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <ReTooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-4">
                <Stat label="Total backlinks" value={profile.totals.backlinks.toLocaleString()} />
                <Stat label="Referring domains" value={profile.totals.referringDomains.toLocaleString()} />
                <p className="text-xs text-gray-500 dark:text-gray-500">Counts are based on discovered opportunities in MVP.</p>
              </div>
            </div>
          ) : (
            <div className="mt-6 text-sm text-gray-500">No backlink data</div>
          )}
        </div>

        {/* New/Lost Timeline */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">New / Lost Links Tracking</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Timeline for new/lost links</p>

          <div className="mt-6 h-56">
            {timelineLoading ? (
              <div className="text-sm text-gray-500">Loading…</div>
            ) : timeline && timeline.points.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeline.points}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                  <XAxis dataKey="date" stroke="#9ca3af" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#9ca3af" style={{ fontSize: '12px' }} />
                  <ReTooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }} />
                  <Line type="monotone" dataKey="new" stroke="#10b981" strokeWidth={2} dot={false} name="New" />
                  <Line type="monotone" dataKey="lost" stroke="#ef4444" strokeWidth={2} dot={false} name="Lost" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-sm text-gray-500">No timeline data</div>
            )}
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">Lost links are pending Phase 4 in MVP.</p>
        </div>

        {/* Outreach Kanban */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Outreach Management</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Kanban board · drag & drop status updates</p>

          {outreachLoading ? (
            <div className="mt-6 text-sm text-gray-500">Loading…</div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-4">
              {COLUMNS.map((col) => (
                <KanbanColumn
                  key={col.id}
                  title={col.title}
                  items={grouped[col.id]}
                  onDrop={(campaignId) => {
                    const statusMap: Record<Column['id'], any> = { draft: 'draft', sent: 'sent', replied: 'replied', accepted: 'accepted' };
                    updateOutreach.mutate({ id: campaignId, status: statusMap[col.id] });
                  }}
                />
              ))}
            </div>
          )}

          {updateOutreach.isError ? (
            <div className="mt-4 text-sm text-red-600 dark:text-red-400">{(updateOutreach.error as Error).message}</div>
          ) : null}
        </div>

        {/* Competitor Gap */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 lg:col-span-2">
          <div className="border-b border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Competitor Backlink Gap</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Competitor-only links (opportunities)</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Domain</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">DR</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Priority</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Competitors</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Discovered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {gapLoading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-500">Loading…</td>
                  </tr>
                ) : gap && gap.opportunities.length > 0 ? (
                  gap.opportunities.map((o) => (
                    <tr key={o.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{o.targetDomain}</div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-500 max-w-[420px] truncate">{o.targetUrl}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{o.domainRating ?? '—'}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{o.priority}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{o.competitors.slice(0, 3).join(', ') || '—'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{formatRelativeTime(o.discoveredAt)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-500">No gap data</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className="text-xs text-gray-500 dark:text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}

function KanbanColumn({
  title,
  items,
  onDrop,
}: {
  title: string;
  items: Array<{ id: string; targetDomain: string; subject: string; contactEmail: string; updatedAt: string }>;
  onDrop: (campaignId: string) => void;
}) {
  return (
    <div
      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain');
        if (id) onDrop(id);
      }}
    >
      <div className="border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
          <span className="text-xs text-gray-500 dark:text-gray-500">{items.length}</span>
        </div>
      </div>
      <div className="p-4 space-y-3 min-h-[180px]">
        {items.map((c) => (
          <div
            key={c.id}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/plain', c.id)}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/20 p-3 cursor-move"
          >
            <div className="text-sm font-medium text-gray-900 dark:text-white">{c.targetDomain}</div>
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-500 line-clamp-2">{c.subject}</div>
            <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-500">{c.contactEmail}</div>
            <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-500">Updated {formatRelativeTime(c.updatedAt)}</div>
          </div>
        ))}
        {items.length === 0 ? <div className="text-sm text-gray-500">Empty</div> : null}
      </div>
    </div>
  );
}
