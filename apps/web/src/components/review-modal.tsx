'use client';

import { useState } from 'react';
import { X, CheckCircle2, XCircle, History, MessageSquare } from 'lucide-react';
import { useSubmitContentReview, useReviewHistory, usePublishContent } from '@/lib/queries';

interface ReviewModalProps {
  contentId: string;
  contentTitle: string;
  contentHtml?: string;
  onClose: () => void;
}

export function ReviewModal({ contentId, contentTitle, contentHtml, onClose }: ReviewModalProps) {
  const [tab, setTab] = useState<'review' | 'history'>('review');
  const [comment, setComment] = useState('');
  const submitReview = useSubmitContentReview();
  const publishContent = usePublishContent();
  const { data: historyData, isLoading: historyLoading } = useReviewHistory(contentId);

  const handleReview = (action: 'approve' | 'reject') => {
    submitReview.mutate(
      { id: contentId, input: { action, comment: comment.trim() || undefined } },
      { onSuccess: () => onClose() },
    );
  };

  const handlePublish = () => {
    publishContent.mutate(contentId, { onSuccess: () => onClose() });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Content Review</h2>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400 truncate max-w-md">{contentTitle}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 px-6">
          <nav className="flex gap-4">
            <button
              onClick={() => setTab('review')}
              className={`border-b-2 py-3 text-sm font-medium ${
                tab === 'review'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}
            >
              Review
            </button>
            <button
              onClick={() => setTab('history')}
              className={`border-b-2 py-3 text-sm font-medium ${
                tab === 'history'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <History className="h-3.5 w-3.5" />
                History
              </span>
            </button>
          </nav>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-6" style={{ maxHeight: 'calc(80vh - 200px)' }}>
          {tab === 'review' ? (
            <div className="space-y-4">
              {/* Content preview */}
              {contentHtml ? (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-4">
                  <h3 className="mb-2 text-xs font-medium uppercase text-gray-500">Preview</h3>
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none max-h-48 overflow-y-auto"
                    dangerouslySetInnerHTML={{ __html: contentHtml }}
                  />
                </div>
              ) : null}

              {/* Comment */}
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Review Comment
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={4}
                  placeholder="Add feedback or notes (optional)…"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => handleReview('reject')}
                  disabled={submitReview.isPending}
                  className="flex items-center gap-1.5 rounded-lg border border-red-300 dark:border-red-700 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                >
                  <XCircle className="h-4 w-4" />
                  Reject
                </button>
                <button
                  onClick={() => handleReview('approve')}
                  disabled={submitReview.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Approve
                </button>
                <button
                  onClick={handlePublish}
                  disabled={publishContent.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Publish
                </button>
              </div>

              {submitReview.isError ? (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {(submitReview.error as Error).message || 'Review failed'}
                </p>
              ) : null}
            </div>
          ) : (
            /* History tab */
            <div className="space-y-3">
              {historyLoading ? (
                <p className="text-sm text-gray-500">Loading history…</p>
              ) : historyData && historyData.history.length > 0 ? (
                historyData.history.map((entry, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-3"
                  >
                    <div
                      className={`mt-0.5 h-6 w-6 rounded-full flex items-center justify-center ${
                        entry.action === 'approve'
                          ? 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400'
                          : 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
                      }`}
                    >
                      {entry.action === 'approve' ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-gray-900 dark:text-white capitalize">
                          {entry.action === 'approve' ? 'Approved' : 'Rejected'}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {new Date(entry.reviewedAt).toLocaleString()}
                        </span>
                      </div>
                      {entry.comment ? (
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{entry.comment}</p>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">No review history yet</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ReviewModal;
