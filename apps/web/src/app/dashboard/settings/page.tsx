'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bell, Clipboard, Database, Download, Key, Link2, Plus, Save, Shield, Trash2, Users } from 'lucide-react';

import { useAuth } from '@/lib/auth-context';
import * as api from '@/lib/api';
import {
  useApiKeys,
  useAuditLogs,
  useCreatePlatformTenant,
  useCreateApiKey,
  useCreateProject,
  useCreateRbacUser,
  useCreateWebhook,
  useDeletePlatformTenant,
  useDeleteProject,
  useDeleteWebhook,
  useImportBackup,
  useNotificationSettings,
  usePermissionsMatrix,
  usePlatformTenants,
  useProjects,
  useRbacUsers,
  useRevokeApiKey,
  useSchedules,
  useUpdateApiKey,
  useUpdatePlatformTenant,
  useUpdateNotificationSettings,
  useUpdateProject,
  useUpdateRbacUser,
  useUpsertScheduleFlow,
  useTenantUsage,
  useTenantBranding,
  useUpdateTenantBranding,
  useUpdateWebhook,
  useWebhookDeliveries,
  useWebhooks,
} from '@/lib/queries';

type Tab =
  | 'projects'
  | 'api-keys'
  | 'notifications'
  | 'webhooks'
  | 'rbac'
  | 'audit-logs'
  | 'backup'
  | 'tenants'
  | 'usage'
  | 'branding';

const apiKeyScopes = [
  { key: 'keywords', label: 'Keywords' },
  { key: 'content', label: 'Content' },
  { key: 'audit', label: 'Audit' },
  { key: 'backlinks', label: 'Backlinks' },
  { key: 'reports', label: 'Reports' },
  { key: 'settings', label: 'Settings' },
] as const;

