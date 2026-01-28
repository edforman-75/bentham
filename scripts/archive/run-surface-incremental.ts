#!/usr/bin/env npx tsx
/**
 * Run a single surface incrementally
 *
 * Usage: npx tsx scripts/run-surface-incremental.ts <surface-id>
 * Example: npx tsx scripts/run-surface-incremental.ts chatgpt-web
 *
 * Surfaces: chatgpt-web, meta-ai-web, google-search, bing-search
 */

import { chromium, Page } from 'playwright';
import * as fs from 'fs';

const MANIFEST_PATH = 'studies/city-of-boise-visibility.json';
const CONSOLIDATED_PATH = 'studies/city-of-boise-consolidated-results.json';
const OUTPUT_PATH = 'studies/city-of-boise-complete-results.json';

// Get surface from command line
const surfaceId = process.argv[2];
if (!surfaceId) {
  console.log('Usage: npx tsx scripts/run-surface-incremental.ts <surface-id>');
  console.log('Surfaces: chatgpt-web, meta-ai-web, google-search, bing-search');
  process.exit(1);
}

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

const SURFACE_CONFIG: Record<string, {
  startUrl: string;
  urlPattern: RegExp;
  inputSelectors: string[];
  submitSelectors: string[];
  responseSelectors: string[];
  waitTime: number;
}> = {
  'chatgpt-web': {
    startUrl: 'https://chatgpt.com',
    urlPattern: /chatgpt\.com/,
    inputSelectors: ['#prompt-textarea', '[contenteditable="true"]'],
    submitSelectors: ['button[data-testid="send-button"]', 'button[data-testid="composer-send-button"]'],
    responseSelectors: ['[data-message-author-role="assistant"] .markdown', '[data-message-author-role="assistant"]'],
    waitTime: 30000,
  },
  'meta-ai-web': {
    startUrl: 'https://www.meta.ai',
    urlPattern: /meta\.ai/,
    inputSelectors: [
      'div[contenteditable="true"][data-lexical-editor="true"]',
      'div[contenteditable="true"]',
      'textarea',
    ],
    submitSelectors: [
      'button[aria-label="Send message"]',
      'button[aria-label="Send"]',
    ],
    responseSelectors: [
      '[class*="markdown"]',
      '[class*="response"]',
      'div[dir="auto"]',
    ],
    waitTime: 30000,
  },
  'google-search': {
    startUrl: 'https://www.google.com',
    urlPattern: /google\.com/,
    inputSelectors: ['textarea[name="q"]', 'input[name="q"]'],
    submitSelectors: [],
    responseSelectors: ['#search', '#rso'],
    waitTime: 5000,
  },
  'bing-search': {
    startUrl: 'https://www.bing.com',
    urlPattern: /bing\.com/,
    inputSelectors: ['textarea#sb_form_q', 'input#sb_form_q'],
    submitSelectors: [],
    responseSelectors: ['#b_results', '#b_content'],
    waitTime: 5000,
  },
};

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function humanType(page: Page, text: string): Promise<void> {
  for (const char of text) {
    await page.keyboard.type(char, { delay: randomDelay(30, 100) });
  }
}

async function executeQuery(
  page: Page,
  query: string,
  config: typeof SURFACE_CONFIG[string]
): Promise<{ success: boolean; text: string; timeMs: number; error?: string }> {
  const startTime = Date.now();

  try {
    // Find input
    let inputEl = null;
    for (const sel of config.inputSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) {
          inputEl = el;
          break;
        }
      } catch { continue; }
    }

    if (!inputEl) {
      return { success: false, text: '', timeMs: Date.now() - startTime, error: 'Input not found' };
    }

    // Clear and type
    await inputEl.click();
    await delay(200);
    await page.keyboard.press('Meta+a');
    await delay(100);
    await page.keyboard.press('Backspace');
    await delay(200);
    await humanType(page, query);
    await delay(300);

    // Submit
    if (config.submitSelectors.length > 0) {
      for (const sel of config.submitSelectors) {
        try {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 1000 })) {
            await btn.click();
            break;
          }
        } catch { continue; }
      }
    } else {
      await page.keyboard.press('Enter');
    }

    // Wait
    await delay(config.waitTime);

    // Extract response
    let responseText = '';
    for (const sel of config.responseSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 })) {
          responseText = await el.innerText();
          if (responseText && responseText.length > 50) break;
        }
      } catch { continue; }
    }

    if (responseText && responseText.length > 50) {
      return { success: true, text: responseText.slice(0, 10000), timeMs: Date.now() - startTime };
    }
    return { success: false, text: '', timeMs: Date.now() - startTime, error: 'No response' };
  } catch (error) {
    return { success: false, text: '', timeMs: Date.now() - startTime, error: String(error) };
  }
}

