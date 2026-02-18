'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './auth-context';
import * as api from './api';

// Dashboard queries
export function useDashboardMetrics() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['dashboard', 'metrics'],
    queryFn: () => api.getDashboardMetrics(token || undefined),
    enabled: !!token,
  });
}

export function useAgentActivities() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['agents', 'activities'],
    queryFn: () => api.getAgentActivities(token || undefined),
    enabled: !!token,
  });
}

export function useAlerts() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['alerts'],
    queryFn: () => api.getAlerts(token || undefined),
    enabled: !!token,
  });
}

export function useAlertSettings() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['alerts', 'settings'],
    queryFn: () => api.getAlertSettings(token || undefined),
    enabled: !!token,
  });
}

export function useUpdateAlertSettings() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<api.AlertSettings, 'projectId'>) => api.updateAlertSettings(input, token || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['alerts', 'settings'] });
    },
  });
}

export function useSerpFeatures(limit = 50) {
  const { token, user } = useAuth();
  return useQuery({
    queryKey: ['serp', 'features', { limit }],
    queryFn: async () => {
      if (!user?.projectId) {
        throw new Error('Missing projectId');
      }
      return api.getSerpFeatures(user.projectId, limit, token || undefined);
    },
    enabled: !!token && !!user?.projectId,
  });
}

export function useWorkflowStatuses() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['workflows', 'status'],
    queryFn: () => api.getWorkflowStatuses(token || undefined),
    enabled: !!token,
  });
}

// Keywords queries
export function useKeywordDistribution(range: '7d' | '30d' | '90d' = '30d') {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['keywords', 'distribution', { range }],
    queryFn: () => api.getKeywordDistributionForRange(range, token || undefined),
    enabled: !!token,
  });
}

export function useKeywords(page = 1, limit = 20) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['keywords', { page, limit }],
    queryFn: () => api.getKeywords(page, limit, token || undefined),
    enabled: !!token,
  });
}

// Content queries
export function useContentStatus() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['content', 'status'],
    queryFn: () => api.getContentStatus(token || undefined),
    enabled: !!token,
  });
}

export function useContent(page = 1, limit = 20, filter?: string) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['content', { page, limit, filter }],
    queryFn: () => api.getContent(page, limit, filter, token || undefined),
    enabled: !!token,
  });
}

export function usePublishedContentPerformance(args: {
  range: '7d' | '30d' | '90d';
  tag?: string;
  author?: 'all' | 'ai' | 'reviewer';
  limit?: number;
}) {
  const { token } = useAuth();
  const range = args.range;
  const tag = args.tag ?? '';
  const author = args.author ?? 'all';
  const limit = args.limit ?? 50;

  return useQuery({
    queryKey: ['content', 'performance', { range, tag, author, limit }],
    queryFn: () => api.getPublishedContentPerformance({ range, tag, author, limit }, token || undefined),
    enabled: !!token,
  });
}

export function useContentDraft(id: string | null) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['content', 'draft', { id }],
    queryFn: async () => {
      if (!id) {
        throw new Error('Missing content id');
      }
      return api.getContentDraft(id, token || undefined);
    },
    enabled: !!token && !!id,
  });
}

export function useUpdateContentDraft() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      id: string;
      input: {
        title: string;
        metaDescription?: string;
        primaryKeyword?: string;
        status?: api.ContentDraftStatus;
        markdown?: string;
      };
    }) => api.updateContentDraft(args.id, args.input, token || undefined),
    onSuccess: async (draft) => {
      await queryClient.invalidateQueries({ queryKey: ['content'] });
      await queryClient.invalidateQueries({ queryKey: ['content', 'draft', { id: draft.id }] });
    },
  });
}

// Schedules (Agent Status Panel)
export function useSchedules() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['schedules'],
    queryFn: () => api.getSchedules(token || undefined),
    enabled: !!token,
  });
}

export function usePauseSchedule() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.pauseSchedule(id, token || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['schedules'] });
    },
  });
}

export function useResumeSchedule() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.resumeSchedule(id, token || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['schedules'] });
    },
  });
}

export function useRunSchedule() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.runSchedule(id, token || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agents', 'activities'] });
    },
  });
}

