#!/usr/bin/env npx tsx
/**
 * Natural Balance US Visibility Study - Amazon Rufus
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
const OUTPUT_DIR = 'repository/results/glu/natural-balance-us-visibility';
const OUTPUT_FILE = `${OUTPUT_DIR}/amazon-rufus-results.json`;
const INTERMEDIATE_FILE = `${OUTPUT_DIR}/amazon-rufus-intermediate.json`;

const BRANDS_TO_TRACK = [
  'Natural Balance',
  'Blue Buffalo', 'Wellness', 'Merrick', 'Orijen', 'Acana',
  'Canidae', 'Nutro', 'Taste of the Wild', 'Fromm', 'Nulo',
  'Purina', 'Pedigree', 'Iams', "Hill's", 'Royal Canin', 'Rachael Ray',
  'Chewy', 'Petco', 'PetSmart', 'Amazon', 'Walmart', 'Target',
];

const QUERIES = [
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
  "what ingredients to avoid in dog food",
  "is grain free dog food bad for dogs",
  "best protein sources for dog food",
  "how to read dog food labels",
  "what makes a dog food high quality",
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
  console.log('  NATURAL BALANCE US VISIBILITY STUDY - Amazon Rufus');
  console.log('='.repeat(70));

  // Check CDP
  try {
    const response = await fetch(`${CDP_URL}/json/version`);
    if (!response.ok) throw new Error('CDP not available');
    console.log('✅ Chrome CDP connection available');
  } catch {
    console.error('\n❌ Chrome not running with CDP on port 9222');
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
    console.log('\n⚠️  Rufus not found. Trying search to trigger Rufus...');
    await amazonPage.fill('#twotabsearchtextbox', 'dog food');
    await amazonPage.press('#twotabsearchtextbox', 'Enter');
    await amazonPage.waitForTimeout(3000);

    const rufusNow = await openRufusChat(amazonPage);
    if (!rufusNow) {
      console.log('\n❌ Rufus not available on this Amazon account.');
      console.log('   Rufus may require:');
      console.log('   - Amazon Prime membership');
      console.log('   - US-based account');
      console.log('   - Mobile app (not always available on web)');
      await browser.close();
      process.exit(1);
    }
  }

  console.log('✅ Rufus is available!');

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
    studyName: 'Natural Balance US Visibility Study - Amazon Rufus',
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
      console.log(`\n📂 Resuming from query ${startIndex + 1}...`);
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
      console.log(`✅ (${Math.round(responseTime / 1000)}s) [${topBrands || 'no brands'}]`);

      if (i < QUERIES.length - 1) {
        await clearChat(amazonPage);
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`❌ ${errorMsg}`);

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
      console.log(`\n   💾 Progress saved (${i + 1}/${QUERIES.length})\n`);
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
    },
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  console.log('\n' + '='.repeat(70));
  console.log('  COMPLETE');
  console.log('='.repeat(70));
  console.log(`\nSuccess: ${studyResults.successfulQueries}/${QUERIES.length}`);

  console.log('\nTop brands:');
  const sorted = Object.entries(brandCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [brand, count] of sorted) {
    const isClient = brand === 'Natural Balance';
    console.log(`  - ${brand}: ${count} queries${isClient ? ' ← CLIENT' : ''}`);
  }

  console.log(`\n✅ Saved to: ${OUTPUT_FILE}`);

  if (existsSync(INTERMEDIATE_FILE)) {
    const { unlinkSync } = await import('fs');
    unlinkSync(INTERMEDIATE_FILE);
  }

  await browser.close();
}

main().catch(console.error);
