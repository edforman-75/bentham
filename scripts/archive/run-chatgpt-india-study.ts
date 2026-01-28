#!/usr/bin/env npx tsx
/**
 * ChatGPT.com 100-Prompt Pet Food Study - India IP via CDP
 *
 * PREREQUISITES:
 * 1. Connect to India VPN
 * 2. Verify IP at https://ipinfo.io (should show India)
 * 3. Launch Chrome with CDP:
 *    /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
 *      --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-chatgpt"
 * 4. Log into ChatGPT in the browser
 * 5. Run this script
 *
 * IMPORTANT: Queries do NOT have "in India" suffix - location comes from IP.
 */

import { chromium, type Page } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const CDP_URL = 'http://localhost:9333';
const QUERIES_FILE = 'studies/google/pet-food-100-queries.json';
const OUTPUT_FILE = 'studies/chatgpt/pet-food-100-india-results.json';
const INTERMEDIATE_FILE = 'studies/chatgpt/pet-food-100-india-intermediate.json';

const BRANDS_TO_TRACK = [
  'Royal Canin', 'Pedigree', 'Drools', 'Farmina', 'Orijen', 'Acana',
  'HUFT', 'Heads Up For Tails', 'Hill\'s', 'Hills Science', 'Purina',
  'Whiskas', 'Iams', 'Eukanuba', 'Wellness', 'Blue Buffalo',
  'Supertails', 'Zigly', 'Me-O', 'Sheba',
];

interface QueryResult {
  queryIndex: number;
  query: string;
  originalQuery: string;
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
  ipSource: string;
  startTime: string;
  endTime?: string;
  totalQueries: number;
  completedQueries: number;
  successfulQueries: number;
  results: QueryResult[];
}

