#!/usr/bin/env npx tsx
import { chromium } from 'playwright';

async function checkAmazon() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = context.pages().find(p => /amazon\.com/.test(p.url()));

  if (!page) {
    console.log('No Amazon tab');
    await browser.close();
    return;
  }

  console.log('URL:', page.url());
  await page.bringToFront();
  await page.waitForTimeout(3000);

  // Get raw HTML
  const html = await page.content();
  console.log('\nHTML length:', html.length);
  console.log('\nFirst 2000 chars of HTML:');
  console.log(html.slice(0, 2000));

  await browser.close();
}

checkAmazon();
