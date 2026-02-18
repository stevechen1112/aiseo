import 'dotenv/config';

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

type Status = 'PASS' | 'FAIL' | 'SKIP';

type CheckResult = {
  id: string;
  name: string;
  status: Status;
  detail: string;
  durationMs: number;
};

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const workspaceRoot = resolve(__dirname, '../../../..');
const resultDir = resolve(workspaceRoot, 'test-results');
mkdirSync(resultDir, { recursive: true });

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const textReportPath = resolve(resultDir, `system-gap-validation-${ts}.log`);
const jsonReportPath = resolve(resultDir, `system-gap-validation-${ts}.json`);
writeFileSync(textReportPath, '');

const checks: CheckResult[] = [];

function log(msg = '') {
  console.log(msg);
  try {
    appendFileSync(textReportPath, `${msg}\n`, 'utf-8');
  } catch {
    // ignore
  }
}

function hr() {
  log('─'.repeat(68));
}

function safeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function runCmd(command: string, timeoutMs = 180_000): string {
  return execSync(command, {
    cwd: workspaceRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf-8',
    timeout: timeoutMs,
  });
}

async function canReachUrl(url: string, timeoutMs = 2500): Promise<boolean> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeoutMs);
    const resp = await fetch(url, { signal: c.signal });
    clearTimeout(t);
    return resp.ok;
  } catch {
    return false;
  }
}

async function runCheck(
  id: string,
  name: string,
  fn: () => Promise<{ status: Status; detail: string }>,
): Promise<void> {
  const started = Date.now();
  try {
    const out = await fn();
    checks.push({
      id,
      name,
      status: out.status,
      detail: out.detail,
      durationMs: Date.now() - started,
    });
    log(`  ${out.status.padEnd(4)} ${id} ${name}${out.detail ? ` — ${out.detail}` : ''}`);
  } catch (error) {
    checks.push({
      id,
      name,
      status: 'FAIL',
      detail: safeError(error).slice(0, 240),
      durationMs: Date.now() - started,
    });
    log(`  FAIL ${id} ${name} — ${safeError(error).slice(0, 240)}`);
  }
}

