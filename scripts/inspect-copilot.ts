#!/usr/bin/env npx tsx
/**
 * Inspect Copilot page to find correct selectors
 */

import { chromium } from 'playwright';

async function inspectCopilot() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const pages = context.pages();

  const page = pages.find(p => /copilot\.microsoft\.com/.test(p.url()));
  if (!page) {
    console.log('No Copilot tab found');
    await browser.close();
    return;
  }

  console.log('URL:', page.url());

  // Try various response selectors
  const selectors = [
    '.response-message',
    '[data-testid="bot-response"]',
    '.cib-message-content',
    '[class*="response"]',
    '[class*="message"]',
    '[class*="answer"]',
    '.ac-textBlock',
    'cib-message-group',
    '[data-content]',
    '.text-message-content',
    'cib-shared',
    '[class*="prose"]',
    '[class*="markdown"]',
    'p',
  ];

  for (const sel of selectors) {
    try {
      const count = await page.locator(sel).count();
      if (count > 0) {
        const text = await page.locator(sel).last().textContent();
        console.log('Found', count, 'elements for:', sel);
        if (text && text.length > 20) {
          console.log('  Text preview:', text.slice(0, 150));
        }
      }
    } catch (e) {}
  }

  // Get all visible text areas that might contain response
  const bodyText = await page.evaluate(() => {
    const main = document.querySelector('main') || document.body;
    return main.innerText.slice(0, 800);
  });
  console.log('\nPage content preview:', bodyText);

  await browser.close();
}

inspectCopilot().catch(console.error);
