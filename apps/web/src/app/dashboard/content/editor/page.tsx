'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';

import { useContentDraft, useUpdateContentDraft } from '@/lib/queries';
import {
  stripHtml,
  countWords,
  keywordDensity,
  lengthScore,
  computeReadability,
} from '@/lib/readability';

// Load TipTap only on client side to avoid SSR issues
const RichEditor = dynamic(() => import('@/components/rich-editor'), { ssr: false });

export default function ContentEditorPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Article Editor</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">Loading…</p>
          </div>
        </div>
      }
    >
      <ContentEditorInner />
    </Suspense>
  );
}

function ContentEditorInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');

  const { data: draft, isLoading, isError, error } = useContentDraft(id);
  const updateDraft = useUpdateContentDraft();

  const [title, setTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [primaryKeyword, setPrimaryKeyword] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [status, setStatus] = useState<'draft' | 'pending_review' | 'approved' | 'rejected' | 'published'>('draft');

  const lastSavedRef = useRef<string>('');
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!draft) return;
    setTitle(draft.title);
    setMetaDescription(draft.metaDescription ?? '');
    setPrimaryKeyword(draft.primaryKeyword ?? '');
    // Support both HTML and markdown content from backend
    setHtmlContent(draft.markdown ?? '');
    setStatus(draft.status);
    lastSavedRef.current = JSON.stringify({
      title: draft.title,
      metaDescription: draft.metaDescription ?? '',
      primaryKeyword: draft.primaryKeyword ?? '',
      markdown: draft.markdown ?? '',
      status: draft.status,
    });
  }, [draft]);

  const plainText = useMemo(() => stripHtml(htmlContent), [htmlContent]);

  const metrics = useMemo(() => {
    const words = countWords(plainText);
    const density = keywordDensity(plainText, primaryKeyword);
    const readability = computeReadability(plainText);
    return {
      words,
      lengthScore: lengthScore(words),
      keywordDensity: density,
      readability,
    };
  }, [plainText, primaryKeyword]);

  const save = (mode: 'auto' | 'manual') => {
    if (!id) return;
    const payload = {
      title: title.trim() || 'Untitled',
      metaDescription: metaDescription.trim(),
      primaryKeyword: primaryKeyword.trim(),
      markdown: htmlContent,
      status,
    };
    const serialized = JSON.stringify(payload);
    if (mode === 'auto' && serialized === lastSavedRef.current) {
      return;
    }
    updateDraft.mutate({ id, input: payload }, { onSuccess: () => (lastSavedRef.current = serialized) });
  };

  // Autosave (debounced)
  useEffect(() => {
    if (!id) return;
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      save('auto');
    }, 800);
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, title, metaDescription, primaryKeyword, htmlContent, status]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Article Editor</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Implements Phase 3 task plan section 4.6.2 only</p>
        </div>

        <div className="flex items-center gap-3">
          {updateDraft.isPending ? (
            <span className="text-sm text-gray-500">Saving…</span>
          ) : updateDraft.isSuccess ? (
            <span className="text-sm text-green-600 dark:text-green-400">Saved</span>
          ) : null}

          <button
            onClick={() => save('manual')}
            disabled={!id || updateDraft.isPending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : isError ? (
        <div className="text-sm text-red-600 dark:text-red-400">{(error as Error).message}</div>
      ) : !draft ? (
        <div className="text-sm text-gray-500">No draft</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Meta description</label>
                <input
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-white"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Primary keyword</label>
                  <input
                    value={primaryKeyword}
                    onChange={(e) => setPrimaryKeyword(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-white"
                    placeholder=""
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-white"
                  >
                    <option value="draft">Draft</option>
                    <option value="pending_review">Pending review</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="published">Published</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Content</label>
              <RichEditor
                content={htmlContent}
                onChange={setHtmlContent}
                placeholder="Start writing your content…"
              />
            </div>
          </div>

          <div className="lg:col-span-1 space-y-4">
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">SEO Score</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Keyword density / readability / length</p>

              <div className="mt-4 space-y-3">
                <MetricRow label="Word count" value={metrics.words.toLocaleString()} />
                <MetricRow label="Length score" value={`${metrics.lengthScore}/100`} />
                <MetricRow label="Keyword density" value={`${metrics.keywordDensity.toFixed(2)}%`} />
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Readability</h2>
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div
                    className={`h-3 w-3 rounded-full ${
                      metrics.readability.score >= 60
                        ? 'bg-green-500'
                        : metrics.readability.score >= 40
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                    }`}
                  />
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {metrics.readability.label}
                  </span>
                </div>
                <MetricRow label="Flesch score" value={String(metrics.readability.fleschReadingEase)} />
                <MetricRow label="Grade level" value={String(metrics.readability.gradeLevel)} />
                <MetricRow label="Readability" value={`${metrics.readability.score}/100`} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600 dark:text-gray-400">{label}</span>
      <span className="font-medium text-gray-900 dark:text-white">{value}</span>
    </div>
  );
}
