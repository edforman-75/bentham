/**
 * ChatGPT Collector
 *
 * Query ChatGPT via browser automation with session persistence.
 * Requires initial manual login, then reuses saved session.
 *
 * Setup:
 *   1. Run: npx tsx scripts/chatgpt-login.ts
 *   2. Log in manually in the browser window
 *   3. Session saved to .chatgpt-session.json
 *   4. Subsequent queries use saved session
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * ChatGPT citation
 */
export interface ChatGPTCitation {
  position: number;
  title: string;
  url: string;
  domain: string;
}

/**
 * ChatGPT query result
 */
export interface ChatGPTResult {
  query: string;
  response_text: string;
  citations: ChatGPTCitation[];
  model?: string;
  timestamp: string;
  success: boolean;
  error?: string;
  session_valid: boolean;
}

/**
 * Proxy configuration for geo-targeting
 */
export interface ProxyConfig {
  /** Proxy server host */
  server: string;
  /** Proxy username */
  username?: string;
  /** Proxy password */
  password?: string;
}

/**
 * Session options
 */
export interface ChatGPTSessionOptions {
  /** Path to saved session file */
  sessionPath?: string;
  /** Headless mode (default: true) */
  headless?: boolean;
  /** Timeout for responses (ms) */
  timeout?: number;
  /** Proxy configuration for geo-targeting */
  proxy?: ProxyConfig;
  /** Country code for Oxylabs geo-targeting (e.g., 'in', 'us') */
  country?: string;
}

/**
 * Get Oxylabs residential proxy config for a country
 */
export function getOxylabsProxy(country: string): ProxyConfig | null {
  const username = process.env.OXYLABS_USERNAME;
  const password = process.env.OXYLABS_PASSWORD;

  if (!username || !password) {
    return null;
  }

  // Oxylabs residential proxy format with country targeting
  // Format: customer-USERNAME-cc-COUNTRY:PASSWORD@pr.oxylabs.io:7777
  return {
    server: 'http://pr.oxylabs.io:7777',
    username: `customer-${username}-cc-${country.toLowerCase()}`,
    password: password,
  };
}

const DEFAULT_SESSION_PATH = '.chatgpt-session.json';
const CHATGPT_URL = 'https://chatgpt.com/';

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
export function hasValidSession(sessionPath: string = DEFAULT_SESSION_PATH): boolean {
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
 * Check if we're logged in to ChatGPT
 */
async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    // Check for elements that only appear when logged in
    const loggedInIndicators = [
      '[data-testid="profile-button"]',
      'button[aria-label*="User"]',
      '[class*="user-menu"]',
      'nav [class*="avatar"]',
    ];

    for (const selector of loggedInIndicators) {
      const element = await page.$(selector);
      if (element) return true;
    }

    // Check for login button (indicates NOT logged in)
    const loginButton = await page.$('button:has-text("Log in"), a:has-text("Log in")');
    return !loginButton;

  } catch {
    return false;
  }
}

/**
 * Interactive login - opens browser for manual login
 */
