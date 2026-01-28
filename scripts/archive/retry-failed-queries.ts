#!/usr/bin/env npx tsx
/**
 * Retry Failed Queries Script
 *
 * Retries only the queries that failed or were not completed in a previous run.
 * Runs one surface at a time to avoid memory issues.
 */

import { chromium, Page } from 'playwright';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Configuration - Edit these based on parse results
// ============================================================================

const RETRY_DATA_PATH = '/tmp/retry-data.json';
const MANIFEST_PATH = 'studies/city-of-boise-visibility.json';
const OUTPUT_PATH = 'studies/city-of-boise-visibility-retry-results.json';

// ============================================================================
// Types
// ============================================================================

interface Manifest {
  version: string;
  name: string;
  description?: string;
  entity?: { name: string; type: string; state: string; website: string };
  queries: { text: string; category: string; tags?: string[] }[];
  surfaces: { id: string; name?: string; required?: boolean; weight?: number; skip?: boolean }[];
  locations: { id: string; name?: string; country?: string; region?: string }[];
  completionCriteria: {
    requiredSurfaces: { surfaceIds: string[]; coverageThreshold: number };
    maxRetriesPerCell: number;
  };
  qualityGates: { minResponseLength?: number; requireActualContent: boolean };
}

interface RetryData {
  completed: Record<string, number[]>;
  remaining: Record<string, number[]>;
}

interface QueryResult {
  success: boolean;
  responseText?: string;
  responseTimeMs: number;
  error?: string;
}

// ============================================================================
// CDP Surface Configurations
// ============================================================================

const SURFACE_PATTERNS: Record<string, RegExp> = {
  'chatgpt-web': /chatgpt\.com/,
  'google-ai-overview': /google\.com/,
  'google-search': /google\.com/,
  'bing-search': /bing\.com/,
  'meta-ai-web': /meta\.ai/,
};

const SURFACE_SELECTORS: Record<string, { input: string[]; submit: string[]; response: string[] }> = {
  'chatgpt-web': {
    input: ['#prompt-textarea', '[contenteditable="true"]'],
    submit: ['button[data-testid="send-button"]', 'button[data-testid="composer-send-button"]'],
    response: ['[data-message-author-role="assistant"] .markdown', '[data-message-author-role="assistant"]'],
  },
  'meta-ai-web': {
    input: [
      'div[contenteditable="true"][data-lexical-editor="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
      'textarea[placeholder*="Ask"]',
      'textarea[placeholder*="message"]',
      'textarea',
    ],
    submit: [
      'button[aria-label="Send message"]',
      'button[aria-label="Send"]',
      'div[role="button"][aria-label*="Send"]',
      'button:has(svg)',
    ],
    response: [
      '[class*="markdown"]',
      '[class*="response"]',
      '[class*="message-content"]',
      'div[dir="auto"]',
    ],
  },
};

// ============================================================================
// Utilities
// ============================================================================

function randomDelay(minMs: number, maxMs: number): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

async function humanPause(page: Page, type: 'quick' | 'normal' | 'long'): Promise<void> {
  const delays: Record<string, [number, number]> = {
    quick: [500, 1500],
    normal: [2000, 4000],
    long: [10000, 20000],
  };
  const [min, max] = delays[type];
  await page.waitForTimeout(randomDelay(min, max));
}

async function humanType(page: Page, text: string): Promise<void> {
  for (const char of text) {
    await page.keyboard.type(char, { delay: 0 });
    await page.waitForTimeout(randomDelay(30, 80));
  }
}

// ============================================================================
// Query Functions
// ============================================================================

