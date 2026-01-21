#!/usr/bin/env npx tsx
/**
 * Deep inspect Grok and Meta AI
 */

import { chromium } from 'playwright';

async function inspect() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const pages = context.pages();

  // Inspect Grok
  console.log('\n=== GROK ===\n');
  const grokPage = pages.find(p => /x\.com.*grok/.test(p.url()));
  if (grokPage) {
    console.log('URL:', grokPage.url());

    // Get all elements with text containing "Paris"
    const parisElements = await grokPage.evaluate(() => {
      const results: string[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      while (walker.nextNode()) {
        const el = walker.currentNode as HTMLElement;
        const text = el.innerText || '';
        if (text.includes('Paris') && text.length < 500) {
          const tag = el.tagName.toLowerCase();
          const classes = el.className?.toString().slice(0, 50) || '';
          const testId = el.getAttribute('data-testid') || '';
          results.push(`<${tag} class="${classes}" data-testid="${testId}"> ${text.slice(0, 100)}`);
        }
      }
      return results.slice(0, 15);
    });
    console.log('Elements containing "Paris":');
    parisElements.forEach(e => console.log('  ', e));

    // Try specific X/Twitter selectors
    const xSelectors = [
      '[data-testid="tweetText"]',
      '[data-testid="messageContent"]',
      '[data-testid="cellInnerDiv"]',
      'article',
      '[lang]',
      'span[dir="auto"]',
      'div[dir="auto"]',
    ];
    console.log('\nTrying X-specific selectors:');
    for (const sel of xSelectors) {
      const count = await grokPage.locator(sel).count();
      if (count > 0) {
        const text = await grokPage.locator(sel).last().textContent();
        console.log(`  ${sel} (${count}): "${text?.slice(0, 80)}"`);
      }
    }
  }

  // Inspect Meta AI
  console.log('\n=== META AI ===\n');
  const metaPage = pages.find(p => /meta\.ai/.test(p.url()));
  if (metaPage) {
    console.log('URL:', metaPage.url());

    // Get all elements with text containing "Paris" or "capital"
    const responseElements = await metaPage.evaluate(() => {
      const results: string[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      while (walker.nextNode()) {
        const el = walker.currentNode as HTMLElement;
        const text = el.innerText || '';
        if ((text.includes('Paris') || text.includes('capital')) && text.length < 500 && text.length > 20) {
          const tag = el.tagName.toLowerCase();
          const classes = el.className?.toString().slice(0, 60) || '';
          const testId = el.getAttribute('data-testid') || '';
          results.push(`<${tag} class="${classes}" data-testid="${testId}"> ${text.slice(0, 120)}`);
        }
      }
      return results.slice(0, 15);
    });
    console.log('Elements containing response content:');
    responseElements.forEach(e => console.log('  ', e));

    // Try Meta-specific selectors
    const metaSelectors = [
      '[data-testid*="message"]',
      '[class*="MessageBubble"]',
      '[class*="chat"]',
      '[class*="response"]',
      'div[dir="auto"]',
      'span[dir="auto"]',
      '[class*="text"]',
    ];
    console.log('\nTrying Meta-specific selectors:');
    for (const sel of metaSelectors) {
      const count = await metaPage.locator(sel).count();
      if (count > 0) {
        const text = await metaPage.locator(sel).last().textContent();
        if (text && text.length > 20) {
          console.log(`  ${sel} (${count}): "${text?.slice(0, 100)}"`);
        }
      }
    }
  }

  await browser.close();
}

inspect().catch(console.error);
