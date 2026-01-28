#!/usr/bin/env npx tsx
/**
 * TASC Performance Visibility Study - Perplexity Web (CDP)
 * Uses browser automation to query perplexity.ai
 */

import { chromium, Page } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const CDP_URL = 'http://localhost:9222';
const OUTPUT_DIR = 'packages/visibility-tool/results/tasc-visibility-study';
const OUTPUT_FILE = `${OUTPUT_DIR}/perplexity-web-results.json`;
const INTERMEDIATE_FILE = `${OUTPUT_DIR}/perplexity-web-intermediate.json`;
const MANIFEST_PATH = process.argv[2] || '/Users/edf/Downloads/tasc-visibility-study.json';

// Load manifest
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
const QUERIES = manifest.queries.map((q: { text: string }) => q.text);

// Brands to track
const BRANDS_TO_TRACK = [
  // Primary brand
  'TASC', 'TASC Performance',

  // Competitors
  'Lululemon', 'Vuori', 'Cotopaxi',
  'Rhone', 'Nike', 'Under Armour', 'Free Fly', 'Cariloha',
  'Ibex', 'Allbirds', 'BAM', 'Boody', 'Bamtech',
  'Everlane', 'Patagonia', 'Girlfriend Collective',

  // Retailers
  'Amazon', 'Nordstrom', 'REI',
];

function extractBrandMentions(text: string): { brand: string; count: number }[] {
  const mentions: { brand: string; count: number }[] = [];
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
      mentions.push({ brand, count });
    }
  }

  return mentions.sort((a, b) => b.count - a.count);
}