function removeIndiaSuffix(query: string): string {
  return query
    .replace(/\s+in\s+india\s*$/i, '')
    .replace(/\s+for\s+india\s*$/i, '')
    .replace(/\s+india\s*$/i, '')
    .trim();
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

async function verifyIndiaIP(page: Page): Promise<{ isIndia: boolean; ip: string; location: string }> {
  try {
    await page.goto('https://ipinfo.io/json', { timeout: 15000 });
    const text = await page.textContent('body');
    const data = JSON.parse(text || '{}');

    return {
      isIndia: data.country === 'IN',
      ip: data.ip || 'unknown',
      location: `${data.city || ''}, ${data.region || ''}, ${data.country || ''}`.trim(),
    };
  } catch {
    return { isIndia: false, ip: 'unknown', location: 'unknown' };
  }
}

async function queryChatGPT(query: string, originalQuery: string, queryIndex: number, page: Page): Promise<QueryResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  try {
    await page.bringToFront();

    const currentUrl = page.url();
    if (!currentUrl.includes('chatgpt.com')) {
      await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(3000);
    } else if (queryIndex > 0 && queryIndex % 5 === 0) {
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
        queryIndex, query, originalQuery, timestamp,
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
        queryIndex, query, originalQuery, timestamp,
        success: false, response: null,
        responseTimeMs: Date.now() - startTime,
        brandMentions: [],
        error: 'No response received',
      };
    }

    const brandMentions = extractBrandMentions(response);

    return {
      queryIndex, query, originalQuery, timestamp,
      success: true, response,
      responseTimeMs: Date.now() - startTime,
      brandMentions,
    };

  } catch (error) {
    return {
      queryIndex, query, originalQuery, timestamp,
      success: false, response: null,
      responseTimeMs: Date.now() - startTime,
      brandMentions: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  ChatGPT.com Pet Food 100-Prompt Study - INDIA IP');
  console.log('='.repeat(70));

  // Check CDP availability
  try {
    const response = await fetch(`${CDP_URL}/json/version`);
    if (!response.ok) throw new Error('CDP not available');
  } catch {
    console.error('\n❌ Chrome not running with CDP on port 9222');
    console.error('\nPlease run:');
    console.error('  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome \\');
    console.error('    --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-chatgpt"');
    process.exit(1);
  }

  const queriesData = JSON.parse(readFileSync(QUERIES_FILE, 'utf-8'));
  const originalQueries: string[] = queriesData.queries;
  const queries = originalQueries.map(q => removeIndiaSuffix(q));

  console.log(`\nTotal queries: ${queries.length}`);
  console.log(`Queries: WITHOUT "in India" suffix (location from IP)`);
  console.log(`\nExample: "${originalQueries[0]}" -> "${queries[0]}"`);

  if (!existsSync('studies/chatgpt')) {
    mkdirSync('studies/chatgpt', { recursive: true });
  }

  let studyResults: StudyResults = {
    studyName: 'ChatGPT Pet Food Study - 100 Queries - India IP',
    surface: 'chatgpt-web',
    location: 'India',
    ipSource: 'VPN + CDP',
    startTime: new Date().toISOString(),
    totalQueries: queries.length,
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
      console.log(`\nResuming from query ${startIndex + 1}...`);
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

  // Verify India IP
  console.log('\nVerifying IP location...');
  const tempPage = await context.newPage();
  const ipCheck = await verifyIndiaIP(tempPage);
  await tempPage.close();

  console.log(`   IP: ${ipCheck.ip}`);
  console.log(`   Location: ${ipCheck.location}`);

  if (!ipCheck.isIndia) {
    console.error('\n❌ NOT connected to India IP!');
    console.error('   Please connect to India VPN before running this study.');
    console.error('   Current location:', ipCheck.location);
    process.exit(1);
  }

  console.log('✅ India IP confirmed');

  // Find ChatGPT tab
  let chatgptPage: Page | null = null;

  for (const page of context.pages()) {
    const url = page.url();
    if (url.includes('chatgpt.com') && !url.includes('/c/')) {
      chatgptPage = page;
      console.log('✅ Found ChatGPT tab');
      break;
    }
  }

  if (!chatgptPage) {
    // Try any chatgpt tab
    for (const page of context.pages()) {
      if (page.url().includes('chatgpt.com')) {
        chatgptPage = page;
        console.log('✅ Found ChatGPT tab (existing conversation)');
        break;
      }
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

  console.log('\n✅ ChatGPT ready - starting queries\n');

  for (let i = startIndex; i < queries.length; i++) {
    const query = queries[i];
    const originalQuery = originalQueries[i];
    const progress = `[${i + 1}/${queries.length}]`;

    process.stdout.write(`${progress} "${query.slice(0, 42)}${query.length > 42 ? '...' : ''}" `);

    const result = await queryChatGPT(query, originalQuery, i, chatgptPage);
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
      console.log(`\n--- Saved (${i + 1}/${queries.length}) ---\n`);
    }

    if (i < queries.length - 1) {
      await sleep(2000 + Math.random() * 2000);
    }
  }

  studyResults.endTime = new Date().toISOString();

  const brandCounts: Record<string, number> = {};
  for (const result of studyResults.results) {
    if (result.success && result.brandMentions) {
      for (const mention of result.brandMentions) {
        brandCounts[mention.brand] = (brandCounts[mention.brand] || 0) + 1;
      }
    }
  }

  const successfulCount = studyResults.successfulQueries;

  console.log('\n' + '='.repeat(70));
  console.log('  STUDY COMPLETE');
  console.log('='.repeat(70));
  console.log(`\nTotal: ${queries.length} | Success: ${successfulCount} (${(successfulCount/queries.length*100).toFixed(1)}%)`);

  console.log('\n--- Brand Mentions ---\n');

  const sortedBrands = Object.entries(brandCounts).sort((a, b) => b[1] - a[1]);
  for (const [brand, count] of sortedBrands) {
    const pct = (count / successfulCount * 100).toFixed(1);
    console.log(`  ${brand.padEnd(20)} ${count.toString().padStart(3)}x  (${pct}%)`);
  }

  const finalOutput = {
    ...studyResults,
    analysis: {
      brandMentionCounts: brandCounts,
      topBrands: sortedBrands.slice(0, 10).map(([brand, count]) => ({
        brand, mentions: count, rate: (count / successfulCount * 100).toFixed(1) + '%',
      })),
    },
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(finalOutput, null, 2));
  console.log(`\n✅ Saved to: ${OUTPUT_FILE}`);

  if (existsSync(INTERMEDIATE_FILE)) {
    const { unlinkSync } = await import('fs');
    unlinkSync(INTERMEDIATE_FILE);
  }
}

main().catch(console.error);
