#!/usr/bin/env npx tsx
/**
 * Run Meta AI queries with very slow human-like behavior
 */

import { chromium, Page } from 'playwright';
import * as fs from 'fs';

const MANIFEST_PATH = 'studies/city-of-boise-visibility.json';
const OUTPUT_PATH = 'studies/city-of-boise-complete-results.json';

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

async function runMetaAIQuery(page: Page, query: string): Promise<{ success: boolean; text: string; timeMs: number }> {
  const startTime = Date.now();

  try {
    await humanMouseMove(page);
    await delay(randomBetween(400, 1000));

    // Find input - Meta AI uses contenteditable div
    const inputSelectors = [
      'div[contenteditable="true"][data-lexical-editor="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
      'textarea[placeholder*="Ask"]',
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
      return { success: false, text: '', timeMs: Date.now() - startTime };
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

    // Find and click send button
    const sendSelectors = [
      'button[aria-label="Send message"]',
      'button[aria-label="Send"]',
      'div[role="button"][aria-label*="Send"]',
      'button:has(svg[viewBox="0 0 24 24"])',
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
      // Try pressing Enter as fallback
      await page.keyboard.press('Enter');
    }

    // Wait for response
    console.log(' waiting...');
    await delay(randomBetween(8000, 15000));

    // Wait for streaming to complete
    let attempts = 0;
    while (attempts < 20) {
      try {
        // Check if still generating
        const generating = page.locator('[class*="loading"], [class*="typing"], [class*="generating"]');
        if (await generating.isVisible({ timeout: 500 })) {
          await delay(2000);
          attempts++;
          continue;
        }
        break;
      } catch {
        break;
      }
    }

    await delay(randomBetween(1000, 2000));

    // Extract response
    const responseSelectors = [
      '[class*="markdown"]',
      '[class*="response"]',
      '[class*="message-content"]',
      'div[dir="auto"]',
    ];

    let text = '';
    for (const sel of responseSelectors) {
      try {
        const els = page.locator(sel);
        const count = await els.count();
        if (count > 0) {
          // Get the last response
          for (let i = count - 1; i >= 0; i--) {
            const el = els.nth(i);
            const t = await el.innerText({ timeout: 2000 });
            if (t && t.length > 100 && !t.includes('Ask Meta AI')) {
              text = t;
              break;
            }
          }
          if (text) break;
        }
      } catch { continue; }
    }

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
  console.log('  HUMAN-LIKE META AI QUERIES');
  console.log('='.repeat(60));

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  console.log(`\nLoaded ${manifest.queries.length} queries`);

  let allResults: QueryResult[] = [];
  if (fs.existsSync(OUTPUT_PATH)) {
    allResults = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8')).results || [];
  }

  const completed = new Set(
    allResults.filter(r => r.surfaceId === 'meta-ai-web').map(r => r.queryIndex)
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

  // Find Meta AI page
  let page = pages.find(p => /meta\.ai/.test(p.url()));
  if (!page) {
    console.log('Opening meta.ai...');
    page = await context.newPage();
    await page.goto('https://www.meta.ai');
    await delay(5000);
  }

  console.log(`Page: ${page.url()}\n`);
  console.log('-'.repeat(60));

  let successCount = 0;
  let failCount = 0;

  for (const queryNum of missing) {
    const query = manifest.queries[queryNum - 1];
    process.stdout.write(`[${queryNum}/${manifest.queries.length}] "${query.text.slice(0, 35)}..."`);

    const result = await runMetaAIQuery(page, query.text);

    const queryResult: QueryResult = {
      queryIndex: queryNum,
      queryText: query.text,
      category: query.category,
      surfaceId: 'meta-ai-web',
      status: result.success ? 'complete' : 'failed',
      responseText: result.text || undefined,
      responseTimeMs: result.timeMs,
      timestamp: new Date().toISOString(),
    };

    allResults = allResults.filter(r => !(r.surfaceId === 'meta-ai-web' && r.queryIndex === queryNum));
    allResults.push(queryResult);

    if (result.success) {
      successCount++;
      console.log(` ✓ (${(result.timeMs / 1000).toFixed(1)}s)`);
    } else {
      failCount++;
      console.log(` ✗`);
    }

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify({
      studyName: 'City of Boise AI Visibility Study',
      lastUpdate: new Date().toISOString(),
      results: allResults,
    }, null, 2));

    // Wait between queries
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
