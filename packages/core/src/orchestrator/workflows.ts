/**
 * Workflow Definitions - 5-Stage SEO Content Pipeline
 * 
 * Stage 1: Research - Keyword research and competitor analysis
 * Stage 2: Planning - Content outline generation
 * Stage 3: Production - Content writing and optimization
 * Stage 4: Publication - Review and CMS publishing
 * Stage 5: Monitoring - Continuous SERP tracking and technical audits
 * 
 * Phase 2 Task 3.11
 */

import type { FlowJob } from 'bullmq';
import type { StartFlowInput } from './types.js';

export type QueueNames = {
  orchestrator: string;
  smartAgents: string;
  autoTasks: string;
};

export type WorkflowStage = 'research' | 'planning' | 'production' | 'publication' | 'monitoring';

export interface WorkflowDefinition {
  name: string;
  description: string;
  stages: {
    stage: WorkflowStage;
    jobs: FlowJob[];
  }[];
}

/**
 * Create enhanced 5-stage SEO content pipeline
 */
export function createSeoContentPipelineFlow(
  input: StartFlowInput,
  queueNames: QueueNames
): FlowJob {
  // BullMQ Flow semantics: children run before their parent.
  // Build a chain so that Stage 1 -> Stage 2 -> Stage 3 -> Stage 4.
  const research: FlowJob = {
    name: 'keyword-researcher',
    queueName: queueNames.smartAgents,
    data: {
      ...input,
      operation: 'research',
      seedKeyword: input.seedKeyword,
    },
  };

  const competitorAnalysis: FlowJob = {
    name: 'competitor-monitor',
    queueName: queueNames.autoTasks,
    data: {
      ...input,
      operation: 'analyze',
      competitorUrls: input.competitorUrls ?? [],
    },
  };

  const outline: FlowJob = {
    name: 'content-writer',
    queueName: queueNames.smartAgents,
    data: {
      ...input,
      operation: 'outline',
    },
    children: [research, competitorAnalysis],
  };

  const write: FlowJob = {
    name: 'content-writer',
    queueName: queueNames.smartAgents,
    data: {
      ...input,
      operation: 'write',
    },
    children: [outline],
  };

  const publish: FlowJob = {
    name: 'content-writer',
    queueName: queueNames.smartAgents,
    data: {
      ...input,
      operation: 'publish',
      requireApproval: true,
    },
    children: [write],
  };

  return {
    name: 'seo-content-pipeline',
    queueName: queueNames.orchestrator,
    data: input,
    children: [publish],
  };
}

/**
 * Create monitoring workflow (scheduled periodically)
 */
export function createMonitoringFlow(
  input: StartFlowInput,
  queueNames: QueueNames
): FlowJob {
  return {
    name: 'seo-monitoring-pipeline',
    queueName: queueNames.orchestrator,
    data: input,
    children: [
      // Stage 5: Monitoring
      {
        // Project-level job that enqueues per-keyword serp-tracker jobs.
        name: 'serp-daily-tracker',
        queueName: queueNames.autoTasks,
        data: {
          ...input,
        },
      },
      {
        name: 'technical-auditor',
        queueName: queueNames.autoTasks,
        data: {
          ...input,
          operation: 'audit',
          // Full site audit
        },
      },
      {
        name: 'pagespeed-agent',
        queueName: queueNames.autoTasks,
        data: {
          ...input,
          operation: 'audit',
          urls: input.urls ?? [],
          device: 'mobile',
        },
      },
      {
        name: 'backlink-builder',
        queueName: queueNames.autoTasks,
        data: {
          ...input,
          operation: 'discover',
          // Find new backlink opportunities
        },
      },
      {
        name: 'content-refresher',
        queueName: queueNames.smartAgents,
        data: {
          ...input,
          operation: 'check',
          staleThresholdDays: 180,
          // Identify outdated content
        },
      },
    ],
  };
}

