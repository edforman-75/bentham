#!/usr/bin/env npx tsx
/**
 * Inspect multiple surfaces to find correct selectors
 */

import { chromium } from 'playwright';

const SURFACES_TO_CHECK = [
  { id: 'x-grok-web', pattern: /x\.com.*grok|grok\.x\.com/, name: 'Grok' },
  { id: 'meta-ai-web', pattern: /meta\.ai/, name: 'Meta AI' },
  { id: 'amazon-web', pattern: /amazon\.com/, name: 'Amazon' },
];

const COMMON_SELECTORS = [
  '[data-testid*="message"]',
  '[data-testid*="response"]',
  '[class*="message"]',
  '[class*="response"]',
  '[class*="answer"]',
  '[class*="result"]',
  '[class*="prose"]',
  '[class*="markdown"]',
  '[role="article"]',
  '[data-content]',
  'textarea',
  'input[type="text"]',
  'input[type="search"]',
  '[contenteditable="true"]',
  '[role="textbox"]',
];

async function inspectSurfaces() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const pages = context.pages();

  for (const surface of SURFACES_TO_CHECK) {
    const page = pages.find(p => surface.pattern.test(p.url()));

    console.log('\n' + '='.repeat(60));
    console.log(`${surface.name} (${surface.id})`);
    console.log('='.repeat(60));

    if (!page) {
      console.log('❌ No tab found');
      continue;
    }

    console.log('URL:', page.url());

    // Check selectors
    console.log('\n--- Matching selectors ---');
    for (const sel of COMMON_SELECTORS) {
      try {
        const count = await page.locator(sel).count();
        if (count > 0) {
          const text = await page.locator(sel).first().textContent();
          const preview = text?.trim().slice(0, 80) || '';
          console.log(`✓ ${sel} (${count}): "${preview}"`);
        }
      } catch (e) {}
    }

    // Get page content
    console.log('\n--- Page content ---');
    const bodyText = await page.evaluate(() => {
      const main = document.querySelector('main') || document.body;
      return main.innerText.slice(0, 600);
    });
    console.log(bodyText);
  }

  await browser.close();
}

inspectSurfaces().catch(console.error);
