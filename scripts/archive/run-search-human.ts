#!/usr/bin/env npx tsx
/**
 * Run Google/Bing searches with very slow human-like behavior
 * Avoids captchas by acting naturally
 */

import { chromium, Page } from 'playwright';
import * as fs from 'fs';

const MANIFEST_PATH = 'studies/city-of-boise-visibility.json';
const CONSOLIDATED_PATH = 'studies/city-of-boise-consolidated-results.json';
const SHARED_OUTPUT_PATH = 'studies/city-of-boise-complete-results.json';

// Which surface to run (pass as argument)
const surfaceId = process.argv[2] || 'google-search';

// Use separate file per surface to avoid race conditions
const OUTPUT_PATH = `studies/city-of-boise-${surfaceId}-results.json`;

interface QueryResult {
  queryIndex: number;
  queryText: string;
  category: string;
  surfaceId: string;
  status: 'complete' | 'failed';
  responseText?: string;
  responseTimeMs: number;
  error?: string;
  timestamp: string;
}

// Very slow, human-like delays
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Human typing - variable speed, occasional pauses
async function humanType(page: Page, text: string): Promise<void> {
  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    // Variable typing speed (50-200ms per character)
    await page.keyboard.type(char, { delay: randomBetween(50, 200) });

    // Occasional longer pause (thinking)
    if (Math.random() < 0.08) {
      await delay(randomBetween(300, 800));
    }

    // Very occasional typo correction simulation
    if (Math.random() < 0.02 && i > 3) {
      await delay(randomBetween(100, 300));
    }
  }
}

// Human-like mouse movement
async function humanMouseMove(page: Page): Promise<void> {
  const viewport = page.viewportSize() || { width: 1200, height: 800 };
  const x = randomBetween(100, viewport.width - 100);
  const y = randomBetween(100, viewport.height - 200);
  await page.mouse.move(x, y, { steps: randomBetween(10, 25) });
  await delay(randomBetween(100, 400));
}

// Human-like scrolling
async function humanScroll(page: Page): Promise<void> {
  const scrollAmount = randomBetween(150, 500);
  await page.mouse.wheel(0, scrollAmount);
  await delay(randomBetween(800, 2000));
}

async function runGoogleSearch(page: Page, query: string): Promise<{ success: boolean; text: string; timeMs: number }> {
  const startTime = Date.now();

  try {
    // Move mouse naturally first
    await humanMouseMove(page);
    await delay(randomBetween(500, 1500));

    // Find and click search box
    const searchBox = page.locator('textarea[name="q"], input[name="q"]').first();
    await searchBox.click();
    await delay(randomBetween(300, 700));

    // Clear existing text
    await page.keyboard.press('Meta+a');
    await delay(randomBetween(100, 200));
    await page.keyboard.press('Backspace');
    await delay(randomBetween(300, 600));

    // Type query slowly
    await humanType(page, query);
    await delay(randomBetween(500, 1200));

    // Sometimes move mouse before pressing enter
    if (Math.random() < 0.3) {
      await humanMouseMove(page);
    }

    // Press Enter
    await page.keyboard.press('Enter');

    // Wait for results (human would wait and look)
    await delay(randomBetween(3000, 5000));

    // Scroll down a bit to see results
    await humanScroll(page);
    await delay(randomBetween(1000, 2000));

    // Extract search results
    const resultsEl = page.locator('#search, #rso').first();
    let text = '';
    try {
      text = await resultsEl.innerText({ timeout: 5000 });
    } catch {
      text = '';
    }

    // Sometimes scroll more
    if (Math.random() < 0.4) {
      await humanScroll(page);
    }

    return {
      success: text.length > 100,
      text: text.slice(0, 8000),
      timeMs: Date.now() - startTime
    };
  } catch (error) {
    return { success: false, text: '', timeMs: Date.now() - startTime };
  }
}

