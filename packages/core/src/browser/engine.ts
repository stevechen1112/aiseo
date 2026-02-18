import { createRequire } from 'node:module';

export type BrowserEngineOptions = {
  headless?: boolean;
  userAgent?: string;
  navigationTimeoutMs?: number;
};

export type BrowsePageInput = {
  url: string;
  screenshot?: boolean;
};

export type BrowsePageOutput = {
  url: string;
  finalUrl: string;
  html: string;
  screenshotPngBase64?: string;
};

export class BrowserEngine {
  constructor(private readonly options: BrowserEngineOptions = {}) {}

  async browsePage(input: BrowsePageInput): Promise<BrowsePageOutput> {
    // Keep Playwright as an optional dependency until Phase 1 hardens browser sandboxing.
    const require = createRequire(import.meta.url);

    type PlaywrightModule = {
      chromium: {
        launch: (options: { headless: boolean }) => Promise<{
          newContext: (options?: { userAgent?: string }) => Promise<{
            newPage: () => Promise<{
              goto: (url: string, options: { waitUntil: 'networkidle'; timeout: number }) => Promise<void>;
              content: () => Promise<string>;
              url: () => string;
              screenshot: (options: { type: 'png'; fullPage: boolean }) => Promise<Uint8Array>;
            }>;
            close: () => Promise<void>;
          }>;
          close: () => Promise<void>;
        }>;
      };
    };

    let playwright: PlaywrightModule;
    try {
      playwright = require('playwright') as unknown as PlaywrightModule;
    } catch {
      throw new Error('Playwright is not installed. Install `playwright` (and browsers) to use BrowserEngine.');
    }

    const browser = await playwright.chromium.launch({ headless: this.options.headless ?? true });

    try {
      const context = await browser.newContext({
        userAgent: this.options.userAgent,
      });

      const page = await context.newPage();
      await page.goto(input.url, {
        waitUntil: 'networkidle',
        timeout: this.options.navigationTimeoutMs ?? 45_000,
      });

      const html = await page.content();
      const finalUrl = page.url();

      let screenshotPngBase64: string | undefined;
      if (input.screenshot) {
        const png = await page.screenshot({ type: 'png', fullPage: true });
        screenshotPngBase64 = Buffer.from(png).toString('base64');
      }

      await context.close();

      return {
        url: input.url,
        finalUrl,
        html,
        screenshotPngBase64,
      };
    } finally {
      await browser.close();
    }
  }
}
