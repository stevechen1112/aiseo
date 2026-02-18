// Prefer same-origin requests (Next.js rewrites /api/* to the backend).
// This avoids browser CORS issues in local dev when API runs on a different port.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface ApiOptions extends RequestInit {
  token?: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type QuotaExceededPayload = {
  kind?: 'quota_exceeded' | string;
  quota?: {
    kind?: string;
    period?: string;
    limit?: number | null;
    current?: number;
    requested?: number;
  };
  message?: string;
};

function formatApiErrorMessage(status: number, errorData: unknown): string {
  if (status === 429 && errorData && typeof errorData === 'object') {
    const payload = errorData as QuotaExceededPayload;
    if (payload.kind === 'quota_exceeded' && payload.quota) {
      const q = payload.quota;
      const resource = q.kind ?? 'quota';
      const limit = q.limit ?? null;
      const current = typeof q.current === 'number' ? q.current : undefined;
      const requested = typeof q.requested === 'number' ? q.requested : undefined;
      const period = q.period ? ` (${q.period})` : '';
      const limitText = limit === null ? '∞' : String(limit);
      const currentText = current === undefined ? '' : `${current}/`;
      const requestedText = requested === undefined ? '' : ` (requested ${requested})`;
      return `Quota exceeded: ${resource}${period} (${currentText}${limitText})${requestedText}`;
    }
  }

  if (errorData && typeof errorData === 'object' && 'message' in (errorData as any)) {
    const msg = (errorData as any).message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }

  return 'API request failed';
}

async function apiRequest<T>(
  endpoint: string,
  options: ApiOptions = {}
): Promise<T> {
  const { token, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Merge with existing headers
  if (fetchOptions.headers) {
    Object.entries(fetchOptions.headers).forEach(([key, value]) => {
      if (typeof value === 'string') {
        headers[key] = value;
      }
    });
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = formatApiErrorMessage(response.status, errorData);
    throw new ApiError(
      response.status,
      message,
      errorData
    );
  }

  return response.json();
}

async function rawRequest(
  endpoint: string,
  options: ApiOptions = {}
): Promise<Response> {
  const { token, ...fetchOptions } = options;

  const headers: Record<string, string> = {};

  if (fetchOptions.headers) {
    Object.entries(fetchOptions.headers).forEach(([key, value]) => {
      if (typeof value === 'string') {
        headers[key] = value;
      }
    });
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(`${API_BASE_URL}${endpoint}`, {
    ...fetchOptions,
    headers,
  });
}

// Dashboard Metrics
export interface DashboardMetrics {
  organicTraffic: {
    value: number;
    change: number;
    trend: 'up' | 'down';
  };
  topRankings: {
    value: number;
    change: number;
    trend: 'up' | 'down';
  };
  trackedKeywords: {
    value: number;
    change: number;
    trend: 'up' | 'down';
  };
  contentPublished: {
    value: number;
    change: number;
    trend: 'up' | 'down';
  };
}

export async function getDashboardMetrics(token?: string): Promise<DashboardMetrics> {
  return apiRequest('/api/dashboard/metrics', { token });
}

// Phase 4 - Platform Tenants
export type TenantStatus = 'active' | 'disabled' | 'deleted';

export type PlatformTenant = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: TenantStatus;
  settings: Record<string, unknown>;
  userCount: number;
  projectCount: number;
  createdAt: string;
  updatedAt: string;
};

export async function getPlatformTenants(token?: string): Promise<PlatformTenant[]> {
  const res = await apiRequest<{ ok: true; tenants: PlatformTenant[] }>('/api/platform/tenants', { token });
  return res.tenants;
}

export async function createPlatformTenant(
  input: { name: string; slug: string; plan?: string },
  token?: string,
): Promise<PlatformTenant> {
  const res = await apiRequest<{ ok: true; tenant: PlatformTenant }>('/api/platform/tenants', {
    method: 'POST',
    body: JSON.stringify(input),
    token,
  });
  return res.tenant;
}

export async function updatePlatformTenant(
  id: string,
  input: { name?: string; slug?: string; plan?: string; status?: TenantStatus },
  token?: string,
): Promise<PlatformTenant> {
  const res = await apiRequest<{ ok: true; tenant: PlatformTenant }>(`/api/platform/tenants/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
    token,
  });
  return res.tenant;
}

export async function deletePlatformTenant(id: string, token?: string): Promise<{ ok: true }> {
  return apiRequest(`/api/platform/tenants/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token,
  });
}

// Agent Activity
export interface AgentActivity {
  id: string;
  agentName: string;
  status: 'running' | 'completed' | 'failed';
  task: string;
  startedAt: string;
  completedAt?: string;
}

export async function getAgentActivities(token?: string): Promise<AgentActivity[]> {
  return apiRequest('/api/agents/activities', { token });
}

