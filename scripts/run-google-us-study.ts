#!/usr/bin/env npx tsx
/**
 * Run HUFT 100-Prompt Study - Google Search from US IP
 *
 * Queries Google Search for the same 100 pet product prompts from real IP (US).
 * Compares against India proxy results to show geographic web layer differences.
 */

import { chromium, type Page } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';

// Resume from query index (0-based). Set to 0 to start fresh.
const RESUME_FROM_QUERY = 0;

// Delay between searches (ms) - 20 seconds to protect your personal IP
const SEARCH_DELAY_MS = 20000;

// Load study manifest
const manifest = JSON.parse(readFileSync('studies/huft-100-prompt-india-study.json', 'utf-8'));
const QUERIES = manifest.queries.map((q: { text: string }) => q.text);

interface QueryResult {
  query: string;
  queryIndex: number;
  surface: string;
  success: boolean;
  response?: string;
  aiOverview?: string;
  organicResults?: string[];
  error?: string;
  timestamp: string;
  responseTimeMs: number;
}

async function queryGoogleSearch(query: string, queryIndex: number, page: Page): Promise<QueryResult> {
  const startTime = Date.now();

  try {
    await page.bringToFront();

    // Navigate to Google
    if (!page.url().includes('google.com/search')) {
      await page.goto('https://www.google.com', { timeout: 30000 });
      await page.waitForTimeout(1000);
    }

    // Dismiss any modals
    try {
      const dismissButtons = ['text="Not now"', 'text="No thanks"', 'text="Dismiss"', 'text="Got it"'];
      for (const selector of dismissButtons) {
        const btn = page.locator(selector).first();
        if (await btn.isVisible({ timeout: 500 })) {
          await btn.click();
          await page.waitForTimeout(300);
          break;
        }
      }
    } catch {}

    // Fill search
    const searchInput = page.locator('textarea[name="q"], input[name="q"]').first();
    await searchInput.click();
    await page.keyboard.press('Meta+a');
    await searchInput.fill(query);
    await page.waitForTimeout(300);

    // Submit search
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);

    // Check for captcha/block
    const isBlocked = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return text.includes('unusual traffic') ||
             text.includes('not a robot') ||
             text.includes('verify you are human') ||
             text.includes('/sorry/');
    });

    if (isBlocked) {
      return {
        query,
        queryIndex,
        surface: 'google-search-us',
        success: false,
        error: 'Google blocked request - rate limited',
        timestamp: new Date().toISOString(),
        responseTimeMs: Date.now() - startTime,
      };
    }

    // Dismiss modals again after search
    try {
      const notNowButton = page.locator('text="Not now"').first();
      if (await notNowButton.isVisible({ timeout: 500 })) {
        await notNowButton.click();
      }
    } catch {}

    // Wait for AI Overview to potentially load
    await page.waitForTimeout(5000);

    // Extract AI Overview
    const aiOverview = await page.evaluate(() => {
      const selectors = [
        '[data-attrid="AIOverview"]',
        '[data-md="50"]',
        'div[jsname="N760b"]',
        '.wDYxhc[data-md]',
        '.xpdopen .wDYxhc',
        '#rso > div:first-child .wDYxhc',
      ];

      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const text = (el as HTMLElement).innerText?.trim();
          if (text && text.length > 100) return text;
        }
      }

      // Look for "AI Overview" heading
      const headings = document.querySelectorAll('h2, div[role="heading"]');
      for (const h of headings) {
        if (h.textContent?.toLowerCase().includes('ai overview')) {
          const container = h.closest('div[data-hveid]') || h.parentElement?.parentElement;
          if (container) {
            const text = (container as HTMLElement).innerText?.trim();
            if (text && text.length > 100) return text;
          }
        }
      }

      return '';
    });

    // Get organic results
    const organicResults = await page.evaluate(() => {
      const results: string[] = [];
      const items = document.querySelectorAll('#search .g');

      for (let i = 0; i < Math.min(items.length, 10); i++) {
        const item = items[i];
        const title = item.querySelector('h3')?.textContent || '';
        const snippet = item.querySelector('.VwiC3b, [data-sncf]')?.textContent || '';
        const link = item.querySelector('a')?.href || '';

        if (title && link) {
          results.push(`${title}\n${link}\n${snippet}`);
        }
      }

      return results;
    });

    return {
      query,
      queryIndex,
      surface: 'google-search-us',
      success: true,
      aiOverview: aiOverview || undefined,
      organicResults,
      response: aiOverview || organicResults.slice(0, 3).join('\n\n'),
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      query,
      queryIndex,
      surface: 'google-search-us',
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
    };
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('  HUFT 100-Prompt Study - Google Search (US IP)');
  console.log('  Comparing against India results for geographic web layer analysis');
  console.log('='.repeat(70));
  console.log(`\nTotal queries: ${QUERIES.length}`);
  console.log(`Delay between searches: ${SEARCH_DELAY_MS / 1000} seconds`);
  if (RESUME_FROM_QUERY > 0) {
    console.log(`Resuming from query: ${RESUME_FROM_QUERY + 1}`);
  }
  console.log('');

  // Launch browser without proxy
  console.log('Launching browser (real IP - no proxy)...');
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--disable-infobars',
    ],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
  });

  // Remove webdriver detection
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  // Check IP location
  console.log('\nVerifying IP location...');
  const testPage = await context.newPage();
  try {
    await testPage.goto('https://ipinfo.io/json', { timeout: 30000 });
    const ipInfo = await testPage.evaluate(() => JSON.parse(document.body.innerText));
    console.log(`✅ IP Location: ${ipInfo.city}, ${ipInfo.region}, ${ipInfo.country}`);
  } catch (e) {
    console.error('❌ Failed to verify IP location:', e);
  }
  await testPage.close();

  // Open Google page
  const googlePage = await context.newPage();
  console.log('\nOpening Google...');
  await googlePage.goto('https://www.google.com', { timeout: 30000 });
  console.log('✅ Google ready');
  console.log('');

  // Load previous results if resuming
  let results: QueryResult[] = [];
  if (RESUME_FROM_QUERY > 0) {
    try {
      const intermediatePath = `studies/huft-google-us-intermediate-${RESUME_FROM_QUERY}.json`;
      if (existsSync(intermediatePath)) {
        const previousData = JSON.parse(readFileSync(intermediatePath, 'utf-8'));
        results = previousData.results || [];
        console.log(`📂 Loaded ${results.length} previous results\n`);
      }
    } catch (e) {
      console.log(`⚠️  Could not load previous results, starting fresh\n`);
    }
  }

  const startTime = Date.now();
  let consecutiveFailures = 0;

  for (let i = RESUME_FROM_QUERY; i < QUERIES.length; i++) {
    const query = QUERIES[i];
    const progress = `[${i + 1}/${QUERIES.length}]`;

    console.log(`\n${progress} "${query.slice(0, 60)}${query.length > 60 ? '...' : ''}"`);

    const result = await queryGoogleSearch(query, i, googlePage);
    results.push(result);

    if (result.success) {
      const aiStatus = result.aiOverview ? ' [AI Overview found]' : ' [No AI Overview]';
      console.log(`  ✅ (${result.responseTimeMs}ms)${aiStatus}`);
      consecutiveFailures = 0;
    } else {
      console.log(`  ❌ ${result.error}`);
      consecutiveFailures++;

      // Stop if we get too many consecutive failures (rate limited)
      if (consecutiveFailures >= 3) {
        console.log('\n' + '!'.repeat(70));
        console.log('  ⚠️  3 consecutive failures - Google may be rate limiting');
        console.log('  Saving progress and stopping. Run again later to resume.');
        console.log('!'.repeat(70));
        break;
      }
    }

    // Save intermediate results every 10 queries
    if ((i + 1) % 10 === 0) {
      const intermediatePath = `studies/huft-google-us-intermediate-${i + 1}.json`;
      writeFileSync(intermediatePath, JSON.stringify({ results, lastQuery: i }, null, 2));
      console.log(`  💾 Saved checkpoint to ${intermediatePath}`);
    }

    // Delay between searches
    if (i < QUERIES.length - 1 && consecutiveFailures === 0) {
      await new Promise(r => setTimeout(r, SEARCH_DELAY_MS));
    }
  }

  const totalTime = Date.now() - startTime;

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('  RESULTS SUMMARY');
  console.log('='.repeat(70));

  const successCount = results.filter(r => r.success).length;
  const aiOverviewCount = results.filter(r => r.aiOverview).length;

  console.log(`\nGoogle Search (US): ${successCount}/${results.length} successful`);
  console.log(`AI Overviews found: ${aiOverviewCount}`);
  console.log(`Total time: ${Math.round(totalTime / 1000 / 60)} minutes`);

  // Save final results
  const outputPath = 'studies/huft-google-us-results.json';
  writeFileSync(outputPath, JSON.stringify({
    studyId: `huft-google-us-${Date.now()}`,
    studyName: `${manifest.name} - Google Search (US)`,
    location: { country: 'US', note: 'Real IP - no proxy' },
    timestamp: new Date().toISOString(),
    totalTimeMs: totalTime,
    summary: {
      totalJobs: results.length,
      successful: successCount,
      failed: results.length - successCount,
      aiOverviewsFound: aiOverviewCount,
    },
    results,
  }, null, 2));

  console.log(`\n✅ Results saved to: ${outputPath}`);
  console.log('\n📝 Browser left open. You can close it manually when done.');
}

main().catch(console.error);
