#!/usr/bin/env npx tsx
/**
 * Test Google AI Overview detection with current selectors
 */

import { chromium } from 'playwright';

const TEST_QUERIES = [
  "Who is the mayor of Boise?",
  "Who are the current Boise City Council members?",
  "What road projects is ACHD working on?",
];

async function testAIOverview() {
  console.log('Connecting to Chrome on port 9222...\n');

  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const contexts = browser.contexts();

  if (contexts.length === 0) {
    console.log('No browser contexts found');
    return;
  }

  const context = contexts[0];
  const pages = context.pages();

  // Find or create a Google page
  let page = pages.find(p => p.url().includes('google.com'));
  if (!page) {
    page = await context.newPage();
  }

  for (const query of TEST_QUERIES) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`Testing: "${query}"`);
    console.log('='.repeat(70));

    // Use regular Google search (not AI Mode)
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&gl=us`;
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Test various selectors for AI Overview
    const selectors = [
      // Most likely AI Overview selectors based on current Google structure
      'div[data-sgrd]',              // AI generated response data
      '[data-attrid="wa:/description"]',
      '.wDYxhc[data-md]',
      '.ifM9O',                      // AI response container
      '[jsname="N760b"]',            // Possible AI container
      'div[data-async-type="overview"]',
      '.kp-wholepage',               // Knowledge panel
      '[data-hveid] .g-blk',
      '.xpdopen',
      // More specific to "AI Overview" label
      '[aria-label*="AI"]',
      '[data-feature-id*="ai"]',
      // Generic content selectors
      '.LGOjhe',                     // Expandable content
      '.wDYxhc',                     // Content wrapper
      '.kno-rdesc',                  // Knowledge description
      // Look for the sparkle icon area
      '[data-async-fc]',
    ];

    console.log('\nSelector results:');

    for (const sel of selectors) {
      try {
        const elements = await page.locator(sel).all();
        if (elements.length > 0) {
          const firstText = await elements[0].innerText().catch(() => '');
          const preview = firstText.slice(0, 100).replace(/\n/g, ' ');
          console.log(`  ✓ ${sel.padEnd(40)} → ${elements.length} element(s): "${preview}..."`);
        }
      } catch (e) {
        // Skip failed selectors silently
      }
    }

    // Try to get all text from potential AI Overview area (first major content block)
    console.log('\n--- Trying page.evaluate for AI Overview content ---');
    const aiContent = await page.evaluate(() => {
      // Look for the AI Overview by finding the sparkle icon or "AI Overview" text
      const allDivs = document.querySelectorAll('div');
      let aiOverviewDiv: Element | null = null;

      for (const div of allDivs) {
        // Check for "AI Overview" text in direct children
        if (div.querySelector('span')?.textContent?.includes('AI Overview')) {
          // Found the header, the parent container likely has the content
          aiOverviewDiv = div.closest('[data-sgrd]') || div.closest('.wDYxhc') || div.parentElement?.parentElement;
          break;
        }
      }

      if (aiOverviewDiv) {
        return {
          found: true,
          text: (aiOverviewDiv as HTMLElement).innerText?.slice(0, 500),
          className: aiOverviewDiv.className,
          tagName: aiOverviewDiv.tagName,
        };
      }

      // Alternative: look for data-sgrd attribute which usually marks AI content
      const sgrd = document.querySelector('[data-sgrd]');
      if (sgrd) {
        return {
          found: true,
          text: (sgrd as HTMLElement).innerText?.slice(0, 500),
          className: sgrd.className,
          tagName: sgrd.tagName,
        };
      }

      // Try to find content that looks like AI Overview (large text block at top)
      const mainContent = document.querySelector('#rso');
      if (mainContent) {
        const firstChild = mainContent.firstElementChild;
        if (firstChild) {
          const text = (firstChild as HTMLElement).innerText;
          if (text && text.length > 200) {
            return {
              found: true,
              text: text.slice(0, 500),
              className: firstChild.className,
              tagName: firstChild.tagName,
            };
          }
        }
      }

      return { found: false, text: '', className: '', tagName: '' };
    });

    if (aiContent.found) {
      console.log(`\n✓ AI Overview found!`);
      console.log(`  Tag: ${aiContent.tagName}, Class: ${aiContent.className}`);
      console.log(`  Preview: "${aiContent.text?.slice(0, 200)}..."`);
    } else {
      console.log(`\n✗ No AI Overview detected with page.evaluate`);
    }

    // Dump the HTML structure of the first result area
    console.log('\n--- First result area HTML structure ---');
    const structure = await page.evaluate(() => {
      const rso = document.querySelector('#rso');
      if (rso && rso.firstElementChild) {
        const el = rso.firstElementChild;
        const getStructure = (element: Element, depth: number = 0): string => {
          if (depth > 3) return '';
          const indent = '  '.repeat(depth);
          const classes = element.className ? `.${element.className.split(' ').join('.')}` : '';
          const attrs = element.getAttribute('data-sgrd') ? ' [data-sgrd]' : '';
          let result = `${indent}<${element.tagName.toLowerCase()}${classes}${attrs}>\n`;
          for (const child of Array.from(element.children).slice(0, 3)) {
            result += getStructure(child, depth + 1);
          }
          return result;
        };
        return getStructure(el);
      }
      return 'No #rso found';
    });
    console.log(structure);

    await page.waitForTimeout(2000);
  }

  console.log('\n\nTest complete!');
}

testAIOverview().catch(console.error);