async function runBingSearch(page: Page, query: string): Promise<{ success: boolean; text: string; timeMs: number }> {
  const startTime = Date.now();

  try {
    await humanMouseMove(page);
    await delay(randomBetween(500, 1500));

    const searchBox = page.locator('textarea#sb_form_q, input#sb_form_q').first();
    await searchBox.click();
    await delay(randomBetween(300, 700));

    await page.keyboard.press('Meta+a');
    await delay(randomBetween(100, 200));
    await page.keyboard.press('Backspace');
    await delay(randomBetween(300, 600));

    await humanType(page, query);
    await delay(randomBetween(500, 1200));

    await page.keyboard.press('Enter');
    await delay(randomBetween(3000, 5000));

    await humanScroll(page);
    await delay(randomBetween(1000, 2000));

    const resultsEl = page.locator('#b_results, #b_content').first();
    let text = '';
    try {
      text = await resultsEl.innerText({ timeout: 5000 });
    } catch {
      text = '';
    }

    if (Math.random() < 0.4) {
      await humanScroll(page);
    }

    return {
      success: text.length > 100,
      text: text.slice(0, 8000),
      timeMs: Date.now() - startTime
    };
  } catch (error) {
    return { success: false, text: '', timeMs: Date.now() - startTime };
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log(`  HUMAN-LIKE SEARCH: ${surfaceId}`);
  console.log('='.repeat(60));

  // Load manifest
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  console.log(`\nLoaded ${manifest.queries.length} queries`);

  // Load existing results
  let allResults: QueryResult[] = [];
  // Load from surface-specific file first
  if (fs.existsSync(OUTPUT_PATH)) {
    allResults = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8')).results || [];
  } else {
    // Bootstrap from shared file or consolidated file
    let sourceResults: QueryResult[] = [];
    if (fs.existsSync(SHARED_OUTPUT_PATH)) {
      sourceResults = JSON.parse(fs.readFileSync(SHARED_OUTPUT_PATH, 'utf-8')).results || [];
    } else if (fs.existsSync(CONSOLIDATED_PATH)) {
      sourceResults = JSON.parse(fs.readFileSync(CONSOLIDATED_PATH, 'utf-8')).results || [];
    }
    // Only keep results for this surface
    allResults = sourceResults.filter(r => r.surfaceId === surfaceId);
  }

  const completed = new Set(
    allResults.filter(r => r.surfaceId === surfaceId).map(r => r.queryIndex)
  );
  console.log(`Already done: ${completed.size}`);

  const missing: number[] = [];
  for (let i = 1; i <= manifest.queries.length; i++) {
    if (!completed.has(i)) missing.push(i);
  }
  console.log(`Missing: ${missing.length}\n`);

  if (missing.length === 0) {
    console.log('All done!');
    return;
  }

  // Connect to Chrome
  console.log('Connecting to Chrome...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const pages = context.pages();

  // Find or create page
  const urlPattern = surfaceId === 'google-search' ? /google\.com/ : /bing\.com/;
  const startUrl = surfaceId === 'google-search' ? 'https://www.google.com' : 'https://www.bing.com';

  let page = pages.find(p => urlPattern.test(p.url()));
  if (!page) {
    console.log(`Opening ${startUrl}...`);
    page = await context.newPage();
    await page.goto(startUrl);
    await delay(3000);
  }

  console.log(`Page: ${page.url()}\n`);
  console.log('-'.repeat(60));

  let successCount = 0;
  let failCount = 0;

  for (const queryNum of missing) {
    const query = manifest.queries[queryNum - 1];
    process.stdout.write(`[${queryNum}/${manifest.queries.length}] "${query.text.slice(0, 35)}..."  `);

    const result = surfaceId === 'google-search'
      ? await runGoogleSearch(page, query.text)
      : await runBingSearch(page, query.text);

    const queryResult: QueryResult = {
      queryIndex: queryNum,
      queryText: query.text,
      category: query.category,
      surfaceId,
      status: result.success ? 'complete' : 'failed',
      responseText: result.text || undefined,
      responseTimeMs: result.timeMs,
      timestamp: new Date().toISOString(),
    };

    allResults = allResults.filter(r => !(r.surfaceId === surfaceId && r.queryIndex === queryNum));
    allResults.push(queryResult);

    if (result.success) {
      successCount++;
      console.log(`✓ (${(result.timeMs / 1000).toFixed(1)}s)`);
    } else {
      failCount++;
      console.log(`✗`);
    }

    // Save progress
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify({
      studyName: 'City of Boise AI Visibility Study',
      lastUpdate: new Date().toISOString(),
      results: allResults,
    }, null, 2));

    // LONG delay between searches (20-40 seconds) to be very human
    const waitTime = randomBetween(20000, 40000);
    console.log(`   ⏳ Waiting ${Math.round(waitTime/1000)}s...`);

    // During wait, occasionally move mouse or scroll
    await delay(waitTime / 3);
    if (Math.random() < 0.3) await humanMouseMove(page);
    await delay(waitTime / 3);
    if (Math.random() < 0.2) await humanScroll(page);
    await delay(waitTime / 3);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`  Done: ${successCount} success, ${failCount} failed`);
  console.log('='.repeat(60));
}

main().catch(console.error);
