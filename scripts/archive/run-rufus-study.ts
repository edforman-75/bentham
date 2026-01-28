#!/usr/bin/env npx tsx
/**
 * Amazon Rufus Studies
 *
 * Study 13: Rufus India - Original prompts
 * Study 14: Rufus US - "in India" suffix prompts
 *
 * Usage:
 *   npx tsx scripts/run-rufus-study.ts 13    # India, original
 *   npx tsx scripts/run-rufus-study.ts 14    # US, India suffix
 *
 * Prerequisites:
 * 1. Chrome running with remote debugging:
 *    /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug-profile
 * 2. Navigate to amazon.in (study 13) or amazon.com (study 14) and log in
 * 3. For study 14 (US), ensure NOT using India proxy
 */

import { chromium, Page } from 'playwright';
import * as fs from 'fs';

// Parse command line argument
const studyNum = parseInt(process.argv[2] || '13');
if (![13, 14, 15].includes(studyNum)) {
  console.error('Usage: npx tsx scripts/run-rufus-study.ts [13|14|15]');
  console.error('  13 = Rufus India, Original prompts');
  console.error('  14 = Rufus US, India suffix prompts');
  console.error('  15 = Rufus US, Original prompts');
  process.exit(1);
}

const STUDY_CONFIG = {
  13: {
    domain: 'amazon.in',
    ip: 'India',
    promptType: 'Original',
    suffix: '',
  },
  14: {
    domain: 'amazon.com',
    ip: 'US',
    promptType: 'India Suffix',
    suffix: ' in India',
  },
  15: {
    domain: 'amazon.com',
    ip: 'US',
    promptType: 'Original',
    suffix: '',
  },
};

const config = STUDY_CONFIG[studyNum as 13 | 14 | 15];

const baseQueries = [
  "What are the best budget dog food brands",
  "What are the best treat brands for dogs",
  "Which are the best dog food brands with high reviews",
  "What dog food do vets recommend",
  "Which pet food brand has good meat content",
  "Which brands offer gluten-free dog treats",
  "Can you suggest dog biscuit brands for sensitive stomachs",
  "What are some vegetarian dog biscuit options",
  "What are the best treat brands under Rs 1000",
  "Can you recommend low-calorie chicken treats for dogs",
  "What dog treats are best for medium-sized dogs",
  "What are the Heads Up For Tails options",
  "Which brands sell gluten-free chicken biscuits for dogs",
  "What are healthy treat options for puppies",
  "Can you suggest crunchy biscuits for adult dogs",
  "What are comfortable dog bed options for small dogs",
  "What interactive toys are good for large dogs",
  "What chew toys are suitable for small dogs",
  "What dog harnesses are best for puppies",
  "Which Indian brands offer wet cat food"
];

// Apply suffix if needed
const queries = baseQueries.map(q => q + config.suffix + '?');

interface QueryResult {
  queryIndex: number;
  query: string;
  response: string;
  timestamp: string;
  success: boolean;
  error?: string;
}

const RUFUS_SELECTORS = {
  // Rufus trigger buttons/icons
  rufusTrigger: [
    '[data-testid="rufus-trigger"]',
    'button[aria-label*="Rufus"]',
    '[class*="rufus-icon"]',
    '[aria-label*="Ask Rufus"]',
    'a[href*="rufus"]',
    '#rufus-button',
    // Search bar may have Rufus icon
    '[class*="nav-search"] [class*="rufus"]',
  ],
  // Chat input
  queryInput: [
    '[data-testid="rufus-input"]',
    '#rufus-chat-input',
    'textarea[placeholder*="Ask"]',
    'input[placeholder*="Ask"]',
    '[class*="rufus"] textarea',
    '[class*="rufus"] input[type="text"]',
  ],
  // Send button
  submitButton: [
    '[data-testid="rufus-send"]',
    '#rufus-send-button',
    'button[aria-label*="Send"]',
    '[class*="rufus"] button[type="submit"]',
  ],
  // Response container
  responseContainer: [
    '[data-testid="rufus-response"]',
    '.rufus-message',
    '[data-role="assistant"]',
    '[class*="rufus"] [class*="response"]',
    '[class*="rufus"] [class*="message"]',
  ],
  // Loading indicator
  loadingIndicator: [
    '[data-testid="rufus-loading"]',
    '.rufus-typing',
    '[class*="rufus"] [class*="loading"]',
    '[class*="rufus"] [class*="typing"]',
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
  console.log('Looking for Rufus trigger...');

  // First check if Rufus chat is already open
  const existingInput = await findElement(page, RUFUS_SELECTORS.queryInput);
  if (existingInput) {
    console.log('Rufus chat already open');
    return true;
  }

  // Try to find and click Rufus trigger
  const trigger = await findElement(page, RUFUS_SELECTORS.rufusTrigger);
  if (trigger) {
    console.log('Found Rufus trigger:', trigger);
    await page.click(trigger);
    await page.waitForTimeout(2000);

    // Check if chat opened
    const input = await findElement(page, RUFUS_SELECTORS.queryInput);
    if (input) {
      return true;
    }
  }

  // Try clicking search bar - sometimes Rufus is integrated there
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
  // Find input
  const inputSelector = await findElement(page, RUFUS_SELECTORS.queryInput);
  if (!inputSelector) {
    throw new Error('Cannot find Rufus input field');
  }

  // Clear and type query
  await page.fill(inputSelector, '');
  await page.waitForTimeout(100);
  await page.fill(inputSelector, query);
  await page.waitForTimeout(200);

  // Find and click submit, or press Enter
  const submitSelector = await findElement(page, RUFUS_SELECTORS.submitButton);
  if (submitSelector) {
    await page.click(submitSelector);
  } else {
    await page.press(inputSelector, 'Enter');
  }

  // Wait for response
  console.log('Waiting for response...');
  await page.waitForTimeout(2000);

  // Wait for loading to finish
  let attempts = 0;
  while (attempts < 30) {
    const loading = await findElement(page, RUFUS_SELECTORS.loadingIndicator);
    if (!loading) break;
    await page.waitForTimeout(500);
    attempts++;
  }

  // Additional stabilization
  await page.waitForTimeout(1500);

  // Extract response
  const response = await page.evaluate((selectors) => {
    for (const selector of selectors) {
      const messages = document.querySelectorAll(selector);
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        const text = lastMessage.textContent?.trim();
        if (text && text.length > 10) {
          return text;
        }
      }
    }

    // Fallback: look for any element containing product recommendations
    const allText = document.body.innerText;
    const rufusSection = allText.match(/Rufus[\s\S]*?(?=\n\n|\$)/i);
    if (rufusSection) {
      return rufusSection[0];
    }

    return '';
  }, RUFUS_SELECTORS.responseContainer);

  if (!response) {
    throw new Error('Could not extract Rufus response');
  }

  return response;
}

