#!/usr/bin/env npx tsx
/**
 * Query via CDP (Chrome DevTools Protocol)
 *
 * Connects to an existing Chrome browser with debugging enabled and
 * uses the existing tabs to run queries. This bypasses anti-bot detection
 * since it uses the user's actual browser session.
 *
 * Prerequisites:
 *   1. Chrome running with --remote-debugging-port=9222
 *   2. Tabs open to the surfaces you want to query (logged in)
 *
 * Usage:
 *   npx tsx scripts/query-via-cdp.ts <surfaceId> "<query>"
 *   npx tsx scripts/query-via-cdp.ts perplexity-web "What is the capital of France?"
 */

import type { Page, BrowserContext } from 'playwright';

// Surface URL patterns to identify tabs
const SURFACE_PATTERNS: Record<string, { urlPattern: RegExp; name: string }> = {
  'chatgpt-web': { urlPattern: /chatgpt\.com/, name: 'ChatGPT' },
  'perplexity-web': { urlPattern: /perplexity\.ai/, name: 'Perplexity' },
  'claude-web': { urlPattern: /claude\.ai/, name: 'Claude' },
  'x-grok-web': { urlPattern: /x\.com.*grok|twitter\.com.*grok/, name: 'Grok' },
  'meta-ai-web': { urlPattern: /meta\.ai/, name: 'Meta AI' },
  'copilot-web': { urlPattern: /copilot\.microsoft\.com/, name: 'Copilot' },
  'bing-search': { urlPattern: /bing\.com/, name: 'Bing' },
  'google-search': { urlPattern: /google\.com\/search/, name: 'Google Search' },
  'amazon-web': { urlPattern: /amazon\.com/, name: 'Amazon' },
  'zappos-web': { urlPattern: /zappos\.com/, name: 'Zappos' },
};

// Query submission selectors for each surface
const QUERY_SELECTORS: Record<string, {
  input: string[];
  submit?: string[];
  response: string[];
  waitForText?: string;
}> = {
  'chatgpt-web': {
    input: ['#prompt-textarea', 'textarea[data-id="root"]', 'textarea[placeholder*="Message"]'],
    submit: ['button[data-testid="send-button"]', 'button[aria-label="Send"]'],
    response: ['[data-message-author-role="assistant"]', '.markdown.prose'],
  },
  'perplexity-web': {
    input: ['[role="textbox"]', 'textarea'],
    submit: ['button[aria-label="Submit"]', 'button[type="submit"]'],
    response: ['[class*="scrollable"]', '.prose'],
  },
  'x-grok-web': {
    input: ['textarea', '[contenteditable="true"]'],
    submit: ['button[type="submit"]'],
    response: ['[data-testid="tweetText"]', '[class*="response"]'],
  },
  'meta-ai-web': {
    input: ['textarea', '[contenteditable="true"]'],
    submit: ['button[type="submit"]'],
    response: ['[class*="message"]', '[class*="response"]'],
  },
  'copilot-web': {
    input: ['textarea', '#searchbox'],
    submit: ['button[type="submit"]'],
    response: ['[class*="response"]', '[class*="answer"]'],
  },
  'bing-search': {
    input: ['#sb_form_q', 'textarea[name="q"]'],
    response: ['#b_results'],
  },
  'google-search': {
    input: ['textarea[name="q"]', 'input[name="q"]'],
    response: ['#search', '#rso'],
  },
};

async function findTab(context: BrowserContext, surfaceId: string): Promise<Page | null> {
  const pattern = SURFACE_PATTERNS[surfaceId];
  if (!pattern) {
    console.error(`Unknown surface: ${surfaceId}`);
    return null;
  }

  const pages = context.pages();
  for (const page of pages) {
    const url = page.url();
    if (pattern.urlPattern.test(url)) {
      return page;
    }
  }
  return null;
}