// Alerts
export interface Alert {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  message: string;
  page: string;
  createdAt: string;
}

export async function getAlerts(token?: string): Promise<Alert[]> {
  return apiRequest('/api/alerts', { token });
}

export type AlertSettings = {
  projectId: string;
  rankDropThreshold: number;
  slackWebhookUrl?: string;
  emailRecipients: string[];
};

export async function getAlertSettings(token?: string): Promise<AlertSettings> {
  return apiRequest('/api/alerts/settings', { token });
}

export async function updateAlertSettings(
  input: Omit<AlertSettings, 'projectId'>,
  token?: string,
): Promise<{ ok: true; projectId: string; settings: Omit<AlertSettings, 'projectId'> }> {
  return apiRequest('/api/alerts/settings', {
    method: 'POST',
    token,
    body: JSON.stringify(input),
  });
}

// Workflows
export interface WorkflowStatus {
  id: string;
  name: string;
  stage: string;
  progress: number;
  status: 'running' | 'completed' | 'failed';
}

export async function getWorkflowStatuses(token?: string): Promise<WorkflowStatus[]> {
  return apiRequest('/api/workflows/status', { token });
}

// SERP Features
export type SerpFeatureFlags = {
  featuredSnippet: boolean;
  peopleAlsoAsk: boolean;
  video: boolean;
  images: boolean;
  localPack: boolean;
};

export type SerpFeaturesRow = {
  keywordId: string;
  keyword: string;
  features: SerpFeatureFlags;
  owned: SerpFeatureFlags;
};

export async function getSerpFeatures(
  projectId: string,
  limit = 50,
  token?: string,
): Promise<{ ok: true; rows: SerpFeaturesRow[] }> {
  const params = new URLSearchParams({ projectId, limit: String(limit) });
  return apiRequest(`/api/serp/features?${params.toString()}`, { token });
}