async function main() {
  log('====================================================================');
  log('  AISEO System Gap Validation (API + DB + Infra)');
  log('====================================================================');
  log(`時間: ${new Date().toISOString()}`);
  log(`Workspace: ${workspaceRoot}`);
  log(`Text report: ${textReportPath}`);
  log(`JSON report: ${jsonReportPath}`);
  log();

  const baseUrl = process.env.BASE_URL ?? 'http://localhost:3001';
  const apiUp = await canReachUrl(`${baseUrl}/health`, 2500);

  hr();
  log('  A. API / Route Layer');
  hr();

  await runCheck('A1', 'API health endpoint', async () => {
    if (!apiUp) return { status: 'SKIP', detail: `${baseUrl}/health unreachable` };
    const resp = await fetch(`${baseUrl}/health`);
    if (!resp.ok) return { status: 'FAIL', detail: `status=${resp.status}` };
    return { status: 'PASS', detail: `status=${resp.status}` };
  });

  await runCheck('A2', 'OpenAPI endpoint', async () => {
    if (!apiUp) return { status: 'SKIP', detail: `${baseUrl}/openapi.json unreachable` };
    const resp = await fetch(`${baseUrl}/openapi.json`);
    if (!resp.ok) return { status: 'FAIL', detail: `status=${resp.status}` };
    const json = (await resp.json()) as { paths?: Record<string, unknown> };
    return { status: 'PASS', detail: `paths=${Object.keys(json.paths ?? {}).length}` };
  });

  hr();
  log('  B. DB / RLS / Outbox / Schedule');
  hr();

  await runCheck('B1', 'RLS smoke test', async () => {
    if (!process.env.DATABASE_URL || !process.env.DATABASE_URL_MIGRATION) {
      return { status: 'SKIP', detail: 'DATABASE_URL / DATABASE_URL_MIGRATION missing' };
    }
    runCmd('corepack pnpm -C apps/api db:rls-smoke', 180_000);
    return { status: 'PASS', detail: 'db:rls-smoke ok' };
  });

  await runCheck('B2', 'Outbox integration test', async () => {
    if (!process.env.DATABASE_URL) {
      return { status: 'SKIP', detail: 'DATABASE_URL missing' };
    }
    runCmd('corepack pnpm -C apps/api outbox:test', 180_000);
    return { status: 'PASS', detail: 'outbox:test ok' };
  });

  await runCheck('B3', 'Schedule smoke test', async () => {
    if (!process.env.DATABASE_URL || !process.env.DEFAULT_TENANT_ID) {
      return { status: 'SKIP', detail: 'DATABASE_URL / DEFAULT_TENANT_ID missing' };
    }
    runCmd('corepack pnpm -C apps/api schedule:smoke', 120_000);
    return { status: 'PASS', detail: 'schedule:smoke ok' };
  });

  hr();
  log('  C. Runtime Infrastructure');
  hr();

  await runCheck('C1', 'Browser engine smoke', async () => {
    try {
      runCmd('corepack pnpm -C apps/api browser:smoke', 120_000);
      return { status: 'PASS', detail: 'browser:smoke ok' };
    } catch (error) {
      const msg = safeError(error);
      if (msg.includes('playwright') || msg.includes('chromium') || msg.includes('Missing')) {
        return { status: 'SKIP', detail: 'Playwright/Chromium not ready' };
      }
      return { status: 'FAIL', detail: msg.slice(0, 180) };
    }
  });

  await runCheck('C2', 'Docker sandbox smoke', async () => {
    try {
      runCmd('corepack pnpm -C apps/api sandbox:smoke', 120_000);
      return { status: 'PASS', detail: 'sandbox:smoke ok' };
    } catch (error) {
      const msg = safeError(error);
      if (msg.includes('Docker') || msg.includes('daemon') || msg.includes('ECONNREFUSED')) {
        return { status: 'SKIP', detail: 'Docker daemon/image not ready' };
      }
      return { status: 'FAIL', detail: msg.slice(0, 180) };
    }
  });

  await runCheck('C3', 'Backup restore test', async () => {
    if (process.env.BACKUP_ENABLED !== 'true') {
      return { status: 'SKIP', detail: 'BACKUP_ENABLED != true' };
    }
    if (process.env.ALLOW_DESTRUCTIVE_TESTS !== '1') {
      return { status: 'SKIP', detail: 'set ALLOW_DESTRUCTIVE_TESTS=1 to run' };
    }
    runCmd('corepack pnpm -C apps/api backup:restore:test', 240_000);
    return { status: 'PASS', detail: 'backup:restore:test ok' };
  });

  hr();
  log('  D. End-to-End Pipeline');
  hr();

  await runCheck('D1', 'Phase1 E2E scenario', async () => {
    if (!apiUp) return { status: 'SKIP', detail: 'API not running on BASE_URL' };
    try {
      runCmd('corepack pnpm -C apps/api phase1:e2e', 180_000);
      return { status: 'PASS', detail: 'phase1:e2e ok' };
    } catch (error) {
      return { status: 'FAIL', detail: safeError(error).slice(0, 200) };
    }
  });

  log();
  hr();
  log('  Summary');
  hr();

  const pass = checks.filter((c) => c.status === 'PASS').length;
  const fail = checks.filter((c) => c.status === 'FAIL').length;
  const skip = checks.filter((c) => c.status === 'SKIP').length;
  const total = checks.length;

  log(`  Result: ${pass} PASS / ${fail} FAIL / ${skip} SKIP / ${total} TOTAL`);
  log();

  checks.forEach((c) => {
    log(`    ${c.status.padEnd(4)} ${c.id} ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
  });

  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      baseUrl,
      workspaceRoot,
      textReportPath,
      jsonReportPath,
    },
    summary: { pass, fail, skip, total },
    checks,
  };

  writeFileSync(jsonReportPath, JSON.stringify(report, null, 2), 'utf-8');

  log();
  log(`Text report written: ${textReportPath}`);
  log(`JSON report written: ${jsonReportPath}`);

  if (fail > 0) {
    process.exitCode = 1;
  }
}

await main();