/**
 * Create comprehensive SEO audit workflow
 */
export function createAuditFlow(
  input: StartFlowInput,
  queueNames: QueueNames
): FlowJob {
  return {
    name: 'seo-comprehensive-audit',
    queueName: queueNames.orchestrator,
    data: input,
    children: [
      {
        name: 'technical-auditor',
        queueName: queueNames.autoTasks,
        data: { ...input, operation: 'audit' },
      },
      {
        name: 'pagespeed-agent',
        queueName: queueNames.autoTasks,
        data: { ...input, operation: 'audit', device: 'mobile' },
      },
      {
        name: 'pagespeed-agent',
        queueName: queueNames.autoTasks,
        data: { ...input, operation: 'audit', device: 'desktop' },
      },
      {
        name: 'schema-agent',
        queueName: queueNames.autoTasks,
        data: { ...input, operation: 'detect' },
      },
      {
        name: 'internal-linker',
        queueName: queueNames.autoTasks,
        data: { ...input, operation: 'analyze' },
      },
      {
        name: 'competitor-monitor',
        queueName: queueNames.autoTasks,
        data: { ...input, operation: 'analyze' },
      },
      {
        name: 'backlink-builder',
        queueName: queueNames.autoTasks,
        data: { ...input, operation: 'discover' },
      },
      {
        name: 'content-refresher',
        queueName: queueNames.smartAgents,
        data: { ...input, operation: 'audit' },
      },
      // Generate comprehensive report at the end
      {
        name: 'report-generator',
        queueName: queueNames.autoTasks,
        data: {
          ...input,
          operation: 'generate',
          reportFormat: 'comprehensive',
          reportPeriod: 'monthly',
        },
      },
    ],
  };
}

/**
 * Create local SEO workflow
 */
export function createLocalSeoFlow(
  input: StartFlowInput,
  queueNames: QueueNames
): FlowJob {
  return {
    name: 'local-seo-optimization',
    queueName: queueNames.orchestrator,
    data: input,
    children: [
      {
        name: 'local-seo',
        queueName: queueNames.autoTasks,
        data: {
          ...input,
          operation: 'audit',
          businessName: input.businessName,
          expectedNAP: input.expectedNAP,
          keywords: input.keywords ?? [],
          location: input.location,
        },
      },
      // Generate local SEO report
      {
        name: 'report-generator',
        queueName: queueNames.autoTasks,
        data: {
          ...input,
          operation: 'generate',
          reportFormat: 'executive_summary',
        },
      },
    ],
  };
}

/**
 * Get workflow definition by name
 */
export function getWorkflowDefinition(workflowName: string): WorkflowDefinition | null {
  const workflows: Record<string, WorkflowDefinition> = {
    'seo-content-pipeline': {
      name: 'SEO Content Pipeline',
      description: 'Complete 5-stage content creation and optimization workflow',
      stages: [
        { stage: 'research' as const, jobs: [] },
        { stage: 'planning' as const, jobs: [] },
        { stage: 'production' as const, jobs: [] },
        { stage: 'publication' as const, jobs: [] },
        { stage: 'monitoring' as const, jobs: [] },
      ],
    },
    'seo-monitoring-pipeline': {
      name: 'SEO Monitoring Pipeline',
      description: 'Continuous monitoring of rankings, performance, and content freshness',
      stages: [
        { stage: 'monitoring' as const, jobs: [] },
      ],
    },
    'seo-comprehensive-audit': {
      name: 'SEO Comprehensive Audit',
      description: 'Full-site SEO audit covering technical, content, and backlink aspects',
      stages: [
        { stage: 'research' as const, jobs: [] },
      ],
    },
    'local-seo-optimization': {
      name: 'Local SEO Optimization',
      description: 'GMB optimization, citation building, and local ranking tracking',
      stages: [
        { stage: 'research' as const, jobs: [] },
      ],
    },
  };

  return workflows[workflowName] ?? null;
}
