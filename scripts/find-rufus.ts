#!/usr/bin/env npx tsx
import { chromium } from 'playwright';

async function findRufus() {
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
  await page.waitForTimeout(1000);

  // Look for Rufus in the page text
  const pageText = await page.evaluate(() => document.body.innerText);
  console.log('Page contains "Rufus":', pageText.includes('Rufus'));

  // Search for Rufus-related elements
  const rufusSelectors = [
    '[class*="rufus"]',
    '[id*="rufus"]',
    '[data-testid*="rufus"]',
    '[aria-label*="Rufus"]',
    'img[alt*="Rufus"]',
  ];

  console.log('\nSearching for Rufus elements...');
  for (const sel of rufusSelectors) {
    try {
      const count = await page.locator(sel).count();
      if (count > 0) {
        console.log('Found:', sel, '- count:', count);
      }
    } catch {}
  }

  // Look for any element with Rufus text
  const rufusElements = await page.evaluate(() => {
    const results: string[] = [];
    document.querySelectorAll('*').forEach(el => {
      const text = (el as HTMLElement).innerText || '';
      if (text.toLowerCase().includes('rufus') && text.length < 100) {
        results.push(`${el.tagName}.${(el as HTMLElement).className?.toString().slice(0,30) || ''}: ${text.slice(0,50)}`);
      }
    });
    return results.slice(0, 10);
  });

  console.log('\nElements mentioning Rufus:');
  rufusElements.forEach(e => console.log(' ', e));

  // Check if there's a chat/assistant icon
  console.log('\nLooking for chat/assistant buttons...');
  const chatSelectors = [
    '[aria-label*="chat"]',
    '[aria-label*="assistant"]',
    '[aria-label*="help"]',
    'button[class*="chat"]',
    '[data-testid*="chat"]',
  ];

  for (const sel of chatSelectors) {
    try {
      const count = await page.locator(sel).count();
      if (count > 0) {
        console.log('Found:', sel, '- count:', count);
      }
    } catch {}
  }

  await browser.close();
}

findRufus();
