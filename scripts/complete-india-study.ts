#!/usr/bin/env npx tsx
/**
 * Complete HUFT India Study - Remaining Queries
 *
 * Picks up from where the previous run stopped and completes remaining queries.
 * Includes longer delays for Google to avoid rate limiting.
 */

import { chromium, type Page } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';

// Environment variables - all credentials from .env
const TWOCAPTCHA_API_KEY = process.env.TWOCAPTCHA_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!TWOCAPTCHA_API_KEY || !OPENAI_API_KEY) {
  console.error('❌ Missing required environment variables:');
  if (!TWOCAPTCHA_API_KEY) console.error('   - TWOCAPTCHA_API_KEY');
  if (!OPENAI_API_KEY) console.error('   - OPENAI_API_KEY');
  console.error('   Add them to your .env file');
  process.exit(1);
}

// 2Captcha Proxy Configuration for India (Mumbai, Maharashtra)
const PROXY_CONFIG = {
  server: 'http://170.106.118.114:2334',
  username: `${TWOCAPTCHA_API_KEY}-zone-custom-region-in-st-maharashtra-city-mumbai`,
  password: TWOCAPTCHA_API_KEY,
};

// Load study manifest
const manifest = JSON.parse(readFileSync('studies/huft-100-prompt-india-study.json', 'utf-8'));
const QUERIES = manifest.queries.map((q: { text: string }) => q.text);

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

// Load existing results
function loadExistingResults(): QueryResult[] {
  // Find the latest intermediate file
  for (let i = 100; i >= 10; i -= 10) {
    const path = `studies/huft-100-india-intermediate-${i}.json`;
    if (existsSync(path)) {
      console.log(`Loading existing results from ${path}...`);
      const data = JSON.parse(readFileSync(path, 'utf-8'));
      return data.results || [];
    }
  }
  return [];
}

// Find which queries are missing for each surface
function findMissingQueries(results: QueryResult[]): Map<string, Set<number>> {
  const completed = new Map<string, Set<number>>();
  completed.set('openai-api', new Set());
  completed.set('chatgpt-web', new Set());
  completed.set('google-search', new Set());

  for (const r of results) {
    if (r.success) {
      completed.get(r.surface)?.add(r.queryIndex);
    }
  }

  const missing = new Map<string, Set<number>>();
  for (const surface of ['openai-api', 'chatgpt-web', 'google-search']) {
    missing.set(surface, new Set());
    for (let i = 0; i < QUERIES.length; i++) {
      if (!completed.get(surface)?.has(i)) {
        missing.get(surface)?.add(i);
      }
    }
  }

  return missing;
}

