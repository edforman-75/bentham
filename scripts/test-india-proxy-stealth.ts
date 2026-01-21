#!/usr/bin/env npx tsx
/**
 * Test India proxy with anti-detection measures and Turnstile solver
 */

import { chromium } from 'playwright';
import { TurnstileSolver } from '../packages/surface-adapters/src/captcha/turnstile-solver.js';

const PROXY_CONFIG = {
  server: 'http://170.106.118.114:2334',
  username: 'uae16ff7557af05d3-zone-custom-region-in-st-maharashtra-city-mumbai',
  password: 'uae16ff7557af05d3',
};

// 2Captcha API key for solving captchas
const TWOCAPTCHA_API_KEY = process.env.TWOCAPTCHA_API_KEY || '90cf3a33c6a3f2ddb6c25d014bf32846';

async function main() {
  console.log('Testing India proxy with anti-detection measures...\n');

  // Launch with anti-detection args
  const browser = await chromium.launch({
    headless: false,
    proxy: PROXY_CONFIG,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-site-isolation-trials',
      '--disable-web-security',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-infobars',
      '--window-size=1920,1080',
      '--start-maximized',
    ],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  });

  // Remove webdriver property
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

    // Override plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });

    // Override languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-IN', 'en-US', 'en'],
    });

    // Mock chrome runtime
    (window as any).chrome = { runtime: {} };
  });

  const page = await context.newPage();

  // Test 1: Verify IP
  console.log('1. Verifying India IP...');
  try {
    await page.goto('https://ipinfo.io/json', { timeout: 30000 });
    const ipInfo = await page.evaluate(() => JSON.parse(document.body.innerText));
    console.log(`   ✅ IP: ${ipInfo.ip}`);
    console.log(`   ✅ Location: ${ipInfo.city}, ${ipInfo.region}, ${ipInfo.country}`);
  } catch (e) {
    console.log(`   ❌ Failed: ${e}`);
  }

  // Test 2: Check bot detection
  console.log('\n2. Checking bot detection (bot.sannysoft.com)...');
  try {
    await page.goto('https://bot.sannysoft.com/', { timeout: 30000 });
    await page.waitForTimeout(3000);

    // Check for failed tests
    const results = await page.evaluate(() => {
      const failed = document.querySelectorAll('.failed');
      const passed = document.querySelectorAll('.passed');
      return {
        failed: failed.length,
        passed: passed.length,
        failedTests: Array.from(failed).map(el => el.closest('tr')?.querySelector('td')?.textContent).filter(Boolean)
      };
    });

    console.log(`   Passed: ${results.passed}, Failed: ${results.failed}`);
    if (results.failedTests.length > 0) {
      console.log(`   Failed tests: ${results.failedTests.join(', ')}`);
    }
  } catch (e) {
    console.log(`   ❌ Failed: ${e}`);
  }

  // Test 3: Try ChatGPT
  console.log('\n3. Testing ChatGPT access...');
  try {
    await page.goto('https://chatgpt.com', { timeout: 60000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    const pageContent = await page.evaluate(() => {
      return {
        title: document.title,
        hasLoginButton: !!document.querySelector('[data-testid="login-button"]'),
        hasCloudflare: document.body.innerText.toLowerCase().includes('cloudflare') ||
                       document.body.innerText.toLowerCase().includes('verify you are human'),
        url: window.location.href
      };
    });

    console.log(`   Title: ${pageContent.title}`);
    console.log(`   URL: ${pageContent.url}`);
    console.log(`   Has login button: ${pageContent.hasLoginButton}`);
    console.log(`   Cloudflare challenge: ${pageContent.hasCloudflare}`);

    if (pageContent.hasCloudflare) {
      console.log('\n   ⚠️  Cloudflare detected. Attempting automatic bypass with 2Captcha...');

      const solver = new TurnstileSolver({ apiKey: TWOCAPTCHA_API_KEY });
      const solution = await solver.bypass(page);

      if (solution.success) {
        console.log(`   ✅ Cloudflare bypassed in ${solution.solveTimeMs}ms`);
        await page.waitForTimeout(3000);
      } else {
        console.log(`   ❌ Auto-bypass failed: ${solution.error}`);
        console.log('   Please complete the Cloudflare challenge manually in the browser.');
        console.log('   Press Enter when done...');
        await new Promise<void>(resolve => process.stdin.once('data', () => resolve()));
      }
    }

  } catch (e) {
    console.log(`   ❌ Failed: ${e}`);
  }

  console.log('\n4. Browser will stay open. Press Enter to close...');
  await new Promise<void>(resolve => process.stdin.once('data', () => resolve()));

  await browser.close();
}

main().catch(console.error);
