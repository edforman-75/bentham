#!/usr/bin/env npx tsx
/**
 * Deckers Brands US Visibility Study - ChatGPT Web via CDP
 *
 * PREREQUISITES:
 * 1. Launch Chrome with CDP:
 *    /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
 *      --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-chatgpt"
 * 2. Log into ChatGPT in the browser (any account tier works)
 * 3. Run this script
 */

import { chromium, type Page } from 'playwright';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';

const CDP_URL = 'http://localhost:9222';
const OUTPUT_DIR = 'repository/results/glu/deckers-us-visibility';
const OUTPUT_FILE = `${OUTPUT_DIR}/chatgpt-web-results.json`;
const INTERMEDIATE_FILE = `${OUTPUT_DIR}/chatgpt-web-intermediate.json`;

const BRANDS_TO_TRACK = [
  // Client brands (Deckers portfolio)
  'UGG', 'HOKA', 'Teva', 'Sanuk', 'Koolaburra',

  // Premium Performance competitors
  'Nike', 'Adidas', 'New Balance', 'Brooks', 'ASICS', 'Saucony', 'On Running',

  // Outdoor/Hiking competitors
  'Merrell', 'Salomon', 'Keen', 'Columbia', 'The North Face',

  // Casual/Lifestyle competitors
  'Birkenstock', 'Crocs', 'Allbirds', 'Vans', 'Converse',

  // Comfort/Boot competitors
  'Timberland', 'Dr. Martens', 'Clarks', 'Sorel',

  // Retailers
  'Zappos', 'DSW', 'Foot Locker', 'Amazon', 'Nordstrom', "Dick's Sporting Goods",
];

// 100 queries organized by category
const QUERIES = [
  // Category 1: Running/Athletic Shoes (15)
  "best running shoes 2026",
  "most comfortable running shoes",
  "best cushioned running shoes",
  "best marathon running shoes",
  "best trail running shoes",
  "best running shoes for beginners",
  "best running shoes for flat feet",
  "best lightweight running shoes",
  "best stability running shoes",
  "top rated athletic shoes",
  "best daily trainer running shoes",
  "best running shoes for wide feet",
  "best running shoes for plantar fasciitis",
  "most durable running shoes",
  "best carbon plate running shoes",

  // Category 2: Outdoor/Hiking (12)
  "best hiking shoes",
  "best hiking sandals",
  "best waterproof hiking boots",
  "best trail shoes for hiking",
  "best outdoor sandals",
  "most comfortable hiking sandals",
  "best water shoes for hiking",
  "best lightweight hiking boots",
  "best approach shoes",
  "best sandals for walking trails",
  "best adventure sandals",
  "best all terrain shoes",

  // Category 3: Boots & Winter (12)
  "best winter boots",
  "best snow boots",
  "most comfortable boots for walking",
  "best warm boots for cold weather",
  "best sheepskin boots",
  "best waterproof boots",
  "best fashion boots",
  "best slip on boots",
  "best ankle boots for women",
  "coziest winter boots",
  "best boots for snow and ice",
  "best insulated boots",

  // Category 4: Casual/Lifestyle (12)
  "most comfortable everyday shoes",
  "best casual sneakers",
  "best slip on shoes",
  "best shoes for standing all day",
  "most comfortable slippers",
  "best house shoes",
  "best comfortable sandals",
  "best walking shoes for travel",
  "best sustainable shoes",
  "best shoes for plantar fasciitis",
  "most comfortable shoes 2026",
  "best orthopedic casual shoes",

  // Category 5: Brand Comparisons (15)
  "HOKA vs Brooks running shoes",
  "HOKA vs Nike running shoes",
  "HOKA vs On Running",
  "UGG vs Bearpaw boots",
  "UGG vs Koolaburra",
  "Teva vs Chaco sandals",
  "Teva vs Keen sandals",
  "HOKA vs New Balance running shoes",
  "UGG vs EMU boots",
  "HOKA vs ASICS",
  "Teva vs Merrell hiking sandals",
  "UGG vs Sorel winter boots",
  "HOKA vs Saucony",
  "best HOKA alternatives",
  "UGG alternatives that are cheaper",

  // Category 6: By Activity/Use Case (12)
  "best shoes for nurses",
  "best shoes for teachers",
  "best shoes for walking on concrete",
  "best shoes for travel",
  "best shoes for long flights",
  "best recovery shoes after running",
  "best post-workout slides",
  "best shoes for warehouse work",
  "best shoes for theme parks",
  "best shoes for back pain",
  "best summer sandals",
  "best beach shoes",

  // Category 7: Slippers & Comfort (10)
  "best slippers for men",
  "best slippers for women",
  "best indoor outdoor slippers",
  "most comfortable house slippers",
  "best memory foam slippers",
  "best sheepskin slippers",
  "best slippers with arch support",
  "best warm slippers",
  "luxury slippers brands",
  "best orthopedic slippers",

  // Category 8: Shopping/Quality (12)
  "what running shoe brands are best",
  "most comfortable shoe brands",
  "best shoe brands for quality",
  "shoe brands with best arch support",
  "shoe brands that last longest",
  "best shoe brands for foot health",
  "luxury shoe brands worth the money",
  "what shoe brand do podiatrists recommend",
  "best direct-to-consumer shoe brands",
  "most innovative shoe brands",
  "best sustainable shoe brands",
  "shoe brands with best customer service",
];

