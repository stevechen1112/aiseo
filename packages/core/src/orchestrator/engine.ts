import { FlowProducer, type FlowJob, Queue, Worker, type JobsOptions } from 'bullmq';

import type { Redis } from 'ioredis';

import type { FlowStartResult, StartFlowInput, WorkflowName } from './types.js';
import { createIsolatedWorkspace } from '../agent-runtime/workspace.js';
import { EventBus } from '../event-bus/bus.js';
import { createDefaultToolRegistry } from '../plugins/registry.js';
import { AgentRegistry } from '../agents/registry.js';
import { KeywordResearcherAgent } from '../agents/keyword-researcher.js';
import { SerpTrackerAgent } from '../agents/serp-tracker.js';
import { ContentWriterAgent } from '../agents/content-writer.js';
import { TechnicalAuditorAgent } from '../agents/technical-auditor.js';
import { CompetitorMonitorAgent } from '../agents/competitor-monitor.js';
import { BacklinkBuilderAgent } from '../agents/backlink-builder.js';
import { ReportGeneratorAgent } from '../agents/report-generator.js';
import { SchemaAgent } from '../agents/schema-agent.js';
import { InternalLinkerAgent } from '../agents/internal-linker.js';
import { PageSpeedAgent } from '../agents/pagespeed-agent.js';
import { LocalSeoAgent } from '../agents/local-seo.js';
import { ContentRefresherAgent } from '../agents/content-refresher.js';
import { SubagentExecutor } from './subagent.js';
import {
  createSeoContentPipelineFlow,
  createMonitoringFlow,
  createAuditFlow,
  createLocalSeoFlow,
} from './workflows.js';

// ── Default retry policy (exponential backoff) ─────────────────────
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000, // 2s → 4s → 8s
  },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 200 },
};

// ── Flow status inspection result ──────────────────────────────────
export type FlowStatusResult = {
  orchestrator: { waiting: number; active: number; completed: number; failed: number; delayed: number };
  smartAgents: { waiting: number; active: number; completed: number; failed: number; delayed: number };
  autoTasks: { waiting: number; active: number; completed: number; failed: number; delayed: number };
};

export type OrchestratorOptions = {
  redis: Redis;
  prefix?: string;
  agents?: AgentRegistry;
};

export type QueueNames = {
  orchestrator: string;
  smartAgents: string;
  autoTasks: string;
};

export function defaultQueueNames(prefix = 'aiseo'): QueueNames {
  void prefix;
  return {
    orchestrator: 'orchestrator',
    smartAgents: 'smart-agents',
    autoTasks: 'auto-tasks',
  };
}

export class OrchestratorEngine {
  private readonly flowProducer: FlowProducer;
  private readonly queues: {
    orchestrator: Queue;
    smartAgents: Queue;
    autoTasks: Queue;
  };

  private readonly queueNames: QueueNames;
  private readonly eventBus: EventBus;
  private readonly agents: AgentRegistry;

  constructor(private readonly options: OrchestratorOptions) {
    this.queueNames = defaultQueueNames(options.prefix);

    this.eventBus = new EventBus({ redis: options.redis, prefix: options.prefix });

    this.agents = options.agents ?? new AgentRegistry();
    if (!options.agents) {
      // Default agents registry
      this.agents.register(new KeywordResearcherAgent());
      this.agents.register(new SerpTrackerAgent());
      this.agents.register(new ContentWriterAgent());
      this.agents.register(new TechnicalAuditorAgent());
      this.agents.register(new CompetitorMonitorAgent());
      this.agents.register(new BacklinkBuilderAgent(this.eventBus));
      this.agents.register(new ReportGeneratorAgent(this.eventBus));
      this.agents.register(new SchemaAgent(this.eventBus));
      this.agents.register(new InternalLinkerAgent(this.eventBus));
      this.agents.register(new PageSpeedAgent(this.eventBus));
      this.agents.register(new LocalSeoAgent(this.eventBus));
      this.agents.register(new ContentRefresherAgent(this.eventBus));
    }

    this.flowProducer = new FlowProducer({ connection: options.redis, prefix: options.prefix });

    this.queues = {
      orchestrator: new Queue(this.queueNames.orchestrator, {
        connection: options.redis,
        prefix: options.prefix,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      }),
      smartAgents: new Queue(this.queueNames.smartAgents, {
        connection: options.redis,
        prefix: options.prefix,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      }),
      autoTasks: new Queue(this.queueNames.autoTasks, {
        connection: options.redis,
        prefix: options.prefix,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      }),
    };
  }

  async startFlow(flowName: WorkflowName, input: StartFlowInput): Promise<FlowStartResult> {
    let flow: FlowJob;

    switch (flowName) {
      case 'seo-content-pipeline':
        flow = createSeoContentPipelineFlow(input, this.queueNames);
        break;
      case 'seo-monitoring-pipeline':
        flow = createMonitoringFlow(input, this.queueNames);
        break;
      case 'seo-comprehensive-audit':
        flow = createAuditFlow(input, this.queueNames);
        break;
      case 'local-seo-optimization':
        flow = createLocalSeoFlow(input, this.queueNames);
        break;
      default:
        throw new Error(`Unsupported flow: ${flowName}`);
    }

    const result = await this.flowProducer.add(flow);

    await this.eventBus.publish({
      tenantId: input.tenantId,
      projectId: input.projectId,
      type: 'agent.task.started',
      payload: {
        kind: 'flow',
        flowName,
        flowJobId: String(result.job.id),
      },
    });

    return {
      flowName,
      flowJobId: String(result.job.id),
    };
  }

