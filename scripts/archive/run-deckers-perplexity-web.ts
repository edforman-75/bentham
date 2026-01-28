#!/usr/bin/env npx tsx
/**
 * Deckers Brands - Perplexity Web Visibility Study (CDP)
 * Fast browser automation
 */

import { chromium, Page } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const CDP_URL = 'http://localhost:9222';
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
  // Click new thread button if available
  try {
    const newThread = page.locator('button:has-text("New"), a[href="/"]').first();
    await newThread.click({ timeout: 2000 });
    await page.waitForTimeout(500);
  } catch {}

  // Find textarea and enter query
  const textarea = page.locator('textarea[placeholder*="Ask"], textarea[placeholder*="anything"], textarea').first();
  await textarea.waitFor({ timeout: 10000 });
  await textarea.fill(query);
  await page.waitForTimeout(300);

  // Submit
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);

  // Wait for response to complete
  let lastLength = 0;
  let stableCount = 0;
  for (let i = 0; i < 45; i++) {
    await page.waitForTimeout(1000);

    // Get response content
    const responseEl = page.locator('[class*="prose"], [class*="markdown"], .response-content, [data-testid*="answer"]').last();
    const text = await responseEl.textContent().catch(() => '');

    if (text && text.length > 50) {
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
  const responseEl = page.locator('[class*="prose"], [class*="markdown"], .response-content').last();
  const response = await responseEl.textContent().catch(() => '');

  if (!response || response.length < 50) {
    throw new Error('No response received');
  }

  return response;
}

async function main() {
  console.log('\n======================================================================');
  console.log('  DECKERS BRANDS - PERPLEXITY WEB VISIBILITY STUDY');
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

  // Connect to Chrome
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
    console.error('[ERROR] Perplexity tab not found. Please open perplexity.ai');
    process.exit(1);
  }

  console.log('[OK] Found Perplexity tab\n');

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

    // Save intermediate
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

    await page.waitForTimeout(1500);
  }

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
