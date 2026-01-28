#!/usr/bin/env npx tsx
/**
 * TASC Performance Visibility Study - Amazon Rufus via CDP
 *
 * PREREQUISITES:
 * 1. Chrome running with CDP on port 9222
 * 2. Navigate to https://www.amazon.com and log in
 * 3. Run this script
 */

import { chromium, type Page } from 'playwright';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';

const CDP_URL = 'http://localhost:9222';
const OUTPUT_DIR = 'packages/visibility-tool/results/tasc-visibility-study';
const OUTPUT_FILE = `${OUTPUT_DIR}/amazon-rufus-results.json`;
const INTERMEDIATE_FILE = `${OUTPUT_DIR}/amazon-rufus-intermediate.json`;
const MANIFEST_PATH = process.argv[2] || '/Users/edf/Downloads/tasc-visibility-study.json';

// Load manifest
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
const QUERIES = manifest.queries.map((q: { text: string }) => q.text);

// Brands to track
const BRANDS_TO_TRACK = [
  'TASC', 'TASC Performance',
  'Lululemon', 'Vuori', 'Cotopaxi',
  'Rhone', 'Nike', 'Under Armour', 'Free Fly', 'Cariloha',
  'Ibex', 'Allbirds', 'BAM', 'Boody', 'Bamtech',
  'Everlane', 'Patagonia', 'Girlfriend Collective',
  'Amazon', 'Nordstrom', 'REI',
];

interface QueryResult {
  queryIndex: number;
  query: string;
  timestamp: string;
  success: boolean;
  response: string | null;
  responseTimeMs: number;
  brandMentions: { brand: string; count: number; }[];
  error?: string;
}

