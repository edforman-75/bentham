#!/usr/bin/env npx tsx
/**
 * Deckers Brands - Zappos Search Visibility Study
 * Tests how Deckers brands rank in Zappos search results
 */

import { chromium, Page } from 'playwright';
import { writeFileSync, readFileSync, existsSync } from 'fs';

const CDP_URL = 'http://localhost:9222';
const OUTPUT_FILE = 'repository/results/glu/deckers-us-visibility/zappos-search-results.json';
const INTERMEDIATE_FILE = 'repository/results/glu/deckers-us-visibility/zappos-search-intermediate.json';

// Deckers brands to track
const DECKERS_BRANDS = ['UGG', 'HOKA', 'Teva', 'Sanuk', 'Koolaburra'];

// Competitor brands
const COMPETITOR_BRANDS = [
  'Nike', 'Adidas', 'New Balance', 'Brooks', 'ASICS', 'Saucony', 'On Running',
  'Merrell', 'Salomon', 'Keen', 'Columbia', 'The North Face',
  'Birkenstock', 'Crocs', 'Allbirds', 'Vans', 'Converse',
  'Timberland', 'Dr. Martens', 'Clarks', 'Sorel'
];

const ALL_BRANDS = [...DECKERS_BRANDS, ...COMPETITOR_BRANDS];

// Load all 100 queries from queries.json
const queriesData = JSON.parse(readFileSync('repository/results/glu/deckers-us-visibility/queries.json', 'utf-8'));

interface QueryItem {
  id: string;
  query: string;
  category: string;
}

const QUERIES: QueryItem[] = [];
let queryIndex = 0;
for (const category of queriesData.categories) {
  for (const query of category.queries) {
    queryIndex++;
    const id = `${category.prefix}${String(queryIndex).padStart(2, '0')}`;
    QUERIES.push({
      id,
      query,
      category: category.name
    });
  }
}

interface SearchResult {
  position: number;
  brand: string;
  title: string;
  price: string;
}

interface QueryResult {
  queryId: string;
  query: string;
  category: string;
  success: boolean;
  totalResults: number;
  topResults: SearchResult[];
  deckersInTop10: string[];
  deckersPositions: { brand: string; position: number }[];
  competitorPositions: { brand: string; position: number }[];
  timestamp: string;
}

async function extractSearchResults(page: Page): Promise<SearchResult[]> {
  return await page.evaluate((brands) => {
    const results: SearchResult[] = [];

    // Try multiple selector strategies for Zappos
    let items = document.querySelectorAll('article[data-product-id]');
    if (items.length === 0) {
      items = document.querySelectorAll('[data-slot-id] article');
    }
    if (items.length === 0) {
      items = document.querySelectorAll('.product-card, .Hy-z_e');
    }
    if (items.length === 0) {
      // Try grabbing any article in the main content area
      items = document.querySelectorAll('main article, #searchPage article, [role="main"] article');
    }
    if (items.length === 0) {
      // Last resort - look for product links
      const links = document.querySelectorAll('a[href*="/p/"]');
      const seen = new Set<string>();
      let position = 0;

      links.forEach((link) => {
        const href = link.getAttribute('href') || '';
        if (seen.has(href) || position >= 20) return;
        seen.add(href);
        position++;

        const text = link.textContent?.trim() || '';
        let brand = '';

        for (const b of brands) {
          if (text.toLowerCase().includes(b.toLowerCase())) {
            brand = b;
            break;
          }
        }

        if (text && text.length > 5) {
          results.push({ position, brand, title: text.slice(0, 100), price: '' });
        }
      });

      return results;
    }

    let position = 0;
    items.forEach((item) => {
      position++;
      if (position > 20) return; // Only check top 20

      // Try multiple selectors for each field
      const titleEl = item.querySelector('a[href*="/p/"], [data-testid="product-name"], span[itemprop="name"]');
      const priceEl = item.querySelector('[data-testid="price"], span[itemprop="price"], .price');
      const brandEl = item.querySelector('[data-testid="brand-name"], span[itemprop="brand"]');

      const title = titleEl?.textContent?.trim() || '';
      const price = priceEl?.textContent?.trim() || '';
      let brand = brandEl?.textContent?.trim() || '';

      // Try to detect brand from title if not found
      if (!brand) {
        for (const b of brands) {
          if (title.toLowerCase().includes(b.toLowerCase())) {
            brand = b;
            break;
          }
        }
      }

      if (title) {
        results.push({ position, brand, title: title.slice(0, 100), price });
      }
    });

    return results;
  }, ALL_BRANDS);
}

async function runSearch(page: Page, query: string): Promise<SearchResult[]> {
  const searchUrl = `https://www.zappos.com/search?term=${encodeURIComponent(query)}`;
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1500);

  // Wait for results to load
  try {
    await page.waitForSelector('[data-testid="search-results-list"], .Hy-z_e, [itemprop="itemListElement"]', { timeout: 5000 });
  } catch {
    // Results may have loaded differently
  }

  await page.waitForTimeout(500);
  return await extractSearchResults(page);
}

function analyzeBrandPositions(results: SearchResult[]): { deckers: { brand: string; position: number }[]; competitors: { brand: string; position: number }[] } {
  const deckers: { brand: string; position: number }[] = [];
  const competitors: { brand: string; position: number }[] = [];

  for (const result of results) {
    const brandLower = result.brand.toLowerCase();
    const titleLower = result.title.toLowerCase();

    for (const brand of DECKERS_BRANDS) {
      if (brandLower.includes(brand.toLowerCase()) || titleLower.includes(brand.toLowerCase())) {
        deckers.push({ brand, position: result.position });
        break;
      }
    }

    for (const brand of COMPETITOR_BRANDS) {
      if (brandLower.includes(brand.toLowerCase()) || titleLower.includes(brand.toLowerCase())) {
        competitors.push({ brand, position: result.position });
        break;
      }
    }
  }

  return { deckers, competitors };
}