async function queryChatGPT(page: Page, query: string): Promise<QueryResult> {
  const startTime = Date.now();
  try {
    await page.bringToFront();
    await humanPause(page, 'quick');

    // Find input
    const selectors = SURFACE_SELECTORS['chatgpt-web'];
    let inputFound = false;
    for (const sel of selectors.input) {
      try {
        const locator = page.locator(sel).first();
        if (await locator.isVisible({ timeout: 3000 })) {
          await locator.click();
          await page.keyboard.press('Meta+a');
          await page.waitForTimeout(200);
          await page.keyboard.press('Backspace');
          await humanType(page, query);
          inputFound = true;
          break;
        }
      } catch { continue; }
    }

    if (!inputFound) {
      return { success: false, responseTimeMs: Date.now() - startTime, error: 'Input not found' };
    }

    await humanPause(page, 'quick');

    // Submit
    for (const sel of selectors.submit) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 1000 })) {
          await btn.click();
          break;
        }
      } catch { continue; }
    }

    // Wait for response
    await page.waitForTimeout(3000);
    let response = '';
    const maxWait = 60000;
    const waitStart = Date.now();

    while (Date.now() - waitStart < maxWait) {
      for (const sel of selectors.response) {
        try {
          const text = await page.evaluate((s) => {
            const els = document.querySelectorAll(s);
            return els.length > 0 ? (els[els.length - 1] as HTMLElement).innerText : '';
          }, sel);
          if (text && text.length > response.length) {
            response = text;
          }
        } catch { continue; }
      }

      if (response.length > 100) {
        // Check if still streaming
        const prevLen = response.length;
        await page.waitForTimeout(2000);
        let newLen = 0;
        for (const sel of selectors.response) {
          try {
            const text = await page.evaluate((s) => {
              const els = document.querySelectorAll(s);
              return els.length > 0 ? (els[els.length - 1] as HTMLElement).innerText?.length || 0 : 0;
            }, sel);
            if (text > newLen) newLen = text;
          } catch { continue; }
        }
        if (newLen === prevLen) break;
      }
      await page.waitForTimeout(1000);
    }

    if (!response || response.length < 50) {
      return { success: false, responseTimeMs: Date.now() - startTime, error: 'No response' };
    }

    return { success: true, responseText: response, responseTimeMs: Date.now() - startTime };
  } catch (error) {
    return { success: false, responseTimeMs: Date.now() - startTime, error: String(error) };
  }
}

async function queryMetaAI(page: Page, query: string): Promise<QueryResult> {
  const startTime = Date.now();
  try {
    await page.bringToFront();
    await humanPause(page, 'quick');

    const selectors = SURFACE_SELECTORS['meta-ai-web'];
    let inputFound = false;

    for (const sel of selectors.input) {
      try {
        const locator = page.locator(sel).first();
        if (await locator.isVisible({ timeout: 3000 })) {
          await locator.click();
          await page.waitForTimeout(500);
          await page.keyboard.press('Meta+a');
          await page.waitForTimeout(200);
          await page.keyboard.press('Backspace');
          await humanType(page, query);
          inputFound = true;
          break;
        }
      } catch { continue; }
    }

    if (!inputFound) {
      return { success: false, responseTimeMs: Date.now() - startTime, error: 'Input not found' };
    }

    await humanPause(page, 'quick');

    // Submit
    let submitted = false;
    for (const sel of selectors.submit) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 1000 })) {
          await btn.click();
          submitted = true;
          break;
        }
      } catch { continue; }
    }
    if (!submitted) {
      await page.keyboard.press('Enter');
    }

    // Wait for response
    await page.waitForTimeout(5000);
    let response = '';
    const maxWait = 90000;
    const waitStart = Date.now();

    while (Date.now() - waitStart < maxWait) {
      for (const sel of selectors.response) {
        try {
          const text = await page.evaluate((s) => {
            const els = document.querySelectorAll(s);
            for (let i = els.length - 1; i >= 0; i--) {
              const t = (els[i] as HTMLElement).innerText?.trim();
              if (t && t.length > 50) return t;
            }
            return '';
          }, sel);
          if (text && text.length > response.length) {
            response = text;
          }
        } catch { continue; }
      }

      if (response.length > 100) {
        const prevLen = response.length;
        await page.waitForTimeout(3000);
        // Check stability
        let stable = true;
        for (const sel of selectors.response) {
          try {
            const text = await page.evaluate((s) => {
              const els = document.querySelectorAll(s);
              for (let i = els.length - 1; i >= 0; i--) {
                const t = (els[i] as HTMLElement).innerText?.trim();
                if (t && t.length > 50) return t;
              }
              return '';
            }, sel);
            if (text && text.length > response.length) {
              response = text;
              stable = false;
            }
          } catch { continue; }
        }
        if (stable && response.length === prevLen) break;
      }
      await page.waitForTimeout(2000);
    }

    if (!response || response.length < 50) {
      return { success: false, responseTimeMs: Date.now() - startTime, error: 'No response' };
    }

    return { success: true, responseText: response, responseTimeMs: Date.now() - startTime };
  } catch (error) {
    return { success: false, responseTimeMs: Date.now() - startTime, error: String(error) };
  }
}

