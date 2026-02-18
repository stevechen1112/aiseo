/**
 * Orchestrator Multi-task Concurrency Test (Redis required)
 *
 * Purpose:
 * - Validate BullMQ Flow fan-out execution with real parallelism
 * - Validate retry behavior (attempts > 1)
 * - Validate EventBus emits job lifecycle events per tenant
 *
 * Run:
 *   corepack pnpm -C apps/api test:orchestrator
 *
 * Env:
 *   REDIS_URL=redis://127.0.0.1:6379
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
config({ path: resolve(__dirname, '../../../../.env') });

import { FlowProducer, type FlowJob } from 'bullmq';

import {
  AgentRegistry,
  BaseAgent,
  createRedisConnection,
  EventBus,
  OrchestratorEngine,
  type AgentContext,
} from '@aiseo/core';

// ── Plain-text output (no ANSI escape codes) ─────────────────────
const log = (msg = '') => console.log(msg);
const hr = () => log('\u2500'.repeat(64));
const section = (title: string) => {
  hr();
  log(`  ${title}`);
  hr();
};

// ── Assertion tracker ────────────────────────────────────────────
interface Assertion {
  name: string;
  pass: boolean;
  detail: string;
}
const assertions: Assertion[] = [];
function assert(name: string, pass: boolean, detail = '') {
  assertions.push({ name, pass, detail });
  log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

// ── Timing ───────────────────────────────────────────────────────
const globalStart = Date.now();
const durations: Record<string, number> = {};
function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const s = Date.now();
  return fn().finally(() => {
    durations[label] = Date.now() - s;
  });
}

// ── Test agents ──────────────────────────────────────────────────
let active = 0;
let maxActive = 0;
const tokenAttempts = new Map<string, number>();

type SleepInput = {
  tenantId: string;
  projectId: string;
  ms: number;
  token: string;
  failOnce?: boolean;
};

type SleepOutput = {
  token: string;
  ms: number;
  attempt: number;
};

class TestSleepAgent extends BaseAgent<SleepInput, SleepOutput> {
  readonly id = 'test.sleep';
  readonly description = 'Test agent that sleeps and optionally fails once.';

  protected async execute(input: SleepInput, _ctx: AgentContext): Promise<SleepOutput> {
    active++;
    maxActive = Math.max(maxActive, active);

    try {
      const attempt = (tokenAttempts.get(input.token) ?? 0) + 1;
      tokenAttempts.set(input.token, attempt);

      if (input.failOnce && attempt === 1) {
        throw new Error(`intentional failOnce token=${input.token}`);
      }

      await new Promise((r) => setTimeout(r, Math.max(0, input.ms)));
      return { token: input.token, ms: input.ms, attempt };
    } finally {
      active--;
    }
  }
}

async function main() {
  log('================================================================');
  log('  AISEO Orchestrator — Multi-task Concurrency Test');
  log('================================================================');
  log();

  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  const prefix = `aiseo-test-${Date.now()}`;

  section('Environment');
  log(`  REDIS_URL: ${redisUrl}`);
  log(`  prefix   : ${prefix}`);
  log();

  // Redis required
  const redis = createRedisConnection({ url: redisUrl });
  try {
    await Promise.race([
      redis.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('ping timeout (2s)')), 2000)),
    ]);
    assert('ENV-01 Redis reachable', true, '');
  } catch (e) {
    assert('ENV-01 Redis reachable', false, String(e).slice(0, 200));
    log();
    log('  Redis is required for this test. Start Redis, then re-run:');
    log('    - Docker:   docker run -p 6379:6379 redis:7');
    log('    - Or set:   $env:REDIS_URL = "redis://127.0.0.1:6379"');
    process.exitCode = 1;
    await redis.quit().catch(() => undefined);
    return;
  }

  const eventBus = new EventBus({ redis, prefix });
  const events: any[] = [];
  const sub = eventBus.subscribeAll((evt) => events.push(evt));
  await sub.start();

  const agents = new AgentRegistry();
  agents.register(new TestSleepAgent());

  const orchestrator = new OrchestratorEngine({ redis, prefix, agents });

  // Workers: orchestrator queue handles parent jobs; smartAgents handles child jobs.
  const workerOrch = orchestrator.createDevWorker('orchestrator', { concurrency: 2 });
  const workerSmart = orchestrator.createDevWorker('smartAgents', { concurrency: 5 });

  const flowProducer = new FlowProducer({ connection: redis, prefix });

  section('T1  Fan-out concurrency + multi-tenant isolation');

  const tenants = [
    { tenantId: 'tenant-A', projectId: 'project-1' },
    { tenantId: 'tenant-B', projectId: 'project-2' },
  ];

  const buildFlow = (tenantId: string, projectId: string, flowToken: string): FlowJob => {
    const children: FlowJob[] = [];

    for (let i = 0; i < 10; i++) {
      children.push({
        name: 'test.sleep',
        queueName: 'smart-agents',
        data: { tenantId, projectId, ms: 400, token: `${flowToken}-ok-${i}` } satisfies SleepInput,
      });
    }

    // One job that must retry and succeed
    children.push({
      name: 'test.sleep',
      queueName: 'smart-agents',
      data: { tenantId, projectId, ms: 50, token: `${flowToken}-retry-1`, failOnce: true } satisfies SleepInput,
      opts: { attempts: 2 },
    });

    return {
      name: 'test.flow',
      queueName: 'orchestrator',
      data: { tenantId, projectId, token: flowToken },
      children,
    };
  };

  try {
    const start = Date.now();

    const results = await timed('T1', () =>
      Promise.all(
        tenants.map((t, idx) =>
          flowProducer.add(buildFlow(t.tenantId, t.projectId, `flow-${idx + 1}`)),
        ),
      ),
    );

    assert('T1-01 flows submitted', results.length === 2, `got ${results.length}`);

    // Wait until queues are drained (best-effort)
    await timed('T1-wait', async () => {
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        const status = await orchestrator.getFlowStatus();
        const inFlight =
          status.orchestrator.waiting + status.orchestrator.active +
          status.smartAgents.waiting + status.smartAgents.active +
          status.autoTasks.waiting + status.autoTasks.active +
          status.orchestrator.delayed + status.smartAgents.delayed + status.autoTasks.delayed;

        if (inFlight === 0) return;
        await new Promise((r) => setTimeout(r, 500));
      }
      throw new Error('timeout waiting for queues to drain');
    });

    const elapsed = Date.now() - start;
    log(`  elapsed: ${(elapsed / 1000).toFixed(1)}s`);
    log(`  maxActive (agent): ${maxActive}`);
    log(`  events captured  : ${events.length}`);
    log();

    assert('T1-02 maxActive >= 3 (parallelism)', maxActive >= 3, `maxActive=${maxActive}`);

    const jobEvents = events.filter((e) => e?.payload?.kind === 'job');
    const byTenant = new Map<string, any[]>();
    for (const e of jobEvents) {
      const tid = String(e.tenantId ?? '');
      byTenant.set(tid, [...(byTenant.get(tid) ?? []), e]);
    }

    assert('T1-03 events for tenant-A', (byTenant.get('tenant-A')?.length ?? 0) > 0, `count=${byTenant.get('tenant-A')?.length ?? 0}`);
    assert('T1-04 events for tenant-B', (byTenant.get('tenant-B')?.length ?? 0) > 0, `count=${byTenant.get('tenant-B')?.length ?? 0}`);

    // Retry semantics: at least one failed with willRetry=true for retry token
    const retryFails = jobEvents.filter(
      (e) => e?.type === 'agent.task.failed' && e?.payload?.jobName === 'test.sleep' && e?.payload?.willRetry === true,
    );
    assert('T1-05 retry emits failed(willRetry=true)', retryFails.length >= 1, `got ${retryFails.length}`);

    const completedRetry = jobEvents.filter(
      (e) => e?.type === 'agent.task.completed' && e?.payload?.jobName === 'test.sleep' && String(e?.payload?.result?.output?.token ?? '').includes('retry-1'),
    );
    assert('T1-06 retry job eventually completed', completedRetry.length >= 1, `got ${completedRetry.length}`);

    // Sanity: ensure tenant IDs are not mixed
    const mixed = jobEvents.some((e) => e.tenantId !== 'tenant-A' && e.tenantId !== 'tenant-B');
    assert('T1-07 no unexpected tenantId in events', !mixed, mixed ? 'found unexpected tenantId' : '');
  } catch (error) {
    assert('T1-01 flows submitted', false, String(error).slice(0, 200));
  }

  // Cleanup
  await sub.stop().catch(() => undefined);
  await flowProducer.close().catch(() => undefined);
  await workerSmart.close().catch(() => undefined);
  await workerOrch.close().catch(() => undefined);
  await orchestrator.close().catch(() => undefined);
  await redis.quit().catch(() => undefined);

  // Summary
  const totalDuration = Date.now() - globalStart;
  const passCount = assertions.filter((a) => a.pass).length;
  const failCount = assertions.filter((a) => !a.pass).length;

  log();
  log('================================================================');
  log('  Summary');
  log('================================================================');
  log();

  log('  Durations:');
  for (const [label, ms] of Object.entries(durations)) {
    log(`    ${label.padEnd(10)} ${(ms / 1000).toFixed(1)}s`);
  }
  log(`    ${'TOTAL'.padEnd(10)} ${(totalDuration / 1000).toFixed(1)}s`);
  log();

  log(`  Assertions: ${passCount} PASS / ${failCount} FAIL / ${assertions.length} TOTAL`);
  assertions.forEach((a) => log(`    ${a.pass ? 'PASS' : 'FAIL'}  ${a.name}${a.detail ? '  (' + a.detail + ')' : ''}`));

  if (failCount > 0) {
    process.exitCode = 1;
  }
}

await main();