async function main() {
  const config = SURFACE_CONFIG[surfaceId];
  if (!config) {
    console.error(`Unknown surface: ${surfaceId}`);
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log(`  Running: ${surfaceId}`);
  console.log('='.repeat(60));

  // Load manifest
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  console.log(`\nLoaded ${manifest.queries.length} queries`);

  // Load existing results
  let allResults: QueryResult[] = [];
  if (fs.existsSync(OUTPUT_PATH)) {
    const existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
    allResults = existing.results || [];
  } else if (fs.existsSync(CONSOLIDATED_PATH)) {
    const consolidated = JSON.parse(fs.readFileSync(CONSOLIDATED_PATH, 'utf-8'));
    allResults = consolidated.results || [];
  }

  // Find completed indices for this surface
  const completed = new Set(
    allResults.filter(r => r.surfaceId === surfaceId).map(r => r.queryIndex)
  );
  console.log(`Already completed: ${completed.size} queries`);

  // Find missing
  const missing: number[] = [];
  for (let i = 1; i <= manifest.queries.length; i++) {
    if (!completed.has(i)) missing.push(i);
  }
  console.log(`Missing: ${missing.length} queries`);

  if (missing.length === 0) {
    console.log('\nSurface is complete!');
    return;
  }

  // Connect to Chrome
  console.log('\nConnecting to Chrome...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const pages = context.pages();

  // Find page for this surface
  let page = pages.find(p => config.urlPattern.test(p.url()));
  if (!page) {
    console.log(`Opening ${config.startUrl}...`);
    page = await context.newPage();
    await page.goto(config.startUrl);
    await delay(5000);
  }

  console.log(`Using page: ${page.url()}`);
  console.log('\n' + '-'.repeat(60));

  let successCount = 0;
  let failCount = 0;

  for (const queryNum of missing) {
    const query = manifest.queries[queryNum - 1];
    process.stdout.write(`  [${queryNum}/${manifest.queries.length}] "${query.text.slice(0, 30)}..."  `);

    const result = await executeQuery(page, query.text, config);

    const queryResult: QueryResult = {
      queryIndex: queryNum,
      queryText: query.text,
      category: query.category,
      surfaceId,
      status: result.success ? 'complete' : 'failed',
      responseText: result.text || undefined,
      responseTimeMs: result.timeMs,
      error: result.error,
      timestamp: new Date().toISOString(),
    };

    // Add to results (remove any existing for this query/surface)
    allResults = allResults.filter(r => !(r.surfaceId === surfaceId && r.queryIndex === queryNum));
    allResults.push(queryResult);

    if (result.success) {
      successCount++;
      console.log(`✓ (${(result.timeMs / 1000).toFixed(1)}s)`);
    } else {
      failCount++;
      console.log(`✗ ${result.error || 'Failed'}`);
    }

    // Save progress
    const output = {
      studyName: 'City of Boise AI Visibility Study',
      lastUpdate: new Date().toISOString(),
      results: allResults,
    };
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

    // Delay
    await delay(randomDelay(2000, 4000));
  }

  console.log('\n' + '='.repeat(60));
  console.log(`  ${surfaceId} complete: ${successCount} success, ${failCount} failed`);
  console.log('='.repeat(60));
}

main().catch(console.error);
