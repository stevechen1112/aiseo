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

test('Dashboard routes render (Phase 3 - 4.11)', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard Overview' })).toBeVisible();

  await page.goto('/dashboard/agents');
  await expect(page.getByRole('heading', { name: 'Agent Status Panel' })).toBeVisible();

  await page.goto('/dashboard/keywords');
  await expect(page.getByRole('heading', { name: 'Keyword Tracking' })).toBeVisible();

  await page.goto('/dashboard/content');
  await expect(page.getByRole('heading', { name: 'Content Management' })).toBeVisible();

  await page.goto('/dashboard/content/editor?id=11111111-1111-1111-1111-111111111111');
  await expect(page.getByRole('heading', { name: 'Article Editor' })).toBeVisible();

  await page.goto('/dashboard/audit');
  await expect(page.getByRole('heading', { name: 'Technical Audit Viewer' })).toBeVisible();

  await page.goto('/dashboard/rankings');
  await expect(page.getByRole('heading', { name: 'Rank Tracker' })).toBeVisible();

  await page.goto('/dashboard/backlinks');
  await expect(page.getByRole('heading', { name: 'Backlink Manager' })).toBeVisible();

  await page.goto('/dashboard/reports');
  await expect(page.getByRole('heading', { name: 'Report Center' })).toBeVisible();

  await page.goto('/dashboard/settings');
  await expect(page.getByRole('heading', { name: 'Settings & RBAC' })).toBeVisible();
});
