#!/usr/bin/env npx tsx
/**
 * Run HUFT 100-Prompt India Study - Gemini Web Surface
 *
 * Queries Gemini Web for the same 100 pet product prompts from India IP.
 * This complements the OpenAI API, ChatGPT Web, and Google Search surfaces.
 */

import { chromium, type Page } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';

// Proxy disabled - running from real IP to avoid Google network block
const USE_PROXY = false;
const TWOCAPTCHA_API_KEY = process.env.TWOCAPTCHA_API_KEY || '';

const PROXY_CONFIG = {
  server: 'http://170.106.118.114:2334',
  username: `${TWOCAPTCHA_API_KEY}-zone-custom-region-in-st-maharashtra-city-mumbai`,
  password: TWOCAPTCHA_API_KEY,
};

// Resume from query index (0-based). Set to 0 to start fresh.
const RESUME_FROM_QUERY = 0;

// Load study manifest
const manifest = JSON.parse(readFileSync('studies/huft-100-prompt-india-study.json', 'utf-8'));
const QUERIES = manifest.queries.map((q: { text: string }) => q.text);

interface QueryResult {
  query: string;
  queryIndex: number;
  surface: string;
  success: boolean;
  response?: string;
  error?: string;
  timestamp: string;
  responseTimeMs: number;
}

const GEMINI_SELECTORS = {
  input: [
    'div[contenteditable="true"][aria-label*="Enter"]',
    'div[contenteditable="true"]',
    'rich-textarea div[contenteditable="true"]',
    '.ql-editor[contenteditable="true"]',
  ],
  submit: [
    'button[aria-label="Send message"]',
    'button[data-test-id="send-button"]',
    'button[aria-label*="Send"]',
    'button[mattooltip="Send"]',
  ],
  response: [
    '.model-response-text',
    'message-content.model-response-text',
    '.response-container-content',
    'model-response message-content',
    '.markdown-main-panel',
  ],
};