async function solveRecaptcha(page: Page): Promise<boolean> {
  console.log('      Attempting to solve Google captcha...');

  try {
    // Check for reCAPTCHA
    const hasRecaptcha = await page.evaluate(() => {
      return !!document.querySelector('.g-recaptcha') ||
             !!document.querySelector('#recaptcha') ||
             document.body.innerText.includes('unusual traffic');
    });

    if (!hasRecaptcha) return true;

    // Get sitekey
    const sitekey = await page.evaluate(() => {
      const el = document.querySelector('.g-recaptcha');
      return el?.getAttribute('data-sitekey') || '';
    });

    if (!sitekey) {
      console.log('      Could not find reCAPTCHA sitekey');
      return false;
    }

    const pageUrl = page.url();
    console.log(`      Sitekey: ${sitekey.slice(0, 20)}...`);

    // Submit to 2Captcha
    const submitUrl = `https://2captcha.com/in.php?key=${TWOCAPTCHA_API_KEY}&method=userrecaptcha&googlekey=${sitekey}&pageurl=${encodeURIComponent(pageUrl)}&json=1`;
    const submitRes = await fetch(submitUrl);
    const submitData = await submitRes.json();

    if (submitData.status !== 1) {
      console.log(`      2Captcha submit error: ${submitData.request}`);
      return false;
    }

    const taskId = submitData.request;
    console.log(`      Task ID: ${taskId}, waiting for solution...`);

    // Poll for result
    for (let i = 0; i < 24; i++) { // 2 minutes max
      await new Promise(r => setTimeout(r, 5000));

      const resultUrl = `https://2captcha.com/res.php?key=${TWOCAPTCHA_API_KEY}&action=get&id=${taskId}&json=1`;
      const resultRes = await fetch(resultUrl);
      const resultData = await resultRes.json();

      if (resultData.status === 1) {
        const token = resultData.request;
        console.log(`      Got token, applying...`);

        // Apply token
        await page.evaluate((tkn) => {
          const textarea = document.querySelector('#g-recaptcha-response') as HTMLTextAreaElement;
          if (textarea) {
            textarea.value = tkn;
            textarea.style.display = 'block';
          }
          // Try to submit
          const form = document.querySelector('form');
          if (form) form.submit();
        }, token);

        await page.waitForTimeout(3000);
        return true;
      }

      if (resultData.request !== 'CAPCHA_NOT_READY') {
        console.log(`      2Captcha error: ${resultData.request}`);
        return false;
      }
    }

    console.log('      Timeout waiting for captcha solution');
    return false;
  } catch (e) {
    console.log(`      Captcha solving error: ${e}`);
    return false;
  }
}

