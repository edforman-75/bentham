#!/usr/bin/env npx tsx
/**
 * Test All Surfaces via CDP
 *
 * Runs a test query on all available surfaces using the existing Chrome tabs.
 */

import type { Page, BrowserContext } from 'playwright';

const SURFACE_PATTERNS: Record<string, { urlPattern: RegExp; name: string }> = {
  // Web Chatbots
  'chatgpt-web': { urlPattern: /chatgpt\.com/, name: 'ChatGPT' },
  'perplexity-web': { urlPattern: /perplexity\.ai/, name: 'Perplexity' },
  'claude-web': { urlPattern: /claude\.ai/, name: 'Claude' },
  'x-grok-web': { urlPattern: /x\.com.*grok|grok\.x\.com/, name: 'Grok' },
  'meta-ai-web': { urlPattern: /^https:\/\/(www\.)?meta\.ai/, name: 'Meta AI' },
  'copilot-web': { urlPattern: /copilot\.microsoft\.com/, name: 'Copilot' },
  // Search
  'bing-search': { urlPattern: /bing\.com/, name: 'Bing Search' },
  'google-search': { urlPattern: /www\.google\.com/, name: 'Google Search' },
  // E-commerce
  'amazon-web': { urlPattern: /amazon\.com/, name: 'Amazon' },
  'amazon-rufus': { urlPattern: /amazon\.com/, name: 'Amazon Rufus' },
  'zappos-web': { urlPattern: /zappos\.com/, name: 'Zappos' },
};

const QUERY_SELECTORS: Record<string, {
  input: string[];
  submit?: string[];
  response: string[];
}> = {
  // Web Chatbots
  'chatgpt-web': {
    input: ['#prompt-textarea', '[contenteditable="true"]', 'textarea[data-id="root"]'],
    submit: ['button[data-testid="send-button"]', 'button[data-testid="composer-send-button"]'],
    response: ['[data-message-author-role="assistant"]', '.markdown.prose', '.markdown'],
  },
  'perplexity-web': {
    input: ['[role="textbox"]', 'textarea'],
    submit: ['button[aria-label="Submit"]'],
    response: ['[class*="scrollable"]'],
  },
  'claude-web': {
    input: ['[contenteditable="true"]', 'textarea'],
    response: ['[class*="prose"]', '[class*="message"]'],
  },
  'x-grok-web': {
    input: ['[data-testid="grok-composer"] textarea', 'textarea[placeholder*="Ask"]', '[role="textbox"]', 'textarea'],
    submit: ['[data-testid="grok-send-button"]', 'button[aria-label*="Send"]'],
    response: ['[data-testid="primaryColumn"]', '[data-testid="grok-message"]', 'div.css-175oi2r'],
  },
  'meta-ai-web': {
    input: ['[data-testid="mwai-input-field"]', 'textarea[placeholder*="Ask Meta AI"]', '[contenteditable="true"]', 'textarea'],
    submit: ['[data-testid="mwai-send-button"]', 'button[aria-label*="Send"]', 'button[type="submit"]'],
    response: ['div[dir="auto"]', '[data-testid="mwai-message"]', '.message-bubble', '[role="article"]'],
  },
  'copilot-web': {
    input: ['#userInput', 'textarea[placeholder*="Ask"]', '[data-testid="chat-input"]', 'textarea[name="q"]', '#searchbox'],
    submit: ['#submitButton', 'button[aria-label*="Submit"]', '[data-testid="submit-button"]', 'button[type="submit"]'],
    response: ['[data-content]', '[class*="message"]', '.response-message', '[data-testid="bot-response"]'],
  },
  // Search
  'bing-search': {
    input: ['#sb_form_q'],
    response: ['#b_results'],
  },
  'google-search': {
    input: ['textarea[name="q"]', 'input[name="q"]'],
    response: ['#search', '#rso'],
  },
  // E-commerce
  'amazon-web': {
    input: ['#twotabsearchtextbox', 'input[name="field-keywords"]', '#nav-bb-search input'],
    submit: ['.nav-search-submit input', 'input[type="submit"]', '#nav-search-submit-button'],
    response: ['.s-main-slot', '#search .s-search-results', '[data-component-type="s-search-results"]'],
  },
  'amazon-rufus': {
    input: ['input[placeholder*="Ask Rufus"]', '[aria-label*="Rufus"] input', 'textarea[placeholder*="Rufus"]'],
    submit: ['button[aria-label*="Send"]', '[aria-label*="Rufus"] button'],
    response: ['[aria-label*="Rufus"]', '[class*="rufus"]'],
  },
  'zappos-web': {
    input: ['#searchAll', 'input[name="term"]', 'input[placeholder*="Search"]'],
    submit: ['button[type="submit"]', '[data-testid="search-submit"]'],
    response: ['main', '[role="main"]', '#searchResults'],
  },
};

