#!/usr/bin/env npx tsx
/**
 * Deckers Brands - Perplexity Web Visibility Study (Local Browser)
 * Uses Playwright's own browser - no proxy, no CDP
 */

import { firefox, Page } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const QUERIES_FILE = 'repository/results/glu/deckers-us-visibility/queries.json';
const RESULTS_FILE = 'repository/results/glu/deckers-us-visibility/perplexity-web-results.json';
const INTERMEDIATE_FILE = 'repository/results/glu/deckers-us-visibility/perplexity-web-intermediate.json';

const ALL_BRANDS = [
  'UGG', 'HOKA', 'Teva', 'Sanuk', 'Koolaburra',
  'Nike', 'Adidas', 'New Balance', 'Brooks', 'ASICS', 'Saucony', 'On Running',
  'Merrell', 'Salomon', 'Keen', 'Columbia', 'The North Face',
  'Birkenstock', 'Crocs', 'Allbirds', 'Vans', 'Converse',
  'Timberland', 'Dr. Martens', 'Clarks', 'Sorel',
  'Skechers', 'Reebok', 'Puma', 'Under Armour', 'Chaco', 'Bearpaw', 'EMU'
];

const DECKERS_BRANDS = ['UGG', 'HOKA', 'Teva', 'Sanuk', 'Koolaburra'];

function extractBrandMentions(text: string): { brand: string; count: number }[] {
  const mentions: { brand: string; count: number }[] = [];
  for (const brand of ALL_BRANDS) {
    const regex = new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = text.match(regex);
    if (matches && matches.length > 0) {
      mentions.push({ brand, count: matches.length });
    }
  }
  return mentions.sort((a, b) => b.count - a.count);
}

function loadQueries(): { query: string; category: string }[] {
  const data = JSON.parse(readFileSync(QUERIES_FILE, 'utf-8'));
  const queries: { query: string; category: string }[] = [];
  for (const category of data.categories) {
    for (const query of category.queries) {
      queries.push({ query, category: category.name });
    }
  }
  return queries;
}

async function askPerplexity(page: Page, query: string): Promise<string> {
  // Go to home to start fresh
  await page.goto('https://www.perplexity.ai/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Find textarea - try multiple selectors
  let textarea = page.locator('textarea[placeholder*="Ask"]').first();
  try {
    await textarea.waitFor({ timeout: 5000 });
  } catch {
    textarea = page.locator('textarea').first();
    await textarea.waitFor({ timeout: 5000 });
  }

  await textarea.click();
  await textarea.fill(query);
  await page.waitForTimeout(500);

  // Submit
  await page.keyboard.press('Enter');
  await page.waitForTimeout(5000);

  // Wait for response to complete
  let lastLength = 0;
  let stableCount = 0;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(1000);

    // Get all text content from the page
    const content = await page.locator('main').textContent().catch(() => '');

    if (content && content.length > 100) {
      if (content.length === lastLength) {
        stableCount++;
        if (stableCount >= 3) break;
      } else {
        stableCount = 0;
        lastLength = content.length;
      }
    }
  }

  // Extract response text
  const response = await page.locator('main').textContent().catch(() => '');

  if (!response || response.length < 50) {
    throw new Error('No response received');
  }

  return response;
}

async function main() {
  console.log('\n======================================================================');
  console.log('  DECKERS BRANDS - PERPLEXITY WEB VISIBILITY STUDY (LOCAL)');
  console.log('======================================================================\n');

  const allQueries = loadQueries();
  console.log(`Loaded ${allQueries.length} queries\n`);

  // Load intermediate results
  let results: any[] = [];
  let startIndex = 0;
  if (existsSync(INTERMEDIATE_FILE)) {
    const intermediate = JSON.parse(readFileSync(INTERMEDIATE_FILE, 'utf-8'));
    results = intermediate.results || [];
    startIndex = results.length;
    console.log(`[RESUME] Found ${startIndex} existing results\n`);
  }

  // Launch local browser (no proxy, visible)
  console.log('[INFO] Launching browser (no proxy)...\n');
  const browser = await firefox.launch({
    headless: false,
    slowMo: 100
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  // Go to Perplexity
  console.log('[INFO] Navigating to Perplexity...');
  await page.goto('https://www.perplexity.ai/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);

  // Take screenshot to see what we have
  await page.screenshot({ path: 'repository/results/glu/deckers-us-visibility/screenshots/perplexity-home.png' });
  console.log('[INFO] Screenshot saved');

  console.log('[OK] Browser ready\n');

  for (let i = startIndex; i < allQueries.length; i++) {
    const { query, category } = allQueries[i];
    process.stdout.write(`[${i + 1}/${allQueries.length}] "${query.substring(0, 35)}..." `);

    try {
      const startTime = Date.now();
      const response = await askPerplexity(page, query);
      const responseTimeMs = Date.now() - startTime;

      const brandMentions = extractBrandMentions(response);

      results.push({
        query,
        category,
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
        query,
        category,
        success: false,
        error: e.message,
        timestamp: new Date().toISOString()
      });
    }

    // Save intermediate every 5 queries
    if ((i + 1) % 5 === 0 || i === allQueries.length - 1) {
      writeFileSync(INTERMEDIATE_FILE, JSON.stringify({
        studyName: 'Deckers Brands - Perplexity Web Visibility Study',
        surface: 'perplexity-web',
        timestamp: new Date().toISOString(),
        totalQueries: allQueries.length,
        completedQueries: results.length,
        results
      }, null, 2));
    }

    await page.waitForTimeout(1000);
  }

  await browser.close();

  // Calculate summary
  const successfulResults = results.filter(r => r.success);
  const brandVisibility: Record<string, number> = {};

  for (const result of successfulResults) {
    for (const mention of result.brandMentions || []) {
      brandVisibility[mention.brand] = (brandVisibility[mention.brand] || 0) + mention.count;
    }
  }

  const deckersVisibility: Record<string, number> = {};
  for (const brand of DECKERS_BRANDS) {
    deckersVisibility[brand] = brandVisibility[brand] || 0;
  }

  const topCompetitors = Object.fromEntries(
    Object.entries(brandVisibility)
      .filter(([brand]) => !DECKERS_BRANDS.includes(brand))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
  );

  const finalResults = {
    studyName: 'Deckers Brands - Perplexity Web Visibility Study',
    surface: 'perplexity-web',
    timestamp: new Date().toISOString(),
    totalQueries: allQueries.length,
    successfulQueries: successfulResults.length,
    deckersVisibility,
    topCompetitors,
    results
  };

  writeFileSync(RESULTS_FILE, JSON.stringify(finalResults, null, 2));

  console.log('\n======================================================================');
  console.log('  PERPLEXITY WEB RESULTS SUMMARY');
  console.log('======================================================================\n');

  console.log(`Total: ${allQueries.length}, Successful: ${successfulResults.length}\n`);

  console.log('DECKERS BRANDS:');
  for (const [brand, count] of Object.entries(deckersVisibility).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${brand}: ${count}`);
  }

  console.log('\nTOP COMPETITORS:');
  for (const [brand, count] of Object.entries(topCompetitors).slice(0, 10)) {
    console.log(`  ${brand}: ${count}`);
  }

  console.log(`\n[OK] Results saved to ${RESULTS_FILE}\n`);
}

main().catch(console.error);
