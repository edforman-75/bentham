#!/usr/bin/env npx tsx
import { chromium } from 'playwright';

async function debugChatGPTContent() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = context.pages().find(p => /chatgpt\.com/.test(p.url()));

  if (!page) {
    console.log('No ChatGPT tab');
    await browser.close();
    return;
  }

  await page.bringToFront();

  // Get all assistant messages and their text
  const messages = await page.evaluate(() => {
    const els = document.querySelectorAll('[data-message-author-role="assistant"]');
    const results: string[] = [];
    els.forEach((el, i) => {
      const markdown = el.querySelector('.markdown');
      const text = markdown ? (markdown as HTMLElement).innerText?.slice(0, 100) : '(no markdown)';
      results.push(`[${i}]: ${text || '(empty)'}`);
    });
    return results.slice(-5); // Last 5
  });

  console.log('Last 5 assistant messages:');
  messages.forEach(m => console.log(m));

  // Get loading state
  const loadingCount = await page.locator('.result-streaming, .result-thinking').count();
  console.log('\nLoading indicators:', loadingCount);

  // Get the response that has actual content (not empty)
  const bestResponse = await page.evaluate(() => {
    const els = document.querySelectorAll('[data-message-author-role="assistant"] .markdown');
    for (let i = els.length - 1; i >= 0; i--) {
      const text = (els[i] as HTMLElement).innerText?.trim();
      if (text && text.length > 5) {
        return { index: i, text: text.slice(0, 200) };
      }
    }
    return { index: -1, text: '(none found)' };
  });

  console.log('\nBest response found at index', bestResponse.index + ':', bestResponse.text);

  await browser.close();
}

debugChatGPTContent();
