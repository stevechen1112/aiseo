import 'dotenv/config';

import { BrowserEngine } from '@aiseo/core';

async function main() {
  const url = process.argv[2] ?? 'https://example.com';
  const screenshot = (process.argv[3] ?? '0') === '1';

  const engine = new BrowserEngine({ headless: true });
  const out = await engine.browsePage({ url, screenshot });

  // eslint-disable-next-line no-console
  console.log({
    url: out.url,
    finalUrl: out.finalUrl,
    htmlChars: out.html.length,
    screenshotBytes: out.screenshotPngBase64 ? Buffer.from(out.screenshotPngBase64, 'base64').byteLength : 0,
  });
}

await main();
