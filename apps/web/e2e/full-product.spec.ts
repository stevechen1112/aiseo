import { test, expect } from '@playwright/test';
import { installApiMocks, installAuthState, type MockContext } from './utils';

const ctx: MockContext = {
  tenantId: '00000000-0000-0000-0000-000000000000',
  projectId: '00000000-0000-0000-0000-000000000000',
};

test.beforeEach(async ({ page }) => {
  await installAuthState(page, ctx);
  await installApiMocks(page, ctx);
});

test('Full product HTTP user journey (mock backend)', async ({ page }) => {
  test.setTimeout(300_000);

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    console.log('[BROWSER console.error]', msg.text());
  });
  page.on('pageerror', (err) => {
    console.log('[BROWSER pageerror]', err?.message ?? String(err));
  });
  page.on('requestfailed', (req) => {
    const url = req.url();
    if (url.includes('/api/') || url.includes('/_next/')) {
      console.log('[BROWSER requestfailed]', req.method(), url, req.failure()?.errorText);
    }
  });

  const base = `/tenant/${ctx.tenantId}/dashboard`;

  // Dashboard
  await page.goto(base);
  await expect(page.getByRole('heading', { name: 'Dashboard Overview' })).toBeVisible();
  await expect(page.getByText('Failed to load metrics')).toHaveCount(0);

  // Agents: run/pause/resume on a configured schedule
  await page.goto(`${base}/agents`);
  await expect(page.getByRole('heading', { name: 'Agent Status Panel' })).toBeVisible();

  const keywordAgentCard = page.locator('div.rounded-xl', {
    has: page.getByText('keyword-researcher', { exact: true }),
  }).first();

  await expect(keywordAgentCard.getByText('Enabled')).toBeVisible();

  const runResp = page.waitForResponse((r) => r.url().includes('/api/schedules/keyword-researcher/run') && r.status() === 200);
  await keywordAgentCard.getByRole('button', { name: 'Run' }).click();
  await runResp;

  const pauseResp = page.waitForResponse((r) => r.url().includes('/api/schedules/keyword-researcher/pause') && r.status() === 200);
  await keywordAgentCard.getByRole('button', { name: 'Pause' }).click();
  await pauseResp;
  await expect(keywordAgentCard.getByText('Paused')).toBeVisible();

  const resumeResp = page.waitForResponse((r) => r.url().includes('/api/schedules/keyword-researcher/resume') && r.status() === 200);
  await keywordAgentCard.getByRole('button', { name: 'Resume' }).click({ force: true });
  await resumeResp;
  await expect(keywordAgentCard.getByText('Enabled')).toBeVisible();

  // Keywords: optimize quick-win + trigger keyword research
  await page.goto(`${base}/keywords`);
  await expect(page.getByRole('heading', { name: 'Keyword Tracking' })).toBeVisible();

  await page.getByRole('button', { name: 'Optimize' }).first().click();
  await expect(page.getByText('Optimization triggered.')).toBeVisible();

  await page.getByPlaceholder('Seed keyword').fill('playwright e2e seed');
  const triggerResp = page.waitForResponse((r) => r.url().includes('/api/agents/keyword-research') && r.request().method() === 'POST' && r.status() === 200);
  await page.getByRole('button', { name: 'Trigger Research' }).click();
  await triggerResp;
  await expect(page.getByText('Queued…')).toBeVisible({ timeout: 10_000 });

  // Content: open editor + save
  await page.goto(`${base}/content`);
  await expect(page.getByRole('heading', { name: 'Content Management' })).toBeVisible();

  // Navigate directly to avoid responsive sidebar intercepting pointer events in smaller viewports.
  await page.goto(`${base}/content/editor?id=c_1`);
  await expect(page.getByRole('heading', { name: 'Article Editor' })).toBeVisible({ timeout: 30_000 });

  const titleInput = page.locator('label', { hasText: 'Title' }).locator('..').locator('input');
  await titleInput.fill(`E2E Draft Updated ${Date.now()}`);
  const saveResp = page.waitForResponse((r) => r.url().includes('/api/content/c_1') && r.request().method() === 'POST' && r.status() === 200);
  await page.getByRole('button', { name: 'Save' }).click({ force: true });
  await saveResp;
  await expect(page.getByText('Saved')).toBeVisible({ timeout: 30_000 });

  // Reports: save template + generate + schedule + remove
  await page.goto(`${base}/reports`);
  await expect(page.getByRole('heading', { name: 'Report Center' })).toBeVisible();

  const tplNameInput = page.locator('label', { hasText: 'Template name' }).locator('..').locator('input');
  await tplNameInput.fill('E2E Template');
  await page.getByRole('button', { name: 'Save Template' }).click();
  await expect(page.getByText('Saved')).toBeVisible();

  // Use an existing template card (mocked as "Weekly")
  const weeklyTpl = page.locator('div.rounded-lg', { has: page.getByText('Weekly', { exact: true }) }).first();

  await weeklyTpl.getByRole('button', { name: 'Generate Now' }).click();
  await expect(weeklyTpl.getByText('Report generated successfully')).toBeVisible();

  await weeklyTpl.getByRole('button', { name: 'Schedule' }).click();
  await weeklyTpl.getByPlaceholder('email1@example.com, email2@example.com').fill('team@example.com');
  await weeklyTpl.getByRole('button', { name: 'Create Schedule' }).click();

  await expect(page.getByRole('heading', { name: 'Scheduled Reports' })).toBeVisible();
  await expect(page.getByText('team@example.com')).toBeVisible();

  const removeResp = page.waitForResponse((r) => r.url().includes('/api/reports/schedules/') && r.request().method() === 'DELETE' && r.status() === 200);
  await page.getByRole('button', { name: 'Remove' }).first().click({ force: true });
  await removeResp;
  await expect(page.getByText('No scheduled reports')).toBeVisible();

  // Settings: create API key (mock)
  await page.goto(`${base}/settings`);
  await expect(page.getByRole('heading', { name: 'Settings & RBAC' })).toBeVisible();

  await page.getByRole('button', { name: 'API Keys' }).click();
  await expect(page.getByText('Create / revoke keys, reveal full key, and set permission scopes.')).toBeVisible();

  await page.getByPlaceholder('Integration name').fill('E2E Key');
  const createKeyResp = page.waitForResponse((r) => r.url().includes('/api/api-keys') && r.request().method() === 'POST' && r.status() === 200);
  await page.getByRole('button', { name: 'Create key' }).click({ force: true });
  await createKeyResp;
  await expect(page.getByText('New API key (copy now)')).toBeVisible();

  await page.getByRole('button', { name: 'Dismiss' }).click({ force: true });
});