async function clearChat(page: Page): Promise<void> {
  // Try to find a "new chat" or "clear" button
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
    // Refresh page and reopen Rufus
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await openRufusChat(page);
  }
}

async function runStudy() {
  console.log('='.repeat(60));
  console.log(`Study ${studyNum}: Amazon Rufus - ${config.ip} IP - ${config.promptType}`);
  console.log(`Domain: ${config.domain}`);
  console.log('='.repeat(60));
  console.log('');

  // Connect to Chrome
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];

  // Find matching Amazon tab
  const domainRegex = new RegExp(config.domain.replace('.', '\\.'));
  let page = context.pages().find(p => domainRegex.test(p.url()));

  if (!page) {
    console.log(`No ${config.domain} tab found. Please navigate to ${config.domain} and log in.`);
    console.log('Looking for any Amazon tab...');
    page = context.pages().find(p => /amazon/.test(p.url()));

    if (!page) {
      console.log(`No Amazon tab found. Opening ${config.domain}...`);
      page = await context.newPage();
      await page.goto(`https://www.${config.domain}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
    }
  }

  await page.bringToFront();
  console.log('Current URL:', page.url());
  console.log('');

  // Check if logged in
  const pageText = await page.evaluate(() => document.body.innerText);
  if (pageText.includes('Sign in') && !pageText.includes('Hello,')) {
    console.log('WARNING: You may not be logged in. Rufus may require login.');
  }

  // Try to open Rufus
  const rufusAvailable = await openRufusChat(page);
  if (!rufusAvailable) {
    console.log('');
    console.log('Could not find Rufus chat interface.');
    console.log('Rufus may not be available on web - it might be mobile-app only in India.');
    console.log('');
    console.log('Checking page for Rufus mentions...');

    const hasRufusMention = pageText.toLowerCase().includes('rufus');
    console.log('Page mentions Rufus:', hasRufusMention);

    // Try searching for something to see if Rufus appears
    console.log('Trying a search to trigger Rufus...');
    await page.fill('#twotabsearchtextbox', 'dog food');
    await page.press('#twotabsearchtextbox', 'Enter');
    await page.waitForTimeout(3000);

    const rufusNow = await openRufusChat(page);
    if (!rufusNow) {
      console.log('');
      console.log('Rufus still not available. You may need to:');
      console.log('1. Use the Amazon mobile app instead');
      console.log(`2. Check if your Amazon ${config.ip} account has Rufus enabled`);
      console.log('3. Try a different region/VPN');
      await browser.close();
      return;
    }
  }

  console.log('Rufus chat is available!');
  console.log('');

  const results: QueryResult[] = [];
  const startTime = Date.now();

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    console.log(`[${i + 1}/${queries.length}] ${query}`);

    try {
      const response = await submitQuery(page, query);

      results.push({
        queryIndex: i + 1,
        query,
        response,
        timestamp: new Date().toISOString(),
        success: true,
      });

      console.log(`  ✓ Got response (${response.length} chars)`);

      // Clear chat for next query
      if (i < queries.length - 1) {
        await clearChat(page);
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`  ✗ Error: ${errorMsg}`);

      results.push({
        queryIndex: i + 1,
        query,
        response: '',
        timestamp: new Date().toISOString(),
        success: false,
        error: errorMsg,
      });

      // Try to recover
      try {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
        await openRufusChat(page);
      } catch {}
    }

    // Rate limiting
    await page.waitForTimeout(2000);
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const successCount = results.filter(r => r.success).length;

  console.log('');
  console.log('='.repeat(60));
  console.log(`Completed: ${successCount}/${queries.length} queries in ${elapsed}s`);
  console.log('='.repeat(60));

  // Save results
  const output = {
    study: studyNum,
    surface: 'Amazon Rufus',
    ip: config.ip,
    prompt: config.promptType,
    domain: config.domain,
    timestamp: new Date().toISOString(),
    totalQueries: queries.length,
    successfulQueries: successCount,
    results,
  };

  const filenames: Record<number, string> = {
    13: 'studies/study13-amazon-rufus-india.json',
    14: 'studies/study14-amazon-rufus-us-india-suffix.json',
    15: 'studies/study15-amazon-rufus-us-original.json',
  };
  const filename = filenames[studyNum];

  fs.writeFileSync(filename, JSON.stringify(output, null, 2));

  console.log(`Saved to ${filename}`);

  await browser.close();
}

runStudy().catch(console.error);
