#!/usr/bin/env npx tsx
/**
 * TASC Performance Visibility Study - Amazon Search via CDP
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
const OUTPUT_FILE = `${OUTPUT_DIR}/amazon-search-results.json`;
const INTERMEDIATE_FILE = `${OUTPUT_DIR}/amazon-search-intermediate.json`;
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

interface SearchResult {
  position: number;
  title: string;
  brand?: string;
  price?: string;
  rating?: string;
  asin?: string;
}

interface QueryResult {
  queryIndex: number;
  query: string;
  timestamp: string;
  success: boolean;
  results: SearchResult[];
  responseTimeMs: number;
  brandMentions: { brand: string; count: number; }[];
  error?: string;
}

function extractBrandMentions(results: SearchResult[]): { brand: string; count: number; }[] {
  const mentions: { brand: string; count: number; }[] = [];

  // Combine all text from results
  let allText = results.map(r => `${r.title || ''} ${r.brand || ''}`).join(' ').toLowerCase();

  for (const brand of BRANDS_TO_TRACK) {
    const lowerBrand = brand.toLowerCase();
    let count = 0;
    let pos = 0;
    while ((pos = allText.indexOf(lowerBrand, pos)) !== -1) {
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

async function searchAmazon(query: string, queryIndex: number, page: Page): Promise<QueryResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  try {
    await page.bringToFront();

    // Navigate to Amazon if not already there
    const currentUrl = page.url();
    if (!currentUrl.includes('amazon.com')) {
      await page.goto('https://www.amazon.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(2000);
    }

    // Find and use search box
    const searchBox = page.locator('#twotabsearchtextbox, input[name="field-keywords"]').first();

    if (!(await searchBox.isVisible({ timeout: 5000 }))) {
      return {
        queryIndex, query, timestamp,
        success: false, results: [],
        responseTimeMs: Date.now() - startTime,
        brandMentions: [],
        error: 'Search box not found',
      };
    }

    // Clear and type query
    await searchBox.click();
    await searchBox.fill('');
    await sleep(200);
    await searchBox.fill(query);
    await sleep(500);

    // Submit search
    await page.keyboard.press('Enter');
    await sleep(3000);

    // Wait for results
    await page.waitForSelector('[data-component-type="s-search-result"], .s-result-item', { timeout: 15000 }).catch(() => {});

    // Extract search results
    const results = await page.evaluate(() => {
      const items: SearchResult[] = [];
      const resultElements = document.querySelectorAll('[data-component-type="s-search-result"]');

      resultElements.forEach((el, idx) => {
        if (idx >= 20) return; // Top 20 results

        const titleEl = el.querySelector('h2 a span, .a-link-normal .a-text-normal');
        const brandEl = el.querySelector('.a-row.a-size-base > .a-size-base, [data-cy="byline-info"]');
        const priceEl = el.querySelector('.a-price .a-offscreen');
        const ratingEl = el.querySelector('.a-icon-star-small .a-icon-alt, .a-icon-star .a-icon-alt');
        const asin = (el as HTMLElement).dataset.asin;

        items.push({
          position: idx + 1,
          title: titleEl?.textContent?.trim() || '',
          brand: brandEl?.textContent?.replace('Visit the ', '').replace(' Store', '').trim(),
          price: priceEl?.textContent?.trim(),
          rating: ratingEl?.textContent?.trim(),
          asin: asin,
        });
      });

      return items;
    });

    if (results.length === 0) {
      return {
        queryIndex, query, timestamp,
        success: false, results: [],
        responseTimeMs: Date.now() - startTime,
        brandMentions: [],
        error: 'No search results found',
      };
    }

    const brandMentions = extractBrandMentions(results);

    return {
      queryIndex, query, timestamp,
      success: true, results,
      responseTimeMs: Date.now() - startTime,
      brandMentions,
    };

  } catch (error) {
    return {
      queryIndex, query, timestamp,
      success: false, results: [],
      responseTimeMs: Date.now() - startTime,
      brandMentions: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  TASC PERFORMANCE VISIBILITY STUDY - Amazon Search');
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
    studyName: 'TASC Performance Visibility Study - Amazon Search',
    surface: 'amazon-search',
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

    const result = await searchAmazon(query, i, amazonPage);
    studyResults.results.push(result);
    studyResults.completedQueries++;

    if (result.success) {
      studyResults.successfulQueries++;
      const brands = result.brandMentions.slice(0, 3).map(b => b.brand).join(', ');
      console.log(`OK (${Math.round(result.responseTimeMs/1000)}s) ${result.results.length} results [${brands || 'no brands'}]`);
    } else {
      console.log(`FAIL: ${result.error}`);
    }

    if ((i + 1) % 10 === 0) {
      writeFileSync(INTERMEDIATE_FILE, JSON.stringify(studyResults, null, 2));
      console.log(`\n   Progress saved (${i + 1}/${QUERIES.length})\n`);
    }

    if (i < QUERIES.length - 1) {
      await sleep(2000 + Math.random() * 1000);
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

  console.log('\n--- Brand Visibility (queries with brand in results) ---\n');

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