async function queryGoogleAIOverview(page: Page, query: string): Promise<QueryResult> {
  const startTime = Date.now();
  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&udm=14`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(randomDelay(3000, 5000));

    const aiResponseSelectors = [
      '[data-sgrd="true"]',
      '.wDYxhc[data-md]',
      '.xpdopen .LGOjhe',
      '[data-attrid="wa:/description"]',
      'div[data-async-token]',
      '.kno-rdesc span',
    ];

    let response = '';
    const maxWait = 20000;
    const waitStart = Date.now();

    while (Date.now() - waitStart < maxWait) {
      for (const sel of aiResponseSelectors) {
        try {
          const elements = await page.locator(sel).all();
          for (const el of elements) {
            const text = await el.innerText().catch(() => '');
            if (text && text.length > 50 && text.length > response.length) {
              response = text.trim();
            }
          }
        } catch { continue; }
      }
      if (response.length > 100) break;
      await page.waitForTimeout(1000);
    }

    if (!response || response.length < 50) {
      return { success: false, responseTimeMs: Date.now() - startTime, error: 'No AI Overview' };
    }

    return { success: true, responseText: response, responseTimeMs: Date.now() - startTime };
  } catch (error) {
    return { success: false, responseTimeMs: Date.now() - startTime, error: String(error) };
  }
}

async function queryGoogleSearch(page: Page, query: string): Promise<QueryResult> {
  const startTime = Date.now();
  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&gl=us`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(randomDelay(3000, 5000));

    let response = '';

    // Featured snippet
    try {
      const snippet = await page.evaluate(() => {
        const selectors = ['.hgKElc', '.IZ6rdc', '.kno-rdesc span'];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) {
            const text = (el as HTMLElement).innerText?.trim();
            if (text && text.length > 50) return `**Featured Snippet:**\n${text}`;
          }
        }
        return '';
      });
      if (snippet) response = snippet;
    } catch { /* continue */ }

    // Organic results
    try {
      const organic = await page.evaluate(() => {
        const results: string[] = [];
        const searchResults = document.querySelectorAll('#rso .g, .MjjYud');
        for (const result of Array.from(searchResults).slice(0, 5)) {
          const titleEl = result.querySelector('h3');
          const snippetEl = result.querySelector('.VwiC3b');
          const title = titleEl ? (titleEl as HTMLElement).innerText?.trim() : '';
          const snippet = snippetEl ? (snippetEl as HTMLElement).innerText?.trim() : '';
          if (title && snippet && snippet.length > 30) {
            results.push(`**${title}**\n${snippet}`);
          }
        }
        return results.join('\n\n');
      });
      if (organic) response += (response ? '\n\n' : '') + organic;
    } catch { /* continue */ }

    if (!response || response.length < 50) {
      return { success: false, responseTimeMs: Date.now() - startTime, error: 'No results' };
    }

    return { success: true, responseText: response, responseTimeMs: Date.now() - startTime };
  } catch (error) {
    return { success: false, responseTimeMs: Date.now() - startTime, error: String(error) };
  }
}