async function submitQuery(page: Page, surfaceId: string, query: string): Promise<string> {
  const selectors = QUERY_SELECTORS[surfaceId];
  if (!selectors) {
    throw new Error(`No selectors configured for ${surfaceId}`);
  }

  // Find and fill the input
  let inputFound = false;
  for (const selector of selectors.input) {
    try {
      const isVisible = await page.isVisible(selector);
      if (isVisible) {
        // Clear existing text and type new query
        await page.click(selector);
        await page.keyboard.press('Meta+a');  // Select all
        await page.fill(selector, query);
        inputFound = true;
        console.log(`  Input found: ${selector}`);
        break;
      }
    } catch {
      continue;
    }
  }

  if (!inputFound) {
    throw new Error('Could not find input field');
  }

  // Small delay
  await page.waitForTimeout(300);

  // Submit
  if (selectors.submit) {
    let submitted = false;
    for (const selector of selectors.submit) {
      try {
        const isVisible = await page.isVisible(selector);
        if (isVisible) {
          await page.click(selector);
          submitted = true;
          console.log(`  Submit clicked: ${selector}`);
          break;
        }
      } catch {
        continue;
      }
    }
    if (!submitted) {
      // Fallback: press Enter
      await page.keyboard.press('Enter');
      console.log('  Submit: pressed Enter');
    }
  } else {
    // No submit button, just press Enter
    await page.keyboard.press('Enter');
    console.log('  Submit: pressed Enter');
  }

  // Wait for response
  console.log('  Waiting for response...');
  await page.waitForTimeout(2000);  // Initial wait

  // Wait for response container
  let responseText = '';
  for (const selector of selectors.response) {
    try {
      await page.waitForSelector(selector, { timeout: 15000, state: 'visible' });

      // Wait a bit more for content to stabilize
      await page.waitForTimeout(3000);

      // Extract text
      responseText = await page.evaluate((sel) => {
        const elements = document.querySelectorAll(sel);
        if (elements.length === 0) return '';
        // Get the last element (most recent response)
        const lastEl = elements[elements.length - 1];
        return lastEl.textContent?.trim() || '';
      }, selector);

      if (responseText && responseText.length > 10) {
        console.log(`  Response found: ${selector}`);
        break;
      }
    } catch {
      continue;
    }
  }

  return responseText;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Query via CDP - Use existing Chrome tabs to run queries

Usage:
  npx tsx scripts/query-via-cdp.ts <surfaceId> "<query>"
  npx tsx scripts/query-via-cdp.ts --list

Examples:
  npx tsx scripts/query-via-cdp.ts perplexity-web "What is the capital of France?"
  npx tsx scripts/query-via-cdp.ts chatgpt-web "Explain quantum computing briefly"

Available surfaces:
  ${Object.keys(SURFACE_PATTERNS).join('\n  ')}

Prerequisites:
  1. Chrome running with: --remote-debugging-port=9222
  2. Tabs open to the surfaces you want to query (and logged in)
`);
    process.exit(0);
  }

  // Import playwright
  const playwright = await import('playwright');

  // Connect to Chrome
  console.log('Connecting to Chrome on port 9222...');
  let browser;
  try {
    browser = await playwright.chromium.connectOverCDP('http://localhost:9222');
  } catch (error) {
    console.error('Could not connect to Chrome. Make sure Chrome is running with --remote-debugging-port=9222');
    process.exit(1);
  }

  const contexts = browser.contexts();
  if (contexts.length === 0) {
    console.error('No browser contexts found');
    await browser.close();
    process.exit(1);
  }

  const context = contexts[0];

  // Handle --list command
  if (args[0] === '--list') {
    console.log('\nOpen tabs:');
    const pages = context.pages();
    for (const page of pages) {
      const url = page.url();
      const title = await page.title();

      // Check which surface this matches
      let surfaceMatch = 'unknown';
      for (const [id, pattern] of Object.entries(SURFACE_PATTERNS)) {
        if (pattern.urlPattern.test(url)) {
          surfaceMatch = id;
          break;
        }
      }

      console.log(`  [${surfaceMatch}] ${title}`);
      console.log(`    ${url}`);
    }
    await browser.close();
    return;
  }

  const surfaceId = args[0];
  const query = args.slice(1).join(' ');

  console.log(`Surface: ${surfaceId}`);
  console.log(`Query: "${query}"`);

  // Find the tab
  const page = await findTab(context, surfaceId);
  if (!page) {
    console.error(`\nNo tab found for ${surfaceId}`);
    console.log('Available tabs:');
    for (const p of context.pages()) {
      console.log(`  ${p.url()}`);
    }
    console.log(`\nPlease open a tab to ${SURFACE_PATTERNS[surfaceId]?.name || surfaceId}`);
    await browser.close();
    process.exit(1);
  }

  console.log(`Found tab: ${page.url()}`);

  // Bring tab to focus
  await page.bringToFront();

  try {
    const response = await submitQuery(page, surfaceId, query);

    console.log('\n--- Response ---');
    console.log(response.slice(0, 500));
    if (response.length > 500) {
      console.log(`... (${response.length} chars total)`);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }

  // Disconnect (don't close - user's browser should stay open)
  await browser.close();
}

main().catch(console.error);
