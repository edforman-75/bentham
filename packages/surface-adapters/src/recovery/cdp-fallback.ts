/**
 * CDP Fallback
 *
 * Provides fallback query capability using Chrome DevTools Protocol.
 * Connects to an existing Chrome browser with debug port enabled
 * and uses the user's authenticated tabs directly.
 */

import type { SurfaceQueryResponse } from '../types.js';

/**
 * Surface patterns for tab identification
 */
const SURFACE_PATTERNS: Record<string, RegExp> = {
  // Web Chatbots
  'chatgpt-web': /chatgpt\.com/,
  'perplexity-web': /perplexity\.ai/,
  'claude-web': /claude\.ai/,
  'x-grok-web': /x\.com.*grok|grok\.x\.com/,
  'meta-ai-web': /^https:\/\/(www\.)?meta\.ai/,
  'copilot-web': /copilot\.microsoft\.com/,
  // Search
  'bing-search': /bing\.com/,
  'google-search': /www\.google\.com/,
  // E-commerce
  'amazon-web': /amazon\.com\/s\?|amazon\.com\/.*\/dp\/|amazon\.co\./,
  'amazon-rufus': /amazon\.com/,
  'zappos-web': /zappos\.com/,
};

/**
 * Query selectors for each surface
 */
const SURFACE_SELECTORS: Record<string, {
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

/**
 * CDP Fallback configuration
 */
export interface CdpFallbackConfig {
  port: number;
  timeoutMs: number;
}

const DEFAULT_CDP_CONFIG: CdpFallbackConfig = {
  port: 9222,
  timeoutMs: 45000,
};

// Surfaces that need longer timeouts (LLMs that think slowly)
const SLOW_SURFACES: ReadonlySet<string> = new Set(['chatgpt-web', 'claude-web', 'meta-ai-web', 'copilot-web', 'x-grok-web', 'perplexity-web']);

/**
 * Get timeout for a surface (longer for slow LLMs)
 */
function getTimeoutForSurface(surfaceId: string, baseTimeout: number): number {
  return SLOW_SURFACES.has(surfaceId) ? Math.max(baseTimeout, 45000) : baseTimeout;
}

/**
 * Abort any stuck generation (ChatGPT stop button, etc.)
 */
async function abortStuckGeneration(page: import('playwright').Page, surfaceId: string): Promise<void> {
  const abortSelectors: Record<string, string[]> = {
    'chatgpt-web': [
      'button[aria-label="Stop generating"]',
      'button[data-testid="stop-button"]',
    ],
    'claude-web': [
      'button:has-text("Stop")',
    ],
  };

  const selectors = abortSelectors[surfaceId] || [];
  for (const sel of selectors) {
    try {
      if (await page.isVisible(sel)) {
        await page.click(sel);
        await page.waitForTimeout(1000);
      }
    } catch {
      // Ignore
    }
  }
}

/**
 * Dismiss common modal dialogs
 */
async function dismissModals(page: import('playwright').Page): Promise<void> {
  const selectors = [
    'button:has-text("Not now")',
    'button:has-text("No thanks")',
    '[aria-label="Close"]',
    'button:has-text("Got it")',
    'button:has-text("Accept")',
  ];

  for (const sel of selectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 200 })) {
        await btn.click();
        await page.waitForTimeout(300);
      }
    } catch {
      // Ignore
    }
  }
}

/**
 * Check if CDP is available
 */
export async function isCdpAvailable(port: number = 9222): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}/json/version`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Query a surface via CDP
 */
export async function querySurfaceViaCdp(
  surfaceId: string,
  query: string,
  config: Partial<CdpFallbackConfig> = {}
): Promise<SurfaceQueryResponse> {
  const cfg = { ...DEFAULT_CDP_CONFIG, ...config };

  // Check if surface is supported
  const pattern = SURFACE_PATTERNS[surfaceId];
  const selectors = SURFACE_SELECTORS[surfaceId];

  if (!pattern) {
    return {
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: `Surface ${surfaceId} not supported for CDP fallback`,
        retryable: false,
      },
      timing: { totalMs: 0, responseMs: 0 },
    };
  }

  if (!selectors) {
    return {
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: `No selectors configured for ${surfaceId}`,
        retryable: false,
      },
      timing: { totalMs: 0, responseMs: 0 },
    };
  }

  const startTime = Date.now();

  try {
    // Dynamic import playwright
    const playwright = await import('playwright');

    // Connect to Chrome
    const browser = await playwright.chromium.connectOverCDP(
      `http://localhost:${cfg.port}`,
      { timeout: 10000 }
    );

    const contexts = browser.contexts();
    if (contexts.length === 0) {
      await browser.close();
      return {
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'No browser context found',
          retryable: true,
        },
        timing: { totalMs: Date.now() - startTime, responseMs: Date.now() - startTime },
      };
    }

    const context = contexts[0];
    const pages = context.pages();

    // Find matching tab
    const page = pages.find(p => pattern.test(p.url()));
    if (!page) {
      await browser.close();
      return {
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: `No tab found for ${surfaceId}. Open a tab to the service first.`,
          retryable: false,
        },
        timing: { totalMs: Date.now() - startTime, responseMs: Date.now() - startTime },
      };
    }

    // Bring tab to front
    await page.bringToFront();

    // Dismiss any blocking modals
    await dismissModals(page);

    // Abort any stuck generation from previous queries
    await abortStuckGeneration(page, surfaceId);

    // Scroll to top for pages that might be scrolled down
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);

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
      } catch {
        continue;
      }
    }

    if (!inputFound) {
      await browser.close();
      return {
        success: false,
        error: {
          code: 'INVALID_RESPONSE',
          message: 'Could not find input field',
          retryable: true,
        },
        timing: { totalMs: Date.now() - startTime, responseMs: Date.now() - startTime },
      };
    }

    // Brief delay
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
        } catch {
          continue;
        }
      }
    }
    if (!submitted) {
      await page.keyboard.press('Enter');
    }

    // Wait for response
    await page.waitForTimeout(2000);

    let responseText = '';
    for (const sel of selectors.response) {
      try {
        const effectiveTimeout = getTimeoutForSurface(surfaceId, cfg.timeoutMs) - (Date.now() - startTime);
        await page.waitForSelector(sel, { timeout: Math.max(effectiveTimeout, 5000), state: 'visible' });
        await page.waitForTimeout(3000);

        responseText = await page.evaluate((s) => {
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

        if (responseText && responseText.length > 10) break;
      } catch {
        continue;
      }
    }

    await browser.close();

    if (!responseText) {
      return {
        success: false,
        error: {
          code: 'INVALID_RESPONSE',
          message: 'No response found',
          retryable: true,
        },
        timing: { totalMs: Date.now() - startTime, responseMs: Date.now() - startTime },
      };
    }

    const queryTimeMs = Date.now() - startTime;
    return {
      success: true,
      responseText,
      timing: {
        totalMs: queryTimeMs,
        responseMs: queryTimeMs,
      },
      rawResponse: { surfaceId, source: 'cdp_fallback' },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : String(error),
        retryable: true,
      },
      timing: { totalMs: Date.now() - startTime, responseMs: Date.now() - startTime },
    };
  }
}

/**
 * Create a CDP query function for the recovery manager
 */
export function createCdpQueryFn(config?: Partial<CdpFallbackConfig>) {
  return (surfaceId: string, query: string) => querySurfaceViaCdp(surfaceId, query, config);
}