async function main() {
  console.log('\n======================================================================');
  console.log('  DECKERS BRANDS - ZAPPOS SEARCH VISIBILITY STUDY');
  console.log('======================================================================\n');

  // Check for existing progress
  let completedQueries: QueryResult[] = [];
  let startIndex = 0;

  if (existsSync(INTERMEDIATE_FILE)) {
    try {
      const data = JSON.parse(readFileSync(INTERMEDIATE_FILE, 'utf-8'));
      completedQueries = data.results || [];
      startIndex = completedQueries.length;
      console.log(`[RESUME] Found ${startIndex} completed queries\n`);
    } catch (e) {
      console.log('[WARN] Could not load intermediate file, starting fresh\n');
    }
  }

  // Connect to Chrome
  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_URL);
    console.log('[OK] Connected to Chrome via CDP');
  } catch (e) {
    console.error('[ERROR] Could not connect to Chrome. Is it running with --remote-debugging-port=9222?');
    process.exit(1);
  }

  const contexts = browser.contexts();
  if (contexts.length === 0) {
    console.error('[ERROR] No browser contexts found');
    process.exit(1);
  }

  const context = contexts[0];
  const page = await context.newPage();

  const results: QueryResult[] = [...completedQueries];

  console.log(`\nTotal queries: ${QUERIES.length}`);
  console.log(`Starting from: ${startIndex + 1}\n`);

  for (let i = startIndex; i < QUERIES.length; i++) {
    const q = QUERIES[i];
    const queryNum = i + 1;

    process.stdout.write(`[${queryNum}/${QUERIES.length}] "${q.query}"... `);

    try {
      const searchResults = await runSearch(page, q.query);
      const { deckers, competitors } = analyzeBrandPositions(searchResults);

      const deckersInTop10 = deckers.filter(d => d.position <= 10).map(d => d.brand);
      const uniqueDeckersTop10 = [...new Set(deckersInTop10)];

      const result: QueryResult = {
        queryId: q.id,
        query: q.query,
        category: q.category,
        success: true,
        totalResults: searchResults.length,
        topResults: searchResults.slice(0, 10),
        deckersInTop10: uniqueDeckersTop10,
        deckersPositions: deckers,
        competitorPositions: competitors,
        timestamp: new Date().toISOString()
      };

      results.push(result);

      const deckersStr = uniqueDeckersTop10.length > 0 ? `[${uniqueDeckersTop10.join(', ')}]` : '[no Deckers]';
      console.log(`[OK] ${searchResults.length} results ${deckersStr}`);

    } catch (e: any) {
      console.log(`[FAIL] ${e.message}`);
      results.push({
        queryId: q.id,
        query: q.query,
        category: q.category,
        success: false,
        totalResults: 0,
        topResults: [],
        deckersInTop10: [],
        deckersPositions: [],
        competitorPositions: [],
        timestamp: new Date().toISOString()
      });
    }

    // Save progress every 10 queries
    if (queryNum % 10 === 0) {
      writeFileSync(INTERMEDIATE_FILE, JSON.stringify({ results }, null, 2));
      console.log(`\n   [SAVE] Progress saved (${queryNum}/${QUERIES.length})\n`);
    }

    // Small delay between queries (reduced for speed)
    await page.waitForTimeout(500);
  }

  await page.close();

  // Calculate summary stats
  const successfulQueries = results.filter(r => r.success);
  const deckersVisibility: Record<string, number> = {};
  const competitorVisibility: Record<string, number> = {};

  for (const brand of DECKERS_BRANDS) {
    deckersVisibility[brand] = successfulQueries.filter(r => r.deckersInTop10.includes(brand)).length;
  }

  for (const r of successfulQueries) {
    const uniqueCompetitors = [...new Set(r.competitorPositions.filter(c => c.position <= 10).map(c => c.brand))];
    for (const brand of uniqueCompetitors) {
      competitorVisibility[brand] = (competitorVisibility[brand] || 0) + 1;
    }
  }

  // Sort competitors by visibility
  const sortedCompetitors = Object.entries(competitorVisibility)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const output = {
    studyName: 'Deckers Brands - Zappos Search Visibility Study',
    surface: 'zappos-search',
    timestamp: new Date().toISOString(),
    totalQueries: QUERIES.length,
    successfulQueries: successfulQueries.length,
    deckersVisibility,
    topCompetitors: Object.fromEntries(sortedCompetitors),
    results
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  console.log('\n======================================================================');
  console.log('  COMPLETE');
  console.log('======================================================================\n');

  console.log(`Success: ${successfulQueries.length}/${QUERIES.length}\n`);

  console.log('--- Deckers Brands (Top 10 Visibility) ---\n');
  for (const brand of DECKERS_BRANDS) {
    const count = deckersVisibility[brand];
    const pct = ((count / successfulQueries.length) * 100).toFixed(1);
    console.log(`  ${brand}: ${count} queries (${pct}%)`);
  }

  console.log('\n--- Top Competitors ---\n');
  for (const [brand, count] of sortedCompetitors) {
    const pct = ((count / successfulQueries.length) * 100).toFixed(1);
    console.log(`  ${brand}: ${count} queries (${pct}%)`);
  }

  console.log(`\n[OK] Saved to: ${OUTPUT_FILE}\n`);
}

main().catch(console.error);
