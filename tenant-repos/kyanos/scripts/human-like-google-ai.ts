#!/usr/bin/env npx tsx
/**
 * Human-like Google AI Overview Detection
 *
 * Uses search box instead of URL navigation, adds mouse movements,
 * scrolling, and longer random delays to avoid bot detection.
 */

import { chromium, Page } from 'playwright';
import * as fs from 'fs';

const MANIFEST_PATH = 'studies/city-of-boise-visibility.json';
const OUTPUT_PATH = 'studies/city-of-boise-google-ai-overview-results.json';
const PROGRESS_PATH = '/tmp/google-ai-progress.json';

// Start from where we left off
const START_FROM = 34; // First 33 were done

interface QueryResult {
  queryIndex: number;
  queryText: string;
  category: string;
  surfaceId: string;
  status: 'complete' | 'failed';
  responseText?: string;
  responseTimeMs: number;
  error?: string;
}

function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function humanMouseMove(page: Page): Promise<void> {
  const viewport = page.viewportSize() || { width: 1200, height: 800 };
  const x = randomDelay(100, viewport.width - 100);
  const y = randomDelay(100, viewport.height - 100);
  await page.mouse.move(x, y, { steps: randomDelay(5, 15) });
  await page.waitForTimeout(randomDelay(100, 300));
}

async function humanScroll(page: Page): Promise<void> {
  const scrollAmount = randomDelay(100, 400);
  await page.mouse.wheel(0, scrollAmount);
  await page.waitForTimeout(randomDelay(500, 1500));
}

async function humanType(page: Page, text: string): Promise<void> {
  for (const char of text) {
    await page.keyboard.type(char, { delay: randomDelay(50, 150) });
    // Occasional longer pause (thinking)
    if (Math.random() < 0.1) {
      await page.waitForTimeout(randomDelay(200, 500));
    }
  }
}

async function extractAIOverview(page: Page): Promise<string> {
  // Wait for any dynamic content
  await page.waitForTimeout(2000);

  try {
    const aiContent = await page.evaluate(() => {
      // Look for AI Overview by the header text
      const spans = document.querySelectorAll('span');
      for (const span of spans) {
        if (span.textContent?.trim() === 'AI Overview') {
          // Navigate up to find the container
          let container = span.parentElement;
          for (let i = 0; i < 8 && container; i++) {
            const text = (container as HTMLElement).innerText;
            if (text && text.length > 150 && text.includes('AI Overview')) {
              return text.replace(/^AI Overview\s*/i, '').trim();
            }
            container = container.parentElement;
          }
        }
      }

      // Fallback: data-sgrd
      const sgrd = document.querySelector('div[data-sgrd]');
      if (sgrd) {
        const text = (sgrd as HTMLElement).innerText;
        if (text && text.length > 100) {
          return text.replace(/^AI Overview\s*/i, '').trim();
        }
      }

      return '';
    });

    return aiContent || '';
  } catch {
    return '';
  }
}

