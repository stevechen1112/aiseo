#!/usr/bin/env node
/**
 * ValueSERP API Smoke Test
 * 
 * Quick verification that ValueSERP API is configured correctly.
 * 
 * Usage:
 *   pnpm -C apps/api smoke:valueserp
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

// Load .env from workspace root (../../ from apps/api/src/scripts/)
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const envPath = resolve(__dirname, '../../../../.env');
config({ path: envPath });

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const BLUE = '\x1b[34m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function log(message: string, color = RESET) {
  console.log(`${color}${message}${RESET}`);
}

async function testValueSerpApi() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', BLUE);
  log('   ValueSERP API Configuration Test', BLUE);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', BLUE);

  // Check environment variables
  const provider = process.env.SERP_PROVIDER;
  const apiKey = process.env.VALUESERP_API_KEY;

  log(`\nConfiguration:`);
  log(`  SERP_PROVIDER: ${provider ?? '(not set)'}`);
  log(`  VALUESERP_API_KEY: ${apiKey ? apiKey.substring(0, 8) + '...' : '(not set)'}`);

  if (provider !== 'valueserp') {
    log(`\n✗ SERP_PROVIDER is "${provider}", expected "valueserp"`, RED);
    return false;
  }

  if (!apiKey) {
    log('\n✗ VALUESERP_API_KEY is not set', RED);
    return false;
  }

  log(`\n✓ Configuration looks good`, GREEN);

  // Test API with a simple query
  log(`\n━━━ Testing API Connection ━━━`, BLUE);
  log(`→ Querying Google for "SEO 優化" (Taiwan)...`);

  const params = new URLSearchParams({
    api_key: apiKey,
    q: 'SEO 優化',
    location: 'Taiwan',
    google_domain: 'google.com.tw',
    gl: 'tw',
    hl: 'zh-tw',
    num: '10',
    output: 'json',
  });

  const url = `https://api.valueserp.com/search?${params.toString()}`;

  try {
    const startTime = Date.now();
    const response = await fetch(url);
    const elapsed = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      log(`\n✗ API Error: ${response.status} ${response.statusText}`, RED);
      log(`  ${errorText.substring(0, 200)}`, RED);
      return false;
    }

    const data = (await response.json()) as {
      search_metadata?: {
        id?: string;
        status?: string;
        created_at?: string;
        processed_at?: string;
        total_time_taken?: number;
      };
      search_parameters?: {
        q?: string;
        location?: string;
        google_domain?: string;
      };
      search_information?: {
        total_results?: number;
        time_taken_displayed?: number;
      };
      organic_results?: Array<{
        position?: number;
        title?: string;
        link?: string;
        displayed_link?: string;
      }>;
      credits_used?: number;
      credits_remaining?: number;
    };

    log(`\n✓ API Response received (${elapsed}ms)`, GREEN);

    if (data.search_metadata?.status) {
      log(`\n✓ Search Status: ${data.search_metadata.status}`, GREEN);
    }

    if (data.search_information?.total_results !== undefined) {
      log(`✓ Total Results: ${data.search_information.total_results.toLocaleString()}`, GREEN);
    }

    if (data.organic_results && data.organic_results.length > 0) {
      log(`\n✓ Organic Results (${data.organic_results.length}):`);
      data.organic_results.slice(0, 3).forEach((result) => {
        log(`  ${result.position}. ${result.title}`, YELLOW);
        log(`     ${result.link}`, RESET);
      });
    }

    if (data.credits_used !== undefined) {
      log(`\n✓ Credits Used: ${data.credits_used}`, GREEN);
    }

    if (data.credits_remaining !== undefined) {
      log(`✓ Credits Remaining: ${data.credits_remaining}`, GREEN);
      
      if (data.credits_remaining < 100) {
        log(`  ⚠️  Warning: Low credits remaining!`, YELLOW);
      }
    }

    return true;
  } catch (error) {
    log(`\n✗ Request Failed:`, RED);
    if (error instanceof Error) {
      log(`  ${error.message}`, RED);
    } else {
      log(`  ${String(error)}`, RED);
    }
    return false;
  }
}

async function main() {
  try {
    const success = await testValueSerpApi();

    if (success) {
      log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', GREEN);
      log('   ✓ ValueSERP API Test Passed!', GREEN);
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', GREEN);
      log('\nNext Steps:', BLUE);
      log('  1. Your SERP Tracker agent is now ready to use real Google data');
      log('  2. Run full E2E test: pnpm -C apps/api phase1:e2e');
      log('  3. Start the system: pnpm dev');
      process.exit(0);
    } else {
      log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', RED);
      log('   ✗ ValueSERP API Test Failed!', RED);
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', RED);
      log('\nTroubleshooting:', YELLOW);
      log('  1. Check your API key is correct in .env');
      log('  2. Verify you have remaining credits at https://www.valueserp.com/dashboard');
      log('  3. Check API documentation: https://www.valueserp.com/docs');
      process.exit(1);
    }
  } catch (error) {
    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', RED);
    log('   ✗ Unexpected Error!', RED);
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', RED);

    if (error instanceof Error) {
      log(`\nError: ${error.message}`, RED);
      if (error.stack) {
        log(`\nStack trace:`, RED);
        log(error.stack, RED);
      }
    } else {
      log(`\nError: ${String(error)}`, RED);
    }

    process.exit(1);
  }
}

await main();
