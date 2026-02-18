export type AgentEventType =
  | 'agent.task.started'
  | 'agent.task.completed'
  | 'agent.task.failed'
  | 'approval.requested'
  | 'report.ready'
  | 'outbox.dispatched'
  | 'serp.rank.anomaly'
  | 'pagespeed.alert.critical'
  | 'system.test';

export type AgentEvent = {
  id: string;
  seq: number;
  tenantId: string;
  projectId?: string;
  type: AgentEventType;
  payload: Record<string, unknown>;
  timestamp: number;
};
