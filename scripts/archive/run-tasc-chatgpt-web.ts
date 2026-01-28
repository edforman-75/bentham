#!/usr/bin/env npx tsx
/**
 * TASC Performance Visibility Study - ChatGPT Web via CDP
 *
 * PREREQUISITES:
 * 1. Chrome running with CDP on port 9222
 * 2. Navigate to https://chatgpt.com and log in
 * 3. Run this script
 */

import { chromium, type Page } from 'playwright';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';

const CDP_URL = 'http://localhost:9222';
const OUTPUT_DIR = 'packages/visibility-tool/results/tasc-visibility-study';
const OUTPUT_FILE = `${OUTPUT_DIR}/chatgpt-web-results.json`;
const INTERMEDIATE_FILE = `${OUTPUT_DIR}/chatgpt-web-intermediate.json`;
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

async function queryChatGPT(query: string, queryIndex: number, page: Page): Promise<QueryResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

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
        queryIndex, query, timestamp,
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
        queryIndex, query, timestamp,
        success: false, response: null,
        responseTimeMs: Date.now() - startTime,
        brandMentions: [],
        error: 'No response received',
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
  console.log('  TASC PERFORMANCE VISIBILITY STUDY - ChatGPT Web');
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

  let studyResults = {
    studyName: 'TASC Performance Visibility Study - ChatGPT Web',
    surface: 'chatgpt-web',
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
    const progress = `[${i + 1}/${QUERIES.length}]`;

    process.stdout.write(`${progress} "${query.slice(0, 40)}${query.length > 40 ? '...' : ''}" `);

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
    const marker = isClient ? ' ← CLIENT' : '';
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
  console.log(`\n✅ Results saved to: ${OUTPUT_FILE}`);

  if (existsSync(INTERMEDIATE_FILE)) {
    const { unlinkSync } = await import('fs');
    unlinkSync(INTERMEDIATE_FILE);
  }

  await browser.close();
}

main().catch(console.error);
