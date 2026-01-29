#!/usr/bin/env npx tsx
/**
 * Run Copilot study with manual Cloudflare bypass
 *
 * 1. Opens visible browser
 * 2. User bypasses Cloudflare challenge
 * 3. Script takes over to run queries
 */

import * as fs from 'fs';
import * as path from 'path';
import { chromium, Page } from 'playwright';
import * as readline from 'readline';

// Load manifest
const MANIFEST_PATH = process.argv[2] || '/Users/edf/Downloads/tasc-visibility-study.json';
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
const OUTPUT_DIR = `packages/visibility-tool/results/${manifest.id || 'visibility-study'}`;

const COPILOT_URL = 'https://copilot.microsoft.com/';
const SESSION_PATH = '.copilot-session.json';

// Brands to track
const PRIMARY_BRAND = manifest.brands.find((b: any) => b.category === 'primary')?.name || '';
const ALL_BRANDS = manifest.brands.map((b: any) => b.name);
const RETAILERS = ['Amazon', 'Nordstrom', 'REI', "Dick's Sporting Goods", 'Target', 'Walmart'];
const BRANDS_TO_TRACK = [...ALL_BRANDS, ...RETAILERS];

interface BrandMention {
  brand: string;
  count: number;
  isClient: boolean;
}

function extractBrandMentions(text: string): BrandMention[] {
  const mentions: BrandMention[] = [];
  const lowerText = text.toLowerCase();

  for (const brand of BRANDS_TO_TRACK) {
    const lowerBrand = brand.toLowerCase();
    let count = 0;
    let pos = 0;
    while ((pos = lowerText.indexOf(lowerBrand, pos)) !== -1) {
      count++;
      pos += lowerBrand.length;
    }
    if (count > 0) {
      mentions.push({
        brand,
        count,
        isClient: brand.toLowerCase() === PRIMARY_BRAND.toLowerCase(),
      });
    }
  }

  return mentions.sort((a, b) => b.count - a.count);
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

async function waitForUserInput(prompt: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

async function waitForCopilotReady(page: Page): Promise<boolean> {
  console.log('Waiting for Copilot to be ready...');

  const inputSelectors = [
    '#userInput',
    'textarea[placeholder*="Ask"]',
    'textarea[placeholder*="Message"]',
    'textarea',
  ];

  for (let i = 0; i < 60; i++) {
    for (const selector of inputSelectors) {
      try {
        const element = await page.$(selector);
        if (element && await element.isVisible()) {
          console.log('✓ Copilot is ready!');
          return true;
        }
      } catch {
        // Continue
      }
    }
    await page.waitForTimeout(1000);
    process.stdout.write('.');
  }

  return false;
}

async function queryAndWait(page: Page, query: string): Promise<{ text: string; citations: any[] }> {
  // Find input
  const inputSelectors = ['textarea', '#userInput', '[contenteditable="true"]'];

  let input = null;
  for (const selector of inputSelectors) {
    input = await page.$(selector);
    if (input && await input.isVisible()) break;
  }

  if (!input) {
    throw new Error('Input not found');
  }

  // Clear and type query
  await input.fill(query);
  await page.waitForTimeout(300);

  // Submit with Enter
  await input.press('Enter');

  // Wait for response
  await page.waitForTimeout(5000);

  // Wait for stop button to appear then disappear (indicates streaming complete)
  try {
    await page.waitForSelector('button:has-text("Stop"), [aria-label*="Stop"]', { timeout: 10000 });
    await page.waitForSelector('button:has-text("Stop"), [aria-label*="Stop"]', { state: 'hidden', timeout: 120000 });
  } catch {
    // May not have stop button
  }

  await page.waitForTimeout(2000);

  // Extract response - look for AI message content
  const text = await page.evaluate(() => {
    // Try various selectors for AI response
    const selectors = [
      '[data-content="ai-message"]',
      '.prose',
      '[role="article"]',
      '.response-message',
    ];

    for (const sel of selectors) {
      const elements = document.querySelectorAll(sel);
      if (elements.length > 0) {
        // Get last (most recent) response
        const last = elements[elements.length - 1];
        const text = last.textContent?.trim();
        if (text && text.length > 50) {
          return text;
        }
      }
    }

    return '';
  });

  // Extract citations
  const citations = await page.evaluate(() => {
    const links: any[] = [];
    const anchors = document.querySelectorAll('a[href^="http"]');
    const seen = new Set();

    anchors.forEach((a, i) => {
      const url = a.getAttribute('href') || '';
      if (!url.includes('microsoft.com') &&
          !url.includes('bing.com') &&
          !seen.has(url)) {
        seen.add(url);
        links.push({
          position: links.length + 1,
          title: a.textContent?.trim() || '',
          url,
        });
      }
    });

    return links;
  });

  return {
    text,
    citations: citations.map(c => ({ ...c, domain: extractDomain(c.url) }))
  };
}

async function main() {
  console.log('\n' + '═'.repeat(70));
  console.log('  COPILOT VISIBILITY STUDY');
  console.log('═'.repeat(70));
  console.log(`\n  Study: ${manifest.name}`);
  console.log(`  Queries: ${manifest.queries.length}`);
  console.log(`  Primary Brand: ${PRIMARY_BRAND}`);

  // Create output dir
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Load existing results and find failed queries to retry
  const outputPath = path.join(OUTPUT_DIR, 'bing-copilot-results.json');
  let results: any[] = [];
  let queriesToRun: number[] = [];

  if (fs.existsSync(outputPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      results = existing.results || [];

      // Find completed query indices
      const completedIndices = new Set(
        results.filter((r: any) => r.status === 'complete').map((r: any) => r.queryIndex)
      );

      // Find queries that need to be run (not completed)
      for (let i = 0; i < manifest.queries.length; i++) {
        if (!completedIndices.has(i + 1)) {
          queriesToRun.push(i);
        }
      }

      const complete = completedIndices.size;
      console.log(`\n  Progress: ${complete}/${manifest.queries.length} complete`);
      console.log(`  Retrying ${queriesToRun.length} failed/missing queries...`);
    } catch {
      // Start fresh - run all queries
      queriesToRun = manifest.queries.map((_: any, i: number) => i);
    }
  } else {
    // No existing results - run all queries
    queriesToRun = manifest.queries.map((_: any, i: number) => i);
    console.log(`\n  Starting fresh - ${queriesToRun.length} queries to run...`);
  }

  if (queriesToRun.length === 0) {
    console.log('\n  All queries already completed!');
    return;
  }

  // Launch browser - Use user's Chrome with their profile
  console.log('\n  Launching Chrome with your profile...');
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',  // Use installed Chrome, not Chromium
    args: [
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const context = fs.existsSync(SESSION_PATH)
    ? await browser.newContext({ storageState: SESSION_PATH })
    : await browser.newContext();

  const page = await context.newPage();

  try {
    await page.goto(COPILOT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    // Wait for user to bypass Cloudflare - auto-detect when ready
    console.log('\n  ⚠️  If you see a Cloudflare challenge, please complete it');
    console.log('  Waiting for Copilot to be ready...\n');

    // Wait up to 5 minutes for user to bypass Cloudflare
    let ready = false;
    for (let attempt = 0; attempt < 300; attempt++) {
      ready = await waitForCopilotReady(page);
      if (ready) break;
      await page.waitForTimeout(1000);
    }

    if (!ready) {
      console.log('\n  ✗ Copilot not ready after 5 minutes. Exiting.');
      await browser.close();
      return;
    }

    // Save session after Cloudflare bypass
    await context.storageState({ path: SESSION_PATH });
    console.log('  Session saved.\n');

    console.log('  Starting queries...\n');

    // Run queries (only failed/missing ones)
    for (const i of queriesToRun) {
      const query = manifest.queries[i];
      const startTime = Date.now();

      process.stdout.write(`  [${i + 1}/${manifest.queries.length}] "${query.text.slice(0, 40)}..."  `);

      try {
        // Start new conversation for each query
        await page.goto(COPILOT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);

        const { text, citations } = await queryAndWait(page, query.text);
        const timeMs = Date.now() - startTime;

        const brandMentions = extractBrandMentions(text);
        const hasContent = text.length > 50;

        if (hasContent) {
          const topBrands = brandMentions.slice(0, 2).map(b => b.brand).join(', ');
          console.log(`✓ (${(timeMs / 1000).toFixed(1)}s) [${citations.length} citations] [${topBrands || 'no brands'}]`);
        } else {
          console.log(`✗ No response (${(timeMs / 1000).toFixed(1)}s)`);
        }

        // Update or add result
        const newResult = {
          queryIndex: i + 1,
          queryText: query.text,
          category: query.category,
          surface: 'bing-copilot',
          status: hasContent ? 'complete' : 'failed',
          responseText: text,
          citations,
          brandMentions,
          responseTimeMs: timeMs,
          hasAiResponse: true,
        };
        const existingIdx = results.findIndex(r => r.queryIndex === i + 1);
        if (existingIdx >= 0) {
          results[existingIdx] = newResult;
        } else {
          results.push(newResult);
        }

      } catch (error) {
        console.log(`✗ Error: ${error}`);
        const newResult = {
          queryIndex: i + 1,
          queryText: query.text,
          category: query.category,
          surface: 'bing-copilot',
          status: 'failed',
          responseText: '',
          citations: [],
          brandMentions: [],
          responseTimeMs: Date.now() - startTime,
          error: String(error),
        };
        const existingIdx = results.findIndex(r => r.queryIndex === i + 1);
        if (existingIdx >= 0) {
          results[existingIdx] = newResult;
        } else {
          results.push(newResult);
        }
      }

      // Save progress after each retry
      {
        const output = {
          timestamp: new Date().toISOString(),
          studyName: `${manifest.name} - bing-copilot`,
          manifest: {
            id: manifest.id,
            name: manifest.name,
            queryCount: manifest.queries.length,
            primaryBrand: PRIMARY_BRAND,
          },
          surface: 'bing-copilot',
          summary: {
            total: manifest.queries.length,
            successful: results.filter(r => r.status === 'complete').length,
            failed: results.filter(r => r.status === 'failed').length,
          },
          results,
        };
        fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
      }

      // Delay between queries
      await page.waitForTimeout(3000);
    }

    console.log(`\n✓ Complete: ${results.filter(r => r.status === 'complete').length}/${manifest.queries.length} successful`);

  } finally {
    await browser.close();
  }
}

main().catch(console.error);
