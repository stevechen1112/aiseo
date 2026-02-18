import { test, expect } from '@playwright/test';

function randomEmail(prefix: string) {
  return `${prefix}${Date.now()}_${Math.floor(Math.random() * 10000)}@example.com`;
}

test.describe('LIVE UAT (real backend)', () => {
  test.skip(!process.env.LIVE_E2E, 'Set LIVE_E2E=1 to run against a real backend');

  test('Login works and key dashboard routes render; WS connects', async ({ page, request }) => {
    test.setTimeout(180_000);
    const apiBase = process.env.AISEO_API_URL || 'http://localhost:3001';
    const baseURL = (test.info().project.use.baseURL as string | undefined) ?? 'http://127.0.0.1:3000';
    const origin = new URL(baseURL).origin;

    let wsErrCount = 0;
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (text.includes('WebSocket connection') || text.includes('WebSocket error')) {
        wsErrCount++;
        if (wsErrCount > 3) return;
      }
      console.log('[BROWSER console.error]', text);
    });
    page.on('pageerror', (err) => {
      console.log('[BROWSER pageerror]', err?.message ?? String(err));
    });
    page.on('requestfailed', (req) => {
      const url = req.url();
      if (url.includes('/_next/') || url.includes('/api/')) {
        console.log('[BROWSER requestfailed]', req.method(), url, req.failure()?.errorText);
      }
    });

    const email = randomEmail('live_uat_');
    const password = 'password1234';

    const reg = await request.post(`${apiBase}/api/auth/register`, {
      data: { email, password, name: 'Live UAT' },
    });
    expect(reg.ok()).toBeTruthy();

    const login = await request.post(`${apiBase}/api/auth/login`, {
      data: { email, password },
    });
    expect(login.ok()).toBeTruthy();
    const auth = (await login.json()) as {
      token: string;
      refreshToken: string;
      user: { id: string; email: string; tenantId: string; projectId: string };
    };

    await page.context().addCookies([
      {
        name: 'aiseo_token',
        value: auth.token,
        url: origin,
      },
      {
        name: 'aiseo_refresh_token',
        value: auth.refreshToken,
        url: origin,
      },
    ]);

    // AuthProvider requires BOTH cookie token + localStorage user at mount time.
    // Setting localStorage via init scripts can be timing/"null origin"-sensitive;
    // do it on a real same-origin page, then do a full navigation to /dashboard.
    await page.goto('/');

    await page.evaluate((user) => {
      window.localStorage.setItem('aiseo_user', JSON.stringify(user));
    }, auth.user);

    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Dashboard Overview' })).toBeVisible();

    // Confirm REST is working (avoids waiting 45s on WS when rewrites point to a dead port).
    await expect(page.getByText('Failed to load metrics')).toHaveCount(0, { timeout: 30_000 });

    // WebSocket status should become Live if backend WS auth is correct.
    await expect(page.getByText('Live', { exact: true })).toBeVisible({ timeout: 45_000 });

    const nav = page.getByRole('navigation');
    await expect(nav).toBeVisible({ timeout: 30_000 });

    await nav.getByRole('link', { name: 'Agents' }).click({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Agent Status Panel' })).toBeVisible({ timeout: 30_000 });

    await nav.getByRole('link', { name: 'Keywords' }).click({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Keyword Tracking' })).toBeVisible({ timeout: 30_000 });

    await nav.getByRole('link', { name: 'Rankings' }).click({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Rank Tracker' })).toBeVisible({ timeout: 30_000 });

    await nav.getByRole('link', { name: 'Backlinks' }).click({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Backlink Manager' })).toBeVisible({ timeout: 30_000 });

    await nav.getByRole('link', { name: 'Reports' }).click({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Report Center' })).toBeVisible({ timeout: 30_000 });

    await nav.getByRole('link', { name: 'Settings' }).click({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Settings & RBAC' })).toBeVisible({ timeout: 30_000 });
  });
});