export function useStartSeoContentPipeline() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (seedKeyword?: string) => {
      if (!user?.projectId) {
        throw new Error('Missing projectId');
      }

      return api.startSeoContentPipeline(
        {
          projectId: user.projectId,
          seedKeyword,
          tenantId: user.tenantId,
        },
        token || undefined
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agents', 'activities'] });
      await queryClient.invalidateQueries({ queryKey: ['workflows', 'status'] });
    },
  });
}

// Phase 4 - 5.2.2: Quota monitoring
export function useTenantUsage(token?: string) {
  return useQuery({
    queryKey: ['tenant', 'usage'],
    queryFn: () => api.getTenantUsage(token),
    staleTime: 30_000,
  });
}

export function useTenantBranding(token?: string) {
  return useQuery({
    queryKey: ['tenant', 'branding'],
    queryFn: () => api.getTenantBranding(token),
    staleTime: 30_000,
  });
}

export function useUpdateTenantBranding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ patch, token }: { patch: api.TenantBranding; token?: string }) => api.updateTenantBranding(patch, token),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenant', 'branding'] });
    },
  });
}

export function useTriggerKeywordResearch() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (seedKeyword: string) => {
      if (!user?.projectId) {
        throw new Error('Missing projectId');
      }
      if (!seedKeyword || seedKeyword.trim().length === 0) {
        throw new Error('Seed keyword is required');
      }

      return api.triggerKeywordResearch(
        {
          projectId: user.projectId,
          seedKeyword: seedKeyword.trim(),
          tenantId: user.tenantId,
        },
        token || undefined
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agents', 'activities'] });
      await queryClient.invalidateQueries({ queryKey: ['keywords'] });
    },
  });
}

// Technical Audit Viewer (Phase 3 - 4.7)
export function useAuditHealth() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['audit', 'health'],
    queryFn: () => api.getAuditHealth(token || undefined),
    enabled: !!token,
  });
}

export function useAuditIssues(limit = 200) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['audit', 'issues', { limit }],
    queryFn: () => api.getAuditIssues(limit, token || undefined),
    enabled: !!token,
  });
}

export function useResolveAuditIssue() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { issueId: string; resolved: boolean }) => api.resolveAuditIssue(args.issueId, args.resolved, token || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['audit', 'issues'] });
    },
  });
}

export function useCwvTrends(args: { range: '7d' | '30d' | '90d'; device?: 'mobile' | 'desktop' }) {
  const { token } = useAuth();
  const range = args.range;
  const device = args.device ?? '';
  return useQuery({
    queryKey: ['audit', 'cwv', { range, device }],
    queryFn: () => api.getCwvTrends({ range, device: args.device }, token || undefined),
    enabled: !!token,
  });
}

export function useCrawlMap(limit = 500) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['audit', 'crawl-map', { limit }],
    queryFn: () => api.getCrawlMap(limit, token || undefined),
    enabled: !!token,
  });
}

// Backlinks (Phase 3 - 4.8)
export function useBacklinkProfile() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['backlinks', 'profile'],
    queryFn: () => api.getBacklinkProfile(token || undefined),
    enabled: !!token,
  });
}

export function useBacklinkTimeline(range: '7d' | '30d' | '90d' = '30d') {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['backlinks', 'timeline', { range }],
    queryFn: () => api.getBacklinkTimeline(range, token || undefined),
    enabled: !!token,
  });
}

export function useOutreachCampaigns() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['backlinks', 'outreach'],
    queryFn: () => api.getOutreachCampaigns(token || undefined),
    enabled: !!token,
  });
}

export function useUpdateOutreachCampaignStatus() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; status: api.OutreachCampaign['status'] }) =>
      api.updateOutreachCampaignStatus(args.id, args.status, token || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['backlinks', 'outreach'] });
    },
  });
}

export function useBacklinkGap(limit = 50) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['backlinks', 'gap', { limit }],
    queryFn: () => api.getBacklinkGap(limit, token || undefined),
    enabled: !!token,
  });
}

// Reports (Phase 3 - 4.9)
export function useReports(args: { type?: string; range: '7d' | '30d' | '90d' | 'all'; limit?: number }) {
  const { token } = useAuth();
  const range = args.range;
  const type = args.type ?? '';
  const limit = args.limit ?? 50;
  return useQuery({
    queryKey: ['reports', { range, type, limit }],
    queryFn: () => api.getReports({ range, type: type || undefined, limit }, token || undefined),
    enabled: !!token,
  });
}