interface QueryResult {
  queryIndex: number;
  queryId: string;
  query: string;
  category: string;
  timestamp: string;
  success: boolean;
  response: string | null;
  responseTimeMs: number;
  brandMentions: { brand: string; count: number; }[];
  error?: string;
}

interface StudyResults {
  studyName: string;
  surface: string;
  location: string;
  startTime: string;
  endTime?: string;
  totalQueries: number;
  completedQueries: number;
  successfulQueries: number;
  results: QueryResult[];
}

// Map query text to ID and category
const QUERY_METADATA: Record<string, { id: string; category: string }> = {};
const categoryOrder = [
  { prefix: 'ra', count: 15, name: 'running-athletic' },
  { prefix: 'oh', count: 12, name: 'outdoor-hiking' },
  { prefix: 'bw', count: 12, name: 'boots-winter' },
  { prefix: 'cl', count: 12, name: 'casual-lifestyle' },
  { prefix: 'bc', count: 15, name: 'brand-comparisons' },
  { prefix: 'au', count: 12, name: 'activity-use-case' },
  { prefix: 'sc', count: 10, name: 'slippers-comfort' },
  { prefix: 'sq', count: 12, name: 'shopping-quality' },
];

let queryIdx = 0;
for (const cat of categoryOrder) {
  for (let i = 1; i <= cat.count; i++) {
    const id = `${cat.prefix}${i.toString().padStart(2, '0')}`;
    QUERY_METADATA[QUERIES[queryIdx]] = { id, category: cat.name };
    queryIdx++;
  }
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

async function queryChatGPT(query: string, queryIndex: number, page: Page): Promise<QueryResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const meta = QUERY_METADATA[query] || { id: `q${queryIndex}`, category: 'unknown' };

  try {
    await page.bringToFront();

    const currentUrl = page.url();
    if (!currentUrl.includes('chatgpt.com')) {
      await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(3000);
    } else if (queryIndex > 0 && queryIndex % 5 === 0) {
      // Start new chat every 5 queries
      console.log('    [New chat]');
      await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(2000);
    }

    await sleep(1000);

    const initialCount = await page.locator('[data-message-author-role="assistant"]').count();

    const inputSelectors = [
      '#prompt-textarea',
      'div[contenteditable="true"][data-placeholder]',
      'textarea[placeholder*="Message"]',
      '[contenteditable="true"]'
    ];

    let inputFound = false;
    for (const sel of inputSelectors) {
      try {
        const input = page.locator(sel).first();
        if (await input.isVisible({ timeout: 2000 })) {
          await input.click();
          await sleep(200);
          await page.keyboard.press('Meta+a');
          await sleep(100);
          await page.keyboard.type(query, { delay: 20 });
          inputFound = true;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!inputFound) {
      return {
        queryIndex, queryId: meta.id, query, category: meta.category, timestamp,
        success: false, response: null,
        responseTimeMs: Date.now() - startTime,
        brandMentions: [],
        error: 'Input field not found',
      };
    }

    await sleep(500);

    const submitSelectors = [
      'button[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
      'button[data-testid="composer-send-button"]',
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

    let response = '';
    const maxWait = 90000;
    const waitStart = Date.now();

    while (Date.now() - waitStart < maxWait) {
      const currentCount = await page.locator('[data-message-author-role="assistant"]').count();

      if (currentCount > initialCount) {
        let streaming = true;
        while (streaming && Date.now() - waitStart < maxWait) {
          streaming = await page.locator('button[aria-label="Stop generating"], button[aria-label="Stop"]').isVisible({ timeout: 500 }).catch(() => false);
          if (streaming) {
            await sleep(1000);
          }
        }

        await sleep(2000);

        response = await page.evaluate(() => {
          const responses = document.querySelectorAll('[data-message-author-role="assistant"]');
          if (responses.length === 0) return '';
          const last = responses[responses.length - 1];
          const markdown = last.querySelector('.markdown');
          return (markdown as HTMLElement)?.innerText || (last as HTMLElement).innerText || '';
        });

        if (response && response.length > 50) break;
      }

      await sleep(1000);
    }

    if (!response || response.length < 50) {
      return {
        queryIndex, queryId: meta.id, query, category: meta.category, timestamp,
        success: false, response: null,
        responseTimeMs: Date.now() - startTime,
        brandMentions: [],
        error: 'No response received',
      };
    }

    const brandMentions = extractBrandMentions(response);

    return {
      queryIndex, queryId: meta.id, query, category: meta.category, timestamp,
      success: true, response,
      responseTimeMs: Date.now() - startTime,
      brandMentions,
    };

  } catch (error) {
    return {
      queryIndex, queryId: meta.id, query, category: meta.category, timestamp,
      success: false, response: null,
      responseTimeMs: Date.now() - startTime,
      brandMentions: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  DECKERS BRANDS US VISIBILITY STUDY - ChatGPT Web');
  console.log('='.repeat(70));

  // Check CDP availability
  try {
    const response = await fetch(`${CDP_URL}/json/version`);
    if (!response.ok) throw new Error('CDP not available');
    console.log('[OK] Chrome CDP connection available');
  } catch {
    console.error('\n[FAIL] Chrome not running with CDP on port 9222');
    console.error('\nPlease run:');
    console.error('  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome \\');
    console.error('    --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-chatgpt"');
    console.error('\nThen log into ChatGPT and run this script again.');
    process.exit(1);
  }

  console.log(`\nTotal queries: ${QUERIES.length}`);
  console.log(`Brands tracked: ${BRANDS_TO_TRACK.length}`);

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let studyResults: StudyResults = {
    studyName: 'Deckers Brands US Visibility Study - ChatGPT Web',
    surface: 'chatgpt-web',
    location: 'United States',
    startTime: new Date().toISOString(),
    totalQueries: QUERIES.length,
    completedQueries: 0,
    successfulQueries: 0,
    results: [],
  };

  let startIndex = 0;

  if (existsSync(INTERMEDIATE_FILE)) {
    try {
      const existing = JSON.parse(readFileSync(INTERMEDIATE_FILE, 'utf-8'));
      studyResults = existing;
      startIndex = existing.completedQueries;
      console.log(`\n[RESUME] Resuming from query ${startIndex + 1}...`);
    } catch {
      console.log('\nStarting fresh');
    }
  }

  console.log('\nConnecting to Chrome via CDP...');

  const browser = await chromium.connectOverCDP(CDP_URL);
  console.log('[OK] Connected to Chrome');

  const contexts = browser.contexts();
  if (contexts.length === 0) {
    console.error('[FAIL] No browser contexts found');
    process.exit(1);
  }

  const context = contexts[0];

  // Find ChatGPT tab
  let chatgptPage: Page | null = null;

  for (const page of context.pages()) {
    const url = page.url();
    if (url.includes('chatgpt.com')) {
      chatgptPage = page;
      console.log('[OK] Found ChatGPT tab');
      break;
    }
  }

  if (!chatgptPage) {
    console.log('Opening new ChatGPT tab...');
    chatgptPage = await context.newPage();
    await chatgptPage.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);
  }

  // Check if logged in
  const isLoggedIn = await chatgptPage.evaluate(() => {
    const loginBtn = document.querySelector('[data-testid="login-button"]');
    const buttons = Array.from(document.querySelectorAll('button'));
    const hasLoginText = buttons.some(b => b.textContent?.toLowerCase().includes('log in'));
    return !loginBtn && !hasLoginText;
  });

  if (!isLoggedIn) {
    console.log('\n[WAIT] Please log in to ChatGPT in the Chrome window.');
    console.log('   Waiting for login...');

    let attempts = 0;
    while (attempts < 180) {
      await sleep(1000);
      attempts++;

      const nowLoggedIn = await chatgptPage.evaluate(() => {
        const hasInput = document.querySelector('#prompt-textarea') ||
                        document.querySelector('[contenteditable="true"]');
        const loginBtn = document.querySelector('[data-testid="login-button"]');
        const hasNav = document.querySelector('nav');
        return hasInput && !loginBtn && hasNav;
      }).catch(() => false);

      if (nowLoggedIn) {
        console.log('[OK] Login detected!');
        break;
      }

      if (attempts % 15 === 0) {
        console.log(`   Still waiting... (${attempts}s)`);
      }
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('  RUNNING QUERIES');
  console.log('='.repeat(70) + '\n');

  for (let i = startIndex; i < QUERIES.length; i++) {
    const query = QUERIES[i];
    const meta = QUERY_METADATA[query] || { id: `q${i}`, category: 'unknown' };
    const progress = `[${i + 1}/${QUERIES.length}]`;

    process.stdout.write(`${progress} [${meta.id}] "${query.slice(0, 40)}${query.length > 40 ? '...' : ''}" `);

    const result = await queryChatGPT(query, i, chatgptPage);
    studyResults.results.push(result);
    studyResults.completedQueries++;

    if (result.success) {
      studyResults.successfulQueries++;
      const brands = result.brandMentions.slice(0, 3).map(b => b.brand).join(', ');
      console.log(`[OK] (${Math.round(result.responseTimeMs/1000)}s) [${brands || 'no brands'}]`);
    } else {
      console.log(`[FAIL] ${result.error}`);
    }

    if ((i + 1) % 10 === 0) {
      writeFileSync(INTERMEDIATE_FILE, JSON.stringify(studyResults, null, 2));
      console.log(`\n   [SAVE] Progress saved (${i + 1}/${QUERIES.length})\n`);
    }

    if (i < QUERIES.length - 1) {
      await sleep(2000 + Math.random() * 2000);
    }
  }

  studyResults.endTime = new Date().toISOString();

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
  const deckersBrands = ['UGG', 'HOKA', 'Teva', 'Sanuk', 'Koolaburra'];

  console.log('\n' + '='.repeat(70));
  console.log('  STUDY COMPLETE');
  console.log('='.repeat(70));
  console.log(`\nTotal: ${QUERIES.length} | Success: ${successfulCount} (${(successfulCount/QUERIES.length*100).toFixed(1)}%)`);

  console.log('\n--- Deckers Brands Visibility ---\n');
  for (const brand of deckersBrands) {
    const queryCount = brandMentionsByQuery[brand] || 0;
    const pct = (queryCount / successfulCount * 100).toFixed(1);
    const totalMentions = brandCounts[brand] || 0;
    console.log(`  ${brand.padEnd(15)} ${queryCount.toString().padStart(3)} queries  (${pct}%)  [${totalMentions} total mentions]`);
  }

  console.log('\n--- Top Competitors ---\n');
  const sortedBrands = Object.entries(brandMentionsByQuery)
    .filter(([b]) => !deckersBrands.includes(b))
    .sort((a, b) => b[1] - a[1]);
  for (const [brand, queryCount] of sortedBrands.slice(0, 10)) {
    const pct = (queryCount / successfulCount * 100).toFixed(1);
    console.log(`  ${brand.padEnd(20)} ${queryCount.toString().padStart(3)} queries  (${pct}%)`);
  }

  const finalOutput = {
    ...studyResults,
    analysis: {
      brandVisibility: Object.fromEntries(
        Object.entries(brandMentionsByQuery)
          .sort((a, b) => b[1] - a[1])
          .map(([brand, queryCount]) => [
            brand,
            {
              queriesAppearing: queryCount,
              percentOfQueries: (queryCount / successfulCount * 100).toFixed(1) + '%',
              totalMentions: brandCounts[brand],
            }
          ])
      ),
      deckersBrandsSummary: Object.fromEntries(
        deckersBrands.map(brand => [
          brand,
          {
            queriesAppearing: brandMentionsByQuery[brand] || 0,
            percentOfQueries: ((brandMentionsByQuery[brand] || 0) / successfulCount * 100).toFixed(1) + '%',
            totalMentions: brandCounts[brand] || 0,
            rank: Object.entries(brandMentionsByQuery).sort((a, b) => b[1] - a[1]).findIndex(([b]) => b === brand) + 1,
          }
        ])
      ),
      topBrands: Object.entries(brandMentionsByQuery)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([brand, queryCount]) => ({
          brand,
          queriesAppearing: queryCount,
          rate: (queryCount / successfulCount * 100).toFixed(1) + '%',
          totalMentions: brandCounts[brand],
        })),
    },
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(finalOutput, null, 2));
  console.log(`\n[OK] Results saved to: ${OUTPUT_FILE}`);

  if (existsSync(INTERMEDIATE_FILE)) {
    const { unlinkSync } = await import('fs');
    unlinkSync(INTERMEDIATE_FILE);
  }

  await browser.close();
}

main().catch(console.error);