async function askPerplexity(page: Page, query: string): Promise<string> {
  // Navigate to home for new thread
  try {
    await page.goto('https://www.perplexity.ai/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);
  } catch {}

  // Find textarea - try multiple selectors for current Perplexity UI
  const textareaSelectors = [
    'textarea',
    '[contenteditable="true"]',
    'input[type="text"]',
    '[role="textbox"]',
    '[data-testid*="input"]',
    '[class*="search"] textarea',
    '[class*="search"] input',
  ];

  let textarea = null;
  for (const selector of textareaSelectors) {
    try {
      const el = page.locator(selector).first();
      await el.waitFor({ timeout: 3000, state: 'visible' });
      textarea = el;
      break;
    } catch {}
  }

  if (!textarea) {
    throw new Error('Could not find input field');
  }

  await textarea.click();
  await page.waitForTimeout(300);
  await textarea.fill(query);
  await page.waitForTimeout(300);

  // Submit - try Enter key or find submit button
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3000);

  // Wait for response to complete
  let lastLength = 0;
  let stableCount = 0;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(1000);

    // Get response content - try multiple selectors
    const responseSelectors = [
      '[class*="prose"]',
      '[class*="markdown"]',
      '[class*="answer"]',
      '[class*="response"]',
      '[data-testid*="answer"]',
      'article',
      '.text-base',
    ];

    let text = '';
    for (const selector of responseSelectors) {
      try {
        const el = page.locator(selector).last();
        text = await el.textContent({ timeout: 1000 }).catch(() => '');
        if (text && text.length > 100) break;
      } catch {}
    }

    if (text && text.length > 100) {
      if (text.length === lastLength) {
        stableCount++;
        if (stableCount >= 3) break;
      } else {
        stableCount = 0;
        lastLength = text.length;
      }
    }
  }

  // Extract final response
  const responseSelectors = [
    '[class*="prose"]',
    '[class*="markdown"]',
    '[class*="answer"]',
    'article',
  ];

  let response = '';
  for (const selector of responseSelectors) {
    try {
      const el = page.locator(selector).last();
      response = await el.textContent({ timeout: 2000 }).catch(() => '');
      if (response && response.length > 100) break;
    } catch {}
  }

  if (!response || response.length < 50) {
    // Try getting all text from main content area
    response = await page.locator('main').textContent().catch(() => '');
  }

  if (!response || response.length < 50) {
    throw new Error('No response received');
  }

  return response;
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  TASC PERFORMANCE VISIBILITY STUDY - Perplexity Web');
  console.log('='.repeat(70));

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Load intermediate results
  let results: any[] = [];
  let startIndex = 0;
  if (existsSync(INTERMEDIATE_FILE)) {
    const intermediate = JSON.parse(readFileSync(INTERMEDIATE_FILE, 'utf-8'));
    results = intermediate.results || [];
    startIndex = results.length;
    console.log(`\n[RESUME] Found ${startIndex} existing results\n`);
  }

  // Connect to Chrome
  console.log('Connecting to Chrome via CDP...');
  const browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  const context = contexts[0];

  // Find Perplexity tab
  let page: Page | null = null;
  for (const p of context.pages()) {
    if (p.url().includes('perplexity.ai')) {
      page = p;
      break;
    }
  }

  if (!page) {
    console.error('\n[ERROR] Perplexity tab not found.');
    console.error('Please open https://www.perplexity.ai in Chrome and make sure you are logged in.');
    console.error('Then run: /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222');
    process.exit(1);
  }

  console.log('[OK] Found Perplexity tab\n');

  let successCount = results.filter(r => r.success).length;
  const brandCounts: Record<string, number> = {};

  // Initialize brand counts from existing results
  for (const r of results) {
    if (r.success && r.brandMentions) {
      for (const m of r.brandMentions) {
        brandCounts[m.brand] = (brandCounts[m.brand] || 0) + 1;
      }
    }
  }

  for (let i = startIndex; i < QUERIES.length; i++) {
    const query = QUERIES[i];
    process.stdout.write(`[${i + 1}/${QUERIES.length}] "${query.substring(0, 40)}..." `);

    try {
      const startTime = Date.now();
      const response = await askPerplexity(page, query);
      const responseTimeMs = Date.now() - startTime;

      const brandMentions = extractBrandMentions(response);
      successCount++;

      for (const m of brandMentions) {
        brandCounts[m.brand] = (brandCounts[m.brand] || 0) + 1;
      }

      results.push({
        queryIndex: i,
        query,
        success: true,
        response,
        responseTimeMs,
        brandMentions,
        timestamp: new Date().toISOString()
      });

      const topBrands = brandMentions.slice(0, 3).map(b => b.brand).join(', ') || 'none';
      console.log(`[OK] ${Math.round(responseTimeMs/1000)}s [${topBrands}]`);

    } catch (e: any) {
      console.log(`[FAIL] ${e.message}`);
      results.push({
        queryIndex: i,
        query,
        success: false,
        error: e.message,
        timestamp: new Date().toISOString()
      });
    }

    // Save intermediate every 5 queries
    if ((i + 1) % 5 === 0 || i === QUERIES.length - 1) {
      writeFileSync(INTERMEDIATE_FILE, JSON.stringify({
        studyName: 'TASC Performance Visibility Study - Perplexity Web',
        surface: 'perplexity-web',
        timestamp: new Date().toISOString(),
        totalQueries: QUERIES.length,
        completedQueries: results.length,
        results
      }, null, 2));
      console.log(`  [SAVE] Progress saved`);
    }

    await page.waitForTimeout(1500);
  }

  // Calculate final summary
  const output = {
    studyName: 'TASC Performance Visibility Study - Perplexity Web',
    surface: 'perplexity-web',
    location: 'United States',
    timestamp: new Date().toISOString(),
    totalQueries: QUERIES.length,
    successfulQueries: successCount,
    results,
    analysis: {
      brandVisibility: Object.fromEntries(
        Object.entries(brandCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([brand, count]) => [
            brand,
            {
              queriesAppearing: count,
              percentOfQueries: successCount > 0 ? ((count / successCount) * 100).toFixed(1) + '%' : '0%',
            },
          ])
      ),
    },
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  console.log('\n' + '='.repeat(70));
  console.log('  COMPLETE');
  console.log('='.repeat(70));
  console.log(`\nSuccess: ${successCount}/${QUERIES.length}`);
  console.log(`Saved to: ${OUTPUT_FILE}`);

  console.log('\nTop brands:');
  const sorted = Object.entries(brandCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [brand, count] of sorted) {
    const isClient = brand.toLowerCase().includes('tasc');
    console.log(`  - ${brand}: ${count} queries${isClient ? ' <- CLIENT' : ''}`);
  }
}

main().catch(console.error);
