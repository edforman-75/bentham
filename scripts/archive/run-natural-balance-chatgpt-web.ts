#!/usr/bin/env npx tsx
/**
 * Natural Balance US Visibility Study - ChatGPT Web via CDP
 *
 * PREREQUISITES:
 * 1. Launch Chrome with CDP:
 *    /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
 *      --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-chatgpt"
 * 2. Log into ChatGPT in the browser (any account tier works)
 * 3. Run this script
 *
 * No VPN needed - US is the default location.
 */

import { chromium, type Page } from 'playwright';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';

const CDP_URL = 'http://localhost:9222';
const OUTPUT_DIR = 'repository/results/glu/natural-balance-us-visibility';
const OUTPUT_FILE = `${OUTPUT_DIR}/chatgpt-web-results.json`;
const INTERMEDIATE_FILE = `${OUTPUT_DIR}/chatgpt-web-intermediate.json`;

// Brands to track from manifest
const BRANDS_TO_TRACK = [
  // Client brand
  'Natural Balance',

  // Primary competitors (premium/natural segment)
  'Blue Buffalo', 'Wellness', 'Merrick', 'Orijen', 'Acana',
  'Canidae', 'Nutro', 'Taste of the Wild', 'Fromm', 'Nulo',

  // Mass market competitors
  'Purina', 'Pedigree', 'Iams', "Hill's", 'Royal Canin', 'Rachael Ray',

  // Retailers
  'Chewy', 'Petco', 'PetSmart', 'Amazon', 'Walmart', 'Target',
];

