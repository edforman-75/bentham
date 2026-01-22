#!/usr/bin/env npx tsx
/**
 * Run HUFT 100-Prompt India Study
 *
 * Queries OpenAI API, ChatGPT Web, and Google Search (with AI Overviews)
 * for 100 pet product prompts from an India IP via 2Captcha residential proxy.
 */

import { chromium, type Page, type Browser } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';

// 2Captcha Proxy Configuration for India (Mumbai, Maharashtra)
// Generated from: https://2captcha.com/enterpage#proxy
// Using HTTP proxy (port 2334) instead of SOCKS5 for Playwright compatibility
const TWOCAPTCHA_API_KEY = process.env.TWOCAPTCHA_API_KEY;
if (!TWOCAPTCHA_API_KEY) {
  console.error('❌ TWOCAPTCHA_API_KEY environment variable is not set');
  process.exit(1);
}

const PROXY_CONFIG = {
  server: 'http://170.106.118.114:2334',
  username: `${TWOCAPTCHA_API_KEY}-zone-custom-region-in-st-maharashtra-city-mumbai`,
  password: TWOCAPTCHA_API_KEY,
};

// OpenAI API key from environment
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY environment variable is not set');
  process.exit(1);
}

// Resume from query index (0-based). Set to 0 to start fresh.
const RESUME_FROM_QUERY = 0;

// Load study manifest
const manifest = JSON.parse(readFileSync('studies/huft-100-prompt-india-study.json', 'utf-8'));
const QUERIES = manifest.queries.map((q: { text: string }) => q.text);

const CHATGPT_SELECTORS = {
  input: ['#prompt-textarea', '[contenteditable="true"]'],
  submit: ['button[data-testid="send-button"]', 'button[data-testid="composer-send-button"]'],
  response: ['[data-message-author-role="assistant"] .markdown', '[data-message-author-role="assistant"]'],
};

const GOOGLE_SELECTORS = {
  searchInput: 'textarea[name="q"], input[name="q"]',
  searchButton: 'input[name="btnK"], button[type="submit"]',
  aiOverview: '[data-attrid="AIOverview"], [data-md="50"], .kp-wholepage [data-async-type="editableDirective"], div[jsname="N760b"], .wDYxhc[data-md], [data-hveid] .wDYxhc',
  organicResults: '#search .g, .hlcw0c .g',
};

interface QueryResult {
  query: string;
  queryIndex: number;
  surface: string;
  success: boolean;
  response?: string;
  aiOverview?: string;
  organicResults?: string[];
  error?: string;
  timestamp: string;
  responseTimeMs: number;
}

