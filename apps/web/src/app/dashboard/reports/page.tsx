'use client';

import { useMemo, useState } from 'react';

import {
  useReports,
  useReportTemplates,
  useSaveReportTemplate,
  useGenerateReport,
  useReportSchedules,
  useCreateReportSchedule,
  useDeleteReportSchedule,
} from '@/lib/queries';
import { formatRelativeTime } from '@/lib/utils';

type Module = 'rankings' | 'traffic' | 'content' | 'backlinks';

export default function ReportsPage() {
  const [type, setType] = useState('');
  const [range, setRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const { data, isLoading, isError, error } = useReports({ type: type || undefined, range, limit: 50 });

  const { data: templatesData, isLoading: templatesLoading } = useReportTemplates();
  const saveTemplate = useSaveReportTemplate();

  const [tplName, setTplName] = useState('');
  const [tplRange, setTplRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [modules, setModules] = useState<Record<Module, boolean>>({
    rankings: true,
    traffic: true,
    content: false,
    backlinks: false,
  });

  const selectedModules = useMemo(() => {
    return (Object.entries(modules) as Array<[Module, boolean]>).filter(([, v]) => v).map(([k]) => k);
  }, [modules]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Report Center</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Implements Phase 3 task plan section 4.9 only</p>
      </div>

      {/* Auto reports list */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="border-b border-gray-200 dark:border-gray-700 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Auto Reports</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Name / type / date / download</p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={type}
                onChange={(e) => setType(e.target.value)}
                placeholder="Type filter"
                className="rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-white"
              />
              <select
                value={range}
                onChange={(e) => setRange(e.target.value as any)}
                className="rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-white"
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="all">All</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Report</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Download</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-sm text-gray-500">Loading…</td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-sm text-red-600 dark:text-red-400">{(error as Error).message}</td>
                </tr>
              ) : data && data.reports.length > 0 ? (
                data.reports.map((r) => (
                  <ReportRow key={r.id} report={r} />
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-sm text-gray-500">No reports</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Builder */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Custom Report Builder</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Select modules + time range and save template</p>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Template name</label>
              <input
                value={tplName}
                onChange={(e) => setTplName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-white"
                placeholder="Executive monthly"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Time range</label>
              <select
                value={tplRange}
                onChange={(e) => setTplRange(e.target.value as any)}
                className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-white"
              >
                <option value="7d">7d</option>
                <option value="30d">30d</option>
                <option value="90d">90d</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Modules</label>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(['rankings', 'traffic', 'content', 'backlinks'] as Module[]).map((m) => (
                  <label key={m} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={modules[m]}
                      onChange={(e) => setModules((prev) => ({ ...prev, [m]: e.target.checked }))}
                    />
                    {m}
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                if (!tplName.trim() || selectedModules.length === 0) return;
                saveTemplate.mutate({ name: tplName.trim(), modules: selectedModules as any, range: tplRange });
              }}
              disabled={saveTemplate.isPending || !tplName.trim() || selectedModules.length === 0}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Template
            </button>

            {saveTemplate.isError ? (
              <div className="text-sm text-red-600 dark:text-red-400">{(saveTemplate.error as Error).message}</div>
            ) : null}
            {saveTemplate.isSuccess ? <div className="text-sm text-green-600 dark:text-green-400">Saved</div> : null}
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Saved Templates</h3>
            <div className="mt-4 space-y-3">
              {templatesLoading ? (
                <div className="text-sm text-gray-500">Loading…</div>
              ) : templatesData && templatesData.templates.length > 0 ? (
                templatesData.templates.map((t) => (
                  <TemplateCard key={t.id} template={t} />
                ))
              ) : (
                <div className="text-sm text-gray-500">No templates</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Scheduled Reports */}
      <ScheduledReportsSection />
    </div>
  );
}

function TemplateCard({ template }: { template: { id: string; name: string; modules: string[]; range: string; createdAt: string } }) {
  const generateReport = useGenerateReport();
  const createSchedule = useCreateReportSchedule();
  const [showSchedule, setShowSchedule] = useState(false);
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [recipients, setRecipients] = useState('');

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
      <div className="text-sm font-medium text-gray-900 dark:text-white">{template.name}</div>
      <div className="mt-1 text-xs text-gray-500 dark:text-gray-500">
        {template.modules.join(', ')} · {template.range} · {formatRelativeTime(template.createdAt)}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => generateReport.mutate({ templateId: template.id })}
          disabled={generateReport.isPending}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {generateReport.isPending ? 'Generating…' : 'Generate Now'}
        </button>
        <button
          onClick={() => setShowSchedule((s) => !s)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          {showSchedule ? 'Cancel' : 'Schedule'}
        </button>
      </div>

      {generateReport.isSuccess ? (
        <div className="mt-2 text-xs text-green-600 dark:text-green-400">Report generated successfully</div>
      ) : generateReport.isError ? (
        <div className="mt-2 text-xs text-red-600 dark:text-red-400">
          {(generateReport.error as Error).message || 'Generation failed'}
        </div>
      ) : null}

      {showSchedule ? (
        <div className="mt-3 space-y-2 border-t border-gray-200 dark:border-gray-700 pt-3">
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as typeof frequency)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-1.5 text-xs text-gray-900 dark:text-white"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <input
            value={recipients}
            onChange={(e) => setRecipients(e.target.value)}
            placeholder="email1@example.com, email2@example.com"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-1.5 text-xs text-gray-900 dark:text-white"
          />
          <button
            onClick={() => {
              const emails = recipients.split(',').map((e) => e.trim()).filter(Boolean);
              if (emails.length === 0) return;
              createSchedule.mutate(
                { templateId: template.id, frequency, recipients: emails },
                { onSuccess: () => setShowSchedule(false) },
              );
            }}
            disabled={createSchedule.isPending || !recipients.trim()}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {createSchedule.isPending ? 'Creating…' : 'Create Schedule'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ScheduledReportsSection() {
  const { data, isLoading } = useReportSchedules();
  const deleteSchedule = useDeleteReportSchedule();

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Scheduled Reports</h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Automated report delivery via email
      </p>

      <div className="mt-4 space-y-3">
        {isLoading ? (
          <div className="text-sm text-gray-500">Loading…</div>
        ) : data && data.schedules.length > 0 ? (
          data.schedules.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 p-3"
            >
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  Template: {s.templateId}
                </div>
                <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {s.frequency} · {s.recipients.join(', ')} · created {formatRelativeTime(s.createdAt)}
                </div>
              </div>
              <button
                onClick={() => deleteSchedule.mutate(s.id)}
                disabled={deleteSchedule.isPending}
                className="rounded-lg border border-red-300 dark:border-red-700 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))
        ) : (
          <div className="text-sm text-gray-500">No scheduled reports</div>
        )}
      </div>
    </div>
  );
}

function ReportRow({ report }: { report: { id: string; reportId: string; format: string; startDate: string; endDate: string; generatedAt: string } }) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
      <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{report.reportId}</td>
      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{report.format}</td>
      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{report.startDate} → {report.endDate}</td>
      <td className="px-6 py-4 text-right">
        <button
          onClick={async () => {
            setDownloading(true);
            setProgress(0);
            try {
              const res = await fetch(`/api/reports/${encodeURIComponent(report.id)}/download`);
              if (!res.ok) {
                throw new Error('Download failed');
              }
              const total = Number(res.headers.get('content-length') ?? '0');
              const reader = res.body?.getReader();
              const chunks: Uint8Array[] = [];
              let received = 0;
              if (reader) {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  if (value) {
                    chunks.push(value);
                    received += value.byteLength;
                    if (total > 0) {
                      setProgress(Math.round((received / total) * 100));
                    }
                  }
                }
              }
              const blob = new Blob(chunks as unknown as BlobPart[], { type: 'application/pdf' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${report.reportId}.pdf`;
              a.click();
              URL.revokeObjectURL(url);
              setProgress(100);
            } finally {
              setTimeout(() => {
                setDownloading(false);
                setProgress(null);
              }, 600);
            }
          }}
          disabled={downloading}
          className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {downloading ? (progress !== null ? `Downloading ${progress}%` : 'Downloading…') : 'Download PDF'}
        </button>
      </td>
    </tr>
  );
}