  /**
   * Worker with retry policies, progress tracking, and dead letter behavior.
   */
  createDevWorker(
    queueName: keyof QueueNames,
    options?: {
      skipJobNames?: string[];
      concurrency?: number;
    },
  ) {
    const name = this.queueNames[queueName];
    const skip = new Set(options?.skipJobNames ?? []);
    return new Worker(
      name,
      async (job) => {
        if (skip.has(job.name)) {
          return { ok: true, skipped: true, queue: name, jobName: job.name, jobId: job.id };
        }

        const tenantId =
          job.data && typeof job.data === 'object' && 'tenantId' in job.data
            ? String((job.data as Record<string, unknown>).tenantId)
            : undefined;
        const projectId =
          job.data && typeof job.data === 'object' && 'projectId' in job.data
            ? String((job.data as Record<string, unknown>).projectId)
            : undefined;

        const workspace = await createIsolatedWorkspace({ agentId: job.name });
        console.log(`[worker:${name}] job=${job.name} id=${job.id} ws=${workspace.path} attempt=${job.attemptsMade + 1}/${job.opts?.attempts ?? 1}`);

        await job.updateProgress(10);

        if (tenantId) {
          await this.eventBus.publish({
            tenantId,
            projectId,
            type: 'agent.task.started',
            payload: {
              kind: 'job',
              queue: name,
              jobName: job.name,
              jobId: job.id,
              attempt: job.attemptsMade + 1,
            },
          });
        }

        try {
          const tools = createDefaultToolRegistry();
          const subagentExecutor = new SubagentExecutor(this.agents);

          await job.updateProgress(30);

          if (tenantId && projectId && this.agents.has(job.name)) {
            const agent = this.agents.get<Record<string, unknown>, unknown>(job.name);
            const output = await agent.run((job.data ?? {}) as Record<string, unknown>, {
              tenantId,
              projectId,
              agentId: job.name,
              workspacePath: workspace.path,
              tools,
              eventBus: this.eventBus,
              subagentExecutor,
              depth: 0,
            });

            await job.updateProgress(90);

            const result = {
              ok: true,
              mode: 'agent',
              queue: name,
              jobName: job.name,
              jobId: job.id,
              workspace: workspace.path,
              output,
            };

            if (tenantId) {
              await this.eventBus.publish({
                tenantId,
                projectId,
                type: 'agent.task.completed',
                payload: {
                  kind: 'job',
                  queue: name,
                  jobName: job.name,
                  jobId: job.id,
                  result,
                },
              });
            }

            await job.updateProgress(100);
            return result;
          }

          const result = {
            ok: true,
            mode: 'log-only',
            queue: name,
            jobName: job.name,
            jobId: job.id,
            workspace: workspace.path,
            data: job.data,
          };

          if (tenantId) {
            await this.eventBus.publish({
              tenantId,
              projectId,
              type: 'agent.task.completed',
              payload: {
                kind: 'job',
                queue: name,
                jobName: job.name,
                jobId: job.id,
                result,
              },
            });
          }

          await job.updateProgress(100);
          return result;
        } catch (error) {
          const isLastAttempt = (job.attemptsMade + 1) >= (job.opts?.attempts ?? 1);

          if (tenantId) {
            await this.eventBus.publish({
              tenantId,
              projectId,
              type: 'agent.task.failed',
              payload: {
                kind: 'job',
                queue: name,
                jobName: job.name,
                jobId: job.id,
                error: error instanceof Error ? error.message : String(error),
                attempt: job.attemptsMade + 1,
                willRetry: !isLastAttempt,
              },
            });
          }

          if (isLastAttempt) {
            console.error(`[worker:${name}] job=${job.name} permanently failed after ${job.attemptsMade + 1} attempts`);
          }

          throw error;
        } finally {
          await workspace.cleanup();
        }
      },
      {
        connection: this.options.redis,
        prefix: this.options.prefix,
        concurrency: options?.concurrency,
        removeOnComplete: DEFAULT_JOB_OPTIONS.removeOnComplete as { count: number },
        removeOnFail: DEFAULT_JOB_OPTIONS.removeOnFail as { count: number },
      },
    );
  }

  async close() {
    await this.flowProducer.close();
    await Promise.all([
      this.queues.orchestrator.close(),
      this.queues.smartAgents.close(),
      this.queues.autoTasks.close(),
    ]);
  }

  /**
   * Returns counts for each queue — useful for Dashboard status panels.
   */
  async getFlowStatus(): Promise<FlowStatusResult> {
    const counts = async (q: Queue) => ({
      waiting: await q.getWaitingCount(),
      active: await q.getActiveCount(),
      completed: await q.getCompletedCount(),
      failed: await q.getFailedCount(),
      delayed: await q.getDelayedCount(),
    });

    return {
      orchestrator: await counts(this.queues.orchestrator),
      smartAgents: await counts(this.queues.smartAgents),
      autoTasks: await counts(this.queues.autoTasks),
    };
  }

  /**
   * Drains all failed jobs and moves them back to waiting (manual retry).
   */
  async retryFailedJobs(queueName: keyof QueueNames, limit = 100): Promise<number> {
    const q = this.queues[queueName];
    const failed = await q.getFailed(0, limit - 1);
    let retried = 0;
    for (const job of failed) {
      await job.retry();
      retried++;
    }
    return retried;
  }
}
