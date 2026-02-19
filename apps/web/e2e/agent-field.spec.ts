import { test, expect } from '@playwright/test';
import { installApiMocks, installAuthState, type MockContext } from './utils';

const ctx: MockContext = {
  tenantId: '',
  projectId: '00000000-0000-0000-0000-000000000000',
};

test.beforeEach(async ({ page }) => {
  await installAuthState(page, ctx);
  await installApiMocks(page, ctx);
});

test('Agent Field smoke: select task and dispatch matching agent', async ({ page }) => {
  await page.goto('/dashboard/agents/field');
  await page.addStyleTag({ content: '* { animation: none !important; transition: none !important; }' });

  await expect(page.getByRole('heading', { name: 'Agent Field', exact: true })).toBeVisible();
  await expect(page.getByText('AISEO Agent Field')).toBeVisible();

  const taskButton = page.getByRole('button', { name: /Keyword & SERP/i });
  await taskButton.click();
  await expect(taskButton).toHaveClass(/border-blue-500/);

  await page.getByRole('button', { name: /SERP Tracker \((idle|waiting)\)/i }).first().dispatchEvent('click');
  await expect(taskButton).not.toHaveClass(/border-blue-500/);
});
