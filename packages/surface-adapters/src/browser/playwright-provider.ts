/**
 * Playwright Browser Provider
 *
 * Real browser provider using Playwright for web scraping.
 * Supports session injection from ChromeSessionManager.
 */

import type {
  BrowserProvider,
  Browser,
  BrowserContext,
  BrowserPage,
} from '../base/web-adapter.js';
import type { StoredSession } from './chrome-session-manager.js';

/**
 * Playwright provider configuration
 */
export interface PlaywrightProviderConfig {
  /** Run in headless mode */
  headless?: boolean;
  /** Slow down operations by this many ms */
  slowMo?: number;
  /** Default viewport */
  viewport?: { width: number; height: number };
  /** Default user agent */
  userAgent?: string;
  /** Session to inject (cookies, storage) */
  session?: StoredSession;
  /** Proxy configuration */
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
}

/**
 * Default configuration
 */
export const DEFAULT_PLAYWRIGHT_CONFIG: PlaywrightProviderConfig = {
  headless: true,
  slowMo: 0,
  viewport: { width: 1280, height: 720 },
};

/**
 * Wrap Playwright Page to match our BrowserPage interface
 */
function wrapPage(page: import('playwright').Page): BrowserPage {
  return {
    async goto(url, options) {
      await page.goto(url, {
        timeout: options?.timeout,
        waitUntil: options?.waitUntil,
      });
    },
    async waitForSelector(selector, options) {
      await page.waitForSelector(selector, {
        timeout: options?.timeout,
        state: options?.state,
      });
    },
    async click(selector) {
      await page.click(selector);
    },
    async type(selector, text) {
      await page.type(selector, text);
    },
    async fill(selector, text) {
      await page.fill(selector, text);
    },
    async press(selector, key) {
      await page.press(selector, key);
    },
    async textContent(selector) {
      return page.textContent(selector);
    },
    async innerHTML(selector) {
      return page.innerHTML(selector);
    },
    async evaluate<T>(fn: () => T) {
      return page.evaluate(fn);
    },
    async screenshot(options) {
      return page.screenshot({
        fullPage: options?.fullPage,
        quality: options?.quality,
        type: options?.type,
      });
    },
    async content() {
      return page.content();
    },
    async waitForTimeout(ms) {
      await page.waitForTimeout(ms);
    },
    async waitForFunction(fn, options) {
      await page.waitForFunction(fn, undefined, { timeout: options?.timeout });
    },
    async close() {
      await page.close();
    },
    async isVisible(selector) {
      return page.isVisible(selector);
    },
    url() {
      return page.url();
    },
  };
}

/**
 * Wrap Playwright BrowserContext
 */
function wrapContext(
  context: import('playwright').BrowserContext,
  session?: StoredSession
): BrowserContext {
  return {
    async newPage() {
      const page = await context.newPage();

      // Inject localStorage and sessionStorage if session provided
      if (session) {
        // We need to navigate to a page first before setting storage
        // This will be done by the adapter when it navigates
        page.on('load', async () => {
          try {
            if (session.localStorage && Object.keys(session.localStorage).length > 0) {
              await page.evaluate((items) => {
                for (const [key, value] of Object.entries(items)) {
                  window.localStorage.setItem(key, value);
                }
              }, session.localStorage);
            }
            if (session.sessionStorage && Object.keys(session.sessionStorage).length > 0) {
              await page.evaluate((items) => {
                for (const [key, value] of Object.entries(items)) {
                  window.sessionStorage.setItem(key, value);
                }
              }, session.sessionStorage);
            }
          } catch {
            // Storage injection may fail on some pages
          }
        });
      }

      return wrapPage(page);
    },
    async close() {
      await context.close();
    },
    async addCookies(cookies) {
      await context.addCookies(cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
      })));
    },
    async cookies() {
      const cookies = await context.cookies();
      return cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
      }));
    },
  };
}

/**
 * Wrap Playwright Browser
 */
function wrapBrowser(
  browser: import('playwright').Browser,
  config: PlaywrightProviderConfig
): Browser {
  return {
    async newContext(options) {
      const contextOptions: import('playwright').BrowserContextOptions = {
        viewport: options?.viewport || config.viewport,
        userAgent: options?.userAgent || config.userAgent || config.session?.userAgent,
        proxy: options?.proxy || config.proxy,
      };

      const context = await browser.newContext(contextOptions);

      // Inject cookies from session if available
      if (config.session?.cookies && config.session.cookies.length > 0) {
        await context.addCookies(config.session.cookies.map(c => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path || '/',
          expires: c.expires,
          httpOnly: c.httpOnly,
          secure: c.secure,
          sameSite: c.sameSite,
        })));
      }

      return wrapContext(context, config.session);
    },
    async close() {
      await browser.close();
    },
  };
}

/**
 * Playwright Browser Provider
 */
export class PlaywrightBrowserProvider implements BrowserProvider {
  private config: PlaywrightProviderConfig;
  private playwright?: typeof import('playwright');
  private activeBrowsers: Set<import('playwright').Browser> = new Set();

  constructor(config: Partial<PlaywrightProviderConfig> = {}) {
    this.config = { ...DEFAULT_PLAYWRIGHT_CONFIG, ...config };
  }

  /**
   * Get Playwright module (lazy loaded)
   */
  private async getPlaywright(): Promise<typeof import('playwright')> {
    if (!this.playwright) {
      this.playwright = await import('playwright');
    }
    return this.playwright;
  }

  /**
   * Launch or get a browser instance
   */
  async getBrowser(): Promise<Browser> {
    const pw = await this.getPlaywright();

    const browser = await pw.chromium.launch({
      headless: this.config.headless,
      slowMo: this.config.slowMo,
    });

    this.activeBrowsers.add(browser);

    return wrapBrowser(browser, this.config);
  }

  /**
   * Release (close) a browser instance
   */
  async releaseBrowser(browser: Browser): Promise<void> {
    await browser.close();
    // The actual Playwright browser is closed through the wrapper
  }

  /**
   * Close all active browsers
   */
  async closeAll(): Promise<void> {
    for (const browser of this.activeBrowsers) {
      try {
        await browser.close();
      } catch {
        // Ignore errors on close
      }
    }
    this.activeBrowsers.clear();
  }

  /**
   * Update configuration (e.g., to inject a new session)
   */
  updateConfig(config: Partial<PlaywrightProviderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Set session for injection
   */
  setSession(session: StoredSession): void {
    this.config.session = session;
  }

  /**
   * Clear session
   */
  clearSession(): void {
    this.config.session = undefined;
  }
}

/**
 * Create a Playwright browser provider
 */
export function createPlaywrightProvider(
  config?: Partial<PlaywrightProviderConfig>
): PlaywrightBrowserProvider {
  return new PlaywrightBrowserProvider(config);
}

/**
 * Create a provider with a session pre-loaded
 */
export function createProviderWithSession(
  session: StoredSession,
  config?: Partial<PlaywrightProviderConfig>
): PlaywrightBrowserProvider {
  return new PlaywrightBrowserProvider({
    ...config,
    session,
  });
}
