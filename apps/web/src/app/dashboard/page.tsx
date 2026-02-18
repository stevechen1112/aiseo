'use client';

import { useEffect, useState } from 'react';
import { 
  ArrowUp, 
  ArrowDown, 
  TrendingUp, 
  Activity,
  AlertCircle,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useDashboardMetrics, useAgentActivities, useAlerts, useWorkflowStatuses } from '@/lib/queries';
import { formatRelativeTime } from '@/lib/utils';
import { useWebSocket, WebSocketEvents } from '@/lib/websocket';
import { useAuth } from '@/lib/auth-context';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';

export default function DashboardPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { data: metrics, isLoading: metricsLoading } = useDashboardMetrics();
  const { data: activities, isLoading: activitiesLoading } = useAgentActivities();
  const { data: alerts, isLoading: alertsLoading } = useAlerts();
  const { data: workflows, isLoading: workflowsLoading } = useWorkflowStatuses();

  // WebSocket for real-time updates
  const { status: wsStatus } = useWebSocket({
    token: token || undefined,
    enabled: !!token,
    onMessage: (message) => {
      // Invalidate relevant queries based on event type
      switch (message.type) {
        case WebSocketEvents.AGENT_TASK_COMPLETED:
        case WebSocketEvents.AGENT_TASK_STARTED:
        case WebSocketEvents.AGENT_TASK_FAILED:
          queryClient.invalidateQueries({ queryKey: ['agents', 'activities'] });
          break;
        
        case WebSocketEvents.SERP_RANK_UPDATED:
        case WebSocketEvents.SERP_RANK_ANOMALY:
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'metrics'] });
          queryClient.invalidateQueries({ queryKey: ['alerts'] });
          break;
        
        case WebSocketEvents.PAGESPEED_ALERT_CRITICAL:
        case WebSocketEvents.TECHNICAL_ISSUE_FOUND:
          queryClient.invalidateQueries({ queryKey: ['alerts'] });
          break;
        
        case WebSocketEvents.WORKFLOW_STARTED:
        case WebSocketEvents.WORKFLOW_COMPLETED:
        case WebSocketEvents.WORKFLOW_FAILED:
        case WebSocketEvents.WORKFLOW_STAGE_COMPLETED:
          queryClient.invalidateQueries({ queryKey: ['workflows', 'status'] });
          break;
        
        case WebSocketEvents.CONTENT_PUBLISHED:
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'metrics'] });
          break;
      }
    },
  });

  useEffect(() => {
    // Fast path: check localStorage cache first (avoids flash on cold load)
    try {
      const cached = localStorage.getItem('aiseo_onboarding_seen_v1');
      if (cached) { setShowOnboarding(false); return; }
    } catch { /* ignore */ }

    // Slower path: ask the server (survives cache clears & device switches)
    if (!token) { setShowOnboarding(true); return; }

    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((data: any) => {
        const seenAt = data?.user?.settings?.onboardingSeenAt;
        setShowOnboarding(!seenAt);
        if (seenAt) {
          try { localStorage.setItem('aiseo_onboarding_seen_v1', seenAt); } catch { /* ignore */ }
        }
      })
      .catch(() => setShowOnboarding(true));
  }, [token]);

  const dismissOnboarding = () => {
    const now = new Date().toISOString();
    // Optimistically update UI
    setShowOnboarding(false);
    // Cache locally
    try { localStorage.setItem('aiseo_onboarding_seen_v1', now); } catch { /* ignore */ }
    // Persist to server (best-effort — not awaited)
    if (token) {
      fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ settings: { onboardingSeenAt: now } }),
      }).catch(() => {/* ignore non-critical */});
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard Overview</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Monitor your SEO performance and AI agent activities
          </p>
        </div>
        {/* WebSocket Status Indicator */}
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${
            wsStatus === 'connected' ? 'bg-green-500 animate-pulse' :
            wsStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' :
            'bg-red-500'
          }`} />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {wsStatus === 'connected' ? 'Live' :
             wsStatus === 'connecting' ? 'Connecting...' :
             'Offline'}
          </span>
        </div>
      </div>

      {showOnboarding && (
        <OnboardingWizard
          token={token ?? undefined}
          onDismiss={dismissOnboarding}
          onComplete={dismissOnboarding}
        />
      )}

      {/* Key Metrics */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {metricsLoading ? (
          <>
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </>
        ) : metrics ? (
          <>
            <MetricCard
              title="Organic Traffic"
              value={metrics.organicTraffic.value.toLocaleString()}
              change={metrics.organicTraffic.change}
              trend={metrics.organicTraffic.trend}
              icon={<TrendingUp className="h-5 w-5" />}
              subtitle="Last 30 days"
            />
            <MetricCard
              title="Top 10 Rankings"
              value={metrics.topRankings.value.toLocaleString()}
              change={metrics.topRankings.change}
              trend={metrics.topRankings.trend}
              icon={<TrendingUp className="h-5 w-5" />}
              subtitle="Total keywords"
            />
            <MetricCard
              title="Tracked Keywords"
              value={metrics.trackedKeywords.value.toLocaleString()}
              change={metrics.trackedKeywords.change}
              trend={metrics.trackedKeywords.trend}
              icon={<TrendingUp className="h-5 w-5" />}
              subtitle="Active monitoring"
            />
            <MetricCard
              title="Content Published"
              value={metrics.contentPublished.value.toLocaleString()}
              change={metrics.contentPublished.change}
              trend={metrics.contentPublished.trend}
              icon={<TrendingUp className="h-5 w-5" />}
              subtitle="This month"
            />
          </>
        ) : (
          <div className="col-span-4 text-center text-gray-500">Failed to load metrics</div>
        )}
      </div>

      {/* Ranking Trends Chart */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          30-Day Performance Trends
        </h2>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={generateTrendData()}>
              <defs>
                <linearGradient id="colorTraffic" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorRankings" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
              <XAxis 
                dataKey="date" 
                stroke="#9ca3af"
                style={{ fontSize: '12px' }}
              />
              <YAxis 
                stroke="#9ca3af"
                style={{ fontSize: '12px' }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff'
                }}
              />
              <Area 
                type="monotone" 
                dataKey="traffic" 
                stroke="#3b82f6" 
                strokeWidth={2}
                fill="url(#colorTraffic)" 
                name="Organic Traffic"
              />
              <Area 
                type="monotone" 
                dataKey="rankings" 
                stroke="#10b981" 
                strokeWidth={2}
                fill="url(#colorRankings)" 
                name="Top 10 Rankings"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Agent Activity & Alerts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              AI Agent Activity
            </h2>
            <Activity className="h-5 w-5 text-gray-400" />
          </div>
          
          <div className="space-y-4">
            {activitiesLoading ? (
              <>
                <ActivityItemSkeleton />
                <ActivityItemSkeleton />
                <ActivityItemSkeleton />
              </>
            ) : activities && activities.length > 0 ? (
              activities.slice(0, 5).map((activity) => (
                <AgentActivityItem
                  key={activity.id}
                  agent={activity.agentName}
                  status={activity.status}
                  task={activity.task}
                  time={formatRelativeTime(activity.startedAt)}
                />
              ))
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">No recent activities</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Recent Alerts
            </h2>
            <AlertCircle className="h-5 w-5 text-gray-400" />
          </div>
          
          <div className="space-y-4">
            {alertsLoading ? (
              <>
                <AlertItemSkeleton />
                <AlertItemSkeleton />
              </>
            ) : alerts && alerts.length > 0 ? (
              alerts.slice(0, 4).map((alert) => (
                <AlertItem
                  key={alert.id}
                  type={alert.type}
                  message={alert.message}
                  page={alert.page}
                  time={formatRelativeTime(alert.createdAt)}
                />
              ))
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">No recent alerts</p>
            )}
          </div>
        </div>
      </div>

      {/* Workflow Status */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Active Workflows
          </h2>
        </div>
        
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {workflowsLoading ? (
            <>
              <WorkflowCardSkeleton />
              <WorkflowCardSkeleton />
              <WorkflowCardSkeleton />
              <WorkflowCardSkeleton />
            </>
          ) : workflows && workflows.length > 0 ? (
            workflows.map((workflow) => (
              <WorkflowCard
                key={workflow.id}
                name={workflow.name}
                stage={workflow.stage}
                progress={workflow.progress}
                status={workflow.status}
              />
            ))
          ) : (
            <div className="col-span-4 text-center text-gray-500 py-4">No active workflows</div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  change,
  trend,
  icon,
  subtitle,
}: {
  title: string;
  value: string;
  change: number;
  trend: 'up' | 'down';
  icon: React.ReactNode;
  subtitle: string;
}) {
  const isPositive = trend === 'up';
  
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
            {icon}
          </div>
        </div>
        <div className={`flex items-center gap-1 text-sm font-medium ${
          isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
        }`}>
          {isPositive ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
          {Math.abs(change)}%
        </div>
      </div>
      
      <div className="mt-4">
        <div className="text-2xl font-bold text-gray-900 dark:text-white">
          {value}
        </div>
        <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {title}
        </div>
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-500">
          {subtitle}
        </div>
      </div>
    </div>
  );
}

function AgentActivityItem({
  agent,
  status,
  task,
  time,
}: {
  agent: string;
  status: 'running' | 'completed' | 'failed';
  task: string;
  time: string;
}) {
  const statusConfig = {
    running: { color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20', icon: <Clock className="h-4 w-4" /> },
    completed: { color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20', icon: <CheckCircle2 className="h-4 w-4" /> },
    failed: { color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20', icon: <AlertCircle className="h-4 w-4" /> },
  };
  
  const config = statusConfig[status];
  
  return (
    <div className="flex items-start gap-3">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${config.bg} ${config.color}`}>
        {config.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {agent}
          </span>
          <span className={`text-xs font-medium ${config.color}`}>
            {status}
          </span>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
          {task}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-500">
          {time}
        </p>
      </div>
    </div>
  );
}