async function queryChatGPTWeb(query: string, queryIndex: number, page: Page): Promise<QueryResult> {
  const startTime = Date.now();

  try {
    await page.bringToFront();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    // Count initial responses
    let initialCount = 0;
    for (const sel of CHATGPT_SELECTORS.response) {
      initialCount = await page.locator(sel).count();
      if (initialCount > 0) break;
    }

    // Find and fill input
    let inputFound = false;
    for (const sel of CHATGPT_SELECTORS.input) {
      try {
        if (await page.isVisible(sel)) {
          await page.click(sel);
          await page.keyboard.press('Meta+a');
          try {
            await page.fill(sel, query);
          } catch {
            await page.keyboard.press('Backspace');
            await page.keyboard.type(query, { delay: 10 });
          }
          inputFound = true;
          break;
        }
      } catch { continue; }
    }

    if (!inputFound) {
      return {
        query,
        queryIndex,
        surface: 'chatgpt-web',
        success: false,
        error: 'Input field not found',
        timestamp: new Date().toISOString(),
        responseTimeMs: Date.now() - startTime,
      };
    }

    await page.waitForTimeout(300);

    // Submit
    let submitted = false;
    for (const sel of CHATGPT_SELECTORS.submit) {
      try {
        if (await page.isVisible(sel)) {
          await page.click(sel);
          submitted = true;
          break;
        }
      } catch { continue; }
    }
    if (!submitted) {
      await page.keyboard.press('Enter');
    }

    // Wait for response
    await page.waitForTimeout(3000);

    let response = '';
    const maxWait = 90000; // 90 seconds for LLM
    const waitStart = Date.now();

    for (const sel of CHATGPT_SELECTORS.response) {
      while (Date.now() - waitStart < maxWait) {
        const currentCount = await page.locator(sel).count();
        if (currentCount > initialCount || initialCount === 0) {
          // Wait for streaming to complete
          await page.waitForTimeout(8000);
          break;
        }
        await page.waitForTimeout(1000);
      }

      // Get the last non-empty response
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

    if (!response) {
      return {
        query,
        queryIndex,
        surface: 'chatgpt-web',
        success: false,
        error: 'No response found',
        timestamp: new Date().toISOString(),
        responseTimeMs: Date.now() - startTime,
      };
    }

    return {
      query,
      queryIndex,
      surface: 'chatgpt-web',
      success: true,
      response,
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      query,
      queryIndex,
      surface: 'chatgpt-web',
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
    };
  }
}

async function queryGoogleSearch(query: string, queryIndex: number, page: Page): Promise<QueryResult> {
  const startTime = Date.now();

  try {
    await page.bringToFront();

    // Navigate to Google if not already there
    if (!page.url().includes('google.com')) {
      await page.goto('https://www.google.com');
      await page.waitForTimeout(1000);
    }

    // Clear and fill search
    const searchInput = page.locator(GOOGLE_SELECTORS.searchInput).first();
    await searchInput.click();
    await page.keyboard.press('Meta+a');
    await searchInput.fill(query);
    await page.waitForTimeout(300);

    // Submit search
    await page.keyboard.press('Enter');

    // Wait for results
    await page.waitForTimeout(3000);

    // Dismiss Google location/permission modals if present
    try {
      const notNowButton = page.locator('text="Not now"').first();
      if (await notNowButton.isVisible({ timeout: 1000 })) {
        await notNowButton.click();
        await page.waitForTimeout(500);
      }
    } catch {
      // No modal present, continue
    }

    // Also try dismissing other common Google modals
    try {
      const dismissButtons = ['text="No thanks"', 'text="Dismiss"', 'text="Got it"', '[aria-label="Close"]'];
      for (const selector of dismissButtons) {
        const btn = page.locator(selector).first();
        if (await btn.isVisible({ timeout: 200 })) {
          await btn.click();
          await page.waitForTimeout(300);
          break;
        }
      }
    } catch {
      // No modal, continue
    }

    // Wait for AI Overview (may not always appear)
    let aiOverview = '';
    try {
      await page.waitForTimeout(5000); // Extra wait for AI Overview

      aiOverview = await page.evaluate(() => {
        // Multiple selectors for AI Overview
        const selectors = [
          '[data-attrid="AIOverview"]',
          '[data-md="50"]',
          '.kp-wholepage [data-async-type="editableDirective"]',
          'div[jsname="N760b"]',
          '.wDYxhc[data-md]',
          '[data-hveid] .wDYxhc',
          '.xpdopen .wDYxhc',
          '#rso > div:first-child .wDYxhc',
        ];

        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) {
            const text = (el as HTMLElement).innerText?.trim();
            if (text && text.length > 100) return text;
          }
        }

        // Look for "AI Overview" heading
        const headings = document.querySelectorAll('h2, div[role="heading"]');
        for (const h of headings) {
          if (h.textContent?.toLowerCase().includes('ai overview')) {
            const container = h.closest('div[data-hveid]') || h.parentElement?.parentElement;
            if (container) {
              const text = (container as HTMLElement).innerText?.trim();
              if (text && text.length > 100) return text;
            }
          }
        }

        return '';
      });
    } catch {
      // AI Overview not found, continue
    }

    // Get organic results
    const organicResults = await page.evaluate(() => {
      const results: string[] = [];
      const items = document.querySelectorAll('#search .g');

      for (let i = 0; i < Math.min(items.length, 10); i++) {
        const item = items[i];
        const title = item.querySelector('h3')?.textContent || '';
        const snippet = item.querySelector('.VwiC3b, [data-sncf]')?.textContent || '';
        const link = item.querySelector('a')?.href || '';

        if (title && link) {
          results.push(`${title}\n${link}\n${snippet}`);
        }
      }

      return results;
    });

    const responseTimeMs = Date.now() - startTime;

    return {
      query,
      queryIndex,
      surface: 'google-search',
      success: true,
      aiOverview: aiOverview || undefined,
      organicResults,
      response: aiOverview || organicResults.slice(0, 3).join('\n\n'),
      timestamp: new Date().toISOString(),
      responseTimeMs,
    };
  } catch (error) {
    return {
      query,
      queryIndex,
      surface: 'google-search',
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
    };
  }
}

