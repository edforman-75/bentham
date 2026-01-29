/**
 * Microsoft Copilot Collector
 *
 * Query Microsoft Copilot via browser automation with session persistence.
 * Similar to ChatGPT collector - requires initial manual login, then reuses saved session.
 *
 * Setup:
 *   1. Run: npx tsx scripts/copilot-login.ts
 *   2. Log in with Microsoft account in the browser window
 *   3. Session saved to .copilot-session.json
 *   4. Subsequent queries use saved session
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { existsSync, readFileSync, writeFileSync } from 'fs';

/**
 * Copilot citation
 */
export interface CopilotCitation {
  position: number;
  title: string;
  url: string;
  domain: string;
}

/**
 * Copilot query result
 */
export interface CopilotResult {
  query: string;
  response_text: string;
  citations: CopilotCitation[];
  timestamp: string;
  success: boolean;
  error?: string;
  session_valid: boolean;
}

/**
 * Session options
 */
export interface CopilotSessionOptions {
  /** Path to saved session file */
  sessionPath?: string;
  /** Headless mode (default: true) */
  headless?: boolean;
  /** Timeout for responses (ms) */
  timeout?: number;
}

const DEFAULT_SESSION_PATH = '.copilot-session.json';
const COPILOT_URL = 'https://copilot.microsoft.com/';

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Check if session file exists and is valid
 */
export function hasValidCopilotSession(sessionPath: string = DEFAULT_SESSION_PATH): boolean {
  if (!existsSync(sessionPath)) {
    return false;
  }

  try {
    const data = JSON.parse(readFileSync(sessionPath, 'utf-8'));
    // Check if session has cookies
    return data.cookies && data.cookies.length > 0;
  } catch {
    return false;
  }
}

/**
 * Create a browser context with saved session
 */
async function createAuthenticatedContext(
  browser: Browser,
  sessionPath: string
): Promise<BrowserContext> {
  if (existsSync(sessionPath)) {
    return browser.newContext({
      storageState: sessionPath,
    });
  }
  return browser.newContext();
}

/**
 * Check if we're logged in to Copilot (or at least have a working session)
 */