function extractBrandMentions(text: string): { brand: string; count: number; }[] {
  const mentions: { brand: string; count: number; }[] = [];
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

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function queryRufus(query: string, queryIndex: number, page: Page): Promise<QueryResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  try {
    await page.bringToFront();

    // Navigate to Amazon if not already there
    const currentUrl = page.url();
    if (!currentUrl.includes('amazon.com')) {
      await page.goto('https://www.amazon.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(3000);
    }

    await sleep(1000);

    // Look for Rufus chat icon/button
    const rufusSelectors = [
      '[data-testid="rufus-chat-button"]',
      '[aria-label*="Rufus"]',
      '[aria-label*="rufus"]',
      'button[class*="rufus"]',
      '#rufus-trigger',
      '[data-component-type="rufus"]',
      'div[class*="chat-widget"]',
    ];

    let rufusFound = false;
    for (const sel of rufusSelectors) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 2000 })) {
          await btn.click();
          rufusFound = true;
          await sleep(2000);
          break;
        }
      } catch {
        continue;
      }
    }

    // If Rufus button not found, try looking for chat input directly
    // (it might already be open)
    if (!rufusFound) {
      // Try searching in the main search bar and see if Rufus responds
      const searchBox = page.locator('#twotabsearchtextbox, input[name="field-keywords"]').first();
      if (await searchBox.isVisible({ timeout: 3000 })) {
        await searchBox.click();
        await searchBox.fill(query);
        await sleep(500);

        // Check if Rufus suggestions appear
        const rufusSuggestions = page.locator('[class*="rufus"], [data-testid*="rufus"], #rufus-container');
        if (await rufusSuggestions.isVisible({ timeout: 5000 }).catch(() => false)) {
          rufusFound = true;
        } else {
          // Submit search and see if Rufus is in results
          await page.keyboard.press('Enter');
          await sleep(3000);

          // Look for Rufus in search results
          const rufusInResults = page.locator('[class*="rufus"], [data-testid*="rufus"]');
          if (await rufusInResults.isVisible({ timeout: 5000 }).catch(() => false)) {
            rufusFound = true;
          }
        }
      }
    }

    // Try to find and use the chat input
    const chatInputSelectors = [
      '[data-testid="rufus-input"]',
      'textarea[placeholder*="Ask"]',
      'input[placeholder*="Ask"]',
      '[class*="chat-input"]',
      '[class*="rufus"] textarea',
      '[class*="rufus"] input',
    ];

    let inputFound = false;
    for (const sel of chatInputSelectors) {
      try {
        const input = page.locator(sel).first();
        if (await input.isVisible({ timeout: 2000 })) {
          await input.click();
          await sleep(200);
          await input.fill(query);
          inputFound = true;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!inputFound) {
      // Rufus might not be available - record this
      return {
        queryIndex, query, timestamp,
        success: false, response: null,
        responseTimeMs: Date.now() - startTime,
        brandMentions: [],
        error: 'Rufus chat interface not found - may not be available in this region/account',
      };
    }

    await sleep(500);

    // Submit the query
    const submitSelectors = [
      'button[data-testid="rufus-send"]',
      'button[aria-label="Send"]',
      '[class*="send-button"]',
    ];

    let submitted = false;
    for (const sel of submitSelectors) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 1000 })) {
          await btn.click();
          submitted = true;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!submitted) {
      await page.keyboard.press('Enter');
    }

    await sleep(3000);

    // Wait for and extract response
    let response = '';
    const maxWait = 60000;
    const waitStart = Date.now();

    while (Date.now() - waitStart < maxWait) {
      // Look for Rufus response container
      const responseSelectors = [
        '[data-testid="rufus-response"]',
        '[class*="rufus-message"]',
        '[class*="chat-response"]',
        '[class*="assistant-message"]',
      ];

      for (const sel of responseSelectors) {
        try {
          const resp = page.locator(sel).last();
          if (await resp.isVisible({ timeout: 1000 })) {
            response = await resp.innerText();
            if (response && response.length > 20) break;
          }
        } catch {
          continue;
        }
      }

      if (response && response.length > 20) break;
      await sleep(1000);
    }

    if (!response || response.length < 20) {
      return {
        queryIndex, query, timestamp,
        success: false, response: null,
        responseTimeMs: Date.now() - startTime,
        brandMentions: [],
        error: 'No response received from Rufus',
      };
    }

    const brandMentions = extractBrandMentions(response);

    return {
      queryIndex, query, timestamp,
      success: true, response,
      responseTimeMs: Date.now() - startTime,
      brandMentions,
    };

  } catch (error) {
    return {
      queryIndex, query, timestamp,
      success: false, response: null,
      responseTimeMs: Date.now() - startTime,
      brandMentions: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  TASC PERFORMANCE VISIBILITY STUDY - Amazon Rufus');
  console.log('='.repeat(70));

  // Check CDP availability
  try {
    const response = await fetch(`${CDP_URL}/json/version`);
    if (!response.ok) throw new Error('CDP not available');
    console.log('Connected to Chrome CDP');
  } catch {
    console.error('\nChrome not running with CDP on port 9222');
    process.exit(1);
  }

  console.log(`\nTotal queries: ${QUERIES.length}`);
  console.log(`Brands tracked: ${BRANDS_TO_TRACK.length}`);

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let studyResults = {
    studyName: 'TASC Performance Visibility Study - Amazon Rufus',
    surface: 'amazon-rufus',
    location: 'United States',
    startTime: new Date().toISOString(),
    totalQueries: QUERIES.length,
    completedQueries: 0,
    successfulQueries: 0,
    results: [] as QueryResult[],
  };

  let startIndex = 0;

  if (existsSync(INTERMEDIATE_FILE)) {
    try {
      const existing = JSON.parse(readFileSync(INTERMEDIATE_FILE, 'utf-8'));
      studyResults = existing;
      startIndex = existing.completedQueries;
      console.log(`\nResuming from query ${startIndex + 1}...`);
    } catch {
      console.log('\nStarting fresh');
    }
  }

  console.log('\nConnecting to Chrome via CDP...');

  const browser = await chromium.connectOverCDP(CDP_URL);
  console.log('Connected to Chrome');

  const contexts = browser.contexts();
  if (contexts.length === 0) {
    console.error('No browser contexts found');
    process.exit(1);
  }

  const context = contexts[0];

  // Find Amazon tab
  let amazonPage: Page | null = null;

  for (const page of context.pages()) {
    const url = page.url();
    if (url.includes('amazon.com')) {
      amazonPage = page;
      console.log('Found Amazon tab');
      break;
    }
  }

  if (!amazonPage) {
    console.log('Opening new Amazon tab...');
    amazonPage = await context.newPage();
    await amazonPage.goto('https://www.amazon.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);
  }

  console.log('\n' + '='.repeat(70));
  console.log('  RUNNING QUERIES');
  console.log('='.repeat(70) + '\n');

  for (let i = startIndex; i < QUERIES.length; i++) {
    const query = QUERIES[i];
    const progress = `[${i + 1}/${QUERIES.length}]`;

    process.stdout.write(`${progress} "${query.slice(0, 40)}${query.length > 40 ? '...' : ''}" `);

    const result = await queryRufus(query, i, amazonPage);
    studyResults.results.push(result);
    studyResults.completedQueries++;

    if (result.success) {
      studyResults.successfulQueries++;
      const brands = result.brandMentions.slice(0, 3).map(b => b.brand).join(', ');
      console.log(`OK (${Math.round(result.responseTimeMs/1000)}s) [${brands || 'no brands'}]`);
    } else {
      console.log(`FAIL: ${result.error}`);
    }

    if ((i + 1) % 10 === 0) {
      writeFileSync(INTERMEDIATE_FILE, JSON.stringify(studyResults, null, 2));
      console.log(`\n   Progress saved (${i + 1}/${QUERIES.length})\n`);
    }

    if (i < QUERIES.length - 1) {
      await sleep(3000 + Math.random() * 2000);
    }
  }

  // Analyze results
  const brandCounts: Record<string, number> = {};
  const brandMentionsByQuery: Record<string, number> = {};

  for (const result of studyResults.results) {
    if (result.success && result.brandMentions) {
      for (const mention of result.brandMentions) {
        brandCounts[mention.brand] = (brandCounts[mention.brand] || 0) + mention.count;
        brandMentionsByQuery[mention.brand] = (brandMentionsByQuery[mention.brand] || 0) + 1;
      }
    }
  }

  const successfulCount = studyResults.successfulQueries;

  console.log('\n' + '='.repeat(70));
  console.log('  STUDY COMPLETE');
  console.log('='.repeat(70));
  console.log(`\nTotal: ${QUERIES.length} | Success: ${successfulCount} (${(successfulCount/QUERIES.length*100).toFixed(1)}%)`);

  console.log('\n--- Brand Visibility (queries mentioning brand) ---\n');

  const sortedBrands = Object.entries(brandMentionsByQuery).sort((a, b) => b[1] - a[1]);
  for (const [brand, queryCount] of sortedBrands) {
    const pct = (queryCount / successfulCount * 100).toFixed(1);
    const totalMentions = brandCounts[brand];
    const isClient = brand.toLowerCase().includes('tasc');
    const marker = isClient ? ' <- CLIENT' : '';
    console.log(`  ${brand.padEnd(20)} ${queryCount.toString().padStart(3)} queries  (${pct}%)  [${totalMentions} total mentions]${marker}`);
  }

  const finalOutput = {
    ...studyResults,
    endTime: new Date().toISOString(),
    summary: {
      total: QUERIES.length,
      successful: successfulCount,
      failed: QUERIES.length - successfulCount,
    },
    analysis: {
      brandVisibility: Object.fromEntries(
        sortedBrands.map(([brand, queryCount]) => [
          brand,
          {
            queriesAppearing: queryCount,
            percentOfQueries: (queryCount / successfulCount * 100).toFixed(1) + '%',
            totalMentions: brandCounts[brand],
          }
        ])
      ),
    },
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(finalOutput, null, 2));
  console.log(`\nResults saved to: ${OUTPUT_FILE}`);

  if (existsSync(INTERMEDIATE_FILE)) {
    const { unlinkSync } = await import('fs');
    unlinkSync(INTERMEDIATE_FILE);
  }

  await browser.close();
}

main().catch(console.error);