async function queryOpenAIAPI(query: string, queryIndex: number): Promise<QueryResult> {
  const startTime = Date.now();
  const apiKey = OPENAI_API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      query,
      queryIndex,
      surface: 'openai-api',
      success: false,
      error: 'OPENAI_API_KEY not set',
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
    };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: query }],
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        query,
        queryIndex,
        surface: 'openai-api',
        success: false,
        error: `API error: ${response.status} - ${error}`,
        timestamp: new Date().toISOString(),
        responseTimeMs: Date.now() - startTime,
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    return {
      query,
      queryIndex,
      surface: 'openai-api',
      success: true,
      response: content,
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      query,
      queryIndex,
      surface: 'openai-api',
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
    };
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('  HUFT 100-Prompt India Study');
  console.log('  Surfaces: OpenAI API, ChatGPT Web, Google Search + AI Overview');
  console.log('  Location: India (Mumbai) via 2Captcha Residential Proxy');
  console.log('='.repeat(70));
  console.log(`\nTotal queries: ${QUERIES.length}`);
  if (RESUME_FROM_QUERY > 0) {
    console.log(`Resuming from query: ${RESUME_FROM_QUERY + 1}`);
    console.log(`Remaining queries: ${QUERIES.length - RESUME_FROM_QUERY}`);
  }
  console.log(`Total jobs: ${(QUERIES.length - RESUME_FROM_QUERY) * 3}`);
  console.log('');

  // Launch browser with India proxy
  console.log('Launching browser with India (Mumbai) proxy...');
  console.log(`   Proxy: ${PROXY_CONFIG.server}`);
  console.log(`   Username: ${PROXY_CONFIG.username.slice(0, 30)}...`);

  const browser = await chromium.launch({
    headless: false,
    proxy: PROXY_CONFIG,
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

  // Test proxy with IP check
  console.log('\nVerifying India IP...');
  const testPage = await context.newPage();
  try {
    await testPage.goto('https://ipinfo.io/json', { timeout: 30000 });
    const ipInfo = await testPage.evaluate(() => JSON.parse(document.body.innerText));
    console.log(`✅ IP Location: ${ipInfo.city}, ${ipInfo.region}, ${ipInfo.country}`);
    if (ipInfo.country !== 'IN') {
      console.warn(`⚠️  Warning: IP is in ${ipInfo.country}, not India (IN)`);
    }
  } catch (e) {
    console.error('❌ Failed to verify IP location:', e);
  }
  await testPage.close();

  // Open ChatGPT page
  const chatgptPage = await context.newPage();
  console.log('\nOpening ChatGPT...');
  await chatgptPage.goto('https://chatgpt.com', { timeout: 60000, waitUntil: 'domcontentloaded' });
  await chatgptPage.waitForTimeout(3000);

  // Check if logged in
  const isLoggedIn = await chatgptPage.evaluate(() => {
    return !document.querySelector('[data-testid="login-button"]') &&
           !window.location.href.includes('/auth/');
  });

  if (!isLoggedIn) {
    console.log('\n⚠️  ChatGPT requires login. Please log in manually in the browser window.');
    console.log('   Press Enter here when you are logged in and ready...');
    await new Promise<void>(resolve => {
      process.stdin.once('data', () => resolve());
    });
  }
  console.log('✅ ChatGPT ready');

  // Open Google page
  const googlePage = await context.newPage();
  console.log('\nOpening Google...');
  await googlePage.goto('https://www.google.com', { timeout: 30000 });
  console.log('✅ Google ready');
  console.log('');

  // Load previous results if resuming
  let results: QueryResult[] = [];
  if (RESUME_FROM_QUERY > 0) {
    try {
      const intermediatePath = `studies/huft-100-india-intermediate-${RESUME_FROM_QUERY}.json`;
      const previousData = JSON.parse(readFileSync(intermediatePath, 'utf-8'));
      results = previousData.results || [];
      console.log(`📂 Loaded ${results.length} previous results from ${intermediatePath}`);
      console.log(`   Resuming from query ${RESUME_FROM_QUERY + 1}...\n`);
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

    // 1. OpenAI API
    process.stdout.write('  → OpenAI API... ');
    const apiResult = await queryOpenAIAPI(query, i);
    results.push(apiResult);
    if (apiResult.success) {
      console.log(`✅ (${apiResult.responseTimeMs}ms)`);
    } else {
      console.log(`❌ ${apiResult.error?.slice(0, 50)}`);
      // OPERATOR NOTIFICATION: Stop on quota/auth errors
      if (apiResult.error?.includes('insufficient_quota') || apiResult.error?.includes('429')) {
        console.log('\n' + '!'.repeat(70));
        console.log('  ⚠️  OPERATOR ACTION REQUIRED: OpenAI API quota exceeded');
        console.log('  Please add credits at: https://platform.openai.com/account/billing');
        console.log('  Press Enter to continue WITHOUT OpenAI API, or Ctrl+C to stop...');
        console.log('!'.repeat(70));
        await new Promise<void>(resolve => {
          process.stdin.once('data', () => resolve());
        });
        // Skip remaining OpenAI API calls
        console.log('  Continuing without OpenAI API...\n');
      }
    }

    // 2. ChatGPT Web
    process.stdout.write('  → ChatGPT Web... ');
    const chatgptResult = await queryChatGPTWeb(query, i, chatgptPage);
    results.push(chatgptResult);
    console.log(chatgptResult.success ? `✅ (${chatgptResult.responseTimeMs}ms)` : `❌ ${chatgptResult.error}`);

    // 3. Google Search
    process.stdout.write('  → Google Search... ');
    const googleResult = await queryGoogleSearch(query, i, googlePage);
    results.push(googleResult);
    const aiOverviewStatus = googleResult.aiOverview ? ' [AI Overview found]' : ' [No AI Overview]';
    console.log(googleResult.success ? `✅ (${googleResult.responseTimeMs}ms)${aiOverviewStatus}` : `❌ ${googleResult.error}`);

    // Save intermediate results every 10 queries
    if ((i + 1) % 10 === 0) {
      const intermediatePath = `studies/huft-100-india-intermediate-${i + 1}.json`;
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

  const apiResults = results.filter(r => r.surface === 'openai-api');
  const chatgptResults = results.filter(r => r.surface === 'chatgpt-web');
  const googleResults = results.filter(r => r.surface === 'google-search');
  const aiOverviewCount = googleResults.filter(r => r.aiOverview).length;

  console.log(`\nOpenAI API:    ${apiResults.filter(r => r.success).length}/${apiResults.length} successful`);
  console.log(`ChatGPT Web:   ${chatgptResults.filter(r => r.success).length}/${chatgptResults.length} successful`);
  console.log(`Google Search: ${googleResults.filter(r => r.success).length}/${googleResults.length} successful`);
  console.log(`AI Overviews:  ${aiOverviewCount}/${googleResults.length} found`);
  console.log(`\nTotal time: ${Math.round(totalTime / 1000 / 60)} minutes`);

  // Save final results
  const outputPath = 'studies/huft-100-india-study-results.json';
  writeFileSync(outputPath, JSON.stringify({
    studyId: crypto.randomUUID(),
    studyName: manifest.name,
    location: manifest.locations[0],
    timestamp: new Date().toISOString(),
    totalTimeMs: totalTime,
    summary: {
      totalJobs: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      aiOverviewsFound: aiOverviewCount,
    },
    bySurface: {
      'openai-api': {
        total: apiResults.length,
        successful: apiResults.filter(r => r.success).length,
      },
      'chatgpt-web': {
        total: chatgptResults.length,
        successful: chatgptResults.filter(r => r.success).length,
      },
      'google-search': {
        total: googleResults.length,
        successful: googleResults.filter(r => r.success).length,
        aiOverviewsFound: aiOverviewCount,
      },
    },
    results,
  }, null, 2));

  console.log(`\n✅ Results saved to: ${outputPath}`);

  // Don't close browser when using CDP connection - user may want to keep it open
  // await browser.close();
  console.log('\n📝 Browser left open. You can close it manually when done.');
}

main().catch(console.error);
