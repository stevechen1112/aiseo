export type AgentId =
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

export type AgentStatus = 'idle' | 'running' | 'waiting' | 'completed' | 'failed' | 'paused';

export type AgentConfig = {
  id: AgentId;
  label: string;
  color: string;
  icon: string;
  isSmartAgent: boolean;
};

export const AGENT_CONFIGS: AgentConfig[] = [
  { id: 'keyword-researcher', label: 'Keyword Researcher', color: '#3B82F6', icon: '🔵', isSmartAgent: true },
  { id: 'content-writer', label: 'Content Writer', color: '#EF4444', icon: '🔴', isSmartAgent: true },
  { id: 'competitor-monitor', label: 'Competitor Monitor', color: '#8B5CF6', icon: '🟣', isSmartAgent: true },
  { id: 'backlink-builder', label: 'Backlink Builder', color: '#F97316', icon: '🟠', isSmartAgent: true },
  { id: 'report-generator', label: 'Report Generator', color: '#EC4899', icon: '🩷', isSmartAgent: true },
  { id: 'content-refresher', label: 'Content Refresher', color: '#06B6D4', icon: '🩵', isSmartAgent: true },
  { id: 'serp-tracker', label: 'SERP Tracker', color: '#EAB308', icon: '🟡', isSmartAgent: false },
  { id: 'technical-auditor', label: 'Technical Auditor', color: '#22C55E', icon: '🟢', isSmartAgent: false },
  { id: 'schema-agent', label: 'Schema Agent', color: '#6366F1', icon: '🟦', isSmartAgent: false },
  { id: 'internal-linker', label: 'Internal Linker', color: '#84CC16', icon: '🟩', isSmartAgent: false },
  { id: 'pagespeed-agent', label: 'PageSpeed Agent', color: '#0EA5E9', icon: '🔷', isSmartAgent: false },
  { id: 'local-seo', label: 'Local SEO', color: '#A78BFA', icon: '🟪', isSmartAgent: false },
];

export const AGENT_COLORS = Object.fromEntries(AGENT_CONFIGS.map((agent) => [agent.id, agent.color])) as Record<AgentId, string>;
export const AGENT_ICONS = Object.fromEntries(AGENT_CONFIGS.map((agent) => [agent.id, agent.icon])) as Record<AgentId, string>;

export type AgentSchedule = {
  id: string;
  enabled: boolean;
  cron: string;
  updatedAt: string;
};

export type AgentActivity = {
  id: string;
  agentName: string;
  status: 'running' | 'completed' | 'failed';
  task: string;
  startedAt: string;
  completedAt?: string;
};

export type AgentTaskBox = {
  id: string;
  title: string;
  agentIds: AgentId[];
  xPct: number;
  yPct: number;
};

export const TASK_BOXES: AgentTaskBox[] = [
  { id: 'keyword-cluster', title: 'Keyword & SERP', agentIds: ['keyword-researcher', 'serp-tracker'], xPct: 62, yPct: 20 },
  { id: 'content-pipeline', title: 'Content Pipeline', agentIds: ['content-writer', 'content-refresher', 'internal-linker', 'schema-agent'], xPct: 78, yPct: 40 },
  { id: 'audit-speed', title: 'Audit & Speed', agentIds: ['technical-auditor', 'pagespeed-agent'], xPct: 62, yPct: 62 },
  { id: 'growth-reports', title: 'Growth & Reports', agentIds: ['competitor-monitor', 'backlink-builder', 'report-generator', 'local-seo'], xPct: 78, yPct: 74 },
];

export function deriveAgentStatus(
  agentId: AgentId,
  schedule: AgentSchedule | undefined,
  activities: AgentActivity[],
  liveStatus?: Partial<Record<AgentId, AgentStatus>>,
): AgentStatus {
  const overridden = liveStatus?.[agentId];
  if (overridden) return overridden;

  if (schedule && !schedule.enabled) return 'paused';

  const latest = activities
    .filter((activity) => activity.agentName === agentId)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];

  if (!latest) return schedule ? 'idle' : 'waiting';
  if (latest.status === 'running') return 'running';
  if (latest.status === 'failed') return 'failed';
  return 'completed';
}

export function statusToClass(status: AgentStatus): string {
  switch (status) {
    case 'running':
      return 'agent-status-running';
    case 'failed':
      return 'agent-status-failed';
    case 'completed':
      return 'agent-status-completed';
    case 'paused':
      return 'agent-status-paused';
    case 'waiting':
      return 'agent-status-waiting';
    default:
      return 'agent-status-idle';
  }
}

export function getPlanScale(plan?: string): number {
  const normalized = (plan ?? '').toLowerCase();
  if (normalized.includes('enterprise')) return 1.2;
  if (normalized.includes('pro')) return 1.08;
  return 1;
}

export function getQuotaPressurePercent(input: {
  quotas?: { apiCallsPerMonth: number | null; serpJobsPerMonth: number | null; crawlJobsPerMonth: number | null };
  usage?: { apiCalls: number; serpJobs: number; crawlJobs: number };
}): number {
  if (!input.usage) return 0;

  const metricPairs: Array<[number, number | null | undefined]> = [
    [input.usage.apiCalls, input.quotas?.apiCallsPerMonth],
    [input.usage.serpJobs, input.quotas?.serpJobsPerMonth],
    [input.usage.crawlJobs, input.quotas?.crawlJobsPerMonth],
  ];

  const validPairs = metricPairs.filter(
    (pair): pair is [number, number] => typeof pair[1] === 'number' && pair[1] > 0,
  );

  const ratios = validPairs.map(([usage, limit]) => Math.min(1, usage / limit));

  if (ratios.length === 0) return 0;

  return Math.round(Math.max(...ratios) * 100);
}

export function secondsUntilNextDayPhase(now = new Date()): number {
  const cycle = 180;
  const sec = Math.floor(now.getTime() / 1000) % cycle;
  return cycle - sec;
}

export function getDaylightOpacity(secondsLeft: number): number {
  const progress = 1 - Math.min(1, Math.max(0, secondsLeft / 180));
  return Math.min(0.55, progress * 0.65);
}

export function computeAgentPosition(index: number, total: number, status: AgentStatus): { x: number; y: number } {
  if (status === 'failed') {
    return { x: 84 + (index % 3) * 4, y: 85 + Math.floor(index / 3) * 3 };
  }

  const angle = (index / Math.max(total, 1)) * Math.PI * 2;
  const radius = status === 'running' ? 24 : 14;
  const cx = status === 'running' ? 70 : 28;
  const cy = status === 'running' ? 48 : 50;
  const x = cx + Math.cos(angle) * radius;
  const y = cy + Math.sin(angle) * (radius * 0.8);
  return { x, y };
}

export function buildAchievementText(agentLabel: string): string {
  const templates = [
    `${agentLabel} 完成了一次漂亮任務！`,
    `${agentLabel} 帶回了新的 SEO 戰利品。`,
    `${agentLabel} 任務達成，基地士氣上升！`,
  ];

  return templates[Math.floor(Math.random() * templates.length)] ?? `${agentLabel} 完成任務。`;
}
