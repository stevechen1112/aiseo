'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { FileText, Plus, Filter, MoreVertical, Eye, Edit, Trash2, Clock, CheckCircle2, AlertCircle, ClipboardCheck, CalendarDays, LayoutGrid } from 'lucide-react';
import { useContentStatus, useContent, usePublishedContentPerformance } from '@/lib/queries';
import { formatRelativeTime } from '@/lib/utils';

const ReviewModal = dynamic(() => import('@/components/review-modal'), { ssr: false });
const ContentCalendar = dynamic(() => import('@/components/content-calendar'), { ssr: false });

export default function ContentPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [perfRange, setPerfRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [perfTag, setPerfTag] = useState('');
  const [perfAuthor, setPerfAuthor] = useState<'all' | 'ai' | 'reviewer'>('all');
  const [reviewTarget, setReviewTarget] = useState<{ id: string; title: string } | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'calendar'>('grid');
  const limit = 12;
  
  const { data: status, isLoading: statusLoading } = useContentStatus();
  const { data: contentData, isLoading: contentLoading } = useContent(page, limit, activeTab !== 'all' ? activeTab : undefined);
  const { data: perfData, isLoading: perfLoading } = usePublishedContentPerformance({
    range: perfRange,
    tag: perfTag,
    author: perfAuthor,
    limit: 50,
  });
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Content Management</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Manage your SEO-optimized content and drafts
          </p>
        </div>
        <div className="flex gap-3">
          <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium ${
                viewMode === 'grid'
                  ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                  : 'bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-l border-gray-300 dark:border-gray-600 ${
                viewMode === 'calendar'
                  ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                  : 'bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <CalendarDays className="h-4 w-4" />
            </button>
          </div>
          <button className="flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
            <Filter className="h-4 w-4" />
            Filter
          </button>
          <button className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" />
            New Content
          </button>
        </div>
      </div>

      {/* Status Overview */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {statusLoading ? (
          <>
            <StatusCardSkeleton />
            <StatusCardSkeleton />
            <StatusCardSkeleton />
            <StatusCardSkeleton />
          </>
        ) : status ? (
          <>
            <StatusCard title="Published" count={status.published} color="bg-green-500" />
            <StatusCard title="Draft" count={status.draft} color="bg-yellow-500" />
            <StatusCard title="Pending" count={status.pending} color="bg-blue-500" />
            <StatusCard title="Scheduled" count={status.scheduled} color="bg-purple-500" />
          </>
        ) : (
          <div className="col-span-4 text-center text-gray-500">Failed to load status</div>
        )}
      </div>

      {/* Content Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-6">
          <button 
            onClick={() => setActiveTab('all')}
            className={`border-b-2 pb-3 text-sm font-medium ${
              activeTab === 'all' 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            All Content
          </button>
          <button 
            onClick={() => setActiveTab('blog')}
            className={`border-b-2 pb-3 text-sm font-medium ${
              activeTab === 'blog' 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            Blog Posts
          </button>
          <button 
            onClick={() => setActiveTab('landing')}
            className={`border-b-2 pb-3 text-sm font-medium ${
              activeTab === 'landing' 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            Landing Pages
          </button>
          <button 
            onClick={() => setActiveTab('product')}
            className={`border-b-2 pb-3 text-sm font-medium ${
              activeTab === 'product' 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            Product Pages
          </button>
        </nav>
      </div>

      {/* Published Content Performance */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="border-b border-gray-200 dark:border-gray-700 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Published Content Performance</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Article / publish date / traffic / rank / conversions</p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                value={perfRange}
                onChange={(e) => setPerfRange(e.target.value as '7d' | '30d' | '90d')}
                className="rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-white"
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>

              <input
                value={perfTag}
                onChange={(e) => setPerfTag(e.target.value)}
                placeholder="Tag"
                className="rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-white"
              />

              <select
                value={perfAuthor}
                onChange={(e) => setPerfAuthor(e.target.value as 'all' | 'ai' | 'reviewer')}
                className="rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-white"
              >
                <option value="all">All authors</option>
                <option value="ai">AI</option>
                <option value="reviewer">Reviewer</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Article</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Published</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Traffic</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rank</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Conversions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {perfLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-500">Loading…</td>
                </tr>
              ) : perfData && perfData.data.length > 0 ? (
                perfData.data.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{row.title}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-500">{row.tag || '—'} · {row.author}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{formatRelativeTime(row.publishedAt)}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{row.traffic.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{row.rank > 0 ? row.rank : '—'}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{row.conversions.toLocaleString()}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-500">No published performance data</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Content View: Grid or Calendar */}
      {viewMode === 'calendar' ? (
        <ContentCalendar
          onSelectItem={(id) => router.push(`/dashboard/content/editor?id=${encodeURIComponent(id)}`)}
        />
      ) : (
        <>
          {/* Content Grid */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {contentLoading ? (
          <>
            <ContentCardSkeleton />
            <ContentCardSkeleton />
            <ContentCardSkeleton />
            <ContentCardSkeleton />
            <ContentCardSkeleton />
            <ContentCardSkeleton />
          </>
        ) : contentData && contentData.data.length > 0 ? (
          contentData.data.map((item) => (
            <ContentCard
              key={item.id}
              id={item.id}
              title={item.title}
              excerpt={item.excerpt}
              status={item.status as 'published' | 'draft' | 'pending' | 'scheduled'}
              wordCount={item.wordCount}
              lastModified={formatRelativeTime(item.lastModified)}
              author={item.author}
              targetKeyword={item.targetKeyword}
              onEdit={() => router.push(`/dashboard/content/editor?id=${encodeURIComponent(item.id)}`)}
              onReview={() => setReviewTarget({ id: item.id, title: item.title })}
            />
          ))
        ) : (
          <div className="col-span-3 text-center py-12 text-gray-500">
            No content found
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-6">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {contentData ? (
            <>
              Showing {(page - 1) * limit + 1}-{Math.min(page * limit, contentData.total)} of{' '}
              {contentData.total} articles
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
            disabled={!contentData || page * limit >= contentData.total}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
        </>
      )}

      {/* Review Modal */}
      {reviewTarget ? (
        <ReviewModal
          contentId={reviewTarget.id}
          contentTitle={reviewTarget.title}
          onClose={() => setReviewTarget(null)}
        />
      ) : null}
    </div>
  );
}

function StatusCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 animate-pulse">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-3 w-3 rounded-full bg-gray-300 dark:bg-gray-600" />
        <div className="h-4 w-24 bg-gray-300 dark:bg-gray-600 rounded" />
      </div>
      <div className="h-9 w-16 bg-gray-300 dark:bg-gray-600 rounded" />
    </div>
  );
}

function ContentCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 animate-pulse">
      <div className="p-6">
        <div className="flex items-start justify-between mb-3">
          <div className="h-6 w-24 bg-gray-300 dark:bg-gray-600 rounded-full" />
          <div className="h-5 w-5 bg-gray-300 dark:bg-gray-600 rounded" />
        </div>
        <div className="h-6 w-full bg-gray-300 dark:bg-gray-600 rounded mb-2" />
        <div className="h-6 w-3/4 bg-gray-300 dark:bg-gray-600 rounded mb-4" />
        <div className="h-4 w-full bg-gray-300 dark:bg-gray-600 rounded mb-2" />
        <div className="h-4 w-full bg-gray-300 dark:bg-gray-600 rounded mb-2" />
        <div className="h-4 w-2/3 bg-gray-300 dark:bg-gray-600 rounded mb-4" />
        <div className="space-y-2 mb-4">
          <div className="h-3 w-24 bg-gray-300 dark:bg-gray-600 rounded" />
          <div className="h-3 w-32 bg-gray-300 dark:bg-gray-600 rounded" />
        </div>
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <div className="flex items-center justify-between">
            <div className="h-3 w-24 bg-gray-300 dark:bg-gray-600 rounded" />
            <div className="h-3 w-20 bg-gray-300 dark:bg-gray-600 rounded" />
          </div>
        </div>
      </div>
      <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center justify-end gap-2">
        <div className="h-7 w-20 bg-gray-300 dark:bg-gray-600 rounded" />
        <div className="h-7 w-16 bg-gray-300 dark:bg-gray-600 rounded" />
        <div className="h-7 w-20 bg-gray-300 dark:bg-gray-600 rounded" />
      </div>
    </div>
  );
}

function StatusCard({
  title,
  count,
  color,
}: {
  title: string;
  count: number;
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
        {count}
      </div>
    </div>
  );
}

function ContentCard({
  id,
  title,
  excerpt,
  status,
  wordCount,
  lastModified,
  author,
  targetKeyword,
  onEdit,
  onReview,
}: {
  id: string;
  title: string;
  excerpt: string;
  status: 'published' | 'draft' | 'pending' | 'scheduled';
  wordCount: number;
  lastModified: string;
  author: string;
  targetKeyword: string;
  onEdit: () => void;
  onReview: () => void;
}) {
  const statusConfig = {
    published: { 
      label: 'Published', 
      color: 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20',
      icon: <CheckCircle2 className="h-3 w-3" />
    },
    draft: { 
      label: 'Draft', 
      color: 'text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20',
      icon: <Edit className="h-3 w-3" />
    },
    pending: { 
      label: 'Pending Review', 
      color: 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20',
      icon: <Clock className="h-3 w-3" />
    },
    scheduled: { 
      label: 'Scheduled', 
      color: 'text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20',
      icon: <Clock className="h-3 w-3" />
    },
  };
  
  const config = statusConfig[status];
  
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-lg transition-shadow">
      <div className="p-6">
        <div className="flex items-start justify-between mb-3">
          <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${config.color}`}>
            {config.icon}
            {config.label}
          </div>
          <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>
        
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 line-clamp-2">
          {title}
        </h3>
        
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-3">
          {excerpt}
        </p>
        
        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-500">
            <FileText className="h-3 w-3" />
            <span>{wordCount.toLocaleString()} words</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-500">
            <span className="font-medium">Target:</span>
            <span className="text-blue-600 dark:text-blue-400">{targetKeyword}</span>
          </div>
        </div>
        
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-500">
            <span>{author}</span>
            <span>{lastModified}</span>
          </div>
        </div>
      </div>
      
      <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center justify-end gap-2">
        <button className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
          <Eye className="h-3 w-3" />
          Preview
        </button>
        <button
          onClick={onReview}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
        >
          <ClipboardCheck className="h-3 w-3" />
          Review
        </button>
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <Edit className="h-3 w-3" />
          Edit
        </button>
        <button className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
          <Trash2 className="h-3 w-3" />
          Delete
        </button>
      </div>
    </div>
  );
}