async function isReady(page: Page): Promise<boolean> {
  try {
    // Check for input field - indicates Copilot is ready
    const inputSelectors = [
      '#userInput',
      'textarea[placeholder*="Ask"]',
      'textarea[placeholder*="Message"]',
      '[data-testid="chat-input"]',
      'textarea[name="q"]',
      '#searchbox',
    ];

    for (const selector of inputSelectors) {
      const element = await page.$(selector);
      if (element) return true;
    }

    // Check if redirected to login
    const url = page.url();
    if (url.includes('login.microsoftonline.com') || url.includes('login.live.com')) {
      return false;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Interactive login - opens browser for manual login
 */
export async function interactiveCopilotLogin(
  sessionPath: string = DEFAULT_SESSION_PATH
): Promise<boolean> {
  console.log('Opening browser for Copilot login...');
  console.log('Please log in with your Microsoft account. The session will be saved automatically.');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(COPILOT_URL);

    // Wait for user to log in (check periodically)
    console.log('Waiting for login... (you have 5 minutes)');

    const maxWait = 5 * 60 * 1000; // 5 minutes
    const checkInterval = 2000; // 2 seconds
    let elapsed = 0;

    while (elapsed < maxWait) {
      await page.waitForTimeout(checkInterval);
      elapsed += checkInterval;

      if (await isReady(page)) {
        console.log('Copilot ready! Saving session...');

        // Save the session
        await context.storageState({ path: sessionPath });
        console.log(`Session saved to ${sessionPath}`);

        await browser.close();
        return true;
      }
    }

    console.log('Login timeout. Please try again.');
    await browser.close();
    return false;

  } catch (error) {
    console.error('Login error:', error);
    await browser.close();
    return false;
  }
}

/**
 * Dismiss any modals or overlays that might be blocking interaction
 */
async function dismissModals(page: Page): Promise<void> {
  // Common modal dismiss buttons
  const dismissSelectors = [
    'button[aria-label*="Close"]',
    'button[aria-label*="Dismiss"]',
    'button[aria-label*="Accept"]',
    'button:has-text("Accept")',
    'button:has-text("Got it")',
    'button:has-text("Continue")',
    'button:has-text("OK")',
    '[data-testid="close-button"]',
    '.modal-close',
    '[aria-label="Close"]',
  ];

  for (const selector of dismissSelectors) {
    try {
      const button = await page.$(selector);
      if (button && await button.isVisible()) {
        await button.click();
        await page.waitForTimeout(500);
      }
    } catch {
      // Ignore errors
    }
  }

  // Also try pressing Escape to close any modal
  try {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  } catch {
    // Ignore
  }
}

/**
 * Query Copilot with a prompt
 */
export async function queryCopilot(
  prompt: string,
  options: CopilotSessionOptions = {}
): Promise<CopilotResult> {
  const sessionPath = options.sessionPath || DEFAULT_SESSION_PATH;
  const headless = options.headless ?? true;
  const timeout = options.timeout || 90000;
  const timestamp = new Date().toISOString();

  // Check for valid session
  if (!hasValidCopilotSession(sessionPath)) {
    return {
      query: prompt,
      response_text: '',
      citations: [],
      timestamp,
      success: false,
      error: `No valid session found at ${sessionPath}. Run interactiveCopilotLogin() first.`,
      session_valid: false,
    };
  }

  const browser = await chromium.launch({ headless });

  try {
    const context = await createAuthenticatedContext(browser, sessionPath);
    const page = await context.newPage();

    // Navigate to Copilot
    await page.goto(COPILOT_URL, { waitUntil: 'domcontentloaded', timeout });

    // Wait for page to load
    await page.waitForTimeout(3000);

    // Dismiss any modals or overlays
    await dismissModals(page);

    // Check if ready
    if (!(await isReady(page))) {
      await browser.close();
      return {
        query: prompt,
        response_text: '',
        citations: [],
        timestamp,
        success: false,
        error: 'Session expired or Copilot not ready. Run interactiveCopilotLogin() to refresh.',
        session_valid: false,
      };
    }

    // Dismiss any modals again before interacting
    await dismissModals(page);
    await page.waitForTimeout(500);

    // Find the input field
    const inputSelectors = [
      '#userInput',
      'textarea[placeholder*="Ask"]',
      'textarea[placeholder*="Message"]',
      '[data-testid="chat-input"]',
      'textarea[name="q"]',
      '#searchbox',
    ];

    let inputField = null;
    for (const selector of inputSelectors) {
      inputField = await page.$(selector);
      if (inputField) break;
    }

    if (!inputField) {
      await browser.close();
      return {
        query: prompt,
        response_text: '',
        citations: [],
        timestamp,
        success: false,
        error: 'Could not find input field',
        session_valid: true,
      };
    }

    // Type the prompt
    await inputField.fill(prompt);
    await page.waitForTimeout(500);

    // Submit (press Enter is more reliable than clicking)
    await inputField.press('Enter');

    // Wait for response to appear
    await page.waitForTimeout(3000);

    // Wait for response container
    const responseSelectors = [
      '.response-message',
      '[data-testid="bot-response"]',
      '.cib-message-content',
      '[role="article"]',
      '.prose',
      '[data-content="ai-message"]',
    ];

    let responseElement = null;
    for (const selector of responseSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 15000, state: 'visible' });
        const elements = await page.$$(selector);
        if (elements.length > 0) {
          responseElement = elements[elements.length - 1];
          break;
        }
      } catch {
        continue;
      }
    }

    // Wait for typing to complete (look for stop button to disappear)
    try {
      await page.waitForSelector('button:has-text("Stop"), [aria-label*="Stop"]', {
        state: 'hidden',
        timeout: timeout - 10000,
      });
    } catch {
      // May not have a stop button
    }

    // Additional wait for response to settle
    await page.waitForTimeout(2000);

    // Extract the response text
    let responseText = '';
    for (const selector of responseSelectors) {
      const elements = await page.$$(selector);
      if (elements.length > 0) {
        const lastElement = elements[elements.length - 1];
        responseText = await lastElement.textContent() || '';
        if (responseText.trim()) break;
      }
    }

    // Extract citations
    const citations: CopilotCitation[] = [];
    const linkElements = await page.$$('a[href^="http"]');

    let position = 1;
    const seenUrls = new Set<string>();
    for (const element of linkElements) {
      const url = await element.getAttribute('href');
      const title = await element.textContent();

      if (url &&
          !url.includes('microsoft.com') &&
          !url.includes('bing.com') &&
          !url.includes('copilot.microsoft.com') &&
          !seenUrls.has(url)) {
        seenUrls.add(url);
        citations.push({
          position: position++,
          title: title || '',
          url,
          domain: extractDomain(url),
        });
      }
    }

    // Update session (cookies may have been refreshed)
    await context.storageState({ path: sessionPath });

    await browser.close();

    return {
      query: prompt,
      response_text: responseText.trim(),
      citations,
      timestamp,
      success: responseText.trim().length > 0,
      session_valid: true,
    };

  } catch (error) {
    await browser.close();
    return {
      query: prompt,
      response_text: '',
      citations: [],
      timestamp,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      session_valid: true,
    };
  }
}

