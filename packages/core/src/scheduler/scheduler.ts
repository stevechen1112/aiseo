import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';

import type { WorkflowName } from '../orchestrator/types.js';
import { OrchestratorEngine } from '../orchestrator/engine.js';

export type CronSchedule = {
  id: string; // caller-provided id
  cron: string;
  timezone?: string;
  flowName: WorkflowName;
  input: {
    tenantId: string;
    projectId: string;
    seedKeyword?: string;
  };
  enabled: boolean;
};

export type SchedulerOptions = {
  redis: Redis;
  prefix?: string;
  queueName?: string;
};

type StartFlowJobData = {
  scheduleId: string;
  flowName: WorkflowName;
  input: CronSchedule['input'];
};

const DEFAULT_QUEUE_NAME = 'scheduler';

/**
 * Phase 1 skeleton: schedules repeatable jobs that trigger BullMQ Flow.
 * Persistence is handled by BullMQ repeatable jobs (Redis).
 */
export class CronScheduler {
  private readonly queue: Queue;

  constructor(private readonly options: SchedulerOptions) {
    this.queue = new Queue(options.queueName ?? DEFAULT_QUEUE_NAME, {
      connection: options.redis,
      prefix: options.prefix,
    });
  }

  async upsertSchedule(schedule: CronSchedule) {
    if (!schedule.enabled) {
      await this.removeSchedule(schedule.id);
      return;
    }

    await this.queue.add(
      'start-flow',
      {
        scheduleId: schedule.id,
        flowName: schedule.flowName,
        input: schedule.input,
      },
      {
        jobId: schedule.id,
        repeat: {
          pattern: schedule.cron,
          tz: schedule.timezone,
          key: schedule.id,
        },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  }

  async removeSchedule(id: string) {
    const repeats = await this.queue.getRepeatableJobs();
    const direct = repeats.find((r) => r.key === id || r.id === id);
    if (direct) {
      await this.queue.removeRepeatableByKey(direct.key);
      return;
    }

    const byName = repeats.find((r) => r.name === 'start-flow' && (r as { pattern?: string }).pattern);
    if (!byName) return;

    await this.queue.removeRepeatable(
      byName.name,
      {
        pattern: (byName as { pattern?: string }).pattern,
        tz: byName.tz ?? undefined,
        key: id,
      },
      id,
    );
  }

  async listSchedules() {
    const repeats = await this.queue.getRepeatableJobs();
    return repeats.map((r) => ({
      id: r.id,
      name: r.name,
      pattern: r.pattern,
      tz: r.tz,
      next: r.next,
    }));
  }

  // Note: repeatable job keys are internal to BullMQ; only remove if we can find a match.

  /**
   * Worker that consumes repeatable "start-flow" jobs and triggers OrchestratorEngine.
   */
  createWorker(orchestrator: OrchestratorEngine) {
    return new Worker(
      this.queue.name,
      async (job) => {
        if (job.name !== 'start-flow') {
          return { ok: true, ignored: true };
        }

        const { flowName, input } = job.data as StartFlowJobData;
        const started = await orchestrator.startFlow(flowName, input);
        return { ok: true, started };
      },
      {
        connection: this.options.redis,
        prefix: this.options.prefix,
      },
    );
  }

  async close() {
    await this.queue.close();
  }
}