export function useReportTemplates() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['reports', 'templates'],
    queryFn: () => api.getReportTemplates(token || undefined),
    enabled: !!token,
  });
}

export function useSaveReportTemplate() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; modules: api.ReportTemplate['modules']; range: api.ReportTemplate['range'] }) =>
      api.saveReportTemplate(input, token || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['reports', 'templates'] });
    },
  });
}

// Settings & RBAC (Phase 3 - 4.10)
export function useProjects() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['settings', 'projects'],
    queryFn: () => api.getProjects(token || undefined),
    enabled: !!token,
  });
}

export function useCreateProject() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; domain: string; targetKeywords?: string[] }) => api.createProject(input, token || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings', 'projects'] });
    },
  });
}

export function useUpdateProject() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; input: { name?: string; domain?: string; targetKeywords?: string[] } }) =>
      api.updateProject(args.id, args.input, token || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings', 'projects'] });
    },
  });
}

export function useDeleteProject() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteProject(id, token || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings', 'projects'] });
    },
  });
}

export function useUpsertScheduleFlow() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      enabled: boolean;
      cron: string;
      timezone?: string;
      flowName?: 'seo-content-pipeline';
      projectId: string;
      seedKeyword?: string;
    }) => api.upsertScheduleFlow(input, token || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['schedules'] });
    },
  });
}

export function useApiKeys() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['settings', 'api-keys'],
    queryFn: () => api.getApiKeys(token || undefined),
    enabled: !!token,
  });
}

export function useCreateApiKey() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; projectId?: string; permissions?: string[] }) => api.createApiKey(input, token || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings', 'api-keys'] });
    },
  });
}

export function useRevokeApiKey() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.revokeApiKey(id, token || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings', 'api-keys'] });
    },
  });
}

export function useUpdateApiKey() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; input: { name?: string; permissions?: string[] } }) =>
      api.updateApiKey(args.id, args.input, token || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings', 'api-keys'] });
    },
  });
}

// Audit Logs (Phase 4 - 5.6.2)
export function useAuditLogs(
  args: api.GetAuditLogsArgs & { enabled?: boolean } = {},
) {
  const { token } = useAuth();
  const { enabled = true, ...rest } = args;

  return useQuery({
    queryKey: ['settings', 'audit-logs', rest],
    queryFn: () => api.getAuditLogs(rest, token || undefined),
    enabled: !!token && enabled,
    staleTime: 15_000,
  });
}

export function useNotificationSettings() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['settings', 'notifications'],
    queryFn: () => api.getNotificationSettings(token || undefined),
    enabled: !!token,
  });
}

export function useUpdateNotificationSettings() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { slackWebhookUrl?: string; emailRecipients: string[]; types: api.NotificationType[] }) =>
      api.updateNotificationSettings(input, token || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings', 'notifications'] });
    },
  });
}

// ── Third-party Webhooks (Phase 4 - 5.5.2) ───────────────────────

export function useWebhooks() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['settings', 'webhooks'],
    queryFn: () => api.getWebhooks(token || undefined),
    enabled: !!token,
  });
}

export function useCreateWebhook() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { url: string; events?: string[]; enabled?: boolean }) => api.createWebhook(input, token || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings', 'webhooks'] });
    },
  });
}

export function useUpdateWebhook() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; patch: { url?: string; events?: string[]; enabled?: boolean } }) =>
      api.updateWebhook(args.id, args.patch, token || undefined),
    onSuccess: async (_data, vars) => {
      await queryClient.invalidateQueries({ queryKey: ['settings', 'webhooks'] });
      await queryClient.invalidateQueries({ queryKey: ['settings', 'webhooks', vars.id, 'deliveries'] });
    },
  });
}

export function useDeleteWebhook() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteWebhook(id, token || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings', 'webhooks'] });
    },
  });
}

export function useWebhookDeliveries(id: string | null, limit = 50) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['settings', 'webhooks', id, 'deliveries', limit],
    queryFn: () => api.getWebhookDeliveries(id!, limit, token || undefined),
    enabled: !!token && !!id,
  });
}

export function useRbacUsers() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['settings', 'rbac', 'users'],
    queryFn: () => api.getRbacUsers(token || undefined),
    enabled: !!token,
  });
}

export function useCreateRbacUser() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; name: string; role: api.RbacUser['role'] }) => api.createRbacUser(input, token || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings', 'rbac', 'users'] });
    },
  });
}