/**
 * Query Copilot with multiple prompts
 */
export async function queryCopilotBatch(
  prompts: string[],
  options: CopilotSessionOptions & {
    delay?: number;
    onProgress?: (completed: number, total: number, result: CopilotResult) => void;
  } = {}
): Promise<CopilotResult[]> {
  const results: CopilotResult[] = [];
  const delay = options.delay || 5000; // 5 second delay between queries

  for (let i = 0; i < prompts.length; i++) {
    const result = await queryCopilot(prompts[i], options);
    results.push(result);

    options.onProgress?.(i + 1, prompts.length, result);

    // Check if session became invalid
    if (!result.session_valid) {
      console.error('Session invalid, stopping batch.');
      break;
    }

    // Delay between queries to avoid rate limiting
    if (i < prompts.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return results;
}

/**
 * Verify session is working without making a query
 */
export async function verifyCopilotSession(
  sessionPath: string = DEFAULT_SESSION_PATH
): Promise<{ valid: boolean; error?: string }> {
  if (!hasValidCopilotSession(sessionPath)) {
    return { valid: false, error: 'No session file found' };
  }

  const browser = await chromium.launch({ headless: true });

  try {
    const context = await createAuthenticatedContext(browser, sessionPath);
    const page = await context.newPage();

    await page.goto(COPILOT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const ready = await isReady(page);
    await browser.close();

    if (ready) {
      return { valid: true };
    } else {
      return { valid: false, error: 'Session expired - need to re-login' };
    }

  } catch (error) {
    await browser.close();
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Summarize Copilot results
 */
export function summarizeCopilotResults(results: CopilotResult[]): {
  total_queries: number;
  successful: number;
  failed: number;
  total_citations: number;
  citations_by_domain: Record<string, number>;
  session_issues: number;
} {
  const summary = {
    total_queries: results.length,
    successful: 0,
    failed: 0,
    total_citations: 0,
    citations_by_domain: {} as Record<string, number>,
    session_issues: 0,
  };

  for (const result of results) {
    if (result.success) {
      summary.successful++;
    } else {
      summary.failed++;
      if (!result.session_valid) {
        summary.session_issues++;
      }
    }

    summary.total_citations += result.citations.length;

    for (const citation of result.citations) {
      summary.citations_by_domain[citation.domain] =
        (summary.citations_by_domain[citation.domain] || 0) + 1;
    }
  }

  return summary;
}
