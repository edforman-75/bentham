#!/usr/bin/env npx tsx
/**
 * Run ChatGPT queries with very slow human-like behavior
 * Uses separate output file to avoid race conditions
 */

import { chromium, Page } from 'playwright';
import * as fs from 'fs';

const MANIFEST_PATH = 'studies/city-of-boise-visibility.json';
const SHARED_OUTPUT_PATH = 'studies/city-of-boise-complete-results.json';
const OUTPUT_PATH = 'studies/city-of-boise-chatgpt-web-results.json';

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

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function humanType(page: Page, text: string): Promise<void> {
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    await page.keyboard.type(char, { delay: randomBetween(40, 150) });
    if (Math.random() < 0.06) {
      await delay(randomBetween(200, 600));
    }
  }
}

async function humanMouseMove(page: Page): Promise<void> {
  const viewport = page.viewportSize() || { width: 1200, height: 800 };
  const x = randomBetween(100, viewport.width - 100);
  const y = randomBetween(100, viewport.height - 200);
  await page.mouse.move(x, y, { steps: randomBetween(8, 20) });
  await delay(randomBetween(100, 300));
}

async function runChatGPTQuery(page: Page, query: string): Promise<{ success: boolean; text: string; timeMs: number }> {
  const startTime = Date.now();

  try {
    await humanMouseMove(page);
    await delay(randomBetween(400, 1000));

    // Find the input - ChatGPT uses a contenteditable div or textarea
    const inputSelectors = [
      '#prompt-textarea',
      'textarea[data-id="root"]',
      'div[contenteditable="true"][data-id]',
      'textarea[placeholder*="Message"]',
      'textarea',
    ];

    let inputEl = null;
    for (const sel of inputSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) {
          inputEl = el;
          break;
        }
      } catch { continue; }
    }

    if (!inputEl) {
      return { success: false, text: 'No input found', timeMs: Date.now() - startTime };
    }

    await inputEl.click();
    await delay(randomBetween(300, 600));

    // Clear existing text
    await page.keyboard.press('Meta+a');
    await delay(randomBetween(80, 150));
    await page.keyboard.press('Backspace');
    await delay(randomBetween(200, 500));

    // Type query slowly
    await humanType(page, query);
    await delay(randomBetween(400, 900));

    // Find and click send button or press Enter
    const sendSelectors = [
      'button[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
      'button[aria-label="Send message"]',
    ];

    let sent = false;
    for (const sel of sendSelectors) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 1500 })) {
          await delay(randomBetween(200, 500));
          await btn.click();
          sent = true;
          break;
        }
      } catch { continue; }
    }

    if (!sent) {
      // Press Enter as fallback
      await page.keyboard.press('Enter');
    }

    // Wait for response to start
    console.log(' waiting...');
    await delay(randomBetween(5000, 8000));

    // Wait for streaming to complete - look for the stop button to disappear
    let attempts = 0;
    while (attempts < 30) {
      try {
        const stopButton = page.locator('button[aria-label="Stop generating"]');
        if (await stopButton.isVisible({ timeout: 500 })) {
          await delay(2000);
          attempts++;
          continue;
        }
        break;
      } catch {
        break;
      }
    }

    await delay(randomBetween(1500, 3000));

    // Extract response - get the last assistant message
    const responseSelectors = [
      '[data-message-author-role="assistant"]',
      '.markdown.prose',
      '[class*="agent-turn"]',
      'div[data-testid*="conversation-turn"]',
    ];

    let text = '';
    for (const sel of responseSelectors) {
      try {
        const els = page.locator(sel);
        const count = await els.count();
        if (count > 0) {
          // Get the last response
          const el = els.last();
          const t = await el.innerText({ timeout: 3000 });
          if (t && t.length > 50) {
            text = t;
            break;
          }
        }
      } catch { continue; }
    }

    // Scroll a bit randomly
    if (Math.random() < 0.5) {
      await page.mouse.wheel(0, randomBetween(100, 300));
      await delay(randomBetween(500, 1500));
    }

    return {
      success: text.length > 50,
      text: text.slice(0, 10000),
      timeMs: Date.now() - startTime
    };
  } catch (error) {
    return { success: false, text: '', timeMs: Date.now() - startTime };
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('  HUMAN-LIKE CHATGPT QUERIES');
  console.log('='.repeat(60));

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  console.log(`\nLoaded ${manifest.queries.length} queries`);

  // Load existing results - first from surface-specific file, then bootstrap from shared
  let allResults: QueryResult[] = [];
  if (fs.existsSync(OUTPUT_PATH)) {
    allResults = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8')).results || [];
  } else if (fs.existsSync(SHARED_OUTPUT_PATH)) {
    // Bootstrap from shared file
    const sharedResults = JSON.parse(fs.readFileSync(SHARED_OUTPUT_PATH, 'utf-8')).results || [];
    allResults = sharedResults.filter((r: QueryResult) => r.surfaceId === 'chatgpt-web');
  }

  const completed = new Set(
    allResults.filter(r => r.status === 'complete').map(r => r.queryIndex)
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

  console.log('Connecting to Chrome...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const pages = context.pages();

  // Find ChatGPT page
  let page = pages.find(p => /chatgpt\.com|chat\.openai\.com/.test(p.url()));
  if (!page) {
    console.log('Opening chatgpt.com...');
    page = await context.newPage();
    await page.goto('https://chatgpt.com');
    await delay(5000);
  }

  console.log(`Page: ${page.url()}\n`);
  console.log('-'.repeat(60));

  let successCount = 0;
  let failCount = 0;

  for (const queryNum of missing) {
    const query = manifest.queries[queryNum - 1];
    process.stdout.write(`[${queryNum}/${manifest.queries.length}] "${query.text.slice(0, 35)}..."`);

    const result = await runChatGPTQuery(page, query.text);

    const queryResult: QueryResult = {
      queryIndex: queryNum,
      queryText: query.text,
      category: query.category,
      surfaceId: 'chatgpt-web',
      status: result.success ? 'complete' : 'failed',
      responseText: result.text || undefined,
      responseTimeMs: result.timeMs,
      timestamp: new Date().toISOString(),
    };

    allResults = allResults.filter(r => r.queryIndex !== queryNum);
    allResults.push(queryResult);

    if (result.success) {
      successCount++;
      console.log(` ✓ (${(result.timeMs / 1000).toFixed(1)}s)`);
    } else {
      failCount++;
      console.log(` ✗`);
    }

    // Save to surface-specific file
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify({
      studyName: 'City of Boise AI Visibility Study',
      lastUpdate: new Date().toISOString(),
      results: allResults,
    }, null, 2));

    // Wait between queries (15-30 seconds)
    const waitTime = randomBetween(15000, 30000);
    console.log(`   ⏳ Waiting ${Math.round(waitTime/1000)}s...`);
    await delay(waitTime / 2);
    if (Math.random() < 0.3) await humanMouseMove(page);
    await delay(waitTime / 2);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`  Done: ${successCount} success, ${failCount} failed`);
  console.log('='.repeat(60));
}

main().catch(console.error);
