import { defineConfig, devices } from '@playwright/test';

function toStringEnv(input: NodeJS.ProcessEnv): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') output[key] = value;
  }
  return output;
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${process.env.PORT || '3000'}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: process.env.LIVE_E2E ? 'corepack pnpm build && corepack pnpm start' : 'corepack pnpm dev',
    url: `http://127.0.0.1:${process.env.PORT || '3000'}`,
    // LIVE_E2E passes dynamic env (AISEO_API_URL / NEXT_PUBLIC_WS_URL) from the runner.
    // Reusing an existing Next server can keep stale rewrites/WS URL and make tests flaky.
    reuseExistingServer: !process.env.LIVE_E2E && !process.env.CI,
    timeout: 120_000,
    env: {
      ...toStringEnv(process.env),
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-tablet',
      use: { ...devices['iPad (gen 7)'] },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