async function queryGoogleSearch(query: string, queryIndex: number, page: Page): Promise<QueryResult> {
  const startTime = Date.now();

  try {
    await page.bringToFront();

    // Navigate to Google
    await page.goto('https://www.google.com', { timeout: 30000 });
    await page.waitForTimeout(2000);

    // Dismiss any modals
    try {
      const notNowButton = page.locator('text="Not now"').first();
      if (await notNowButton.isVisible({ timeout: 1000 })) {
        await notNowButton.click();
        await page.waitForTimeout(500);
      }
    } catch {}

    // Fill search
    const searchInput = page.locator('textarea[name="q"], input[name="q"]').first();
    await searchInput.click();
    await searchInput.fill(query);
    await page.waitForTimeout(500);

    // Submit search
    await page.keyboard.press('Enter');
    await page.waitForTimeout(5000);

    // Check for captcha/block
    const isBlocked = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return text.includes('unusual traffic') ||
             text.includes('not a robot') ||
             text.includes('verify you are human');
    });

    if (isBlocked) {
      console.log('      Google blocked, attempting captcha solve...');
      const solved = await solveRecaptcha(page);
      if (!solved) {
        return {
          query,
          queryIndex,
          surface: 'google-search',
          success: false,
          error: 'Google blocked request - captcha not solved',
          timestamp: new Date().toISOString(),
          responseTimeMs: Date.now() - startTime,
        };
      }
      await page.waitForTimeout(3000);
    }

    // Dismiss modals again
    try {
      const notNowButton = page.locator('text="Not now"').first();
      if (await notNowButton.isVisible({ timeout: 1000 })) {
        await notNowButton.click();
      }
    } catch {}

    // Wait for AI Overview
    await page.waitForTimeout(5000);

    const aiOverview = await page.evaluate(() => {
      const selectors = [
        '[data-attrid="AIOverview"]',
        '[data-md="50"]',
        'div[jsname="N760b"]',
        '.wDYxhc[data-md]',
        '.xpdopen .wDYxhc',
      ];

      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const text = (el as HTMLElement).innerText?.trim();
          if (text && text.length > 100) return text;
        }
      }
      return '';
    });

    // Get organic results
    const organicResults = await page.evaluate(() => {
      const results: string[] = [];
      const items = document.querySelectorAll('#search .g');

      for (let i = 0; i < Math.min(items.length, 10); i++) {
        const item = items[i];
        const title = item.querySelector('h3')?.textContent || '';
        const link = item.querySelector('a')?.href || '';
        if (title && link) {
          results.push(`${title}\n${link}`);
        }
      }
      return results;
    });

    return {
      query,
      queryIndex,
      surface: 'google-search',
      success: true,
      aiOverview: aiOverview || undefined,
      organicResults,
      response: aiOverview || organicResults.slice(0, 3).join('\n\n'),
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
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

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
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
    return {
      query,
      queryIndex,
      surface: 'openai-api',
      success: true,
      response: data.choices?.[0]?.message?.content,
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

async function queryChatGPTWeb(query: string, queryIndex: number, page: Page): Promise<QueryResult> {
  const startTime = Date.now();

  try {
    await page.bringToFront();
    await page.waitForTimeout(500);

    // Find input
    const input = page.locator('#prompt-textarea, [contenteditable="true"]').first();
    await input.click();
    await page.keyboard.press('Meta+a');
    await input.fill(query);
    await page.waitForTimeout(300);

    // Count existing responses
    const initialCount = await page.locator('[data-message-author-role="assistant"]').count();

    // Submit
    const submitBtn = page.locator('button[data-testid="send-button"], button[data-testid="composer-send-button"]').first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
    } else {
      await page.keyboard.press('Enter');
    }

    // Wait for response
    const maxWait = 90000;
    const waitStart = Date.now();

    while (Date.now() - waitStart < maxWait) {
      const currentCount = await page.locator('[data-message-author-role="assistant"]').count();
      if (currentCount > initialCount) {
        await page.waitForTimeout(8000); // Wait for streaming
        break;
      }
      await page.waitForTimeout(1000);
    }

    // Get response
    const response = await page.evaluate(() => {
      const els = document.querySelectorAll('[data-message-author-role="assistant"]');
      for (let i = els.length - 1; i >= 0; i--) {
        const text = (els[i] as HTMLElement).innerText?.trim();
        if (text && text.length > 20) return text;
      }
      return '';
    });

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

async function main() {
  console.log('='.repeat(70));
  console.log('  HUFT India Study - Complete Remaining Queries');
  console.log('  With captcha solving and longer delays');
  console.log('='.repeat(70));

  // Load existing results
  const existingResults = loadExistingResults();
  console.log(`Loaded ${existingResults.length} existing results`);

  // Find missing queries
  const missing = findMissingQueries(existingResults);

  console.log('\nMissing queries:');
  console.log(`  OpenAI API: ${missing.get('openai-api')?.size || 0}`);
  console.log(`  ChatGPT Web: ${missing.get('chatgpt-web')?.size || 0}`);
  console.log(`  Google Search: ${missing.get('google-search')?.size || 0}`);

  const totalMissing = (missing.get('openai-api')?.size || 0) +
                       (missing.get('chatgpt-web')?.size || 0) +
                       (missing.get('google-search')?.size || 0);

  if (totalMissing === 0) {
    console.log('\n✅ All queries completed!');
    return;
  }

  console.log(`\nTotal missing: ${totalMissing}`);
  console.log('');

  // Launch browser
  console.log('Launching browser with India proxy...');
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
  console.log(`✅ IP: ${ipInfo.city}, ${ipInfo.region}, ${ipInfo.country}`);
  await testPage.close();

  // Setup pages
  let chatgptPage: Page | null = null;
  let googlePage: Page | null = null;

  const results = [...existingResults];

  // Process ChatGPT missing queries first
  const chatgptMissing = Array.from(missing.get('chatgpt-web') || []).sort((a, b) => a - b);
  if (chatgptMissing.length > 0) {
    chatgptPage = await context.newPage();
    await chatgptPage.goto('https://chatgpt.com', { timeout: 60000 });
    await chatgptPage.waitForTimeout(3000);

    const isLoggedIn = await chatgptPage.evaluate(() => {
      return !document.querySelector('[data-testid="login-button"]');
    });

    if (!isLoggedIn) {
      console.log('\n⚠️  Please log in to ChatGPT, then press Enter...');
      await new Promise<void>(r => process.stdin.once('data', () => r()));
    }
    console.log('✅ ChatGPT ready\n');

    for (const idx of chatgptMissing) {
      const query = QUERIES[idx];
      console.log(`[ChatGPT ${idx + 1}/100] "${query.slice(0, 50)}..."`);
      const result = await queryChatGPTWeb(query, idx, chatgptPage);
      results.push(result);
      console.log(`  ${result.success ? '✅' : '❌'} (${result.responseTimeMs}ms)`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Process OpenAI API missing queries
  const apiMissing = Array.from(missing.get('openai-api') || []).sort((a, b) => a - b);
  for (const idx of apiMissing) {
    const query = QUERIES[idx];
    console.log(`[OpenAI API ${idx + 1}/100] "${query.slice(0, 50)}..."`);
    const result = await queryOpenAIAPI(query, idx);
    results.push(result);
    console.log(`  ${result.success ? '✅' : '❌'} (${result.responseTimeMs}ms)`);
  }

  // Process Google missing queries with longer delays
  const googleMissing = Array.from(missing.get('google-search') || []).sort((a, b) => a - b);
  if (googleMissing.length > 0) {
    googlePage = await context.newPage();
    console.log('\n⚠️  Google searches will have 15-second delays to avoid rate limiting\n');

    for (const idx of googleMissing) {
      const query = QUERIES[idx];
      console.log(`[Google ${idx + 1}/100] "${query.slice(0, 50)}..."`);
      const result = await queryGoogleSearch(query, idx, googlePage);
      results.push(result);
      const status = result.success ? (result.aiOverview ? '✅ [AI Overview]' : '✅') : '❌';
      console.log(`  ${status} (${result.responseTimeMs}ms)`);

      // Longer delay for Google
      if (idx < googleMissing[googleMissing.length - 1]) {
        console.log('  Waiting 15 seconds before next Google search...');
        await new Promise(r => setTimeout(r, 15000));
      }
    }
  }

  // Save final results
  const outputPath = 'studies/huft-100-india-study-results.json';

  const bySurface = {
    'openai-api': results.filter(r => r.surface === 'openai-api'),
    'chatgpt-web': results.filter(r => r.surface === 'chatgpt-web'),
    'google-search': results.filter(r => r.surface === 'google-search'),
  };

  writeFileSync(outputPath, JSON.stringify({
    studyId: `huft-india-${Date.now()}`,
    studyName: manifest.name,
    location: { city: 'Mumbai', region: 'Maharashtra', country: 'IN' },
    timestamp: new Date().toISOString(),
    summary: {
      totalResults: results.length,
      bySurface: {
        'openai-api': {
          total: bySurface['openai-api'].length,
          successful: bySurface['openai-api'].filter(r => r.success).length,
        },
        'chatgpt-web': {
          total: bySurface['chatgpt-web'].length,
          successful: bySurface['chatgpt-web'].filter(r => r.success).length,
        },
        'google-search': {
          total: bySurface['google-search'].length,
          successful: bySurface['google-search'].filter(r => r.success).length,
          aiOverviewsFound: bySurface['google-search'].filter(r => r.aiOverview).length,
        },
      },
    },
    results,
  }, null, 2));

  console.log('\n' + '='.repeat(70));
  console.log('  COMPLETE');
  console.log('='.repeat(70));
  console.log(`\nResults saved to: ${outputPath}`);
  console.log(`\nSummary:`);
  console.log(`  OpenAI API: ${bySurface['openai-api'].filter(r => r.success).length}/${bySurface['openai-api'].length}`);
  console.log(`  ChatGPT Web: ${bySurface['chatgpt-web'].filter(r => r.success).length}/${bySurface['chatgpt-web'].length}`);
  console.log(`  Google Search: ${bySurface['google-search'].filter(r => r.success).length}/${bySurface['google-search'].length}`);

  await browser.close();
}

main().catch(console.error);