async function findTab(context: BrowserContext, surfaceId: string): Promise<Page | null> {
  const pattern = SURFACE_PATTERNS[surfaceId];
  if (!pattern) return null;

  const pages = context.pages();
  for (const page of pages) {
    if (pattern.urlPattern.test(page.url())) {
      return page;
    }
  }
  return null;
}

/**
 * Abort any stuck generation (ChatGPT stop button, etc.)
 */
async function abortStuckGeneration(page: Page, surfaceId: string): Promise<void> {
  const abortSelectors: Record<string, string[]> = {
    'chatgpt-web': [
      'button[aria-label="Stop generating"]',
      'button[data-testid="stop-button"]',
      'button:has-text("Stop generating")',
    ],
    'claude-web': [
      'button:has-text("Stop")',
      '[aria-label="Stop response"]',
    ],
  };

  const selectors = abortSelectors[surfaceId] || [];
  for (const sel of selectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 500 })) {
        console.log('  [Aborting stuck generation...]');
        await btn.click();
        await page.waitForTimeout(1000);
      }
    } catch {
      // Ignore
    }
  }
}

/**
 * Dismiss common modal dialogs that may block interaction
 */
async function dismissModals(page: Page): Promise<void> {
  const modalDismissSelectors = [
    // Google location prompt
    'button:has-text("Not now")',
    'button:has-text("No thanks")',
    'button:has-text("Maybe later")',
    // Generic dismiss patterns
    '[aria-label="Close"]',
    '[aria-label="Dismiss"]',
    'button:has-text("Close")',
    'button:has-text("Dismiss")',
    'button:has-text("Skip")',
    'button:has-text("Got it")',
    // Cookie/consent banners
    'button:has-text("Accept")',
    'button:has-text("Accept all")',
    '[aria-label="Accept cookies"]',
    // Overlay close buttons
    '.modal-close',
    '[data-testid="close-button"]',
    '[data-dismiss="modal"]',
  ];

  for (const sel of modalDismissSelectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 200 })) {
        await btn.click();
        await page.waitForTimeout(300);
      }
    } catch {
      // Ignore - selector not found or not clickable
    }
  }
}

// Surfaces that need longer timeouts (LLMs that think slowly)
const SLOW_SURFACES = new Set(['chatgpt-web', 'claude-web', 'meta-ai-web', 'copilot-web', 'x-grok-web', 'perplexity-web']);