async function queryGeminiWeb(query: string, queryIndex: number, page: Page): Promise<QueryResult> {
  const startTime = Date.now();

  try {
    await page.bringToFront();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    // Count initial responses
    let initialCount = 0;
    for (const sel of GEMINI_SELECTORS.response) {
      initialCount = await page.locator(sel).count();
      if (initialCount > 0) break;
    }

    // Find and fill input
    let inputFound = false;
    for (const sel of GEMINI_SELECTORS.input) {
      try {
        const input = page.locator(sel).first();
        if (await input.isVisible({ timeout: 2000 })) {
          await input.click();
          await page.waitForTimeout(200);

          // Clear existing text
          await page.keyboard.press('Meta+a');
          await page.keyboard.press('Backspace');
          await page.waitForTimeout(100);

          // Type the query
          await page.keyboard.type(query, { delay: 10 });
          inputFound = true;
          break;
        }
      } catch { continue; }
    }

    if (!inputFound) {
      return {
        query,
        queryIndex,
        surface: 'gemini-web',
        success: false,
        error: 'Input field not found',
        timestamp: new Date().toISOString(),
        responseTimeMs: Date.now() - startTime,
      };
    }

    await page.waitForTimeout(300);

    // Submit
    let submitted = false;
    for (const sel of GEMINI_SELECTORS.submit) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 1000 })) {
          await btn.click();
          submitted = true;
          break;
        }
      } catch { continue; }
    }

    if (!submitted) {
      // Try Enter key as fallback
      await page.keyboard.press('Enter');
    }

    // Wait for response
    await page.waitForTimeout(3000);

    let response = '';
    const maxWait = 90000; // 90 seconds for LLM
    const waitStart = Date.now();

    while (Date.now() - waitStart < maxWait) {
      // Check for any response container
      for (const sel of GEMINI_SELECTORS.response) {
        const currentCount = await page.locator(sel).count();
        if (currentCount > initialCount || (initialCount === 0 && currentCount > 0)) {
          // Wait for streaming to complete (check if still generating)
          let prevLength = 0;
          let stableCount = 0;

          for (let i = 0; i < 20; i++) {
            await page.waitForTimeout(1000);
            const currentResponse = await page.evaluate((s) => {
              const els = document.querySelectorAll(s);
              for (let i = els.length - 1; i >= 0; i--) {
                const text = (els[i] as HTMLElement).innerText?.trim() || '';
                if (text && text.length > 20) return text;
              }
              return '';
            }, sel);

            if (currentResponse.length === prevLength && currentResponse.length > 50) {
              stableCount++;
              if (stableCount >= 3) {
                response = currentResponse;
                break;
              }
            } else {
              stableCount = 0;
              prevLength = currentResponse.length;
            }
          }

          if (response) break;
        }
      }

      if (response) break;
      await page.waitForTimeout(1000);
    }

    // Final attempt to get response
    if (!response) {
      for (const sel of GEMINI_SELECTORS.response) {
        response = await page.evaluate((s) => {
          const els = document.querySelectorAll(s);
          for (let i = els.length - 1; i >= 0; i--) {
            const text = (els[i] as HTMLElement).innerText?.trim() || '';
            if (text && text.length > 20) return text;
          }
          return '';
        }, sel);
        if (response && response.length > 20) break;
      }
    }

    if (!response || response.length < 20) {
      return {
        query,
        queryIndex,
        surface: 'gemini-web',
        success: false,
        error: 'No response found',
        timestamp: new Date().toISOString(),
        responseTimeMs: Date.now() - startTime,
      };
    }

    return {
      query,
      queryIndex,
      surface: 'gemini-web',
      success: true,
      response,
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      query,
      queryIndex,
      surface: 'gemini-web',
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
    };
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('  HUFT 100-Prompt India Study - Gemini Web Surface');
  console.log('  Location: India (Mumbai) via 2Captcha Residential Proxy');
  console.log('='.repeat(70));
  console.log(`\nTotal queries: ${QUERIES.length}`);
  if (RESUME_FROM_QUERY > 0) {
    console.log(`Resuming from query: ${RESUME_FROM_QUERY + 1}`);
  }
  console.log('');

  // Launch browser (with or without proxy)
  console.log(USE_PROXY ? 'Launching browser with India proxy...' : 'Launching browser (no proxy - real IP)...');
  const browser = await chromium.launch({
    headless: false,
    ...(USE_PROXY ? { proxy: PROXY_CONFIG } : {}),
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--disable-infobars',
    ],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  });

  // Remove webdriver detection
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  // Check IP location
  console.log('\nVerifying IP location...');
  const testPage = await context.newPage();
  try {
    await testPage.goto('https://ipinfo.io/json', { timeout: 30000 });
    const ipInfo = await testPage.evaluate(() => JSON.parse(document.body.innerText));
    console.log(`✅ IP Location: ${ipInfo.city}, ${ipInfo.region}, ${ipInfo.country}`);
    if (!USE_PROXY) {
      console.log('   (Running from real IP - not India proxy)');
    } else if (ipInfo.country !== 'IN') {
      console.warn(`⚠️  Warning: IP is in ${ipInfo.country}, not India (IN)`);
    }
  } catch (e) {
    console.error('❌ Failed to verify IP location:', e);
  }
  await testPage.close();

  // Open Gemini page
  const geminiPage = await context.newPage();
  console.log('\nOpening Gemini...');
  await geminiPage.goto('https://gemini.google.com', { timeout: 60000, waitUntil: 'domcontentloaded' });
  await geminiPage.waitForTimeout(3000);

  // Check if logged in (Gemini requires Google account)
  const isLoggedIn = await geminiPage.evaluate(() => {
    // Check for login button or redirect to accounts
    const loginButton = document.querySelector('[data-mdc-dialog-action="login"]') ||
                        document.querySelector('a[href*="accounts.google.com"]');
    return !loginButton && !window.location.href.includes('accounts.google.com');
  });

  if (!isLoggedIn) {
    console.log('\n⚠️  Gemini requires Google login. Please log in manually in the browser window.');
    console.log('   Press Enter here when you are logged in and ready...');
    await new Promise<void>(resolve => {
      process.stdin.once('data', () => resolve());
    });
  }
  console.log('✅ Gemini ready');
  console.log('');

  // Load previous results if resuming
  let results: QueryResult[] = [];
  if (RESUME_FROM_QUERY > 0) {
    try {
      const intermediatePath = `studies/huft-100-india-gemini-intermediate-${RESUME_FROM_QUERY}.json`;
      if (existsSync(intermediatePath)) {
        const previousData = JSON.parse(readFileSync(intermediatePath, 'utf-8'));
        results = previousData.results || [];
        console.log(`📂 Loaded ${results.length} previous results\n`);
      }
    } catch (e) {
      console.log(`⚠️  Could not load previous results, starting fresh\n`);
    }
  }

  const startTime = Date.now();

  for (let i = RESUME_FROM_QUERY; i < QUERIES.length; i++) {
    const query = QUERIES[i];
    const progress = `[${i + 1}/${QUERIES.length}]`;

    console.log(`\n${progress} "${query.slice(0, 60)}${query.length > 60 ? '...' : ''}"`);
    console.log('-'.repeat(70));

    process.stdout.write('  → Gemini Web... ');
    const result = await queryGeminiWeb(query, i, geminiPage);
    results.push(result);

    if (result.success) {
      console.log(`✅ (${result.responseTimeMs}ms)`);
    } else {
      console.log(`❌ ${result.error}`);
    }

    // Save intermediate results every 10 queries
    if ((i + 1) % 10 === 0) {
      const intermediatePath = `studies/huft-100-india-gemini-intermediate-${i + 1}.json`;
      writeFileSync(intermediatePath, JSON.stringify({ results, lastQuery: i }, null, 2));
      console.log(`\n  💾 Saved intermediate results to ${intermediatePath}`);
    }

    // Small delay between queries
    if (i < QUERIES.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  const totalTime = Date.now() - startTime;

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('  RESULTS SUMMARY');
  console.log('='.repeat(70));

  const successCount = results.filter(r => r.success).length;
  console.log(`\nGemini Web: ${successCount}/${results.length} successful`);
  console.log(`Total time: ${Math.round(totalTime / 1000 / 60)} minutes`);

  // Save final results
  const outputPath = 'studies/huft-100-india-gemini-results.json';
  writeFileSync(outputPath, JSON.stringify({
    studyId: `huft-india-gemini-${Date.now()}`,
    studyName: `${manifest.name} - Gemini Web`,
    location: manifest.locations[0],
    timestamp: new Date().toISOString(),
    totalTimeMs: totalTime,
    summary: {
      totalJobs: results.length,
      successful: successCount,
      failed: results.length - successCount,
    },
    results,
  }, null, 2));

  console.log(`\n✅ Results saved to: ${outputPath}`);
  console.log('\n📝 Browser left open. You can close it manually when done.');
}

main().catch(console.error);