const webhookEventOptions = [
  { key: 'agent.task.completed', label: 'Agent completed' },
  { key: 'agent.task.failed', label: 'Agent failed' },
  { key: 'approval.requested', label: 'Approval requested' },
  { key: 'serp.rank.anomaly', label: 'Rank anomaly alert' },
  { key: 'pagespeed.alert.critical', label: 'PageSpeed critical alert' },
  { key: 'report.ready', label: 'Report ready' },
] as const;

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('projects');

  const { token } = useAuth();

  const projectsQuery = useProjects();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  const schedulesQuery = useSchedules();
  const upsertSchedule = useUpsertScheduleFlow();

  const apiKeysQuery = useApiKeys();
  const createApiKey = useCreateApiKey();
  const revokeApiKey = useRevokeApiKey();
  const updateApiKey = useUpdateApiKey();

  const notificationsQuery = useNotificationSettings();
  const updateNotifications = useUpdateNotificationSettings();

  // Phase 4: Webhooks
  const webhooksQuery = useWebhooks();
  const createWebhook = useCreateWebhook();
  const updateWebhook = useUpdateWebhook();
  const deleteWebhook = useDeleteWebhook();

  const rbacUsersQuery = useRbacUsers();
  const createRbacUser = useCreateRbacUser();
  const updateRbacUser = useUpdateRbacUser();
  const permissionsMatrixQuery = usePermissionsMatrix();

  const auditLogsQuery = useAuditLogs({ limit: 100, enabled: activeTab === 'audit-logs' });

  // Phase 4: Platform Tenants
  const platformTenantsQuery = usePlatformTenants();
  const createPlatformTenant = useCreatePlatformTenant();
  const updatePlatformTenant = useUpdatePlatformTenant();
  const deletePlatformTenant = useDeletePlatformTenant();

  const importBackup = useImportBackup();

  const tenantUsageQuery = useTenantUsage(token || undefined);

  const tenantBrandingQuery = useTenantBranding(token || undefined);
  const updateTenantBranding = useUpdateTenantBranding();

  const projects = projectsQuery.data ?? [];
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const activeProject = useMemo(() => projects.find((p) => p.id === activeProjectId) ?? null, [projects, activeProjectId]);

  useEffect(() => {
    if (!activeProjectId && projects.length > 0) {
      setActiveProjectId(projects[0].id);
    }
  }, [activeProjectId, projects]);

  // Projects form
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDomain, setNewProjectDomain] = useState('');
  const [newProjectTargetKeywords, setNewProjectTargetKeywords] = useState('');

  const [editProjectName, setEditProjectName] = useState('');
  const [editProjectDomain, setEditProjectDomain] = useState('');
  const [editProjectTargetKeywords, setEditProjectTargetKeywords] = useState('');

  useEffect(() => {
    if (!activeProject) return;
    setEditProjectName(activeProject.name);
    setEditProjectDomain(activeProject.domain);
    const targetKeywords = (activeProject.settings?.targetKeywords as string[] | undefined) ?? [];
    setEditProjectTargetKeywords(targetKeywords.join(', '));
  }, [activeProject?.id]);

  // Schedule form (for seo-content-pipeline)
  const scheduleId = activeProjectId ? `content-pipeline-${activeProjectId}` : '';
  const schedulesForProject = (schedulesQuery.data ?? []).filter((s) => s.projectId === activeProjectId);
  const existingSchedule = schedulesForProject.find((s) => s.id === scheduleId) ?? schedulesForProject[0] ?? null;

  const [scheduleEnabled, setScheduleEnabled] = useState(true);
  const [scheduleCron, setScheduleCron] = useState('0 9 * * 1');
  const [scheduleTimezone, setScheduleTimezone] = useState('');
  const [scheduleSeedKeyword, setScheduleSeedKeyword] = useState('');

  useEffect(() => {
    if (!activeProjectId) return;

    if (existingSchedule) {
      setScheduleEnabled(existingSchedule.enabled);
      setScheduleCron(existingSchedule.cron);
      setScheduleTimezone(existingSchedule.timezone ?? '');
      setScheduleSeedKeyword(existingSchedule.seedKeyword ?? '');
      return;
    }

    const fallbackSeed = ((activeProject?.settings?.targetKeywords as string[] | undefined) ?? [])[0] ?? '';
    setScheduleEnabled(true);
    setScheduleCron('0 9 * * 1');
    setScheduleTimezone('');
    setScheduleSeedKeyword(fallbackSeed);
  }, [activeProjectId, existingSchedule?.id]);

  // API key create form
  const [apiKeyName, setApiKeyName] = useState('');
  const [apiKeyProjectId, setApiKeyProjectId] = useState<string>('');
  const [apiKeyPermissions, setApiKeyPermissions] = useState<string[]>(['keywords', 'content']);
  const [createdApiKeySecret, setCreatedApiKeySecret] = useState<string | null>(null);
  const [revealedApiKeys, setRevealedApiKeys] = useState<Record<string, string>>({});

  // Notifications form
  const [slackWebhookUrl, setSlackWebhookUrl] = useState('');
  const [emailRecipientsText, setEmailRecipientsText] = useState('');
  const [notificationTypes, setNotificationTypes] = useState<api.NotificationType[]>(['alerts']);

  // Webhooks form
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEnabled, setWebhookEnabled] = useState(true);
  const [webhookEvents, setWebhookEvents] = useState<string[]>(['agent.task.completed']);
  const [activeWebhookId, setActiveWebhookId] = useState<string>('');
  const webhookDeliveriesQuery = useWebhookDeliveries(activeWebhookId || null, 50);

  useEffect(() => {
    if (!notificationsQuery.data) return;
    setSlackWebhookUrl(notificationsQuery.data.slackWebhookUrl ?? '');
    setEmailRecipientsText((notificationsQuery.data.emailRecipients ?? []).join(', '));
    setNotificationTypes(notificationsQuery.data.types ?? ['alerts']);
  }, [notificationsQuery.data?.projectId]);

  // RBAC create form
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<api.RbacUser['role']>('analyst');

  const [rbacDraft, setRbacDraft] = useState<Record<string, { email: string; name: string; role: api.RbacUser['role'] }>>({});

  useEffect(() => {
    const users = rbacUsersQuery.data ?? [];
    setRbacDraft((prev) => {
      const next: typeof prev = { ...prev };
      for (const u of users) {
        if (!next[u.id]) {
          next[u.id] = { email: u.email, name: u.name, role: u.role };
        }
      }
      return next;
    });
  }, [rbacUsersQuery.data?.length]);

  // Backup/export
  const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('json');
  const [importStatus, setImportStatus] = useState<string>('');

  const [auditExportStatus, setAuditExportStatus] = useState<string>('');

  // Usage upgrade CTA
  const [usageUpgradeStatus, setUsageUpgradeStatus] = useState<string>('');

  // Platform tenants form
  const [tenantCreateName, setTenantCreateName] = useState('');
  const [tenantCreateSlug, setTenantCreateSlug] = useState('');
  const [tenantCreatePlan, setTenantCreatePlan] = useState('starter');

  // Branding form
  const [brandPrimaryColor, setBrandPrimaryColor] = useState('#3b82f6');
  const [brandHeaderText, setBrandHeaderText] = useState('');
  const [brandFooterText, setBrandFooterText] = useState('');
  const [brandLogoDataUrl, setBrandLogoDataUrl] = useState<string>('');
  const [brandStatus, setBrandStatus] = useState<string>('');

  useEffect(() => {
    const b = tenantBrandingQuery.data?.brand;
    if (!b) return;
    if (b.primaryColor) setBrandPrimaryColor(b.primaryColor);
    setBrandHeaderText(b.headerText ?? '');
    setBrandFooterText(b.footerText ?? '');
    setBrandLogoDataUrl(b.logoDataUrl ?? '');
  }, [tenantBrandingQuery.data?.tenantId]);

  const onPickLogoFile = async (file: File | null) => {
    setBrandStatus('');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setBrandStatus('Please select an image file');
      return;
    }
    if (file.size > 250_000) {
      setBrandStatus('Logo too large (max 250KB)');
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.readAsDataURL(file);
    });

    setBrandLogoDataUrl(dataUrl);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Settings & RBAC</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Phase 3 task plan section 4.10</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <nav className="space-y-1">
            <TabButton icon={<Database className="h-5 w-5" />} label="Projects" active={activeTab === 'projects'} onClick={() => setActiveTab('projects')} />
            <TabButton icon={<Key className="h-5 w-5" />} label="API Keys" active={activeTab === 'api-keys'} onClick={() => setActiveTab('api-keys')} />
            <TabButton icon={<Bell className="h-5 w-5" />} label="Notifications" active={activeTab === 'notifications'} onClick={() => setActiveTab('notifications')} />
            <TabButton icon={<Link2 className="h-5 w-5" />} label="Webhooks" active={activeTab === 'webhooks'} onClick={() => setActiveTab('webhooks')} />
            <TabButton icon={<Users className="h-5 w-5" />} label="RBAC" active={activeTab === 'rbac'} onClick={() => setActiveTab('rbac')} />
            <TabButton icon={<Shield className="h-5 w-5" />} label="Audit Logs" active={activeTab === 'audit-logs'} onClick={() => setActiveTab('audit-logs')} />
            <TabButton icon={<Download className="h-5 w-5" />} label="Backup/Export" active={activeTab === 'backup'} onClick={() => setActiveTab('backup')} />
            <TabButton icon={<Users className="h-5 w-5" />} label="Tenants" active={activeTab === 'tenants'} onClick={() => setActiveTab('tenants')} />
            <TabButton icon={<Clipboard className="h-5 w-5" />} label="Usage" active={activeTab === 'usage'} onClick={() => setActiveTab('usage')} />
            <TabButton icon={<Save className="h-5 w-5" />} label="Branding" active={activeTab === 'branding'} onClick={() => setActiveTab('branding')} />
          </nav>
        </div>

        <div className="lg:col-span-3">
          {activeTab === 'projects' && (
            <div className="space-y-6">
              <Card title="Projects" subtitle="Create / edit / delete projects; set domain, target keywords, and a basic schedule.">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Active project</label>
                    <select
                      value={activeProjectId}
                      onChange={(e) => setActiveProjectId(e.target.value)}
                      className="mt-2 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.domain})
                        </option>
                      ))}
                    </select>
                    {projectsQuery.isLoading && <p className="mt-2 text-sm text-gray-500">Loading projects…</p>}
                    {projectsQuery.isError && (
                      <p className="mt-2 text-sm text-red-600 dark:text-red-400">{(projectsQuery.error as Error).message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Create project</label>
                    <div className="mt-2 grid gap-2">
                      <input
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        placeholder="Project name"
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
                      />
                      <input
                        value={newProjectDomain}
                        onChange={(e) => setNewProjectDomain(e.target.value)}
                        placeholder="example.com"
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
                      />
                      <input
                        value={newProjectTargetKeywords}
                        onChange={(e) => setNewProjectTargetKeywords(e.target.value)}
                        placeholder="target keywords (comma-separated)"
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
                      />

                      <button
                        onClick={async () => {
                          const keywords = newProjectTargetKeywords
                            .split(',')
                            .map((k) => k.trim())
                            .filter(Boolean);

                          const created = await createProject.mutateAsync({
                            name: newProjectName.trim(),
                            domain: newProjectDomain.trim(),
                            targetKeywords: keywords,
                          });

                          setNewProjectName('');
                          setNewProjectDomain('');
                          setNewProjectTargetKeywords('');
                          setActiveProjectId(created.id);
                        }}
                        disabled={createProject.isPending || !newProjectName.trim() || !newProjectDomain.trim()}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        <Plus className="h-4 w-4" />
                        Create
                      </button>

                      {createProject.isError && (
                        <p className="text-sm text-red-600 dark:text-red-400">{(createProject.error as Error).message}</p>
                      )}
                    </div>
                  </div>
                </div>

                {activeProject && (
                  <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-6">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Project settings</h3>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
                        <input
                          value={editProjectName}
                          onChange={(e) => setEditProjectName(e.target.value)}
                          className="mt-2 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Domain</label>
                        <input
                          value={editProjectDomain}
                          onChange={(e) => setEditProjectDomain(e.target.value)}
                          className="mt-2 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Target keywords</label>
                        <input
                          value={editProjectTargetKeywords}
                          onChange={(e) => setEditProjectTargetKeywords(e.target.value)}
                          placeholder="comma-separated"
                          className="mt-2 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        onClick={async () => {
                          const keywords = editProjectTargetKeywords
                            .split(',')
                            .map((k) => k.trim())
                            .filter(Boolean);

                          await updateProject.mutateAsync({
                            id: activeProject.id,
                            input: {
                              name: editProjectName.trim(),
                              domain: editProjectDomain.trim(),
                              targetKeywords: keywords,
                            },
                          });
                        }}
                        disabled={updateProject.isPending}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        <Save className="h-4 w-4" />
                        Save
                      </button>
                      <button
                        onClick={async () => {
                          const ok = window.confirm('Delete this project? This will remove associated data via cascading deletes.');
                          if (!ok) return;
                          await deleteProject.mutateAsync(activeProject.id);
                          setActiveProjectId('');
                        }}
                        disabled={deleteProject.isPending}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 dark:border-red-800 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                    </div>

                    {updateProject.isError && (
                      <p className="mt-2 text-sm text-red-600 dark:text-red-400">{(updateProject.error as Error).message}</p>
                    )}
                    {deleteProject.isError && (
                      <p className="mt-2 text-sm text-red-600 dark:text-red-400">{(deleteProject.error as Error).message}</p>
                    )}
                  </div>
                )}

                {activeProject && (
                  <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-6">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Schedule (seo-content-pipeline)</h3>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Stores schedules in the schedules table and triggers the content pipeline flow.</p>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Cron</label>
                        <input
                          value={scheduleCron}
                          onChange={(e) => setScheduleCron(e.target.value)}
                          className="mt-2 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Timezone (optional)</label>
                        <input
                          value={scheduleTimezone}
                          onChange={(e) => setScheduleTimezone(e.target.value)}
                          placeholder="Asia/Taipei"
                          className="mt-2 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Seed keyword (optional)</label>
                        <input
                          value={scheduleSeedKeyword}
                          onChange={(e) => setScheduleSeedKeyword(e.target.value)}
                          className="mt-2 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
                        />
                      </div>
                      <div className="md:col-span-2 flex items-center gap-2">
                        <input
                          id="schedule-enabled"
                          type="checkbox"
                          checked={scheduleEnabled}
                          onChange={(e) => setScheduleEnabled(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                        />
                        <label htmlFor="schedule-enabled" className="text-sm text-gray-700 dark:text-gray-300">Enabled</label>
                      </div>
                    </div>

                    <div className="mt-4">
                      <button
                        onClick={async () => {
                          await upsertSchedule.mutateAsync({
                            id: scheduleId,
                            enabled: scheduleEnabled,
                            cron: scheduleCron.trim(),
                            timezone: scheduleTimezone.trim() ? scheduleTimezone.trim() : undefined,
                            flowName: 'seo-content-pipeline',
                            projectId: activeProject.id,
                            seedKeyword: scheduleSeedKeyword.trim() ? scheduleSeedKeyword.trim() : undefined,
                          });
                        }}
                        disabled={upsertSchedule.isPending || !scheduleId || !scheduleCron.trim()}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        <Save className="h-4 w-4" />
                        Save schedule
                      </button>

                      {upsertSchedule.isError && (
                        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{(upsertSchedule.error as Error).message}</p>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            </div>
          )}

          {activeTab === 'api-keys' && (
            <div className="space-y-6">
              <Card title="API Keys" subtitle="Create / revoke keys, reveal full key, and set permission scopes.">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
                    <input
                      value={apiKeyName}
                      onChange={(e) => setApiKeyName(e.target.value)}
                      placeholder="Integration name"
                      className="mt-2 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Project (optional)</label>
                    <select
                      value={apiKeyProjectId}
                      onChange={(e) => setApiKeyProjectId(e.target.value)}
                      className="mt-2 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
                    >
                      <option value="">Tenant-wide</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Permissions</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {apiKeyScopes.map((scope) => {
                      const checked = apiKeyPermissions.includes(scope.key);
                      return (
                        <label key={scope.key} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setApiKeyPermissions((prev) => {
                                if (e.target.checked) return Array.from(new Set([...prev, scope.key]));
                                return prev.filter((x) => x !== scope.key);
                              });
                            }}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                          />
                          {scope.label}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={async () => {
                      const res = await createApiKey.mutateAsync({
                        name: apiKeyName.trim(),
                        projectId: apiKeyProjectId || undefined,
                        permissions: apiKeyPermissions,
                      });
                      setCreatedApiKeySecret(res.secret);
                      setApiKeyName('');
                    }}
                    disabled={createApiKey.isPending || !apiKeyName.trim()}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    Create key
                  </button>

                  {createApiKey.isError && (
                    <p className="text-sm text-red-600 dark:text-red-400">{(createApiKey.error as Error).message}</p>
                  )}
                </div>

                {createdApiKeySecret && (
                  <div className="mt-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/20 p-4">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">New API key (copy now)</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <code className="rounded bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700">
                        {createdApiKeySecret}
                      </code>
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(createdApiKeySecret);
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <Clipboard className="h-4 w-4" />
                        Copy
                      </button>
                      <button
                        onClick={() => setCreatedApiKeySecret(null)}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </Card>

              <Card title="Existing keys" subtitle="Masked keys can be revealed if not revoked.">
                {apiKeysQuery.isLoading ? (
                  <p className="text-sm text-gray-600 dark:text-gray-400">Loading…</p>
                ) : apiKeysQuery.isError ? (
                  <p className="text-sm text-red-600 dark:text-red-400">{(apiKeysQuery.error as Error).message}</p>
                ) : apiKeysQuery.data && apiKeysQuery.data.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-600 dark:text-gray-400">
                          <th className="py-2">Name</th>
                          <th className="py-2">Key</th>
                          <th className="py-2">Scopes</th>
                          <th className="py-2">Status</th>
                          <th className="py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {apiKeysQuery.data.map((k) => {
                          const scopes = Array.isArray((k.permissions as any)?.scopes) ? ((k.permissions as any).scopes as string[]) : [];
                          const revealed = revealedApiKeys[k.id];
                          const isRevoked = !!k.revokedAt;

                          return (
                            <tr key={k.id}>
                              <td className="py-3 text-gray-900 dark:text-white">{k.name}</td>
                              <td className="py-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <code className="rounded bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700">
                                    {revealed ? revealed : k.maskedKey}
                                  </code>
                                  {!isRevoked && (
                                    <button
                                      onClick={async () => {
                                        if (revealed) {
                                          setRevealedApiKeys((prev) => {
                                            const next = { ...prev };
                                            delete next[k.id];
                                            return next;
                                          });
                                          return;
                                        }

                                        if (!token) return;
                                        const res = await api.revealApiKey(k.id, token);
                                        setRevealedApiKeys((prev) => ({ ...prev, [k.id]: res.secret }));
                                      }}
                                      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
                                    >
                                      {revealed ? 'Hide' : 'Reveal'}
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 text-gray-700 dark:text-gray-300">
                                <div className="flex flex-wrap gap-2">
                                  {apiKeyScopes.map((scope) => {
                                    const checked = scopes.includes(scope.key);
                                    return (
                                      <label key={scope.key} className="flex items-center gap-1 text-xs">
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={(e) => {
                                            const next = e.target.checked
                                              ? Array.from(new Set([...scopes, scope.key]))
                                              : scopes.filter((s) => s !== scope.key);
                                            updateApiKey.mutate({ id: k.id, input: { permissions: next } });
                                          }}
                                          disabled={isRevoked || updateApiKey.isPending}
                                          className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                                        />
                                        {scope.label}
                                      </label>
                                    );
                                  })}
                                </div>
                              </td>
                              <td className="py-3 text-gray-700 dark:text-gray-300">{isRevoked ? 'Revoked' : 'Active'}</td>
                              <td className="py-3 text-right">
                                <button
                                  onClick={async () => {
                                    const ok = window.confirm('Revoke this API key?');
                                    if (!ok) return;
                                    await revokeApiKey.mutateAsync(k.id);
                                  }}
                                  disabled={isRevoked || revokeApiKey.isPending}
                                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 dark:border-red-800 bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                                >
                                  Revoke
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-400">No API keys yet.</p>
                )}

                {revokeApiKey.isError && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">{(revokeApiKey.error as Error).message}</p>
                )}
                {updateApiKey.isError && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">{(updateApiKey.error as Error).message}</p>
                )}
              </Card>
            </div>
          )}

          {activeTab === 'notifications' && (
            <Card title="Notifications" subtitle="Configure Slack + Email recipients and select notification types.">
              {notificationsQuery.isLoading ? (
                <p className="text-sm text-gray-600 dark:text-gray-400">Loading…</p>
              ) : notificationsQuery.isError ? (
                <p className="text-sm text-red-600 dark:text-red-400">{(notificationsQuery.error as Error).message}</p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Slack webhook URL</label>
                    <input
                      value={slackWebhookUrl}
                      onChange={(e) => setSlackWebhookUrl(e.target.value)}
                      placeholder="https://hooks.slack.com/..."
                      className="mt-2 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email recipients</label>
                    <input
                      value={emailRecipientsText}
                      onChange={(e) => setEmailRecipientsText(e.target.value)}
                      placeholder="a@company.com, b@company.com"
                      className="mt-2 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Types</p>
                    <div className="mt-2 flex flex-wrap gap-4">
                      {(['alerts', 'reviews', 'completions'] as api.NotificationType[]).map((t) => {
                        const checked = notificationTypes.includes(t);
                        return (
                          <label key={t} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                setNotificationTypes((prev) => {
                                  if (e.target.checked) return Array.from(new Set([...prev, t]));
                                  return prev.filter((x) => x !== t);
                                });
                              }}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                            />
                            {t}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    onClick={async () => {
                      const emailRecipients = emailRecipientsText
                        .split(',')
                        .map((x) => x.trim())
                        .filter(Boolean);

                      await updateNotifications.mutateAsync({
                        slackWebhookUrl: slackWebhookUrl.trim() ? slackWebhookUrl.trim() : undefined,
                        emailRecipients,
                        types: notificationTypes.length > 0 ? notificationTypes : ['alerts'],
                      });
                    }}
                    disabled={updateNotifications.isPending}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    Save
                  </button>

                  {updateNotifications.isError && (
                    <p className="text-sm text-red-600 dark:text-red-400">{(updateNotifications.error as Error).message}</p>
                  )}
                  {updateNotifications.isSuccess && (
                    <p className="text-sm text-green-700 dark:text-green-400">Saved.</p>
                  )}
                </div>
              )}
            </Card>
          )}

          {activeTab === 'webhooks' && (
            <div className="space-y-6">
              <Card title="Third-party Webhooks" subtitle="Deliver selected events to your own HTTP endpoint.">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Webhook URL</label>
                    <input
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://example.com/webhook"
                      className="mt-2 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
                    />
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        id="webhook-enabled"
                        type="checkbox"
                        checked={webhookEnabled}
                        onChange={(e) => setWebhookEnabled(e.target.checked)}
                        className="h-4 w-4"
                      />
                      <label htmlFor="webhook-enabled" className="text-sm text-gray-700 dark:text-gray-300">
                        Enabled
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Events</label>
                    <div className="mt-2 grid gap-2">
                      {webhookEventOptions.map((opt) => {
                        const checked = webhookEvents.includes(opt.key);
                        return (
                          <label key={opt.key} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                setWebhookEvents((prev) => {
                                  if (e.target.checked) return Array.from(new Set([...prev, opt.key]));
                                  return prev.filter((x) => x !== opt.key);
                                });
                              }}
                              className="h-4 w-4"
                            />
                            <span>{opt.label}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">{opt.key}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={async () => {
                      if (!webhookUrl.trim()) return;
                      await createWebhook.mutateAsync({ url: webhookUrl.trim(), enabled: webhookEnabled, events: webhookEvents });
                      setWebhookUrl('');
                    }}
                    disabled={createWebhook.isPending || !webhookUrl.trim()}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" /> Add webhook
                  </button>
                </div>
              </Card>

              <Card title="Configured Webhooks" subtitle="Select a webhook to view recent delivery logs.">
                {webhooksQuery.isLoading ? (
                  <div className="text-sm text-gray-600 dark:text-gray-400">Loading...</div>
                ) : (
                  <div className="space-y-3">
                    {(webhooksQuery.data ?? []).length === 0 ? (
                      <div className="text-sm text-gray-600 dark:text-gray-400">No webhooks configured.</div>
                    ) : (
                      <div className="space-y-2">
                        {(webhooksQuery.data ?? []).map((wh) => (
                          <div
                            key={wh.id}
                            className={`rounded-lg border px-3 py-3 ${activeWebhookId === wh.id ? 'border-indigo-500' : 'border-gray-200 dark:border-gray-700'}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <button onClick={() => setActiveWebhookId(wh.id)} className="flex-1 text-left" title="Select webhook">
                                <div className="text-sm font-medium text-gray-900 dark:text-white break-all">{wh.url}</div>
                                <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                                  {wh.enabled ? 'Enabled' : 'Disabled'} · Events: {(wh.events ?? []).join(', ') || '(all)'}
                                </div>
                              </button>

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={async () => {
                                    await updateWebhook.mutateAsync({ id: wh.id, patch: { enabled: !wh.enabled } });
                                  }}
                                  disabled={updateWebhook.isPending}
                                  className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1 text-xs text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                                >
                                  {wh.enabled ? 'Disable' : 'Enable'}
                                </button>
                                <button
                                  onClick={async () => {
                                    await deleteWebhook.mutateAsync(wh.id);
                                    if (activeWebhookId === wh.id) setActiveWebhookId('');
                                  }}
                                  disabled={deleteWebhook.isPending}
                                  className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                                >
                                  <Trash2 className="h-3 w-3" /> Delete
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {activeWebhookId && (
                      <div className="mt-4 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">Delivery logs</div>
                        {webhookDeliveriesQuery.isLoading ? (
                          <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">Loading...</div>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {(webhookDeliveriesQuery.data?.deliveries ?? []).length === 0 ? (
                              <div className="text-sm text-gray-600 dark:text-gray-400">No deliveries yet.</div>
                            ) : (
                              (webhookDeliveriesQuery.data?.deliveries ?? []).map((d) => (
                                <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2">
                                  <div className="text-xs text-gray-700 dark:text-gray-300">
                                    <span className="font-medium">{d.eventType}</span>
                                    <span className="text-gray-500 dark:text-gray-400"> · seq </span>
                                    <span>{d.eventSeq ?? '-'}</span>
                                  </div>
                                  <div className="text-xs">
                                    <span className={d.ok ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
                                      {d.ok ? `OK ${d.statusCode ?? ''}` : `FAIL ${d.statusCode ?? ''}`}
                                    </span>
                                    <span className="ml-2 text-gray-500 dark:text-gray-400">{new Date(d.createdAt).toLocaleString()}</span>
                                  </div>
                                  {!d.ok && d.error && (
                                    <div className="w-full text-xs text-red-700 dark:text-red-400 break-all">{d.error}</div>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </div>
          )}

          {activeTab === 'rbac' && (
            <div className="space-y-6">
              <Card title="Users & roles" subtitle="Create users and assign roles (Admin / Manager / Analyst).">
                <div className="grid gap-2 md:grid-cols-4">
                  <input
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    placeholder="email"
                    className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
                  />
                  <input
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    placeholder="name"
                    className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
                  />
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as api.RbacUser['role'])}
                    className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
                  >
                    <option value="admin">admin</option>
                    <option value="manager">manager</option>
                    <option value="analyst">analyst</option>
                  </select>
                  <button
                    onClick={async () => {
                      await createRbacUser.mutateAsync({
                        email: newUserEmail.trim(),
                        name: newUserName.trim(),
                        role: newUserRole,
                      });
                      setNewUserEmail('');
                      setNewUserName('');
                      setNewUserRole('analyst');
                    }}
                    disabled={createRbacUser.isPending || !newUserEmail.trim() || !newUserName.trim()}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    Add
                  </button>
                </div>

                {createRbacUser.isError && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">{(createRbacUser.error as Error).message}</p>
                )}

                <div className="mt-6">
                  {rbacUsersQuery.isLoading ? (
                    <p className="text-sm text-gray-600 dark:text-gray-400">Loading…</p>
                  ) : rbacUsersQuery.isError ? (
                    <p className="text-sm text-red-600 dark:text-red-400">{(rbacUsersQuery.error as Error).message}</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-600 dark:text-gray-400">
                            <th className="py-2">Email</th>
                            <th className="py-2">Name</th>
                            <th className="py-2">Role</th>
                            <th className="py-2"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {(rbacUsersQuery.data ?? []).map((u) => {
                            const draft = rbacDraft[u.id] ?? { email: u.email, name: u.name, role: u.role };
                            const dirty = draft.email !== u.email || draft.name !== u.name || draft.role !== u.role;

                            return (
                              <tr key={u.id}>
                                <td className="py-3">
                                  <input
                                    value={draft.email}
                                    onChange={(e) =>
                                      setRbacDraft((prev) => ({
                                        ...prev,
                                        [u.id]: { ...draft, email: e.target.value },
                                      }))
                                    }
                                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-white"
                                  />
                                </td>
                                <td className="py-3">
                                  <input
                                    value={draft.name}
                                    onChange={(e) =>
                                      setRbacDraft((prev) => ({
                                        ...prev,
                                        [u.id]: { ...draft, name: e.target.value },
                                      }))
                                    }
                                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-white"
                                  />
                                </td>
                                <td className="py-3">
                                  <select
                                    value={draft.role}
                                    onChange={(e) =>
                                      setRbacDraft((prev) => ({
                                        ...prev,
                                        [u.id]: { ...draft, role: e.target.value as api.RbacUser['role'] },
                                      }))
                                    }
                                    className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-white"
                                  >
                                    <option value="admin">admin</option>
                                    <option value="manager">manager</option>
                                    <option value="analyst">analyst</option>
                                  </select>
                                </td>
                                <td className="py-3 text-right">
                                  <button
                                    onClick={async () => {
                                      await updateRbacUser.mutateAsync({
                                        id: u.id,
                                        input: {
                                          email: draft.email.trim(),
                                          name: draft.name.trim(),
                                          role: draft.role,
                                        },
                                      });
                                    }}
                                    disabled={!dirty || updateRbacUser.isPending}
                                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                                  >
                                    <Save className="h-4 w-4" />
                                    Save
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {updateRbacUser.isError && (
                    <p className="mt-2 text-sm text-red-600 dark:text-red-400">{(updateRbacUser.error as Error).message}</p>
                  )}
                </div>
              </Card>

              <Card title="Permission matrix" subtitle="Static MVP matrix for roles.">
                {permissionsMatrixQuery.isLoading ? (
                  <p className="text-sm text-gray-600 dark:text-gray-400">Loading…</p>
                ) : permissionsMatrixQuery.isError ? (
                  <p className="text-sm text-red-600 dark:text-red-400">{(permissionsMatrixQuery.error as Error).message}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-600 dark:text-gray-400">
                          <th className="py-2">Area</th>
                          <th className="py-2">Admin</th>
                          <th className="py-2">Manager</th>
                          <th className="py-2">Analyst</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {(permissionsMatrixQuery.data?.permissions ?? []).map((p) => (
                          <tr key={p.key}>
                            <td className="py-3 text-gray-900 dark:text-white">{p.label}</td>
                            <td className="py-3 text-gray-700 dark:text-gray-300">{p.admin ? '✓' : '—'}</td>
                            <td className="py-3 text-gray-700 dark:text-gray-300">{p.manager ? '✓' : '—'}</td>
                            <td className="py-3 text-gray-700 dark:text-gray-300">{p.analyst ? '✓' : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          )}

          {activeTab === 'audit-logs' && (
            <Card title="Audit Logs" subtitle="Phase 4: records sensitive actions (admin/manager).">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Showing latest {auditLogsQuery.data?.items?.length ?? 0} items.
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      if (!token) return;
                      setAuditExportStatus('');
                      try {
                        const { blob, filename } = await api.exportAuditLogs({ format: 'json', limit: 500 }, token);
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = filename;
                        a.click();
                        URL.revokeObjectURL(url);
                      } catch (err) {
                        const msg = err instanceof Error ? err.message : String(err);
                        setAuditExportStatus(msg);
                      }
                    }}
                    disabled={!token}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-xs font-semibold text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />
                    Download JSON
                  </button>
                  <button
                    onClick={async () => {
                      if (!token) return;
                      setAuditExportStatus('');
                      try {
                        const { blob, filename } = await api.exportAuditLogs({ format: 'csv', limit: 500 }, token);
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = filename;
                        a.click();
                        URL.revokeObjectURL(url);
                      } catch (err) {
                        const msg = err instanceof Error ? err.message : String(err);
                        setAuditExportStatus(msg);
                      }
                    }}
                    disabled={!token}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-xs font-semibold text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />
                    Download CSV
                  </button>
                </div>
              </div>

              {auditExportStatus && <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{auditExportStatus}</p>}

              <div className="mt-4">
                {auditLogsQuery.isLoading ? (
                  <p className="text-sm text-gray-600 dark:text-gray-400">Loading…</p>
                ) : auditLogsQuery.isError ? (
                  <p className="text-sm text-red-600 dark:text-red-400">{(auditLogsQuery.error as Error).message}</p>
                ) : (auditLogsQuery.data?.items ?? []).length === 0 ? (
                  <p className="text-sm text-gray-600 dark:text-gray-400">No audit logs yet.</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                    <table className="min-w-full">
                      <thead className="bg-gray-50 dark:bg-gray-900/40">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">Time</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">Actor</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">Action</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">Resource</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">Project</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">Metadata</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                        {(auditLogsQuery.data?.items ?? []).map((row) => {
                          const meta = row.metadata ? JSON.stringify(row.metadata) : '';
                          return (
                            <tr key={row.id} className="text-sm">
                              <td className="px-4 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                                {new Date(row.createdAt).toLocaleString()}
                              </td>
                              <td className="px-4 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap">{row.userId ?? 'system'}</td>
                              <td className="px-4 py-2 text-gray-900 dark:text-white whitespace-nowrap">{row.action}</td>
                              <td className="px-4 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                                {row.resourceType}
                                {row.resourceId ? `:${row.resourceId}` : ''}
                              </td>
                              <td className="px-4 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap">{row.projectId ?? '—'}</td>
                              <td className="px-4 py-2 text-gray-600 dark:text-gray-300 max-w-[420px]">
                                <span className="block truncate" title={meta}>
                                  {meta || '—'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </Card>
          )}

          {activeTab === 'backup' && (
            <Card title="Backup / Export" subtitle="Export project data (JSON/CSV) and import keywords + project settings.">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Export</h3>
                  <div className="mt-2 grid gap-2">
                    <select
                      value={activeProjectId}
                      onChange={(e) => setActiveProjectId(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={exportFormat}
                      onChange={(e) => setExportFormat(e.target.value as 'json' | 'csv')}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
                    >
                      <option value="json">JSON (project + keywords + schedules)</option>
                      <option value="csv">CSV (keywords only)</option>
                    </select>
                    <button
                      onClick={async () => {
                        if (!token || !activeProjectId) return;
                        const { blob, filename } = await api.downloadBackupExport({ projectId: activeProjectId, format: exportFormat }, token);
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = filename;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      disabled={!token || !activeProjectId}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Import</h3>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Accepts JSON exported from this page.</p>
                  <div className="mt-2 grid gap-2">
                    <input
                      type="file"
                      accept="application/json,.json"
                      onChange={async (e) => {
                        setImportStatus('');
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const text = await file.text();
                        let parsed: any;
                        try {
                          parsed = JSON.parse(text) as any;
                        } catch (err) {
                          const msg = err instanceof Error ? err.message : String(err);
                          setImportStatus(
                            `Invalid JSON file. ${msg} (Tip: if your JSON contains Windows paths like C:\\Users\\..., backslashes must be escaped as \\\\.)`,
                          );
                          return;
                        }

                        const payload = parsed?.export ? parsed.export : parsed;
                        const project = payload?.project;
                        const keywords = payload?.keywords;

                        if (!project?.name || !project?.domain) {
                          setImportStatus('Invalid file: missing project.name/domain');
                          return;
                        }

                        const res = await importBackup.mutateAsync({
                          project: { name: project.name, domain: project.domain, settings: project.settings ?? {} },
                          keywords: Array.isArray(keywords) ? keywords : [],
                        });
                        setImportStatus(`Imported project ${res.projectId}`);
                      }}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
                    />

                    {importStatus && <p className="text-sm text-gray-700 dark:text-gray-300">{importStatus}</p>}
                    {importBackup.isError && (
                      <p className="text-sm text-red-600 dark:text-red-400">{(importBackup.error as Error).message}</p>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {activeTab === 'tenants' && (
            <div className="space-y-6">
              <Card title="Platform Tenants" subtitle="Phase 4: requires PLATFORM_ADMIN_SECRET (server-side) + Bearer(admin).">
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
                    <input
                      value={tenantCreateName}
                      onChange={(e) => setTenantCreateName(e.target.value)}
                      placeholder="Acme Inc"
                      className="mt-2 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Slug</label>
                    <input
                      value={tenantCreateSlug}
                      onChange={(e) => setTenantCreateSlug(e.target.value)}
                      placeholder="acme-inc"
                      className="mt-2 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">kebab-case only</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Plan</label>
                    <input
                      value={tenantCreatePlan}
                      onChange={(e) => setTenantCreatePlan(e.target.value)}
                      placeholder="starter"
                      className="mt-2 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={async () => {
                      await createPlatformTenant.mutateAsync({
                        name: tenantCreateName.trim(),
                        slug: tenantCreateSlug.trim(),
                        plan: tenantCreatePlan.trim() ? tenantCreatePlan.trim() : undefined,
                      });
                      setTenantCreateName('');
                      setTenantCreateSlug('');
                      setTenantCreatePlan('starter');
                    }}
                    disabled={createPlatformTenant.isPending || !tenantCreateName.trim() || !tenantCreateSlug.trim()}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    Create tenant
                  </button>
                  {createPlatformTenant.isError && (
                    <p className="text-sm text-red-600 dark:text-red-400">{(createPlatformTenant.error as Error).message}</p>
                  )}
                </div>

                <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-6">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Tenants list</h3>

                  {platformTenantsQuery.isLoading ? (
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Loading…</p>
                  ) : platformTenantsQuery.isError ? (
                    <p className="mt-2 text-sm text-red-600 dark:text-red-400">{(platformTenantsQuery.error as Error).message}</p>
                  ) : (
                    <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-900/30">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">Name</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">Slug</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">Plan</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">Status</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">Users</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">Projects</th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600 dark:text-gray-300">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                          {(platformTenantsQuery.data ?? []).map((t) => (
                            <tr key={t.id} className="text-sm">
                              <td className="px-4 py-2 text-gray-900 dark:text-white">{t.name}</td>
                              <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{t.slug}</td>
                              <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{t.plan}</td>
                              <td className="px-4 py-2">
                                <span className="inline-flex rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:text-gray-200">
                                  {t.status}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{t.userCount}</td>
                              <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{t.projectCount}</td>
                              <td className="px-4 py-2">
                                <div className="flex justify-end gap-2">
                                  {t.status !== 'deleted' && (
                                    <button
                                      onClick={async () => {
                                        await updatePlatformTenant.mutateAsync({
                                          id: t.id,
                                          input: { status: t.status === 'active' ? 'disabled' : 'active' },
                                        });
                                      }}
                                      disabled={updatePlatformTenant.isPending}
                                      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                                    >
                                      {t.status === 'active' ? 'Disable' : 'Enable'}
                                    </button>
                                  )}
                                  <button
                                    onClick={async () => {
                                      const ok = window.confirm('Mark this tenant as deleted? (soft-delete)');
                                      if (!ok) return;
                                      await deletePlatformTenant.mutateAsync(t.id);
                                    }}
                                    disabled={deletePlatformTenant.isPending}
                                    className="inline-flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-800 bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {(updatePlatformTenant.isError || deletePlatformTenant.isError) && (
                    <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                      {((updatePlatformTenant.error || deletePlatformTenant.error) as Error).message}
                    </p>
                  )}
                </div>
              </Card>
            </div>
          )}

          {activeTab === 'usage' && (
            <div className="space-y-6">
              <Card title="Usage & Quotas" subtitle="Phase 4: shows current usage vs quota (monthly).">
                {tenantUsageQuery.isLoading && <p className="text-sm text-gray-500">Loading usage…</p>}
                {tenantUsageQuery.isError && (
                  <p className="text-sm text-red-600 dark:text-red-400">{(tenantUsageQuery.error as Error).message}</p>
                )}

                {tenantUsageQuery.data && (
                  <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                        <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Plan</p>
                        <p className="mt-1 text-sm text-gray-900 dark:text-white">{tenantUsageQuery.data.plan}</p>
                      </div>
                      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                        <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Period</p>
                        <p className="mt-1 text-sm text-gray-900 dark:text-white">{tenantUsageQuery.data.period}</p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 rounded-lg border border-gray-200 dark:border-gray-700 p-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">Need higher limits?</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Copy a prefilled upgrade request and send it to your platform admin/billing.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            setUsageUpgradeStatus('');
                            const d = tenantUsageQuery.data;
                            const text = [
                              'AISEO quota upgrade request',
                              `Tenant: ${d.tenantId}`,
                              `Plan: ${d.plan}`,
                              `Period: ${d.period}`,
                              '',
                              'Usage:',
                              `- Keywords: ${d.usage.keywords.current}/${d.quotas.keywordsMax ?? '∞'} (remaining ${d.usage.keywords.remaining ?? '∞'})`,
                              `- API calls: ${d.usage.apiCalls}/${d.quotas.apiCallsPerMonth ?? '∞'}`,
                              `- SERP jobs: ${d.usage.serpJobs}/${d.quotas.serpJobsPerMonth ?? '∞'}`,
                              `- Crawl jobs: ${d.usage.crawlJobs}/${d.quotas.crawlJobsPerMonth ?? '∞'}`,
                            ].join('\n');
                            try {
                              await navigator.clipboard.writeText(text);
                              setUsageUpgradeStatus('Copied upgrade request to clipboard.');
                            } catch {
                              window.prompt('Copy upgrade request:', text);
                            }
                          }}
                          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-xs font-semibold text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          <Clipboard className="h-4 w-4" />
                          Copy upgrade request
                        </button>
                      </div>
                    </div>

                    {usageUpgradeStatus && <p className="text-xs text-gray-500 dark:text-gray-400">{usageUpgradeStatus}</p>}

                    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                      <table className="min-w-full">
                        <thead className="bg-gray-50 dark:bg-gray-900/40">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">Resource</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">Used</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">Limit</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">Remaining</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-t border-gray-200 dark:border-gray-700">
                            <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">Keywords</td>
                            <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{tenantUsageQuery.data.usage.keywords.current}</td>
                            <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{tenantUsageQuery.data.quotas.keywordsMax ?? '∞'}</td>
                            <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{tenantUsageQuery.data.usage.keywords.remaining ?? '∞'}</td>
                          </tr>
                          <tr className="border-t border-gray-200 dark:border-gray-700">
                            <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">API calls</td>
                            <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{tenantUsageQuery.data.usage.apiCalls}</td>
                            <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{tenantUsageQuery.data.quotas.apiCallsPerMonth ?? '∞'}</td>
                            <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                              {tenantUsageQuery.data.quotas.apiCallsPerMonth === null
                                ? '∞'
                                : Math.max(0, tenantUsageQuery.data.quotas.apiCallsPerMonth - tenantUsageQuery.data.usage.apiCalls)}
                            </td>
                          </tr>
                          <tr className="border-t border-gray-200 dark:border-gray-700">
                            <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">SERP jobs</td>
                            <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{tenantUsageQuery.data.usage.serpJobs}</td>
                            <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{tenantUsageQuery.data.quotas.serpJobsPerMonth ?? '∞'}</td>
                            <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                              {tenantUsageQuery.data.quotas.serpJobsPerMonth === null
                                ? '∞'
                                : Math.max(0, tenantUsageQuery.data.quotas.serpJobsPerMonth - tenantUsageQuery.data.usage.serpJobs)}
                            </td>
                          </tr>
                          <tr className="border-t border-gray-200 dark:border-gray-700">
                            <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">Crawl / workflow runs</td>
                            <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{tenantUsageQuery.data.usage.crawlJobs}</td>
                            <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{tenantUsageQuery.data.quotas.crawlJobsPerMonth ?? '∞'}</td>
                            <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                              {tenantUsageQuery.data.quotas.crawlJobsPerMonth === null
                                ? '∞'
                                : Math.max(0, tenantUsageQuery.data.quotas.crawlJobsPerMonth - tenantUsageQuery.data.usage.crawlJobs)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Recent history</h3>
                      <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                        <table className="min-w-full">
                          <thead className="bg-gray-50 dark:bg-gray-900/40">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">Period</th>
                              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">API calls</th>
                              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">SERP jobs</th>
                              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">Crawl</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(tenantUsageQuery.data.history ?? []).length === 0 ? (
                              <tr className="border-t border-gray-200 dark:border-gray-700">
                                <td className="px-4 py-3 text-sm text-gray-500" colSpan={4}>
                                  No usage history yet.
                                </td>
                              </tr>
                            ) : (
                              tenantUsageQuery.data.history.map((h: { period: string; apiCalls: number; serpJobs: number; crawlJobs: number }) => (
                                <tr key={h.period} className="border-t border-gray-200 dark:border-gray-700">
                                  <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">{h.period}</td>
                                  <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{h.apiCalls}</td>
                                  <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{h.serpJobs}</td>
                                  <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{h.crawlJobs}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">Need higher limits? Update tenant plan or quotas in tenant settings.</p>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          )}

          {activeTab === 'branding' && (
            <div className="space-y-6">
              <Card title="White-label Branding" subtitle="Phase 4: logo + primary color + header/footer text (tenant-level).">
                {tenantBrandingQuery.isLoading && <p className="text-sm text-gray-500">Loading branding…</p>}
                {tenantBrandingQuery.isError && (
                  <p className="text-sm text-red-600 dark:text-red-400">{(tenantBrandingQuery.error as Error).message}</p>
                )}

                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Logo</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => void onPickLogoFile(e.target.files?.[0] ?? null)}
                        className="mt-2 block w-full text-sm text-gray-700 dark:text-gray-300"
                      />
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Stored as base64 in tenant settings (max 250KB).</p>
                      {brandLogoDataUrl ? (
                        <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={brandLogoDataUrl} alt="Logo preview" className="h-10 w-auto" />
                        </div>
                      ) : (
                        <div className="mt-3 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 p-6 text-sm text-gray-500 dark:text-gray-400">
                          No logo uploaded.
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Primary color</label>
                      <div className="mt-2 flex items-center gap-3">
                        <input
                          type="color"
                          value={brandPrimaryColor}
                          onChange={(e) => setBrandPrimaryColor(e.target.value)}
                          className="h-10 w-12 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                        />
                        <input
                          value={brandPrimaryColor}
                          onChange={(e) => setBrandPrimaryColor(e.target.value)}
                          className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
                          placeholder="#3b82f6"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Report header text</label>
                      <textarea
                        value={brandHeaderText}
                        onChange={(e) => setBrandHeaderText(e.target.value)}
                        rows={3}
                        className="mt-2 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
                        placeholder="e.g. Acme SEO Performance Report"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Report footer text</label>
                      <textarea
                        value={brandFooterText}
                        onChange={(e) => setBrandFooterText(e.target.value)}
                        rows={3}
                        className="mt-2 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
                        placeholder="e.g. Confidential — For internal use only"
                      />
                    </div>

                    {brandStatus && <p className="text-sm text-gray-700 dark:text-gray-300">{brandStatus}</p>}

                    <button
                      type="button"
                      onClick={async () => {
                        setBrandStatus('');
                        try {
                          await updateTenantBranding.mutateAsync({
                            token: token || undefined,
                            patch: {
                              primaryColor: brandPrimaryColor.trim() || undefined,
                              headerText: brandHeaderText,
                              footerText: brandFooterText,
                              logoDataUrl: brandLogoDataUrl || undefined,
                            },
                          });
                          setBrandStatus('Saved');
                        } catch (e) {
                          setBrandStatus(e instanceof Error ? e.message : 'Failed to save');
                        }
                      }}
                      disabled={!token || updateTenantBranding.isPending}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      {updateTenantBranding.isPending ? 'Saving…' : 'Save branding'}
                    </button>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}