// 100 queries from the Natural Balance study
const QUERIES = [
  // Category 1: General Dog Food (20)
  "What is the best dog food brand?",
  "best dry dog food 2026",
  "top rated dog food brands",
  "healthiest dog food options",
  "best dog food recommended by veterinarians",
  "premium dog food brands worth the money",
  "best natural dog food brands",
  "high quality dog food brands",
  "best dog food for the money",
  "what dog food do vets recommend most",
  "best affordable dog food that's still healthy",
  "dog food brands with best ingredients",
  "best American made dog food",
  "safest dog food brands 2026",
  "best dog food without fillers",
  "highest protein dog food brands",
  "best holistic dog food",
  "dog food brands that have never been recalled",
  "best organic dog food brands",
  "most nutritious dog food available",

  // Category 2: Breed-Specific (15)
  "best dog food for golden retrievers",
  "best dog food for german shepherds",
  "best dog food for labrador retrievers",
  "best dog food for french bulldogs",
  "best dog food for pitbulls",
  "best dog food for small breeds",
  "best dog food for large breed dogs",
  "best dog food for chihuahuas",
  "best dog food for huskies",
  "best dog food for beagles",
  "best dog food for poodles",
  "best dog food for bulldogs",
  "best dog food for dachshunds",
  "best dog food for rottweilers",
  "best dog food for boxers",

  // Category 3: Health-Specific (15)
  "best dog food for allergies",
  "best dog food for sensitive stomach",
  "best dog food for dogs with skin issues",
  "best dog food for weight loss",
  "best dog food for joint health",
  "best limited ingredient dog food",
  "best grain free dog food",
  "best dog food for dogs with diabetes",
  "best dog food for dogs with kidney disease",
  "best hypoallergenic dog food",
  "best dog food for digestive issues",
  "best dog food for itchy skin",
  "best dog food for dogs with food sensitivities",
  "best dog food for heart health",
  "best single protein dog food",

  // Category 4: Life Stage (10)
  "best puppy food for large breeds",
  "best puppy food for small breeds",
  "best senior dog food",
  "best dog food for adult dogs",
  "when to switch from puppy food to adult food",
  "best puppy food 2026",
  "best food for senior dogs with sensitive stomachs",
  "best high calorie dog food for underweight dogs",
  "best dog food for active dogs",
  "best dog food for working dogs",

  // Category 5: Brand Comparisons (15)
  "Blue Buffalo vs Purina Pro Plan",
  "Orijen vs Acana dog food",
  "Wellness vs Blue Buffalo",
  "Natural Balance vs Blue Buffalo",
  "Merrick vs Wellness dog food",
  "Royal Canin vs Hill's Science Diet",
  "Taste of the Wild vs Merrick",
  "Natural Balance vs Wellness",
  "Purina vs Iams dog food",
  "Canidae vs Orijen",
  "Natural Balance limited ingredient vs other LID brands",
  "is Blue Buffalo better than Natural Balance",
  "Nutro vs Natural Balance",
  "best limited ingredient dog food brands compared",
  "premium dog food brand comparison",

  // Category 6: Dog Treats (10)
  "best dog treats for training",
  "healthiest dog treats",
  "best dental chews for dogs",
  "best natural dog treats",
  "best dog treats for sensitive stomachs",
  "best low calorie dog treats",
  "best grain free dog treats",
  "best dog treats for puppies",
  "best long lasting dog chews",
  "best single ingredient dog treats",

  // Category 7: Cat Food (10)
  "best cat food brands",
  "best wet cat food",
  "best dry cat food",
  "best cat food for indoor cats",
  "best cat food for sensitive stomach",
  "best grain free cat food",
  "best senior cat food",
  "best kitten food",
  "best limited ingredient cat food",
  "best natural cat food brands",

  // Category 8: Ingredients & Quality (5)
  "what ingredients to avoid in dog food",
  "is grain free dog food bad for dogs",
  "best protein sources for dog food",
  "how to read dog food labels",
  "what makes a dog food high quality",
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
  { prefix: 'df', count: 20, name: 'dog-food-general' },
  { prefix: 'bs', count: 15, name: 'dog-food-breed-specific' },
  { prefix: 'hs', count: 15, name: 'dog-food-health' },
  { prefix: 'ls', count: 10, name: 'dog-food-life-stage' },
  { prefix: 'bc', count: 15, name: 'dog-food-comparison' },
  { prefix: 'dt', count: 10, name: 'dog-treats' },
  { prefix: 'cf', count: 10, name: 'cat-food' },
  { prefix: 'iq', count: 5, name: 'ingredients-quality' },
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
  console.log('  NATURAL BALANCE US VISIBILITY STUDY - ChatGPT Web');
  console.log('='.repeat(70));

  // Check CDP availability
  try {
    const response = await fetch(`${CDP_URL}/json/version`);
    if (!response.ok) throw new Error('CDP not available');
    console.log('✅ Chrome CDP connection available');
  } catch {
    console.error('\n❌ Chrome not running with CDP on port 9222');
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
    studyName: 'Natural Balance US Visibility Study - ChatGPT Web',
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
      console.log(`\n📂 Resuming from query ${startIndex + 1}...`);
    } catch {
      console.log('\nStarting fresh');
    }
  }

  console.log('\nConnecting to Chrome via CDP...');

  const browser = await chromium.connectOverCDP(CDP_URL);
  console.log('✅ Connected to Chrome');

  const contexts = browser.contexts();
  if (contexts.length === 0) {
    console.error('❌ No browser contexts found');
    process.exit(1);
  }

  const context = contexts[0];

  // Find ChatGPT tab
  let chatgptPage: Page | null = null;

  for (const page of context.pages()) {
    const url = page.url();
    if (url.includes('chatgpt.com')) {
      chatgptPage = page;
      console.log('✅ Found ChatGPT tab');
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
    console.log('\n⚠️  Please log in to ChatGPT in the Chrome window.');
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
        console.log('✅ Login detected!');
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
      console.log(`✅ (${Math.round(result.responseTimeMs/1000)}s) [${brands || 'no brands'}]`);
    } else {
      console.log(`❌ ${result.error}`);
    }

    if ((i + 1) % 10 === 0) {
      writeFileSync(INTERMEDIATE_FILE, JSON.stringify(studyResults, null, 2));
      console.log(`\n   💾 Progress saved (${i + 1}/${QUERIES.length})\n`);
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

  console.log('\n' + '='.repeat(70));
  console.log('  STUDY COMPLETE');
  console.log('='.repeat(70));
  console.log(`\nTotal: ${QUERIES.length} | Success: ${successfulCount} (${(successfulCount/QUERIES.length*100).toFixed(1)}%)`);

  console.log('\n--- Brand Visibility (queries mentioning brand) ---\n');

  const sortedBrands = Object.entries(brandMentionsByQuery).sort((a, b) => b[1] - a[1]);
  for (const [brand, queryCount] of sortedBrands) {
    const pct = (queryCount / successfulCount * 100).toFixed(1);
    const totalMentions = brandCounts[brand];
    const isClient = brand === 'Natural Balance';
    const marker = isClient ? ' ← CLIENT' : '';
    console.log(`  ${brand.padEnd(20)} ${queryCount.toString().padStart(3)} queries  (${pct}%)  [${totalMentions} total mentions]${marker}`);
  }

  // Natural Balance specific
  const nbQueryCount = brandMentionsByQuery['Natural Balance'] || 0;
  const nbTotalMentions = brandCounts['Natural Balance'] || 0;
  console.log('\n--- Natural Balance Summary ---');
  console.log(`  Appeared in: ${nbQueryCount}/${successfulCount} queries (${(nbQueryCount/successfulCount*100).toFixed(1)}%)`);
  console.log(`  Total mentions: ${nbTotalMentions}`);

  const finalOutput = {
    ...studyResults,
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
      naturalBalanceSummary: {
        queriesAppearing: nbQueryCount,
        percentOfQueries: (nbQueryCount / successfulCount * 100).toFixed(1) + '%',
        totalMentions: nbTotalMentions,
        rank: sortedBrands.findIndex(([b]) => b === 'Natural Balance') + 1,
      },
      topBrands: sortedBrands.slice(0, 10).map(([brand, queryCount]) => ({
        brand,
        queriesAppearing: queryCount,
        rate: (queryCount / successfulCount * 100).toFixed(1) + '%',
        totalMentions: brandCounts[brand],
      })),
    },
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(finalOutput, null, 2));
  console.log(`\n✅ Results saved to: ${OUTPUT_FILE}`);

  if (existsSync(INTERMEDIATE_FILE)) {
    const { unlinkSync } = await import('fs');
    unlinkSync(INTERMEDIATE_FILE);
  }

  await browser.close();
}

main().catch(console.error);
