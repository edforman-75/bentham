#!/usr/bin/env npx tsx
/**
 * Quick test: Verify AI Overview extraction is working
 * Runs 3 queries and shows what we capture
 */

import { chromium, type Page } from 'playwright';

const TWOCAPTCHA_API_KEY = process.env.TWOCAPTCHA_API_KEY;

if (!TWOCAPTCHA_API_KEY) {
  console.error('❌ TWOCAPTCHA_API_KEY environment variable is not set');
  console.error('   Add it to your .env file: TWOCAPTCHA_API_KEY=your-key-here');
  process.exit(1);
}

const PROXY_CONFIG = {
  server: 'http://170.106.118.114:2334',
  username: `${TWOCAPTCHA_API_KEY}-zone-custom-region-in-st-karnataka-city-bengaluru`,
  password: TWOCAPTCHA_API_KEY,
};

const TEST_QUERIES = [
  'best dog food brands in India',
  'how to train a puppy not to bite',
  'best cat litter brands',
];

async function humanType(page: Page, text: string): Promise<void> {
  for (const char of text) {
    await page.keyboard.type(char);
    await page.waitForTimeout(50 + Math.random() * 100);
  }
}

async function testAiOverviewExtraction(page: Page, query: string): Promise<void> {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`QUERY: "${query}"`);
  console.log('='.repeat(70));

  await page.goto('https://www.google.co.in', { timeout: 30000 });
  await page.waitForTimeout(1000);

  // Dismiss modals
  try {
    const btn = page.locator('text="Accept all"').first();
    if (await btn.isVisible({ timeout: 500 })) await btn.click();
  } catch {}

  const searchInput = page.locator('textarea[name="q"], input[name="q"]').first();
  await searchInput.click();
  await humanType(page, query);
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');

  // Wait for results
  console.log('\nWaiting for results to load...');
  await page.waitForTimeout(6000);

  // Try to expand AI Overview if collapsed
  try {
    const showMore = page.locator('div[role="button"]:has-text("Show more")').first();
    if (await showMore.isVisible({ timeout: 1000 })) {
      console.log('Found "Show more" button, clicking...');
      await showMore.click();
      await page.waitForTimeout(2000);
    }
  } catch {}

  // Take screenshot for manual inspection
  const screenshotPath = `studies/test-google-${Date.now()}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`📸 Screenshot saved: ${screenshotPath}`);

  // Extract and display what we find
  const extracted = await page.evaluate(() => {
    const results: { selector: string; content: string; length: number }[] = [];

    // Test each selector
    const selectors = [
      { name: 'AIOverview attr', sel: 'div[data-attrid="AIOverview"]' },
      { name: 'N760b jsname', sel: 'div[jsname="N760b"]' },
      { name: 'data-md=50', sel: 'div[data-md="50"]' },
      { name: 'LGOjhe class', sel: 'div.LGOjhe' },
      { name: 'xpdopen', sel: 'div.xpdopen div.wDYxhc' },
      { name: 'First rso child', sel: '#rso > div:first-child' },
      { name: 'kp-wholepage', sel: 'div.kp-wholepage' },
      { name: 'aCZVp controller', sel: 'div[jscontroller="aCZVp"]' },
    ];

    for (const { name, sel } of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = (el as HTMLElement).innerText?.trim() || '';
        if (text.length > 0) {
          results.push({
            selector: name,
            content: text.slice(0, 500),
            length: text.length,
          });
        }
      }
    }

    // Also check for People Also Ask specifically
    const paa = document.querySelector('div[data-initq]');
    if (paa) {
      const paaText = (paa as HTMLElement).innerText?.trim() || '';
      results.push({
        selector: 'PAA (data-initq)',
        content: paaText.slice(0, 300),
        length: paaText.length,
      });
    }

    return results;
  });

  console.log('\n--- EXTRACTED CONTENT ---\n');

  if (extracted.length === 0) {
    console.log('❌ No content found with any selector!');
  } else {
    for (const item of extracted) {
      console.log(`\n📍 SELECTOR: ${item.selector} (${item.length} chars)`);
      console.log('-'.repeat(50));

      // Check if it looks like PAA (mostly questions)
      const lines = item.content.split('\n').filter(l => l.trim());
      const questions = lines.filter(l => l.trim().endsWith('?'));
      const isPaaLike = questions.length >= lines.length * 0.5 && lines.length <= 8;

      if (isPaaLike) {
        console.log('⚠️  LOOKS LIKE PAA (mostly questions):');
      } else if (item.length > 200) {
        console.log('✅ LOOKS LIKE REAL CONTENT:');
      }

      console.log(item.content);
    }
  }

  // Show page title and URL for context
  const pageInfo = await page.evaluate(() => ({
    title: document.title,
    url: window.location.href,
  }));
  console.log(`\n📄 Page: ${pageInfo.title}`);
  console.log(`🔗 URL: ${pageInfo.url}`);
}

async function main() {
  console.log('='.repeat(70));
  console.log('  AI OVERVIEW EXTRACTION TEST');
  console.log('  Testing 3 queries to verify scraper quality');
  console.log('='.repeat(70));

  const browser = await chromium.launch({
    headless: false,
    proxy: PROXY_CONFIG,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  // Verify IP
  const testPage = await context.newPage();
  await testPage.goto('https://ipinfo.io/json');
  const ipInfo = await testPage.evaluate(() => JSON.parse(document.body.innerText));
  console.log(`\n✅ IP: ${ipInfo.city}, ${ipInfo.country}`);
  await testPage.close();

  const page = await context.newPage();

  for (const query of TEST_QUERIES) {
    await testAiOverviewExtraction(page, query);
    console.log('\n⏱️  Waiting 10 seconds before next query...');
    await new Promise(r => setTimeout(r, 10000));
  }

  console.log('\n' + '='.repeat(70));
  console.log('  TEST COMPLETE');
  console.log('  Check the output above and screenshots in studies/');
  console.log('  Browser left open for manual inspection');
  console.log('='.repeat(70));
}

main().catch(console.error);
