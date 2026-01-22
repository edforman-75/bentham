#!/usr/bin/env npx tsx
import { chromium } from 'playwright';

const TWOCAPTCHA_API_KEY = process.env.TWOCAPTCHA_API_KEY;

if (!TWOCAPTCHA_API_KEY) {
  console.error('❌ TWOCAPTCHA_API_KEY environment variable is not set');
  console.error('   Add it to your .env file: TWOCAPTCHA_API_KEY=your-key-here');
  process.exit(1);
}

const PROXY_CONFIG = {
  server: 'http://170.106.118.114:2334',
  username: `${TWOCAPTCHA_API_KEY}-zone-custom-region-in-st-maharashtra-city-mumbai`,
  password: TWOCAPTCHA_API_KEY,
};

async function test() {
  console.log('Testing ChatGPT access via India proxy...\n');

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

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();

  try {
    console.log('Loading ChatGPT...');
    await page.goto('https://chatgpt.com', { timeout: 60000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    const result = await page.evaluate(() => {
      const bodyText = document.body.innerText.toLowerCase();
      const hasCloudflare = bodyText.includes('just a moment') ||
                     bodyText.includes('verify you are human') ||
                     bodyText.includes('checking your browser');
      const loginBtn = document.querySelector('[data-testid="login-button"]');
      return {
        title: document.title,
        url: window.location.href,
        hasCloudflare,
        hasLoginButton: loginBtn !== null,
        bodyPreview: document.body.innerText.slice(0, 300)
      };
    });

    console.log('Title:', result.title);
    console.log('URL:', result.url);
    console.log('Cloudflare challenge:', result.hasCloudflare);
    console.log('Has login button:', result.hasLoginButton);
    console.log('Body preview:', result.bodyPreview.slice(0, 150) + '...');

    if (result.hasCloudflare) {
      console.log('\n⚠️  CLOUDFLARE DETECTED - need to solve challenge');
      console.log('Browser staying open for manual inspection...');
      console.log('Press Ctrl+C to exit when done.');
      await new Promise(() => {}); // Keep open indefinitely
    } else if (result.hasLoginButton) {
      console.log('\n✅ SUCCESS: ChatGPT loaded - login button visible (no Cloudflare block!)');
      console.log('Browser will close in 5 seconds...');
      await page.waitForTimeout(5000);
    } else {
      console.log('\n✅ ChatGPT loaded');
      console.log('Browser will close in 5 seconds...');
      await page.waitForTimeout(5000);
    }

  } catch (e) {
    console.log('❌ Error:', e instanceof Error ? e.message : e);
  }

  await browser.close();
}

test();