export function useUpdateRbacUser() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; input: { email?: string; name?: string; role?: api.RbacUser['role'] } }) =>
      api.updateRbacUser(args.id, args.input, token || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings', 'rbac', 'users'] });
    },
  });
}

export function usePermissionsMatrix() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['settings', 'rbac', 'matrix'],
    queryFn: () => api.getPermissionsMatrix(token || undefined),
    enabled: !!token,
  });
}

// Phase 4 - Platform Tenants
export function usePlatformTenants() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['platform', 'tenants'],
    queryFn: () => api.getPlatformTenants(token || undefined),
    enabled: !!token,
  });
}

export function useCreatePlatformTenant() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; slug: string; plan?: string }) => api.createPlatformTenant(input, token || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['platform', 'tenants'] });
    },
  });
}

export function useUpdatePlatformTenant() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; input: { name?: string; slug?: string; plan?: string; status?: api.TenantStatus } }) =>
      api.updatePlatformTenant(args.id, args.input, token || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['platform', 'tenants'] });
    },
  });
}

export function useDeletePlatformTenant() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deletePlatformTenant(id, token || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['platform', 'tenants'] });
    },
  });
}

export function useImportBackup() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { project: { name: string; domain: string; settings?: Record<string, unknown> }; keywords?: string[] }) =>
      api.importBackup(input, token || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings', 'projects'] });
      await queryClient.invalidateQueries({ queryKey: ['keywords'] });
    },
  });
}

// ── Content Review (HITL) ───────────────────────────────────────────

export function useReviewQueue(page = 1, limit = 20) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['content', 'review-queue', page, limit],
    queryFn: () => api.getReviewQueue(page, limit, token || undefined),
    enabled: !!token,
  });
}

export function useSubmitContentReview() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; input: { action: 'approve' | 'reject'; comment?: string } }) =>
      api.submitContentReview(args.id, args.input, token || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['content'] });
    },
  });
}

export function useReviewHistory(id: string | null) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['content', 'review-history', id],
    queryFn: () => api.getReviewHistory(id!, token || undefined),
    enabled: !!token && !!id,
  });
}

// ── CMS Publish ─────────────────────────────────────────────────────

export function usePublishContent() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.publishContent(id, token || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['content'] });
    },
  });
}

export function useCmsConfig() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['settings', 'cms'],
    queryFn: () => api.getCmsConfig(token || undefined),
    enabled: !!token,
  });
}

export function useSaveCmsConfig() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: api.CmsConfig) => api.saveCmsConfig(input, token || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings', 'cms'] });
    },
  });
}

// ── Report Schedules ────────────────────────────────────────────────

export function useReportSchedules() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['reports', 'schedules'],
    queryFn: () => api.getReportSchedules(token || undefined),
    enabled: !!token,
  });
}

export function useCreateReportSchedule() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { templateId: string; frequency: api.ReportSchedule['frequency']; recipients: string[] }) =>
      api.createReportSchedule(input, token || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['reports', 'schedules'] });
    },
  });
}

export function useDeleteReportSchedule() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteReportSchedule(id, token || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['reports', 'schedules'] });
    },
  });
}

export function useGenerateReport() {
  const { token } = useAuth();
  return useMutation({
    mutationFn: (input: { templateId: string; email?: boolean; recipients?: string[] }) =>
      api.generateReport(input, token || undefined),
  });
}

// ── Outreach HITL ───────────────────────────────────────────────────

export function usePendingOutreach() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['backlinks', 'outreach', 'pending'],
    queryFn: () => api.getPendingOutreach(token || undefined),
    enabled: !!token,
  });
}

export function useReviewOutreach() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; input: { action: 'approve' | 'reject'; comment?: string } }) =>
      api.reviewOutreach(args.id, args.input, token || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['backlinks'] });
    },
  });
}

// ── ROI Calculator ─────────────────────────────────────────────────────────

export function useROIEstimate() {
  const { token } = useAuth();
  return useMutation({
    mutationFn: (input: api.ROIEstimateRequest) =>
      api.estimateROI(input, token || undefined),
  });
}

export function useROICtrCurves() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['roi', 'ctr-curves'],
    queryFn: () => api.getROICtrCurves(token || undefined),
    enabled: !!token,
    staleTime: Infinity,
  });
}
