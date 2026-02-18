'use client';

import { useMemo, useState } from 'react';
import { Download, Filter, PauseCircle, Play, PlayCircle } from 'lucide-react';

import {
  useAgentActivities,
  usePauseSchedule,
  useResumeSchedule,
  useRunSchedule,
  useSchedules,
} from '@/lib/queries';
import { formatRelativeTime } from '@/lib/utils';

type AgentId =
  | 'keyword-researcher'
  | 'serp-tracker'
  | 'content-writer'
  | 'technical-auditor'
  | 'competitor-monitor'
  | 'backlink-builder'
  | 'report-generator'
  | 'schema-agent'
  | 'internal-linker'
  | 'pagespeed-agent'
  | 'local-seo'
  | 'content-refresher';

const AGENTS: Array<{ id: AgentId; label: string }> = [
  { id: 'keyword-researcher', label: 'Keyword Researcher' },
  { id: 'serp-tracker', label: 'SERP Tracker' },
  { id: 'content-writer', label: 'Content Writer' },
  { id: 'technical-auditor', label: 'Technical Auditor' },
  { id: 'competitor-monitor', label: 'Competitor Monitor' },
  { id: 'backlink-builder', label: 'Backlink Builder' },
  { id: 'report-generator', label: 'Report Generator' },
  { id: 'schema-agent', label: 'Schema Agent' },
  { id: 'internal-linker', label: 'Internal Linker' },
  { id: 'pagespeed-agent', label: 'PageSpeed Agent' },
  { id: 'local-seo', label: 'Local SEO' },
  { id: 'content-refresher', label: 'Content Refresher' },
];

export default function AgentsPage() {
  const { data: schedules, isLoading: schedulesLoading, isError: schedulesError } = useSchedules();
  const { data: activities, isLoading: activitiesLoading } = useAgentActivities();
  const pauseSchedule = usePauseSchedule();
  const resumeSchedule = useResumeSchedule();
  const runSchedule = useRunSchedule();

  const [filterAgent, setFilterAgent] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'running' | 'completed' | 'failed'>('all');
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const scheduleById = useMemo(() => {
    const map = new Map<string, NonNullable<typeof schedules>[number]>();
    (schedules ?? []).forEach((s) => map.set(s.id, s));
    return map;
  }, [schedules]);

  const filteredActivities = useMemo(() => {
    const now = Date.now();
    const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
    const minTs = now - days * 24 * 60 * 60 * 1000;

    return (activities ?? []).filter((a) => {
      if (filterAgent !== 'all' && a.agentName !== filterAgent) return false;
      if (filterStatus !== 'all' && a.status !== filterStatus) return false;
      const startedAt = Date.parse(a.startedAt);
      return Number.isFinite(startedAt) ? startedAt >= minTs : true;
    });
  }, [activities, filterAgent, filterStatus, timeRange]);

  const totalPages = Math.max(1, Math.ceil(filteredActivities.length / pageSize));
  const pagedActivities = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredActivities.slice(start, start + pageSize);
  }, [filteredActivities, page]);

  const downloadLogs = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      filters: { agent: filterAgent, status: filterStatus, timeRange },
      count: filteredActivities.length,
      items: filteredActivities,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `agent-logs-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const busy = pauseSchedule.isPending || resumeSchedule.isPending || runSchedule.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Agent Status Panel</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Phase 3 (4.3): status cards + manual trigger + pause/resume</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {AGENTS.map((agent) => (
          <AgentCard
            key={agent.id}
            agentId={agent.id}
            label={agent.label}
            schedule={scheduleById.get(agent.id)}
            loading={schedulesLoading}
            error={schedulesError}
            busy={busy}
            onRun={() => runSchedule.mutate(agent.id)}
            onPause={() => pauseSchedule.mutate(agent.id)}
            onResume={() => resumeSchedule.mutate(agent.id)}
          />
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="border-b border-gray-200 dark:border-gray-700 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Agent Activity Logs</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Filters + pagination + download</p>
            </div>
            <button
              onClick={downloadLogs}
              className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <Download className="h-4 w-4" />
              Download Logs
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <select
                value={filterAgent}
                onChange={(e) => {
                  setPage(1);
                  setFilterAgent(e.target.value);
                }}
                className="w-full bg-transparent text-sm text-gray-900 dark:text-white outline-none"
              >
                <option value="all">All agents</option>
                {AGENTS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>

            <select
              value={filterStatus}
              onChange={(e) => {
                setPage(1);
                setFilterStatus(e.target.value as typeof filterStatus);
              }}
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-white"
            >
              <option value="all">All statuses</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>

            <select
              value={timeRange}
              onChange={(e) => {
                setPage(1);
                setTimeRange(e.target.value as typeof timeRange);
              }}
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-white"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>

            <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm text-gray-600 dark:text-gray-400">
              {filteredActivities.length.toLocaleString()} records
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Agent</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Task</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {activitiesLoading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-sm text-gray-500">Loading activity…</td>
                </tr>
              ) : pagedActivities.length > 0 ? (
                pagedActivities.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{a.agentName}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          a.status === 'completed'
                            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                            : a.status === 'failed'
                              ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                              : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                        }`}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">{a.task}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-500">{formatRelativeTime(a.startedAt)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-sm text-gray-500">No activity logs</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
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

function AgentCard({
  agentId,
  label,
  schedule,
  loading,
  error,
  busy,
  onRun,
  onPause,
  onResume,
}: {
  agentId: string;
  label: string;
  schedule?: { id: string; enabled: boolean; cron: string; updatedAt: string };
  loading: boolean;
  error: boolean;
  busy: boolean;
  onRun: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const badge = loading
    ? { text: 'Loading', cls: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300' }
    : error
      ? { text: 'Error', cls: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' }
      : schedule
        ? schedule.enabled
          ? { text: 'Enabled', cls: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' }
          : { text: 'Paused', cls: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400' }
        : { text: 'Not configured', cls: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300' };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">{label}</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">{agentId}</p>
        </div>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.text}</span>
      </div>

      <div className="mt-4 space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-gray-600 dark:text-gray-400">Last updated</span>
          <span className="text-gray-900 dark:text-white">{schedule ? formatRelativeTime(schedule.updatedAt) : '—'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-600 dark:text-gray-400">Cron</span>
          <span className="text-gray-900 dark:text-white truncate max-w-[10rem]">{schedule ? schedule.cron : '—'}</span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <button
          onClick={onRun}
          disabled={!schedule || busy}
          className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Play className="h-4 w-4" />
          Run
        </button>
        <button
          onClick={onPause}
          disabled={!schedule || !schedule.enabled || busy}
          className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <PauseCircle className="h-4 w-4" />
          Pause
        </button>
        <button
          onClick={onResume}
          disabled={!schedule || schedule.enabled || busy}
          className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <PlayCircle className="h-4 w-4" />
          Resume
        </button>
      </div>
    </div>
  );
}