async function queryTab(page: Page, surfaceId: string, query: string): Promise<{ success: boolean; response?: string; error?: string }> {
  const selectors = QUERY_SELECTORS[surfaceId];
  if (!selectors) {
    return { success: false, error: 'No selectors configured' };
  }

  const maxWaitTime = SLOW_SURFACES.has(surfaceId) ? 45000 : 20000;

  try {
    await page.bringToFront();

    // Dismiss any blocking modals first
    await dismissModals(page);

    // Abort any stuck generation from previous queries
    await abortStuckGeneration(page, surfaceId);

    // Scroll to top for pages that might be scrolled down
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);

    // Count initial response elements to detect new ones
    let initialCount = 0;
    for (const sel of selectors.response) {
      try {
        initialCount = await page.locator(sel).count();
        if (initialCount > 0) break;
      } catch { continue; }
    }

    // Find and fill input
    let inputFound = false;
    for (const sel of selectors.input) {
      try {
        if (await page.isVisible(sel)) {
          await page.click(sel);
          await page.keyboard.press('Meta+a');
          // Try fill first, fall back to keyboard.type for contenteditable
          try {
            await page.fill(sel, query);
          } catch {
            // For contenteditable elements, use keyboard
            await page.keyboard.press('Backspace');
            await page.keyboard.type(query);
          }
          inputFound = true;
          break;
        }
      } catch { continue; }
    }

    if (!inputFound) {
      return { success: false, error: 'Input field not found' };
    }

    await page.waitForTimeout(300);

    // Submit
    let submitted = false;
    if (selectors.submit) {
      for (const sel of selectors.submit) {
        try {
          if (await page.isVisible(sel)) {
            await page.click(sel);
            submitted = true;
            break;
          }
        } catch { continue; }
      }
    }
    if (!submitted) {
      await page.keyboard.press('Enter');
    }

    // Wait for new response (check for increased count or new content)
    await page.waitForTimeout(2000);

    let response = '';
    for (const sel of selectors.response) {
      try {
        // Wait for new response element to appear
        const startTime = Date.now();
        let currentCount = 0;

        while (Date.now() - startTime < maxWaitTime) {
          currentCount = await page.locator(sel).count();
          if (currentCount > initialCount || initialCount === 0) {
            // New element appeared, wait a bit for content to load
            await page.waitForTimeout(3000);
            break;
          }
          await page.waitForTimeout(500);
        }

        response = await page.evaluate((s) => {
          const els = document.querySelectorAll(s);
          if (els.length === 0) return '';
          // Find the last element that has actual content (not empty)
          for (let i = els.length - 1; i >= 0; i--) {
            const text = (els[i] as HTMLElement).innerText?.trim() || els[i].textContent?.trim() || '';
            if (text && text.length > 10) {
              return text;
            }
          }
          // Fallback to last element
          return (els[els.length - 1] as HTMLElement).innerText?.trim() || els[els.length - 1].textContent?.trim() || '';
        }, sel);

        if (response && response.length > 10) break;
      } catch { continue; }
    }

    if (!response) {
      return { success: false, error: 'No response found' };
    }

    return { success: true, response: response.slice(0, 200) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function main() {
  const query = process.argv[2] || 'What is the capital of France? Answer in one sentence.';

  console.log('='.repeat(60));
  console.log('  CDP Surface Test');
  console.log('='.repeat(60));
  console.log(`Query: "${query}"\n`);

  const playwright = await import('playwright');

  let browser;
  try {
    browser = await playwright.chromium.connectOverCDP('http://localhost:9222');
  } catch {
    console.error('Could not connect to Chrome. Run Chrome with --remote-debugging-port=9222');
    process.exit(1);
  }

  const context = browser.contexts()[0];
  if (!context) {
    console.error('No browser context found');
    await browser.close();
    process.exit(1);
  }

  const results: { surface: string; status: string; response?: string }[] = [];

  for (const [surfaceId, pattern] of Object.entries(SURFACE_PATTERNS)) {
    process.stdout.write(`Testing ${pattern.name}... `);

    const page = await findTab(context, surfaceId);
    if (!page) {
      console.log('❌ No tab found');
      results.push({ surface: surfaceId, status: 'no_tab' });
      continue;
    }

    if (!QUERY_SELECTORS[surfaceId]) {
      console.log('⚠️ No selectors configured');
      results.push({ surface: surfaceId, status: 'no_selectors' });
      continue;
    }

    const result = await queryTab(page, surfaceId, query);
    if (result.success) {
      console.log('✅');
      results.push({ surface: surfaceId, status: 'success', response: result.response });
    } else {
      console.log(`❌ ${result.error}`);
      results.push({ surface: surfaceId, status: 'failed', response: result.error });
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('  Results');
  console.log('='.repeat(60) + '\n');

  const successful = results.filter(r => r.status === 'success');
  const failed = results.filter(r => r.status !== 'success');

  console.log(`Passed: ${successful.length}/${results.length}\n`);

  if (successful.length > 0) {
    console.log('--- Successful ---');
    for (const r of successful) {
      console.log(`✅ ${r.surface}: ${r.response?.slice(0, 80)}...`);
    }
  }

  if (failed.length > 0) {
    console.log('\n--- Failed/Skipped ---');
    for (const r of failed) {
      console.log(`❌ ${r.surface}: ${r.status} - ${r.response || ''}`);
    }
  }

  await browser.close();
}

main().catch(console.error);