async function queryBingSearch(page: Page, query: string): Promise<QueryResult> {
  const startTime = Date.now();
  try {
    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=en&cc=US`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(randomDelay(3000, 5000));

    let response = '';

    try {
      response = await page.evaluate(() => {
        const results: string[] = [];
        const algos = document.querySelectorAll('.b_algo');
        for (const algo of Array.from(algos).slice(0, 5)) {
          const titleEl = algo.querySelector('h2 a');
          const snippetEl = algo.querySelector('.b_caption p');
          const title = titleEl ? (titleEl as HTMLElement).innerText?.trim() : '';
          const snippet = snippetEl ? (snippetEl as HTMLElement).innerText?.trim() : '';
          if (title && snippet && snippet.length > 30) {
            results.push(`**${title}**\n${snippet}`);
          }
        }
        return results.join('\n\n');
      });
    } catch { /* continue */ }

    if (!response || response.length < 50) {
      return { success: false, responseTimeMs: Date.now() - startTime, error: 'No results' };
    }

    return { success: true, responseText: response, responseTimeMs: Date.now() - startTime };
  } catch (error) {
    return { success: false, responseTimeMs: Date.now() - startTime, error: String(error) };
  }
}

// ============================================================================
// Main Retry Logic
// ============================================================================

async function main() {
  console.log('='.repeat(70));
  console.log('  RETRY FAILED QUERIES');
  console.log('='.repeat(70));

  // Load retry data
  const retryData: RetryData = JSON.parse(fs.readFileSync(RETRY_DATA_PATH, 'utf-8'));
  const manifest: Manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));

  console.log('\nQueries to retry per surface:');
  for (const [surfaceId, remaining] of Object.entries(retryData.remaining)) {
    console.log(`  ${surfaceId}: ${remaining.length} queries`);
  }

  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];

  const results: any[] = [];
  const surfaceOrder = ['google-ai-overview', 'google-search', 'bing-search', 'chatgpt-web', 'meta-ai-web'];

  for (const surfaceId of surfaceOrder) {
    const remaining = retryData.remaining[surfaceId] || [];
    if (remaining.length === 0) {
      console.log(`\n✅ ${surfaceId}: No queries to retry`);
      continue;
    }

    console.log(`\n${'─'.repeat(70)}`);
    console.log(`  ${surfaceId.toUpperCase()}: Retrying ${remaining.length} queries`);
    console.log('─'.repeat(70));

    // Find the page for this surface
    let page: Page | undefined;
    const pattern = SURFACE_PATTERNS[surfaceId];
    if (pattern) {
      page = context.pages().find(p => pattern.test(p.url()));
    }

    // For search surfaces, use any Google/Bing page or open one
    if (!page && (surfaceId === 'google-search' || surfaceId === 'google-ai-overview')) {
      page = context.pages().find(p => /google\.com/.test(p.url()));
      if (!page) {
        page = await context.newPage();
        await page.goto('https://www.google.com');
      }
    }
    if (!page && surfaceId === 'bing-search') {
      page = context.pages().find(p => /bing\.com/.test(p.url()));
      if (!page) {
        page = await context.newPage();
        await page.goto('https://www.bing.com');
      }
    }

    if (!page) {
      console.log(`  ❌ No page found for ${surfaceId}`);
      continue;
    }

    for (let i = 0; i < remaining.length; i++) {
      const queryIndex = remaining[i] - 1; // Convert from 1-indexed to 0-indexed
      const query = manifest.queries[queryIndex];

      console.log(`  [${i + 1}/${remaining.length}] "${query.text.slice(0, 40)}..."`);

      let result: QueryResult;

      switch (surfaceId) {
        case 'chatgpt-web':
          result = await queryChatGPT(page, query.text);
          break;
        case 'meta-ai-web':
          result = await queryMetaAI(page, query.text);
          break;
        case 'google-ai-overview':
          result = await queryGoogleAIOverview(page, query.text);
          break;
        case 'google-search':
          result = await queryGoogleSearch(page, query.text);
          break;
        case 'bing-search':
          result = await queryBingSearch(page, query.text);
          break;
        default:
          result = { success: false, responseTimeMs: 0, error: 'Unknown surface' };
      }

      if (result.success) {
        console.log(`     ✅ (${(result.responseTimeMs / 1000).toFixed(1)}s)`);
      } else {
        console.log(`     ❌ ${result.error}`);
      }

      results.push({
        queryIndex: queryIndex + 1,
        queryText: query.text,
        category: query.category,
        surfaceId,
        status: result.success ? 'complete' : 'failed',
        responseText: result.responseText,
        responseTimeMs: result.responseTimeMs,
        error: result.error,
      });

      // Delay between queries
      if (i < remaining.length - 1) {
        const delay = randomDelay(12000, 20000);
        console.log(`     ⏳ Waiting ${(delay / 1000).toFixed(0)}s...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  await browser.close();

  // Save results
  const output = {
    timestamp: new Date().toISOString(),
    studyName: manifest.name,
    retryRun: true,
    summary: {
      total: results.length,
      successful: results.filter(r => r.status === 'complete').length,
      failed: results.filter(r => r.status === 'failed').length,
    },
    results,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

  console.log('\n' + '='.repeat(70));
  console.log('  RETRY COMPLETE');
  console.log('='.repeat(70));
  console.log(`\n  Total: ${output.summary.total}`);
  console.log(`  Successful: ${output.summary.successful}`);
  console.log(`  Failed: ${output.summary.failed}`);
  console.log(`\n  Results saved to: ${OUTPUT_PATH}`);
}

main().catch(console.error);
