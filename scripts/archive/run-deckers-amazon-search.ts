#!/usr/bin/env npx tsx
/**
 * Deckers Brands - Amazon Search Visibility Study (Non-Rufus)
 * Tests regular Amazon search results for brand visibility
 */

import { chromium, Page } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const CDP_URL = 'http://localhost:9222';
const QUERIES_FILE = 'repository/results/glu/deckers-us-visibility/queries.json';
const RESULTS_FILE = 'repository/results/glu/deckers-us-visibility/amazon-search-results.json';
const INTERMEDIATE_FILE = 'repository/results/glu/deckers-us-visibility/amazon-search-intermediate.json';

const ALL_BRANDS = [
  'UGG', 'HOKA', 'Teva', 'Sanuk', 'Koolaburra',
  'Nike', 'Adidas', 'New Balance', 'Brooks', 'ASICS', 'Saucony', 'On Running', 'On ',
  'Merrell', 'Salomon', 'Keen', 'Columbia', 'The North Face', 'North Face',
  'Birkenstock', 'Crocs', 'Allbirds', 'Vans', 'Converse',
  'Timberland', 'Dr. Martens', 'Clarks', 'Sorel',
  'Skechers', 'Reebok', 'Puma', 'Under Armour', 'Chaco', 'Bearpaw', 'EMU'
];

const DECKERS_BRANDS = ['UGG', 'HOKA', 'Teva', 'Sanuk', 'Koolaburra'];

interface SearchResult {
  position: number;
  title: string;
  brand: string | null;
  price: string | null;
  rating: string | null;
  sponsored: boolean;
  asin: string | null;
}

interface QueryResult {
  query: string;
  shortenedQuery: string;
  category: string;
  success: boolean;
  results: SearchResult[];
  totalResults: number;
  deckersResults: number;
  brandCounts: Record<string, number>;
  error?: string;
  timestamp: string;
}

// Shorten queries for Amazon search (remove evaluative words)
function shortenQuery(query: string): string {
  return query
    .replace(/^(best|most|top rated|top)\s+/i, '')
    .replace(/\s+(2024|2025|2026)$/i, '')
    .replace(/\s+that are cheaper$/i, '')
    .replace(/^what\s+/i, '')
    .replace(/\s+are best$/i, '')
    .trim();
}

function detectBrand(text: string): string | null {
  const upperText = text.toUpperCase();

  // Check for exact brand matches
  for (const brand of ALL_BRANDS) {
    const brandUpper = brand.toUpperCase();
    // Handle "On Running" / "On " specially
    if (brand === 'On Running' || brand === 'On ') {
      if (upperText.includes('ON RUNNING') || /\bON\s+(CLOUD|RUNNING|MEN|WOMEN)/i.test(text)) {
        return 'On Running';
      }
    } else if (upperText.includes(brandUpper)) {
      return brand;
    }
  }
  return null;
}

async function extractSearchResults(page: Page): Promise<SearchResult[]> {
  return await page.evaluate((brands) => {
    const results: SearchResult[] = [];

    // Amazon search result selectors
    const items = document.querySelectorAll('[data-component-type="s-search-result"]');

    items.forEach((item, index) => {
      if (index >= 20) return; // Top 20 results

      const titleEl = item.querySelector('h2 a span, h2 span');
      const title = titleEl?.textContent?.trim() || '';

      const priceEl = item.querySelector('.a-price .a-offscreen');
      const price = priceEl?.textContent?.trim() || null;

      const ratingEl = item.querySelector('.a-icon-star-small .a-icon-alt, .a-icon-star .a-icon-alt');
      const rating = ratingEl?.textContent?.trim() || null;

      const sponsored = !!item.querySelector('[data-component-type="sp-sponsored-result"], .s-label-popover-default');

      const asin = item.getAttribute('data-asin') || null;

      // Try to detect brand from title
      let brand: string | null = null;
      const upperTitle = title.toUpperCase();
      for (const b of brands) {
        if (b === 'On Running' || b === 'On ') {
          if (upperTitle.includes('ON RUNNING') || /\bON\s+(CLOUD|RUNNING)/i.test(title)) {
            brand = 'On Running';
            break;
          }
        } else if (upperTitle.includes(b.toUpperCase())) {
          brand = b;
          break;
        }
      }

      if (title) {
        results.push({
          position: index + 1,
          title,
          brand,
          price,
          rating,
          sponsored,
          asin
        });
      }
    });

    return results;
  }, ALL_BRANDS);
}