// Schedules (used for Agent Status Panel)
export interface Schedule {
  id: string;
  flowName: string;
  projectId: string;
  seedKeyword?: string;
  cron: string;
  timezone?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

type SchedulesResponse = {
  ok: true;
  schedules: Array<{
    id: string;
    flow_name: string;
    project_id: string;
    seed_keyword: string | null;
    cron: string;
    timezone: string | null;
    enabled: boolean;
    created_at: string;
    updated_at: string;
  }>;
};

export async function getSchedules(token?: string): Promise<Schedule[]> {
  const res = await apiRequest<SchedulesResponse>('/api/schedules', { token });
  return res.schedules.map((row) => ({
    id: row.id,
    flowName: row.flow_name,
    projectId: row.project_id,
    seedKeyword: row.seed_keyword ?? undefined,
    cron: row.cron,
    timezone: row.timezone ?? undefined,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function pauseSchedule(id: string, token?: string): Promise<{ ok: true }> {
  return apiRequest(`/api/schedules/${encodeURIComponent(id)}/pause`, {
    method: 'POST',
    token,
  });
}

export async function resumeSchedule(id: string, token?: string): Promise<{ ok: true }> {
  return apiRequest(`/api/schedules/${encodeURIComponent(id)}/resume`, {
    method: 'POST',
    token,
  });
}

export async function runSchedule(id: string, token?: string): Promise<{ ok: true; result: unknown }> {
  return apiRequest(`/api/schedules/${encodeURIComponent(id)}/run`, {
    method: 'POST',
    token,
  });
}

export async function upsertScheduleFlow(
  input: {
    id: string;
    enabled: boolean;
    cron: string;
    timezone?: string;
    flowName?: 'seo-content-pipeline';
    projectId: string;
    seedKeyword?: string;
  },
  token?: string,
): Promise<{ ok: true }> {
  return apiRequest('/api/schedules/flow', {
    method: 'POST',
    token,
    body: JSON.stringify({
      id: input.id,
      enabled: input.enabled,
      cron: input.cron,
      timezone: input.timezone,
      flowName: input.flowName ?? 'seo-content-pipeline',
      projectId: input.projectId,
      seedKeyword: input.seedKeyword,
    }),
  });
}

// Phase 3 - 4.10 Settings & RBAC
export type Project = {
  id: string;
  name: string;
  domain: string;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export async function getProjects(token?: string): Promise<Project[]> {
  const res = await apiRequest<{ ok: true; projects: Project[] }>('/api/projects', { token });
  return res.projects;
}

export async function createProject(
  input: { name: string; domain: string; targetKeywords?: string[] },
  token?: string,
): Promise<Project> {
  const res = await apiRequest<{ ok: true; project: Project }>('/api/projects', {
    method: 'POST',
    token,
    body: JSON.stringify(input),
  });
  return res.project;
}

export async function updateProject(
  id: string,
  input: { name?: string; domain?: string; targetKeywords?: string[] },
  token?: string,
): Promise<Project> {
  const res = await apiRequest<{ ok: true; project: Project }>(`/api/projects/${encodeURIComponent(id)}`, {
    method: 'PUT',
    token,
    body: JSON.stringify(input),
  });
  return res.project;
}

export async function deleteProject(id: string, token?: string): Promise<{ ok: true; id: string }> {
  return apiRequest(`/api/projects/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token,
  });
}

export type ApiKey = {
  id: string;
  projectId: string | null;
  name: string;
  maskedKey: string;
  permissions: { scopes?: string[] } | Record<string, unknown>;
  revokedAt: string | null;
  createdAt: string;
};

export async function getApiKeys(token?: string): Promise<ApiKey[]> {
  const res = await apiRequest<{ ok: true; apiKeys: ApiKey[] }>('/api/api-keys', { token });
  return res.apiKeys;
}

export async function createApiKey(
  input: { name: string; projectId?: string; permissions?: string[] },
  token?: string,
): Promise<{ ok: true; secret: string; apiKey: ApiKey }> {
  return apiRequest('/api/api-keys', {
    method: 'POST',
    token,
    body: JSON.stringify(input),
  });
}

export async function revealApiKey(id: string, token?: string): Promise<{ ok: true; id: string; secret: string }> {
  return apiRequest(`/api/api-keys/${encodeURIComponent(id)}/reveal`, { token });
}

export async function revokeApiKey(id: string, token?: string): Promise<{ ok: true; id: string; revokedAt: string }> {
  return apiRequest(`/api/api-keys/${encodeURIComponent(id)}/revoke`, {
    method: 'POST',
    token,
  });
}

export async function updateApiKey(
  id: string,
  input: { name?: string; permissions?: string[] },
  token?: string,
): Promise<{ ok: true; id: string }> {
  return apiRequest(`/api/api-keys/${encodeURIComponent(id)}`, {
    method: 'POST',
    token,
    body: JSON.stringify(input),
  });
}

export type NotificationType = 'alerts' | 'reviews' | 'completions';
export type NotificationSettings = {
  ok: true;
  projectId: string;
  slackWebhookUrl?: string;
  emailRecipients: string[];
  types: NotificationType[];
};

export async function getNotificationSettings(token?: string): Promise<NotificationSettings> {
  return apiRequest('/api/notifications/settings', { token });
}

export async function updateNotificationSettings(
  input: { slackWebhookUrl?: string; emailRecipients: string[]; types: NotificationType[] },
  token?: string,
): Promise<{ ok: true; projectId: string; settings: unknown }> {
  return apiRequest('/api/notifications/settings', {
    method: 'POST',
    token,
    body: JSON.stringify(input),
  });
}

export type RbacUser = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'analyst';
  createdAt: string;
  updatedAt: string;
};

export async function getRbacUsers(token?: string): Promise<RbacUser[]> {
  const res = await apiRequest<{ ok: true; users: RbacUser[] }>('/api/rbac/users', { token });
  return res.users;
}

export async function createRbacUser(
  input: { email: string; name: string; role: 'admin' | 'manager' | 'analyst' },
  token?: string,
): Promise<{ ok: true; userId: string }> {
  return apiRequest('/api/rbac/users', {
    method: 'POST',
    token,
    body: JSON.stringify(input),
  });
}

export async function updateRbacUser(
  id: string,
  input: { email?: string; name?: string; role?: 'admin' | 'manager' | 'analyst' },
  token?: string,
): Promise<{ ok: true; userId: string }> {
  return apiRequest(`/api/rbac/users/${encodeURIComponent(id)}`, {
    method: 'POST',
    token,
    body: JSON.stringify(input),
  });
}

export type PermissionsMatrix = {
  ok: true;
  roles: Array<'admin' | 'manager' | 'analyst'>;
  permissions: Array<{ key: string; label: string; admin: boolean; manager: boolean; analyst: boolean }>;
};

export async function getPermissionsMatrix(token?: string): Promise<PermissionsMatrix> {
  return apiRequest('/api/rbac/permissions-matrix', { token });
}

export async function downloadBackupExport(
  args: { projectId: string; format: 'json' | 'csv' },
  token?: string,
): Promise<{ blob: Blob; filename: string; contentType: string }>
{
  const params = new URLSearchParams({ projectId: args.projectId, format: args.format });
  const res = await rawRequest(`/api/backup/export?${params.toString()}`, { token, method: 'GET' });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (errorData as any).message || 'API request failed', errorData);
  }

  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename = match?.[1] || `export-${args.projectId}.${args.format === 'csv' ? 'csv' : 'json'}`;
  const blob = await res.blob();

  return { blob, filename, contentType };
}

export async function importBackup(
  input: { project: { name: string; domain: string; settings?: Record<string, unknown> }; keywords?: string[] },
  token?: string,
): Promise<{ ok: true; projectId: string }> {
  return apiRequest('/api/backup/import', {
    method: 'POST',
    token,
    body: JSON.stringify(input),
  });
}

// Flows
export async function startSeoContentPipeline(
  args: {
    projectId: string;
    seedKeyword?: string;
    tenantId?: string;
  },
  token?: string
): Promise<unknown> {
  return apiRequest('/api/flows/start', {
    method: 'POST',
    token,
    headers: args.tenantId ? { 'x-tenant-id': args.tenantId } : undefined,
    body: JSON.stringify({
      flowName: 'seo-content-pipeline',
      projectId: args.projectId,
      seedKeyword: args.seedKeyword,
    }),
  });
}

export async function triggerKeywordResearch(
  args: {
    projectId: string;
    seedKeyword: string;
    tenantId?: string;
  },
  token?: string
): Promise<{ ok: true; jobId: string | number }> {
  return apiRequest('/api/agents/keyword-research', {
    method: 'POST',
    token,
    headers: args.tenantId ? { 'x-tenant-id': args.tenantId } : undefined,
    body: JSON.stringify({ projectId: args.projectId, seedKeyword: args.seedKeyword }),
  });
}

// Keywords
export interface KeywordDistribution {
  topThree: number;
  topTen: number;
  topTwenty: number;
  topHundred: number;
}

export interface Keyword {
  id: string;
  keyword: string;
  position: number;
  change: number;
  volume: number;
  difficulty: number;
  url: string;
  lastUpdated: string;
}

export async function getKeywordDistribution(token?: string): Promise<KeywordDistribution> {
  return apiRequest('/api/keywords/distribution', { token });
}

export async function getKeywordDistributionForRange(
  range: '7d' | '30d' | '90d',
  token?: string,
): Promise<KeywordDistribution> {
  return apiRequest(`/api/keywords/distribution?range=${encodeURIComponent(range)}`, { token });
}

export async function getKeywords(
  page = 1,
  limit = 20,
  token?: string
): Promise<{ data: Keyword[]; total: number }> {
  return apiRequest(`/api/keywords?page=${page}&limit=${limit}`, { token });
}

// Content
export interface ContentStatus {
  published: number;
  draft: number;
  pending: number;
  scheduled: number;
}

export interface Content {
  id: string;
  title: string;
  excerpt: string;
  status: 'published' | 'draft' | 'pending' | 'scheduled';
  wordCount: number;
  lastModified: string;
  author: string;
  targetKeyword: string;
}

export type ContentDraftStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'published';

export type ContentDraft = {
  id: string;
  projectId: string;
  title: string;
  metaDescription: string;
  status: ContentDraftStatus;
  primaryKeyword: string;
  markdown: string;
  totalWordCount: number;
  createdAt: string;
  updatedAt: string;
};

export async function getContentDraft(id: string, token?: string): Promise<ContentDraft> {
  const res = await apiRequest<{ ok: true; draft: ContentDraft }>(`/api/content/${encodeURIComponent(id)}`, { token });
  return res.draft;
}

export async function updateContentDraft(
  id: string,
  input: {
    title: string;
    metaDescription?: string;
    primaryKeyword?: string;
    status?: ContentDraftStatus;
    markdown?: string;
  },
  token?: string,
): Promise<ContentDraft> {
  const res = await apiRequest<{ ok: true; draft: ContentDraft }>(`/api/content/${encodeURIComponent(id)}`, {
    method: 'POST',
    token,
    body: JSON.stringify(input),
  });
  return res.draft;
}

export async function getContentStatus(token?: string): Promise<ContentStatus> {
  return apiRequest('/api/content/status', { token });
}

export async function getContent(
  page = 1,
  limit = 20,
  filter?: string,
  token?: string
): Promise<{ data: Content[]; total: number }> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });
  
  if (filter) {
    params.append('filter', filter);
  }
  
  return apiRequest(`/api/content?${params.toString()}`, { token });
}

export type ContentPerformanceRow = {
  id: string;
  title: string;
  tag: string;
  publishedAt: string;
  traffic: number;
  rank: number;
  conversions: number;
  author: string;
};

export async function getPublishedContentPerformance(
  args: {
    range: '7d' | '30d' | '90d';
    tag?: string;
    author?: 'all' | 'ai' | 'reviewer';
    limit?: number;
  },
  token?: string,
): Promise<{ ok: true; projectId: string; range: string; data: ContentPerformanceRow[] }> {
  const params = new URLSearchParams({
    range: args.range,
    author: args.author ?? 'all',
    limit: String(args.limit ?? 50),
  });

  if (args.tag && args.tag.trim().length > 0) {
    params.set('tag', args.tag.trim());
  }

  return apiRequest(`/api/content/performance?${params.toString()}`, { token });
}

// Authentication
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name?: string;
    tenantId: string;
    projectId: string;
    role?: string;
  };
}

export async function login(credentials: LoginCredentials): Promise<AuthResponse> {
  return apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  tenantName?: string;
  tenantSlug?: string;
  projectDomain?: string;
}

export async function register(input: RegisterInput): Promise<AuthResponse> {
  return apiRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function verifyEmail(token: string): Promise<{ ok: true; alreadyVerified?: boolean }> {
  const params = new URLSearchParams({ token });
  return apiRequest(`/api/auth/verify-email?${params.toString()}`, {
    method: 'GET',
    headers: {},
  });
}

export async function resendVerification(email: string): Promise<{ ok: true; alreadyVerified?: boolean }> {
  return apiRequest('/api/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function refreshToken(token: string): Promise<AuthResponse> {
  return apiRequest('/api/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: token }),
  });
}

export async function logout(token: string): Promise<void> {
  return apiRequest('/api/auth/logout', {
    method: 'POST',
    token,
  });
}

// Audit Logs (Phase 4 - 5.6.2)
export type AuditLogItem = {
  id: string;
  tenantId: string;
  projectId: string | null;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type GetAuditLogsArgs = {
  limit?: number;
  before?: string;
  projectId?: string;
  userId?: string;
  action?: string;
};

export async function getAuditLogs(
  args: GetAuditLogsArgs = {},
  token?: string,
): Promise<{ ok: true; items: AuditLogItem[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (args.limit) params.set('limit', String(args.limit));
  if (args.before) params.set('before', args.before);
  if (args.projectId) params.set('projectId', args.projectId);
  if (args.userId) params.set('userId', args.userId);
  if (args.action) params.set('action', args.action);
  const qs = params.toString();
  return apiRequest(`/api/audit/logs${qs ? `?${qs}` : ''}`, { token });
}

export async function exportAuditLogs(
  args: GetAuditLogsArgs & { format: 'json' | 'csv' },
  token?: string,
): Promise<{ blob: Blob; filename: string; contentType: string }>
{
  const params = new URLSearchParams({ format: args.format });
  if (args.limit) params.set('limit', String(args.limit));
  if (args.before) params.set('before', args.before);
  if (args.projectId) params.set('projectId', args.projectId);
  if (args.userId) params.set('userId', args.userId);
  if (args.action) params.set('action', args.action);

  const accept = args.format === 'csv' ? 'text/csv' : 'application/json';
  const res = await rawRequest(`/api/audit/logs/export?${params.toString()}`,
    { token, method: 'GET', headers: { Accept: accept } },
  );

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (errorData as any).message || 'API request failed', errorData);
  }

  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const ext = args.format === 'csv' ? 'csv' : 'json';
  const filename = match?.[1] || `audit-logs.${ext}`;
  const blob = await res.blob();
  return { blob, filename, contentType };
}

// Technical Audit Viewer (Phase 3 - 4.7)
export type AuditHealth = {
  ok: true;
  projectId: string;
  overall: number;
  breakdown: {
    technical: number;
    content: number;
    ux: number;
  };
  issues: {
    total: number;
    critical: number;
    warning: number;
  };
  auditedAt: string | null;
};

export async function getAuditHealth(token?: string): Promise<AuditHealth> {
  return apiRequest('/api/audit/health', { token });
}

export type AuditIssue = {
  id: string;
  url: string;
  auditedAt: string;
  severity: 'critical' | 'warning' | 'info';
  category: string;
  title: string;
  description: string;
  recommendation: string;
  resolved: boolean;
  resolvedAt: string | null;
};

export async function getAuditIssues(
  limit = 200,
  token?: string,
): Promise<{ ok: true; projectId: string; items: AuditIssue[] }> {
  return apiRequest(`/api/audit/issues?limit=${encodeURIComponent(String(limit))}`, { token });
}

export async function resolveAuditIssue(
  issueId: string,
  resolved: boolean,
  token?: string,
): Promise<{ ok: true; projectId: string; issueId: string; resolved: boolean }> {
  return apiRequest(`/api/audit/issues/${encodeURIComponent(issueId)}/resolve`, {
    method: 'POST',
    token,
    body: JSON.stringify({ resolved }),
  });
}

export type CwvPoint = { date: string; lcp: number; fid: number; cls: number };
export async function getCwvTrends(
  args: { range: '7d' | '30d' | '90d'; device?: 'mobile' | 'desktop' },
  token?: string,
): Promise<{ ok: true; projectId: string; range: string; device: string | null; points: CwvPoint[] }> {
  const params = new URLSearchParams({ range: args.range });
  if (args.device) params.set('device', args.device);
  return apiRequest(`/api/audit/cwv?${params.toString()}`, { token });
}

export type CrawlLeaf = { name: string; size: number; status: 'good' | 'warn' | 'bad' };
export type CrawlGroup = { name: string; children: CrawlLeaf[] };

export async function getCrawlMap(
  limit = 500,
  token?: string,
): Promise<{ ok: true; projectId: string; data: CrawlGroup[] }> {
  return apiRequest(`/api/audit/crawl-map?limit=${encodeURIComponent(String(limit))}`, { token });
}

// Backlinks (Phase 3 - 4.8)
export type DaBucket = { bucket: string; count: number };
export type BacklinkProfile = {
  ok: true;
  projectId: string;
  totals: { backlinks: number; referringDomains: number };
  daBuckets: DaBucket[];
};

export async function getBacklinkProfile(token?: string): Promise<BacklinkProfile> {
  return apiRequest('/api/backlinks/profile', { token });
}

export type BacklinkTimelinePoint = { date: string; new: number; lost: number };
export async function getBacklinkTimeline(
  range: '7d' | '30d' | '90d',
  token?: string,
): Promise<{ ok: true; projectId: string; range: string; points: BacklinkTimelinePoint[] }> {
  return apiRequest(`/api/backlinks/timeline?range=${encodeURIComponent(range)}`, { token });
}

export type OutreachCampaign = {
  id: string;
  campaignId: string;
  targetDomain: string;
  contactEmail: string;
  subject: string;
  status: 'draft' | 'sent' | 'opened' | 'replied' | 'accepted' | 'rejected';
  createdAt: string;
  updatedAt: string;
};

export async function getOutreachCampaigns(token?: string): Promise<{ ok: true; projectId: string; campaigns: OutreachCampaign[] }> {
  return apiRequest('/api/backlinks/outreach', { token });
}

export async function updateOutreachCampaignStatus(
  id: string,
  status: OutreachCampaign['status'],
  token?: string,
): Promise<{ ok: true; id: string; status: string }> {
  return apiRequest(`/api/backlinks/outreach/${encodeURIComponent(id)}`, {
    method: 'POST',
    token,
    body: JSON.stringify({ status }),
  });
}

export type BacklinkGapOpportunity = {
  id: string;
  targetDomain: string;
  targetUrl: string;
  domainRating: number | null;
  priority: string;
  competitors: string[];
  status: string;
  discoveredAt: string;
};

export async function getBacklinkGap(
  limit = 50,
  token?: string,
): Promise<{ ok: true; projectId: string; opportunities: BacklinkGapOpportunity[] }> {
  return apiRequest(`/api/backlinks/gap?limit=${encodeURIComponent(String(limit))}`, { token });
}

// Reports (Phase 3 - 4.9)
export type ReportRow = {
  id: string;
  reportId: string;
  format: string;
  period: string;
  startDate: string;
  endDate: string;
  outputFormat: string;
  outputUrl: string | null;
  generatedAt: string;
};

export async function getReports(
  args: { type?: string; range: '7d' | '30d' | '90d' | 'all'; limit?: number },
  token?: string,
): Promise<{ ok: true; projectId: string; reports: ReportRow[] }> {
  const params = new URLSearchParams({
    range: args.range,
    limit: String(args.limit ?? 50),
  });
  if (args.type && args.type.trim()) params.set('type', args.type.trim());
  return apiRequest(`/api/reports?${params.toString()}`, { token });
}

export type ReportTemplate = {
  id: string;
  name: string;
  modules: Array<'rankings' | 'traffic' | 'content' | 'backlinks'>;
  range: '7d' | '30d' | '90d';
  createdAt: string;
};

export async function getReportTemplates(token?: string): Promise<{ ok: true; projectId: string; templates: ReportTemplate[] }> {
  return apiRequest('/api/reports/templates', { token });
}

export async function saveReportTemplate(
  input: { name: string; modules: ReportTemplate['modules']; range: ReportTemplate['range'] },
  token?: string,
): Promise<{ ok: true; projectId: string; template: ReportTemplate }> {
  return apiRequest('/api/reports/templates', {
    method: 'POST',
    token,
    body: JSON.stringify(input),
  });
}

// ── Auth ────────────────────────────────────────────────────────────

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  projectId: string;
  role: string;
};

export async function authLogin(input: { email: string; password: string }): Promise<{
  ok: true;
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}> {
  return apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function authRegister(input: { email: string; password: string; name: string }): Promise<{
  ok: true;
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}> {
  return apiRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function authRefresh(refreshToken: string): Promise<{
  ok: true;
  accessToken: string;
  refreshToken: string;
}> {
  return apiRequest('/api/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
}

export async function authMe(token?: string): Promise<{ ok: true; user: AuthUser }> {
  return apiRequest('/api/auth/me', { token });
}

// ── Tenant Usage / Quotas (Phase 4 - 5.2.2) ───────────────────────

export type TenantQuotaConfig = {
  keywordsMax: number | null;
  apiCallsPerMonth: number | null;
  serpJobsPerMonth: number | null;
  crawlJobsPerMonth: number | null;
};

export type TenantUsageResponse = {
  ok: true;
  tenantId: string;
  plan: string;
  period: string;
  quotas: TenantQuotaConfig;
  usage: {
    apiCalls: number;
    serpJobs: number;
    crawlJobs: number;
    keywords: {
      current: number;
      max: number | null;
      remaining: number | null;
    };
  };
  history: Array<{ period: string; apiCalls: number; serpJobs: number; crawlJobs: number }>;
};

export async function getTenantUsage(token?: string): Promise<TenantUsageResponse> {
  return apiRequest('/api/tenants/usage', { token });
}

// ── Tenant Branding (Phase 4 - 5.4.1) ─────────────────────────────

export type TenantBranding = {
  logoDataUrl?: string;
  primaryColor?: string;
  headerText?: string;
  footerText?: string;
};

export async function getTenantBranding(token?: string): Promise<{ ok: true; tenantId: string; brand: TenantBranding }> {
  return apiRequest('/api/tenants/brand', { token });
}

export async function updateTenantBranding(
  patch: TenantBranding,
  token?: string,
): Promise<{ ok: true; tenantId: string; brand: TenantBranding }> {
  return apiRequest('/api/tenants/brand', {
    method: 'PATCH',
    token,
    body: JSON.stringify(patch),
  });
}

// ── Third-party Webhooks (Phase 4 - 5.5.2) ───────────────────────

export type WebhookSubscription = {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WebhookDelivery = {
  id: number;
  eventType: string;
  eventSeq: number | null;
  statusCode: number | null;
  ok: boolean;
  error: string | null;
  createdAt: string;
};

export async function getWebhooks(token?: string): Promise<WebhookSubscription[]> {
  const res = await apiRequest<{ ok: true; webhooks: WebhookSubscription[] }>('/api/webhooks', { token });
  return res.webhooks;
}

export async function createWebhook(
  input: { url: string; events?: string[]; enabled?: boolean },
  token?: string,
): Promise<WebhookSubscription> {
  const res = await apiRequest<{ ok: true; webhook: WebhookSubscription }>('/api/webhooks', {
    method: 'POST',
    token,
    body: JSON.stringify(input),
  });
  return res.webhook;
}

export async function updateWebhook(
  id: string,
  patch: { url?: string; events?: string[]; enabled?: boolean },
  token?: string,
): Promise<WebhookSubscription> {
  const res = await apiRequest<{ ok: true; webhook: WebhookSubscription }>(`/api/webhooks/${id}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(patch),
  });
  return res.webhook;
}

export async function deleteWebhook(id: string, token?: string): Promise<{ ok: true; deletedId: string }> {
  return apiRequest(`/api/webhooks/${id}`, { method: 'DELETE', token });
}

export async function getWebhookDeliveries(
  id: string,
  limit = 50,
  token?: string,
): Promise<{ ok: true; webhookId: string; deliveries: WebhookDelivery[] }> {
  const qs = new URLSearchParams({ limit: String(limit) });
  return apiRequest(`/api/webhooks/${id}/deliveries?${qs.toString()}`, { token });
}

// ── Content Review (HITL) ───────────────────────────────────────────

export type ReviewQueueItem = {
  id: string;
  title: string;
  status: string;
  contentType: string;
  targetKeyword: string;
  updatedAt: string;
};

export async function getReviewQueue(
  page = 1,
  limit = 20,
  token?: string,
): Promise<{ ok: true; items: ReviewQueueItem[]; total: number; page: number; limit: number }> {
  return apiRequest(`/api/content/review-queue?page=${page}&limit=${limit}`, { token });
}

export async function submitContentReview(
  id: string,
  input: { action: 'approve' | 'reject'; comment?: string },
  token?: string,
): Promise<{ ok: true; id: string; status: string; action: string }> {
  return apiRequest(`/api/content/${id}/review`, {
    method: 'POST',
    token,
    body: JSON.stringify(input),
  });
}

export type ReviewHistoryEntry = {
  action: string;
  comment?: string;
  reviewedAt: string;
};

export async function getReviewHistory(
  id: string,
  token?: string,
): Promise<{ ok: true; id: string; history: ReviewHistoryEntry[] }> {
  return apiRequest(`/api/content/${id}/review-history`, { token });
}

// ── CMS Publish ─────────────────────────────────────────────────────

export async function publishContent(
  id: string,
  token?: string,
): Promise<{ ok: true; id: string; platform: string; externalId: string; url: string }> {
  return apiRequest(`/api/content/${id}/publish`, {
    method: 'POST',
    token,
  });
}

export type CmsConfig = {
  platform: 'wordpress' | 'shopify' | '';
  siteUrl: string;
  apiKey: string;
  username?: string;
  blogId?: string;
};

export async function getCmsConfig(token?: string): Promise<{ ok: true; cms: CmsConfig | null }> {
  return apiRequest('/api/cms/config', { token });
}

export async function saveCmsConfig(input: CmsConfig, token?: string): Promise<{ ok: true; cms: CmsConfig }> {
  return apiRequest('/api/cms/config', {
    method: 'POST',
    token,
    body: JSON.stringify(input),
  });
}

// ── Report Schedules ────────────────────────────────────────────────

export type ReportSchedule = {
  id: string;
  templateId: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  recipients: string[];
  createdAt: string;
};

export async function getReportSchedules(token?: string): Promise<{ ok: true; schedules: ReportSchedule[] }> {
  return apiRequest('/api/reports/schedules', { token });
}

export async function createReportSchedule(
  input: { templateId: string; frequency: ReportSchedule['frequency']; recipients: string[] },
  token?: string,
): Promise<{ ok: true; schedule: ReportSchedule }> {
  return apiRequest('/api/reports/schedules', {
    method: 'POST',
    token,
    body: JSON.stringify(input),
  });
}

export async function deleteReportSchedule(id: string, token?: string): Promise<{ ok: true; id: string }> {
  return apiRequest(`/api/reports/schedules/${id}`, { method: 'DELETE', token });
}

export async function generateReport(
  input: { templateId: string; email?: boolean; recipients?: string[] },
  token?: string,
): Promise<{ ok: true; reportId: string; url: string }> {
  return apiRequest('/api/reports/generate', {
    method: 'POST',
    token,
    body: JSON.stringify(input),
  });
}

// ── Outreach HITL ───────────────────────────────────────────────────

export type PendingOutreach = {
  id: string;
  campaignId: string;
  targetDomain: string;
  contactEmail: string;
  subject: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export async function getPendingOutreach(token?: string): Promise<{ ok: true; pending: PendingOutreach[] }> {
  return apiRequest('/api/backlinks/outreach/pending', { token });
}

export async function reviewOutreach(
  id: string,
  input: { action: 'approve' | 'reject'; comment?: string },
  token?: string,
): Promise<{ ok: true; id: string; status: string; action: string }> {
  return apiRequest(`/api/backlinks/outreach/${id}/review`, {
    method: 'POST',
    token,
    body: JSON.stringify(input),
  });
}

// ── ROI Calculator ─────────────────────────────────────────────────────────

export interface ROIKeywordInput {
  keyword: string;
  searchVolume: number;
  currentPosition: number;
  targetPosition: number;
  kd?: number;
  isBrand?: boolean;
  conversionRate?: number;
  avgOrderValue?: number;
}

export interface ROIKeywordResult {
  keyword: string;
  searchVolume: number;
  currentPosition: number;
  targetPosition: number;
  kd: number;
  isBrand: boolean;
  currentCTR: number;
  targetCTR: number;
  currentMonthlyTraffic: number;
  targetMonthlyTraffic: number;
  trafficDelta: number;
  opportunityScore: number;
  monthlyRevenueV1: number;
  adjustedMonthlyRevenue: number;
  annualRevenueV2: number;
  conversionMultiplierCurrent: number;
  conversionMultiplierTarget: number;
  seasonalityFactor: number;
  conversionRate: number;
  avgOrderValue: number;
}

export interface ROIEstimateRequest {
  keywords: ROIKeywordInput[];
  conversionRate?: number;
  avgOrderValue?: number;
  month?: number;
}

export interface ROIEstimateResponse {
  ok: boolean;
  summary: {
    totalTrafficDelta: number;
    totalMonthlyRevenueV2: number;
    totalAnnualRevenueV2: number;
    avgOpportunityScore: number;
  };
  keywords: ROIKeywordResult[];
}

export async function estimateROI(
  input: ROIEstimateRequest,
  token?: string,
): Promise<ROIEstimateResponse> {
  return apiRequest('/api/roi/estimate', {
    method: 'POST',
    token,
    body: JSON.stringify(input),
  });
}

export async function getROICtrCurves(
  token?: string,
): Promise<{ ok: boolean; nonBrand: Record<string, number>; brand: Record<string, number>; seasonalityIndex: Record<string, number> }> {
  return apiRequest('/api/roi/ctr-curves', { token });
}
