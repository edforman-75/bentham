#!/usr/bin/env npx tsx
/**
 * Deckers Brands US Visibility Study - Amazon Rufus
 *
 * Prerequisites:
 * 1. Chrome running with CDP:
 *    /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
 *      --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-chatgpt"
 * 2. Navigate to amazon.com and log in
 * 3. Run this script
 */

import { chromium, Page } from 'playwright';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';

const CDP_URL = 'http://localhost:9222';
const OUTPUT_DIR = 'repository/results/glu/deckers-us-visibility';
const OUTPUT_FILE = `${OUTPUT_DIR}/amazon-rufus-results.json`;
const INTERMEDIATE_FILE = `${OUTPUT_DIR}/amazon-rufus-intermediate.json`;

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

function extractBrandMentions(text: string): { brand: string; count: number }[] {
  const mentions: { brand: string; count: number }[] = [];
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

const RUFUS_SELECTORS = {
  rufusTrigger: [
    '#nav-rufus-disco',
    'button[aria-label*="Rufus"]',
    '[class*="rufus-disco"]',
  ],
  queryInput: [
    '#rufus-text-area',
    'textarea[placeholder*="Ask Rufus"]',
  ],
  submitButton: [
    '#rufus-submit-button',
    'button[aria-label="Submit"]',
  ],
  responseContainer: [
    '.rufus-html-turn',
    '.a-section.rufus-conversation-branding-update:not(.rufus-customer-text)',
    '.rufus-sections-container',
  ],
  customerMessage: [
    '.rufus-customer-text',
    '.rufus-speech-bubble',
  ],
  loadingIndicator: [
    '.a-spinner',
    '[class*="rufus"][class*="loading"]',
    '[class*="rufus"][class*="typing"]',
  ],
};

async function findElement(page: Page, selectors: string[]): Promise<string | null> {
  for (const selector of selectors) {
    try {
      const count = await page.locator(selector).count();
      if (count > 0) {
        const isVisible = await page.locator(selector).first().isVisible();
        if (isVisible) {
          return selector;
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function openRufusChat(page: Page): Promise<boolean> {
  // Check if Rufus chat is already open
  const existingInput = await findElement(page, RUFUS_SELECTORS.queryInput);
  if (existingInput) {
    return true;
  }

  // Try to find and click Rufus trigger
  const trigger = await findElement(page, RUFUS_SELECTORS.rufusTrigger);
  if (trigger) {
    await page.click(trigger);
    await page.waitForTimeout(2000);
    const input = await findElement(page, RUFUS_SELECTORS.queryInput);
    if (input) {
      return true;
    }
  }

  // Try clicking search bar
  try {
    await page.click('#twotabsearchtextbox');
    await page.waitForTimeout(1000);
    const input = await findElement(page, RUFUS_SELECTORS.queryInput);
    if (input) {
      return true;
    }
  } catch {}

  return false;
}

async function submitQuery(page: Page, query: string): Promise<string> {
  const inputSelector = await findElement(page, RUFUS_SELECTORS.queryInput);
  if (!inputSelector) {
    throw new Error('Cannot find Rufus input field');
  }

  // Human-like: click input, pause, then type slowly
  await page.click(inputSelector);
  await page.waitForTimeout(500 + Math.random() * 500);

  // Clear with keyboard like a human
  await page.keyboard.press('Meta+a');
  await page.waitForTimeout(200);

  // Type slowly like a human (30-80ms per character)
  await page.keyboard.type(query, { delay: 30 + Math.random() * 50 });
  await page.waitForTimeout(800 + Math.random() * 500);

  const submitSelector = await findElement(page, RUFUS_SELECTORS.submitButton);
  if (submitSelector) {
    await page.click(submitSelector);
  } else {
    await page.press(inputSelector, 'Enter');
  }

  // Wait longer for response to start
  await page.waitForTimeout(3000 + Math.random() * 2000);

  // Wait for loading to finish - be patient like a human
  let attempts = 0;
  while (attempts < 60) {
    const loading = await findElement(page, RUFUS_SELECTORS.loadingIndicator);
    if (!loading) break;
    await page.waitForTimeout(1000);
    attempts++;
  }

  // Extra wait for response to fully render
  await page.waitForTimeout(3000 + Math.random() * 2000);

  const response = await page.evaluate(() => {
    // Look for Rufus response (not customer message)
    const responseSelectors = [
      '.rufus-html-turn',
      '.a-section.rufus-conversation-branding-update:not(.rufus-customer-text)',
    ];

    for (const selector of responseSelectors) {
      const messages = document.querySelectorAll(selector);
      if (messages.length > 0) {
        // Get the last Rufus response
        const lastMessage = messages[messages.length - 1];
        const text = lastMessage.textContent?.trim();
        // Filter out customer questions (they're shorter and start with the query)
        if (text && text.length > 50 && !text.startsWith('Customer question')) {
          // Clean up the text
          return text.replace(/\s+/g, ' ').trim();
        }
      }
    }

    // Fallback: look in conversation container for any long text
    const container = document.querySelector('#rufus-conversation-container');
    if (container) {
      const allText = container.textContent || '';
      // Find text after "I'd be happy" or similar Rufus phrases
      const match = allText.match(/When it comes to[\s\S]*?(?=Customer question|Ask Rufus|$)/i);
      if (match) {
        return match[0].replace(/\s+/g, ' ').trim();
      }
    }

    return '';
  });

  if (!response) {
    throw new Error('Could not extract Rufus response');
  }

  return response;
}

async function clearChat(page: Page): Promise<void> {
  const clearSelectors = [
    '[aria-label*="new chat"]',
    '[aria-label*="clear"]',
    'button[class*="new"]',
    '[data-testid="rufus-clear"]',
  ];

  const clearBtn = await findElement(page, clearSelectors);
  if (clearBtn) {
    await page.click(clearBtn);
    await page.waitForTimeout(1000);
  } else {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await openRufusChat(page);
  }
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  DECKERS BRANDS US VISIBILITY STUDY - Amazon Rufus');
  console.log('='.repeat(70));

  // Check CDP
  try {
    const response = await fetch(`${CDP_URL}/json/version`);
    if (!response.ok) throw new Error('CDP not available');
    console.log('[OK] Chrome CDP connection available');
  } catch {
    console.error('\n[FAIL] Chrome not running with CDP on port 9222');
    process.exit(1);
  }

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];

  // Find Amazon tab
  let amazonPage: Page | null = null;
  for (const page of context.pages()) {
    if (page.url().includes('amazon.com')) {
      amazonPage = page;
      break;
    }
  }

  if (!amazonPage) {
    console.log('Opening Amazon...');
    amazonPage = await context.newPage();
    await amazonPage.goto('https://www.amazon.com', { waitUntil: 'domcontentloaded' });
    await amazonPage.waitForTimeout(3000);
  }

  await amazonPage.bringToFront();
  console.log('Current URL:', amazonPage.url());

  // Try to open Rufus
  console.log('\nLooking for Rufus...');
  const rufusAvailable = await openRufusChat(amazonPage);

  if (!rufusAvailable) {
    console.log('\n[WAIT] Rufus not found. Trying search to trigger Rufus...');
    await amazonPage.fill('#twotabsearchtextbox', 'running shoes');
    await amazonPage.press('#twotabsearchtextbox', 'Enter');
    await amazonPage.waitForTimeout(3000);

    const rufusNow = await openRufusChat(amazonPage);
    if (!rufusNow) {
      console.log('\n[FAIL] Rufus not available on this Amazon account.');
      console.log('   Rufus may require:');
      console.log('   - Amazon Prime membership');
      console.log('   - US-based account');
      console.log('   - Mobile app (not always available on web)');
      await browser.close();
      process.exit(1);
    }
  }

  console.log('[OK] Rufus is available!');

  // Load previous progress
  interface StudyResults {
    studyName: string;
    surface: string;
    location: string;
    startTime: string;
    totalQueries: number;
    completedQueries: number;
    successfulQueries: number;
    results: any[];
  }

  let studyResults: StudyResults = {
    studyName: 'Deckers Brands US Visibility Study - Amazon Rufus',
    surface: 'amazon-rufus',
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

  console.log('\n' + '='.repeat(70));
  console.log('  RUNNING QUERIES');
  console.log('='.repeat(70) + '\n');

  for (let i = startIndex; i < QUERIES.length; i++) {
    const query = QUERIES[i];
    const startTime = Date.now();

    process.stdout.write(`[${i + 1}/${QUERIES.length}] "${query.slice(0, 40)}..." `);

    try {
      const response = await submitQuery(amazonPage, query);
      const responseTime = Date.now() - startTime;
      const brandMentions = extractBrandMentions(response);

      studyResults.results.push({
        queryIndex: i,
        query,
        success: true,
        response,
        responseTimeMs: responseTime,
        brandMentions,
      });

      studyResults.completedQueries++;
      studyResults.successfulQueries++;

      const topBrands = brandMentions.slice(0, 3).map(b => b.brand).join(', ');
      console.log(`[OK] (${Math.round(responseTime / 1000)}s) [${topBrands || 'no brands'}]`);

      if (i < QUERIES.length - 1) {
        await clearChat(amazonPage);
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`[FAIL] ${errorMsg}`);

      studyResults.results.push({
        queryIndex: i,
        query,
        success: false,
        response: null,
        responseTimeMs: Date.now() - startTime,
        brandMentions: [],
        error: errorMsg,
      });

      studyResults.completedQueries++;

      // Try to recover
      try {
        await amazonPage.reload({ waitUntil: 'domcontentloaded' });
        await amazonPage.waitForTimeout(2000);
        await openRufusChat(amazonPage);
      } catch {}
    }

    if ((i + 1) % 10 === 0) {
      writeFileSync(INTERMEDIATE_FILE, JSON.stringify(studyResults, null, 2));
      console.log(`\n   [SAVE] Progress saved (${i + 1}/${QUERIES.length})\n`);
    }

    // Human-like delay between queries (5-10 seconds)
    await amazonPage.waitForTimeout(5000 + Math.random() * 5000);
  }

  // Analyze results
  const brandCounts: Record<string, number> = {};
  for (const result of studyResults.results) {
    if (result.success && result.brandMentions) {
      for (const m of result.brandMentions) {
        brandCounts[m.brand] = (brandCounts[m.brand] || 0) + 1;
      }
    }
  }

  const deckersBrands = ['UGG', 'HOKA', 'Teva', 'Sanuk', 'Koolaburra'];

  const output = {
    ...studyResults,
    endTime: new Date().toISOString(),
    analysis: {
      brandVisibility: Object.fromEntries(
        Object.entries(brandCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([brand, count]) => [
            brand,
            {
              queriesAppearing: count,
              percentOfQueries: ((count / studyResults.successfulQueries) * 100).toFixed(1) + '%',
            },
          ])
      ),
      deckersBrandsSummary: Object.fromEntries(
        deckersBrands.map(brand => [
          brand,
          {
            queriesAppearing: brandCounts[brand] || 0,
            percentOfQueries: ((brandCounts[brand] || 0) / studyResults.successfulQueries * 100).toFixed(1) + '%',
          }
        ])
      ),
    },
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  console.log('\n' + '='.repeat(70));
  console.log('  COMPLETE');
  console.log('='.repeat(70));
  console.log(`\nSuccess: ${studyResults.successfulQueries}/${QUERIES.length}`);

  console.log('\n--- Deckers Brands ---');
  for (const brand of deckersBrands) {
    const count = brandCounts[brand] || 0;
    console.log(`  - ${brand}: ${count} queries`);
  }

  console.log('\n--- Top Competitors ---');
  const sorted = Object.entries(brandCounts)
    .filter(([b]) => !deckersBrands.includes(b))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  for (const [brand, count] of sorted) {
    console.log(`  - ${brand}: ${count} queries`);
  }

  console.log(`\n[OK] Saved to: ${OUTPUT_FILE}`);

  if (existsSync(INTERMEDIATE_FILE)) {
    const { unlinkSync } = await import('fs');
    unlinkSync(INTERMEDIATE_FILE);
  }

  await browser.close();
}

main().catch(console.error);