async function searchAmazon(page: Page, query: string): Promise<SearchResult[]> {
  const searchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(query)}`;

  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Check for CAPTCHA
  const captcha = await page.$('#captchacharacters, .a-box-inner form[action*="validateCaptcha"]');
  if (captcha) {
    throw new Error('CAPTCHA detected - please solve it manually');
  }

  // Wait for results
  await page.waitForSelector('[data-component-type="s-search-result"]', { timeout: 10000 }).catch(() => {});

  return await extractSearchResults(page);
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

async function main() {
  console.log('\n======================================================================');
  console.log('  DECKERS BRANDS - AMAZON SEARCH VISIBILITY STUDY');
  console.log('======================================================================\n');

  const allQueries = loadQueries();
  console.log(`Loaded ${allQueries.length} queries\n`);

  // Load intermediate results if they exist
  let results: QueryResult[] = [];
  let startIndex = 0;

  if (existsSync(INTERMEDIATE_FILE)) {
    const intermediate = JSON.parse(readFileSync(INTERMEDIATE_FILE, 'utf-8'));
    results = intermediate.results || [];
    startIndex = results.length;
    console.log(`[RESUME] Found ${startIndex} existing results, continuing from query ${startIndex + 1}\n`);
  }

  // Connect to Chrome via CDP
  const browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  const context = contexts[0];

  // Find or create Amazon tab
  let page: Page | null = null;
  for (const p of context.pages()) {
    if (p.url().includes('amazon.com')) {
      page = p;
      break;
    }
  }

  if (!page) {
    console.log('[INFO] No Amazon tab found, creating new one...');
    page = await context.newPage();
    await page.goto('https://www.amazon.com', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
  }

  console.log('[OK] Connected to Amazon\n');

  // Check if logged in
  const signInLink = await page.$('#nav-link-accountList[data-nav-role="signin"]');
  if (signInLink) {
    console.log('[WARNING] Not logged in to Amazon - results may vary\n');
  }

  // Process queries
  for (let i = startIndex; i < allQueries.length; i++) {
    const { query, category } = allQueries[i];
    const shortenedQuery = shortenQuery(query);

    process.stdout.write(`[${i + 1}/${allQueries.length}] "${shortenedQuery}" ... `);

    try {
      const searchResults = await searchAmazon(page, shortenedQuery);

      // Count brands
      const brandCounts: Record<string, number> = {};
      let deckersResults = 0;

      for (const result of searchResults) {
        if (result.brand) {
          brandCounts[result.brand] = (brandCounts[result.brand] || 0) + 1;
          if (DECKERS_BRANDS.includes(result.brand)) {
            deckersResults++;
          }
        }
      }

      const queryResult: QueryResult = {
        query,
        shortenedQuery,
        category,
        success: true,
        results: searchResults,
        totalResults: searchResults.length,
        deckersResults,
        brandCounts,
        timestamp: new Date().toISOString()
      };

      results.push(queryResult);

      // Show top brands
      const topBrands = Object.entries(brandCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([brand, count]) => `${brand}(${count})`)
        .join(', ') || 'no brands detected';

      console.log(`[OK] ${searchResults.length} results, Deckers: ${deckersResults} [${topBrands}]`);

    } catch (e: any) {
      console.log(`[FAIL] ${e.message}`);

      results.push({
        query,
        shortenedQuery,
        category,
        success: false,
        results: [],
        totalResults: 0,
        deckersResults: 0,
        brandCounts: {},
        error: e.message,
        timestamp: new Date().toISOString()
      });

      // If CAPTCHA, wait for user to solve
      if (e.message.includes('CAPTCHA')) {
        console.log('\n[PAUSE] Please solve the CAPTCHA, then press Enter to continue...');
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    }

    // Save intermediate results every 5 queries
    if ((i + 1) % 5 === 0 || i === allQueries.length - 1) {
      const intermediate = {
        studyName: 'Deckers Brands - Amazon Search Visibility Study',
        surface: 'amazon-search',
        timestamp: new Date().toISOString(),
        totalQueries: allQueries.length,
        completedQueries: results.length,
        results
      };
      writeFileSync(INTERMEDIATE_FILE, JSON.stringify(intermediate, null, 2));
    }

    // Delay between queries (randomized to avoid detection)
    const delay = 1500 + Math.random() * 1000;
    await page.waitForTimeout(delay);
  }

  // Calculate summary statistics
  const successfulResults = results.filter(r => r.success);

  const deckersVisibility: Record<string, number> = {};
  for (const brand of DECKERS_BRANDS) {
    deckersVisibility[brand] = 0;
  }

  const competitorVisibility: Record<string, number> = {};

  for (const result of successfulResults) {
    for (const [brand, count] of Object.entries(result.brandCounts)) {
      if (DECKERS_BRANDS.includes(brand)) {
        deckersVisibility[brand] = (deckersVisibility[brand] || 0) + count;
      } else {
        competitorVisibility[brand] = (competitorVisibility[brand] || 0) + count;
      }
    }
  }

  // Sort competitors by visibility
  const topCompetitors = Object.fromEntries(
    Object.entries(competitorVisibility)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
  );

  // Calculate category breakdown
  const categoryBreakdown: Record<string, Record<string, number>> = {};
  for (const result of successfulResults) {
    if (!categoryBreakdown[result.category]) {
      categoryBreakdown[result.category] = {};
    }
    for (const [brand, count] of Object.entries(result.brandCounts)) {
      categoryBreakdown[result.category][brand] = (categoryBreakdown[result.category][brand] || 0) + count;
    }
  }

  // Final output
  const finalResults = {
    studyName: 'Deckers Brands - Amazon Search Visibility Study',
    surface: 'amazon-search',
    timestamp: new Date().toISOString(),
    totalQueries: allQueries.length,
    successfulQueries: successfulResults.length,
    deckersVisibility,
    topCompetitors,
    categoryBreakdown,
    results
  };

  writeFileSync(RESULTS_FILE, JSON.stringify(finalResults, null, 2));

  // Print summary
  console.log('\n======================================================================');
  console.log('  AMAZON SEARCH RESULTS SUMMARY');
  console.log('======================================================================\n');

  console.log(`Total queries: ${allQueries.length}`);
  console.log(`Successful: ${successfulResults.length}\n`);

  console.log('DECKERS BRANDS VISIBILITY (total product appearances):');
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