async function searchAndExtract(page: Page, query: string): Promise<{ success: boolean; text: string; timeMs: number }> {
  const startTime = Date.now();

  try {
    // Human-like: move mouse around first
    await humanMouseMove(page);
    await page.waitForTimeout(randomDelay(500, 1000));

    // Find search input (could be search box or textarea)
    const searchSelectors = [
      'textarea[name="q"]',
      'input[name="q"]',
      'textarea[title="Search"]',
      'input[title="Search"]',
    ];

    let searchInput = null;
    for (const sel of searchSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) {
          searchInput = el;
          break;
        }
      } catch { continue; }
    }

    if (!searchInput) {
      // Navigate to Google homepage
      await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(randomDelay(2000, 4000));
      searchInput = page.locator('textarea[name="q"], input[name="q"]').first();
    }

    // Click on search box
    await humanMouseMove(page);
    await searchInput.click();
    await page.waitForTimeout(randomDelay(300, 700));

    // Clear existing text
    await page.keyboard.press('Meta+a');
    await page.waitForTimeout(randomDelay(100, 200));
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(randomDelay(200, 500));

    // Type query human-like
    await humanType(page, query);
    await page.waitForTimeout(randomDelay(500, 1000));

    // Press Enter
    await page.keyboard.press('Enter');

    // Wait for results
    await page.waitForTimeout(randomDelay(4000, 6000));

    // Human-like: scroll a bit
    if (Math.random() < 0.5) {
      await humanScroll(page);
    }

    // Extract AI Overview
    const aiText = await extractAIOverview(page);
    const timeMs = Date.now() - startTime;

    if (aiText && aiText.length > 50) {
      return { success: true, text: aiText, timeMs };
    } else {
      return { success: false, text: '', timeMs };
    }
  } catch (error) {
    return { success: false, text: '', timeMs: Date.now() - startTime };
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('  HUMAN-LIKE GOOGLE AI OVERVIEW DETECTION');
  console.log('='.repeat(70));
  console.log(`  Starting from query ${START_FROM}\n`);

  // Load manifest
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  const queries = manifest.queries;

  // Load existing results if any
  let results: QueryResult[] = [];
  if (fs.existsSync(OUTPUT_PATH)) {
    const existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
    results = existing.results || [];
    console.log(`Loaded ${results.length} existing results\n`);
  }

  // Connect to Chrome
  console.log('Connecting to Chrome on port 9222...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const contexts = browser.contexts();
  const context = contexts[0];
  const pages = context.pages();

  let googlePage = pages.find(p => p.url().includes('google.com'));
  if (!googlePage) {
    googlePage = await context.newPage();
    await googlePage.goto('https://www.google.com');
    await googlePage.waitForTimeout(3000);
  }

  let successCount = results.filter(r => r.status === 'complete').length;
  let failCount = results.filter(r => r.status === 'failed').length;

  console.log(`\nProcessing queries ${START_FROM} to ${queries.length}...\n`);
  console.log('-'.repeat(70));

  for (let i = START_FROM - 1; i < queries.length; i++) {
    const query = queries[i];
    const queryNum = i + 1;

    // Skip if already processed
    if (results.find(r => r.queryIndex === queryNum)) {
      console.log(`  [${queryNum}/${queries.length}] Already done, skipping`);
      continue;
    }

    process.stdout.write(`  [${queryNum}/${queries.length}] "${query.text.slice(0, 35)}..."  `);

    const result = await searchAndExtract(googlePage, query.text);

    if (result.success) {
      successCount++;
      console.log(`✓ (${(result.timeMs / 1000).toFixed(1)}s)`);
      results.push({
        queryIndex: queryNum,
        queryText: query.text,
        category: query.category,
        surfaceId: 'google-ai-overview',
        status: 'complete',
        responseText: result.text,
        responseTimeMs: result.timeMs,
      });
    } else {
      failCount++;
      console.log(`✗ No AI Overview`);
      results.push({
        queryIndex: queryNum,
        queryText: query.text,
        category: query.category,
        surfaceId: 'google-ai-overview',
        status: 'failed',
        responseTimeMs: result.timeMs,
        error: 'No AI Overview found',
      });
    }

    // Save progress after each query
    const output = {
      timestamp: new Date().toISOString(),
      studyName: 'City of Boise - Google AI Overview',
      surface: 'google-ai-overview',
      summary: { total: queries.length, successful: successCount, failed: failCount },
      results,
    };
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

    // Human-like delay between searches (15-30 seconds)
    if (i < queries.length - 1) {
      const delay = randomDelay(15000, 30000);
      console.log(`     ⏳ Waiting ${Math.round(delay/1000)}s...`);

      // During wait, occasionally move mouse or scroll
      await googlePage.waitForTimeout(delay / 3);
      if (Math.random() < 0.3) await humanMouseMove(googlePage);
      await googlePage.waitForTimeout(delay / 3);
      if (Math.random() < 0.2) await humanScroll(googlePage);
      await googlePage.waitForTimeout(delay / 3);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('  COMPLETE');
  console.log('='.repeat(70));
  console.log(`\n  Total: ${queries.length}`);
  console.log(`  Success: ${successCount}`);
  console.log(`  Failed: ${failCount}`);
  console.log(`  AI Overview Rate: ${((successCount / queries.length) * 100).toFixed(1)}%`);
  console.log(`\n  Results saved to: ${OUTPUT_PATH}\n`);
}

main().catch(console.error);
