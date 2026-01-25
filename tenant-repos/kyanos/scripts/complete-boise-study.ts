#!/usr/bin/env npx tsx
/**
 * Complete City of Boise AI Visibility Study
 *
 * Runs all 118 queries across all surfaces, tracking progress and
 * resuming from where we left off.
 */

import { chromium, Page } from 'playwright';
import * as fs from 'fs';

// ============================================================================
// Configuration
// ============================================================================

const MANIFEST_PATH = 'studies/city-of-boise-visibility.json';
const OUTPUT_PATH = 'studies/city-of-boise-complete-results.json';
const PROGRESS_PATH = '/tmp/boise-study-progress.json';

// Surfaces to run (google-ai-overview done via SerpAPI separately)
const SURFACES_TO_RUN = ['chatgpt-web', 'meta-ai-web', 'google-search', 'bing-search'];

// ============================================================================
// Types
// ============================================================================

interface Query {
  text: string;
  category: string;
  tags?: string[];
}

interface Manifest {
  queries: Query[];
  surfaces: { id: string; name?: string; weight?: number }[];
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

interface StudyResults {
  studyName: string;
  startTime: string;
  lastUpdate: string;
  summary: {
    total: number;
    complete: number;
    failed: number;
    pending: number;
  };
  bySurface: Record<string, { complete: number; failed: number; pending: number }>;
  results: QueryResult[];
}

// ============================================================================
// Surface Handlers
// ============================================================================

const SURFACE_CONFIG: Record<string, {
  urlPattern: RegExp;
  inputSelectors: string[];
  submitSelectors: string[];
  responseSelectors: string[];
  waitTime: number;
}> = {
  'chatgpt-web': {
    urlPattern: /chatgpt\.com/,
    inputSelectors: ['#prompt-textarea', '[contenteditable="true"]'],
    submitSelectors: ['button[data-testid="send-button"]', 'button[data-testid="composer-send-button"]'],
    responseSelectors: ['[data-message-author-role="assistant"] .markdown', '[data-message-author-role="assistant"]'],
    waitTime: 30000,
  },
  'meta-ai-web': {
    urlPattern: /meta\.ai/,
    inputSelectors: [
      'div[contenteditable="true"][data-lexical-editor="true"]',
      'div[contenteditable="true"]',
      'textarea',
    ],
    submitSelectors: [
      'button[aria-label="Send message"]',
      'button[aria-label="Send"]',
      'div[role="button"][aria-label*="Send"]',
    ],
    responseSelectors: [
      '[class*="markdown"]',
      '[class*="response"]',
      'div[dir="auto"]',
    ],
    waitTime: 30000,
  },
  'google-search': {
    urlPattern: /google\.com/,
    inputSelectors: ['textarea[name="q"]', 'input[name="q"]'],
    submitSelectors: [], // Press Enter instead
    responseSelectors: ['#search', '#rso'],
    waitTime: 5000,
  },
  'bing-search': {
    urlPattern: /bing\.com/,
    inputSelectors: ['textarea#sb_form_q', 'input#sb_form_q'],
    submitSelectors: [],
    responseSelectors: ['#b_results', '#b_content'],
    waitTime: 5000,
  },
};

// ============================================================================
// Utility Functions
// ============================================================================

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function humanType(page: Page, text: string): Promise<void> {
  for (const char of text) {
    await page.keyboard.type(char, { delay: randomDelay(30, 100) });
    if (Math.random() < 0.05) {
      await delay(randomDelay(100, 300));
    }
  }
}

// ============================================================================
// Query Execution
// ============================================================================

async function executeQuery(
  page: Page,
  query: string,
  surfaceId: string
): Promise<{ success: boolean; text: string; timeMs: number; error?: string }> {
  const config = SURFACE_CONFIG[surfaceId];
  if (!config) {
    return { success: false, text: '', timeMs: 0, error: `Unknown surface: ${surfaceId}` };
  }

  const startTime = Date.now();

  try {
    // Find input element
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

    // Clear and type query
    await inputEl.click();
    await delay(randomDelay(200, 500));
    await page.keyboard.press('Meta+a');
    await delay(100);
    await page.keyboard.press('Backspace');
    await delay(randomDelay(200, 400));
    await humanType(page, query);
    await delay(randomDelay(300, 600));

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

    // Wait for response
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
      return { success: true, text: responseText, timeMs: Date.now() - startTime };
    } else {
      return { success: false, text: '', timeMs: Date.now() - startTime, error: 'No response found' };
    }
  } catch (error) {
    return { success: false, text: '', timeMs: Date.now() - startTime, error: String(error) };
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('='.repeat(70));
  console.log('  CITY OF BOISE AI VISIBILITY STUDY - COMPLETE RUN');
  console.log('='.repeat(70));
  console.log();

  // Load manifest
  const manifest: Manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  console.log(`Loaded ${manifest.queries.length} queries`);
  console.log(`Surfaces to run: ${SURFACES_TO_RUN.join(', ')}`);
  console.log();

  // Load or initialize results
  let results: StudyResults;
  if (fs.existsSync(OUTPUT_PATH)) {
    results = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
    console.log(`Resuming: ${results.results.length} results already collected`);
  } else {
    results = {
      studyName: 'City of Boise AI Visibility Study',
      startTime: new Date().toISOString(),
      lastUpdate: new Date().toISOString(),
      summary: { total: manifest.queries.length * SURFACES_TO_RUN.length, complete: 0, failed: 0, pending: 0 },
      bySurface: {},
      results: [],
    };
  }

  // Build completion map
  const completed = new Set<string>();
  for (const r of results.results) {
    completed.add(`${r.surfaceId}:${r.queryIndex}`);
  }

  // Connect to Chrome
  console.log('\nConnecting to Chrome on port 9222...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const contexts = browser.contexts();
  const context = contexts[0];
  const pages = context.pages();

  // Find or create pages for each surface
  const surfacePages: Record<string, Page> = {};

  for (const surfaceId of SURFACES_TO_RUN) {
    const config = SURFACE_CONFIG[surfaceId];
    let page = pages.find(p => config.urlPattern.test(p.url()));

    if (!page) {
      console.log(`  Opening new tab for ${surfaceId}...`);
      page = await context.newPage();

      // Navigate to surface
      const urls: Record<string, string> = {
        'chatgpt-web': 'https://chatgpt.com',
        'meta-ai-web': 'https://www.meta.ai',
        'google-search': 'https://www.google.com',
        'bing-search': 'https://www.bing.com',
      };
      await page.goto(urls[surfaceId]);
      await delay(3000);
    }

    surfacePages[surfaceId] = page;
    console.log(`  ${surfaceId}: ${page.url()}`);
  }

  console.log('\n' + '-'.repeat(70));

  // Process each surface
  for (const surfaceId of SURFACES_TO_RUN) {
    const page = surfacePages[surfaceId];
    console.log(`\n[${surfaceId.toUpperCase()}]`);

    let surfaceComplete = 0;
    let surfaceFailed = 0;

    for (let i = 0; i < manifest.queries.length; i++) {
      const queryNum = i + 1;
      const key = `${surfaceId}:${queryNum}`;

      if (completed.has(key)) {
        continue; // Already done
      }

      const query = manifest.queries[i];
      process.stdout.write(`  [${queryNum}/${manifest.queries.length}] "${query.text.slice(0, 35)}..."  `);

      const result = await executeQuery(page, query.text, surfaceId);

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

      results.results.push(queryResult);
      completed.add(key);

      if (result.success) {
        surfaceComplete++;
        console.log(`✓ (${(result.timeMs / 1000).toFixed(1)}s)`);
      } else {
        surfaceFailed++;
        console.log(`✗ ${result.error || 'Failed'}`);
      }

      // Update summary
      results.lastUpdate = new Date().toISOString();
      results.summary.complete = results.results.filter(r => r.status === 'complete').length;
      results.summary.failed = results.results.filter(r => r.status === 'failed').length;
      results.summary.pending = results.summary.total - results.summary.complete - results.summary.failed;

      // Save progress
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));

      // Delay between queries
      await delay(randomDelay(2000, 4000));
    }

    console.log(`  Surface complete: ${surfaceComplete} success, ${surfaceFailed} failed`);
  }

  // Final summary
  console.log('\n' + '='.repeat(70));
  console.log('  STUDY COMPLETE');
  console.log('='.repeat(70));
  console.log(`\n  Total: ${results.summary.total}`);
  console.log(`  Complete: ${results.summary.complete}`);
  console.log(`  Failed: ${results.summary.failed}`);
  console.log(`  Results saved to: ${OUTPUT_PATH}\n`);
}

main().catch(console.error);