export async function interactiveLogin(
  sessionPath: string = DEFAULT_SESSION_PATH
): Promise<boolean> {
  console.log('Opening browser for ChatGPT login...');
  console.log('Please log in manually. The session will be saved automatically.');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(CHATGPT_URL);

    // Wait for user to log in (check periodically)
    console.log('Waiting for login... (you have 5 minutes)');

    const maxWait = 5 * 60 * 1000; // 5 minutes
    const checkInterval = 2000; // 2 seconds
    let elapsed = 0;

    while (elapsed < maxWait) {
      await page.waitForTimeout(checkInterval);
      elapsed += checkInterval;

      if (await isLoggedIn(page)) {
        console.log('Login detected! Saving session...');

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
 * Query ChatGPT with a prompt
 */
export async function queryChatGPT(
  prompt: string,
  options: ChatGPTSessionOptions = {}
): Promise<ChatGPTResult> {
  const sessionPath = options.sessionPath || DEFAULT_SESSION_PATH;
  const headless = options.headless ?? true;
  const timeout = options.timeout || 60000;
  const timestamp = new Date().toISOString();

  // Check for valid session
  if (!hasValidSession(sessionPath)) {
    return {
      query: prompt,
      response_text: '',
      citations: [],
      timestamp,
      success: false,
      error: `No valid session found at ${sessionPath}. Run interactiveLogin() first.`,
      session_valid: false,
    };
  }

  // Get proxy config - either provided or from Oxylabs with country targeting
  let proxyConfig: ProxyConfig | undefined = options.proxy;
  if (!proxyConfig && options.country) {
    const oxylabsProxy = getOxylabsProxy(options.country);
    if (oxylabsProxy) {
      proxyConfig = oxylabsProxy;
      console.log(`  Using Oxylabs proxy for country: ${options.country}`);
    }
  }

  // Launch browser with optional proxy
  const launchOptions: Parameters<typeof chromium.launch>[0] = { headless };
  if (proxyConfig) {
    launchOptions.proxy = {
      server: proxyConfig.server,
      username: proxyConfig.username,
      password: proxyConfig.password,
    };
  }

  const browser = await chromium.launch(launchOptions);

  try {
    const context = await createAuthenticatedContext(browser, sessionPath);
    const page = await context.newPage();

    // Navigate to ChatGPT
    await page.goto(CHATGPT_URL, { waitUntil: 'domcontentloaded', timeout });

    // Wait for page to load
    await page.waitForTimeout(2000);

    // Check if still logged in
    if (!(await isLoggedIn(page))) {
      await browser.close();
      return {
        query: prompt,
        response_text: '',
        citations: [],
        timestamp,
        success: false,
        error: 'Session expired. Run interactiveLogin() to refresh.',
        session_valid: false,
      };
    }

    // Find the input field and type the prompt
    const inputSelectors = [
      'textarea[data-id="root"]',
      '#prompt-textarea',
      'textarea[placeholder*="Message"]',
      'textarea',
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

    // Submit (press Enter or click send button)
    const sendButton = await page.$('button[data-testid="send-button"], button[aria-label="Send"]');
    if (sendButton) {
      await sendButton.click();
    } else {
      await inputField.press('Enter');
    }

    // Wait for response to complete
    // ChatGPT shows a streaming response, we need to wait for it to finish
    await page.waitForTimeout(3000); // Initial wait

    // Wait for the "stop generating" button to disappear (indicates response complete)
    try {
      await page.waitForSelector('button:has-text("Stop generating")', {
        state: 'hidden',
        timeout: timeout - 5000,
      });
    } catch {
      // Button might not appear for short responses
    }

    // Additional wait for response to settle
    await page.waitForTimeout(2000);

    // Extract the response
    const responseSelectors = [
      '[data-message-author-role="assistant"]',
      '.markdown.prose',
      '[class*="agent-turn"]',
      '.text-base',
    ];

    let responseText = '';
    for (const selector of responseSelectors) {
      const elements = await page.$$(selector);
      if (elements.length > 0) {
        // Get the last response (most recent)
        const lastElement = elements[elements.length - 1];
        responseText = await lastElement.textContent() || '';
        if (responseText.trim()) break;
      }
    }

    // Extract citations (if ChatGPT browsed the web)
    const citations: ChatGPTCitation[] = [];
    const citationElements = await page.$$('[data-message-author-role="assistant"] a[href^="http"]');

    let position = 1;
    for (const element of citationElements) {
      const url = await element.getAttribute('href');
      const title = await element.textContent();

      if (url && !url.includes('chatgpt.com') && !url.includes('openai.com')) {
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
      success: true,
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
 * Query ChatGPT with multiple prompts
 */
export async function queryChatGPTBatch(
  prompts: string[],
  options: ChatGPTSessionOptions & {
    delay?: number;
    onProgress?: (completed: number, total: number, result: ChatGPTResult) => void;
  } = {}
): Promise<ChatGPTResult[]> {
  const results: ChatGPTResult[] = [];
  const delay = options.delay || 5000; // 5 second delay between queries

  for (let i = 0; i < prompts.length; i++) {
    const result = await queryChatGPT(prompts[i], options);
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
export async function verifySession(
  sessionPath: string = DEFAULT_SESSION_PATH
): Promise<{ valid: boolean; error?: string }> {
  if (!hasValidSession(sessionPath)) {
    return { valid: false, error: 'No session file found' };
  }

  const browser = await chromium.launch({ headless: true });

  try {
    const context = await createAuthenticatedContext(browser, sessionPath);
    const page = await context.newPage();

    await page.goto(CHATGPT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const loggedIn = await isLoggedIn(page);
    await browser.close();

    if (loggedIn) {
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
 * Summarize ChatGPT results
 */
export function summarizeChatGPTResults(results: ChatGPTResult[]): {
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