function AlertItem({
  type,
  message,
  page,
  time,
}: {
  type: 'success' | 'info' | 'warning' | 'error';
  message: string;
  page: string;
  time: string;
}) {
  const typeConfig = {
    success: { color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20' },
    info: { color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    warning: { color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
    error: { color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
  };
  
  const config = typeConfig[type];
  
  return (
    <div className={`rounded-lg ${config.bg} p-4`}>
      <div className="flex items-start gap-3">
        <AlertCircle className={`h-5 w-5 ${config.color} flex-shrink-0`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {message}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            {page}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            {time}
          </p>
        </div>
      </div>
    </div>
  );
}

function WorkflowCard({
  name,
  stage,
  progress,
  status,
}: {
  name: string;
  stage: string;
  progress: number;
  status: 'running' | 'completed' | 'failed';
}) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">
          {name}
        </h3>
        <span className={`text-xs font-medium ${
          status === 'completed' ? 'text-green-600 dark:text-green-400' : 
          status === 'failed' ? 'text-red-600 dark:text-red-400' :
          'text-blue-600 dark:text-blue-400'
        }`}>
          {status}
        </span>
      </div>
      
      <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
        {stage}
      </p>
      
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      
      <p className="text-xs text-gray-500 dark:text-gray-500 mt-2 text-right">
        {progress}%
      </p>
    </div>
  );
}

// Skeleton loaders
function MetricCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
      <div className="h-8 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
      <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
    </div>
  );
}

function ActivityItemSkeleton() {
  return (
    <div className="flex items-start gap-3 animate-pulse">
      <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded-lg" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-3 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    </div>
  );
}

function AlertItemSkeleton() {
  return (
    <div className="rounded-lg bg-gray-100 dark:bg-gray-700 p-4 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="h-5 w-5 bg-gray-200 dark:bg-gray-600 rounded" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-600 rounded" />
          <div className="h-3 w-1/2 bg-gray-200 dark:bg-gray-600 rounded" />
        </div>
      </div>
    </div>
  );
}

function WorkflowCardSkeleton() {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 animate-pulse">
      <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
      <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
      <div className="h-2 w-full bg-gray-200 dark:bg-gray-700 rounded" />
    </div>
  );
}

// Generate mock trend data for the last 30 days
function generateTrendData() {
  const data = [];
  const today = new Date();
  
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    
    // Generate realistic trending data with some noise
    const baseTraffic = 25000;
    const baseRankings = 800;
    const trend = (29 - i) * 100; // Upward trend
    const noise = Math.random() * 1000 - 500; // Random noise
    
    data.push({
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      traffic: Math.floor(baseTraffic + trend + noise),
      rankings: Math.floor(baseRankings + (29 - i) * 3 + Math.random() * 10 - 5),
    });
  }
  
  return data;
}
