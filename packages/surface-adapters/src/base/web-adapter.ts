/**
 * Base Web Surface Adapter
 *
 * Abstract base class for browser-based surface adapters.
 * Provides common functionality for web chatbots and search surfaces.
 */

import {
  BaseSurfaceAdapter,
  type BaseAdapterConfig,
} from './base-adapter.js';
import type {
  SurfaceMetadata,
  SurfaceQueryRequest,
  SurfaceQueryResponse,
  WebSessionConfig,
  CapturedEvidence,
  CapturedImage,
  ResponseTiming,
} from '../types.js';
import {
  type HumanBehaviorConfig,
  DEFAULT_HUMAN_BEHAVIOR,
  randomDelay,
  randomSleep,
  preInteractionDelay,
  postInteractionDelay,
} from '../utils/human-behavior.js';

/**
 * Web adapter configuration
 */
export interface WebAdapterConfig extends Partial<BaseAdapterConfig> {
  /** Session configuration */
  sessionConfig?: WebSessionConfig;
  /** Whether to run in headless mode */
  headless?: boolean;
  /** Screenshot capture quality (0-100) */
  screenshotQuality?: number;
  /** Whether to capture HAR files */
  captureHar?: boolean;
  /** Page load timeout */
  pageLoadTimeoutMs?: number;
  /** Wait for network idle timeout */
  networkIdleTimeoutMs?: number;
  /** Capture screenshot after each query */
  captureScreenshots?: boolean;
  /** Extract images from response */
  captureImages?: boolean;
  /** Capture full HTML content */
  captureHtml?: boolean;
  /** Enable human-like behavior (default: true) */
  enableHumanBehavior?: boolean;
  /** Human behavior configuration */
  humanBehavior?: Partial<HumanBehaviorConfig>;
}

/**
 * Default web adapter configuration
 */
export const DEFAULT_WEB_CONFIG: WebAdapterConfig = {
  headless: true,
  screenshotQuality: 80,
  captureHar: false,
  pageLoadTimeoutMs: 30000,
  networkIdleTimeoutMs: 5000,
  captureScreenshots: false,
  captureImages: false,
  captureHtml: false,
  enableHumanBehavior: true,
  humanBehavior: DEFAULT_HUMAN_BEHAVIOR,
};

/**
 * Keyboard interface for human-like typing
 */
export interface BrowserKeyboard {
  /** Type a single character or string with optional delay */
  type(text: string, options?: { delay?: number }): Promise<void>;
  /** Press a key (like Enter, Backspace) */
  press(key: string): Promise<void>;
}

/**
 * Mouse interface for human-like movements
 */
export interface BrowserMouse {
  /** Move mouse to coordinates */
  move(x: number, y: number, options?: { steps?: number }): Promise<void>;
  /** Scroll the page */
  wheel(deltaX: number, deltaY: number): Promise<void>;
}

/**
 * Browser page interface (abstraction over Playwright)
 * This allows testing without actual browser dependencies
 */
export interface BrowserPage {
  /** Navigate to URL */
  goto(url: string, options?: { timeout?: number; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }): Promise<void>;
  /** Wait for selector */
  waitForSelector(selector: string, options?: { timeout?: number; state?: 'attached' | 'visible' }): Promise<void>;
  /** Click element */
  click(selector: string): Promise<void>;
  /** Type text */
  type(selector: string, text: string): Promise<void>;
  /** Fill input */
  fill(selector: string, text: string): Promise<void>;
  /** Press key */
  press(selector: string, key: string): Promise<void>;
  /** Get text content */
  textContent(selector: string): Promise<string | null>;
  /** Get inner HTML */
  innerHTML(selector: string): Promise<string>;
  /** Evaluate JavaScript */
  evaluate<T>(fn: () => T): Promise<T>;
  /** Take screenshot */
  screenshot(options?: { fullPage?: boolean; quality?: number; type?: 'png' | 'jpeg' }): Promise<Buffer>;
  /** Get page content */
  content(): Promise<string>;
  /** Wait for timeout */
  waitForTimeout(ms: number): Promise<void>;
  /** Wait for function */
  waitForFunction(fn: () => boolean, options?: { timeout?: number }): Promise<void>;
  /** Close page */
  close(): Promise<void>;
  /** Check if selector exists */
  isVisible(selector: string): Promise<boolean>;
  /** Get URL */
  url(): string;
  /** Keyboard interface for direct typing */
  keyboard?: BrowserKeyboard;
  /** Mouse interface for movements */
  mouse?: BrowserMouse;
  /** Get viewport size */
  viewportSize?(): { width: number; height: number } | null;
}

/**
 * Browser context interface
 */
export interface BrowserContext {
  /** Create new page */
  newPage(): Promise<BrowserPage>;
  /** Close context */
  close(): Promise<void>;
  /** Set cookies */
  addCookies(cookies: Array<{ name: string; value: string; domain: string; path?: string }>): Promise<void>;
  /** Get cookies */
  cookies(): Promise<Array<{ name: string; value: string; domain: string }>>;
}

/**
 * Browser interface
 */
export interface Browser {
  /** Create new context */
  newContext(options?: {
    viewport?: { width: number; height: number };
    userAgent?: string;
    proxy?: { server: string; username?: string; password?: string };
  }): Promise<BrowserContext>;
  /** Close browser */
  close(): Promise<void>;
}

/**
 * Browser provider interface for dependency injection
 */
export interface BrowserProvider {
  /** Launch or get a browser instance */
  getBrowser(): Promise<Browser>;
  /** Release the browser instance */
  releaseBrowser(browser: Browser): Promise<void>;
}

/**
 * Mock browser provider for testing
 */
export class MockBrowserProvider implements BrowserProvider {
  private mockResponses: Map<string, string> = new Map();

  setMockResponse(query: string, response: string): void {
    this.mockResponses.set(query.toLowerCase(), response);
  }

  async getBrowser(): Promise<Browser> {
    const self = this;
    return {
      async newContext() {
        return {
          async newPage(): Promise<BrowserPage> {
            let currentUrl = '';
            return {
              keyboard: {
                async type() {},
                async press() {},
              },
              mouse: {
                async move() {},
                async wheel() {},
              },
              viewportSize() { return { width: 1280, height: 720 }; },
              async goto(url: string) { currentUrl = url; },
              async waitForSelector() {},
              async click() {},
              async type() {},
              async fill() {},
              async press() {},
              async textContent(selector: string) {
                // Return mock response based on query
                for (const [query, response] of self.mockResponses) {
                  if (currentUrl.includes(query) || selector.includes('response')) {
                    return response;
                  }
                }
                return 'Mock response';
              },
              async innerHTML() { return '<div>Mock HTML</div>'; },
              async evaluate<T>(fn: () => T) {
                // Try to execute the function to get its return type
                // This works for simple functions that don't need DOM
                try {
                  const result = fn();
                  // If the function returned something valid (not undefined from DOM calls), use it
                  if (result !== undefined) {
                    return result;
                  }
                } catch {
                  // Function threw (probably needs DOM)
                  // For functions that query DOM elements (returns string/array), return mock data
                  // For functions that check conditions (returns boolean), return false (safe default)
                  const fnStr = fn.toString();
                  // If it looks like a boolean check (includes, hasOwnProperty, etc.), return false
                  if (fnStr.includes('.includes(') || fnStr.includes('!!') || fnStr.includes('return !')) {
                    return false as T;
                  }
                  // Return mock data for text extraction functions
                  for (const [query, response] of self.mockResponses) {
                    if (currentUrl.includes(query)) {
                      return response as T;
                    }
                  }
                }
                return 'Mock response' as T;
              },
              async screenshot() { return Buffer.from('mock-screenshot'); },
              async content() { return '<html><body>Mock content</body></html>'; },
              async waitForTimeout() {},
              async waitForFunction() {},
              async close() {},
              async isVisible(selector: string) {
                // Return false for login/captcha indicators (they shouldn't be visible in happy path)
                const loginIndicators = ['login', 'captcha', 'recaptcha', 'turnstile', 'sign-in'];
                for (const indicator of loginIndicators) {
                  if (selector.toLowerCase().includes(indicator)) {
                    return false;
                  }
                }
                return true;
              },
              url() { return currentUrl; },
            };
          },
          async close() {},
          async addCookies() {},
          async cookies() { return []; },
        };
      },
      async close() {},
    };
  }

  async releaseBrowser(): Promise<void> {}
}

/**
 * UI element selectors for a web surface
 */
export interface WebSurfaceSelectors {
  /** Input field for query */
  queryInput: string;
  /** Submit button */
  submitButton: string;
  /** Response container */
  responseContainer: string;
  /** Loading indicator */
  loadingIndicator?: string;
  /** Error message container */
  errorContainer?: string;
  /** Login required indicator */
  loginRequired?: string;
  /** Captcha indicator */
  captchaIndicator?: string;
}

/**
 * Abstract base class for web-based surface adapters
 */
export abstract class BaseWebAdapter extends BaseSurfaceAdapter {
  protected webConfig: WebAdapterConfig;
  protected browserProvider: BrowserProvider;
  protected browser?: Browser;
  protected context?: BrowserContext;
  protected page?: BrowserPage;

  constructor(
    metadata: SurfaceMetadata,
    config: WebAdapterConfig,
    browserProvider: BrowserProvider
  ) {
    super(metadata, config);
    this.webConfig = { ...DEFAULT_WEB_CONFIG, ...config };
    this.browserProvider = browserProvider;
  }

  /**
   * Get selectors for this surface
   */
  protected abstract getSelectors(): WebSurfaceSelectors;

  /**
   * Get the URL to navigate to for queries
   */
  protected abstract getQueryUrl(query: string): string;

  /**
   * Extract response from the page
   */
  protected abstract extractResponse(page: BrowserPage): Promise<string>;

  /**
   * Check if the page shows a login requirement
   */
  protected abstract checkLoginRequired(page: BrowserPage): Promise<boolean>;

  /**
   * Execute a query using browser automation
   */
  protected async executeQuery(request: SurfaceQueryRequest): Promise<SurfaceQueryResponse> {
    const startTime = Date.now();

    try {
      // Ensure we have a page
      await this.ensurePage();

      // Navigate to query URL
      const url = this.getQueryUrl(request.query);
      await this.page!.goto(url, {
        timeout: this.webConfig.pageLoadTimeoutMs,
        waitUntil: 'domcontentloaded',
      });

      // Check for login requirement
      if (await this.checkLoginRequired(this.page!)) {
        return {
          success: false,
          timing: this.createWebTiming(startTime),
          error: {
            code: 'SESSION_EXPIRED',
            message: 'Login required',
            retryable: false,
          },
        };
      }

      // Check for captcha
      const selectors = this.getSelectors();
      if (selectors.captchaIndicator) {
        const hasCaptcha = await this.page!.isVisible(selectors.captchaIndicator);
        if (hasCaptcha) {
          return {
            success: false,
            timing: this.createWebTiming(startTime),
            error: {
              code: 'CAPTCHA_REQUIRED',
              message: 'Captcha verification required',
              retryable: false,
            },
          };
        }
      }

      // Submit query if needed (some surfaces use URL-based queries)
      await this.submitQuery(request.query);

      // Wait for response
      await this.waitForResponse();

      // Extract response
      const responseText = await this.extractResponse(this.page!);

      // Capture evidence if requested
      let evidence: CapturedEvidence | undefined;
      if (request.captureEvidence) {
        evidence = await this.captureEvidence();
      }

      return {
        success: true,
        responseText,
        structured: {
          mainResponse: responseText,
        },
        timing: this.createWebTiming(startTime),
        evidence,
      };
    } catch (error) {
      throw error; // Let base class handle
    }
  }

  /**
   * Submit a query (can be overridden)
   * Uses human-like behavior by default for bot detection avoidance
   */
  protected async submitQuery(query: string): Promise<void> {
    const selectors = this.getSelectors();
    const useHuman = this.webConfig.enableHumanBehavior !== false;
    const humanConfig = { ...DEFAULT_HUMAN_BEHAVIOR, ...this.webConfig.humanBehavior };

    if (useHuman) {
      // Human-like query submission
      await preInteractionDelay();

      // Click input field first
      await this.page!.click(selectors.queryInput);
      await randomSleep(100, 300);

      // Clear existing content
      if (this.page!.keyboard) {
        await this.page!.keyboard.press('Meta+a');
        await randomSleep(50, 150);
      }

      // Type with human-like delays
      await this.humanTypeText(query, humanConfig);
      await randomSleep(200, 400);

      // Click submit or press Enter
      if (selectors.submitButton) {
        await this.page!.click(selectors.submitButton);
      } else {
        await this.page!.press(selectors.queryInput, 'Enter');
      }

      await postInteractionDelay();
    } else {
      // Fast mode - instant fill
      await this.page!.fill(selectors.queryInput, query);

      if (selectors.submitButton) {
        await this.page!.click(selectors.submitButton);
      } else {
        await this.page!.press(selectors.queryInput, 'Enter');
      }
    }
  }

  /**
   * Type text with human-like variable delays
   */
  protected async humanTypeText(
    text: string,
    config: HumanBehaviorConfig
  ): Promise<void> {
    if (!this.page?.keyboard) {
      // Fallback to fill if keyboard not available
      await this.page!.fill(this.getSelectors().queryInput, text);
      return;
    }

    const hesitationChars = new Set([' ', '.', ',', '?', '!', "'", '"']);
    const typoPairs: Record<string, string> = {
      'a': 's', 's': 'a', 'd': 'f', 'f': 'd',
      'e': 'r', 'r': 'e', 't': 'y', 'y': 't',
      'i': 'o', 'o': 'i', 'n': 'm', 'm': 'n',
    };

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // Simulate occasional typo + correction
      if (config.typoChance > 0 && Math.random() < config.typoChance && typoPairs[char.toLowerCase()]) {
        const typo = char === char.toUpperCase()
          ? typoPairs[char.toLowerCase()].toUpperCase()
          : typoPairs[char.toLowerCase()];

        await this.page!.keyboard.type(typo, {
          delay: randomDelay(config.minTypingDelayMs, config.maxTypingDelayMs)
        });
        await this.page!.waitForTimeout(randomDelay(100, 250));
        await this.page!.keyboard.press('Backspace');
        await this.page!.waitForTimeout(randomDelay(50, 150));
        await this.page!.keyboard.type(char, {
          delay: randomDelay(config.minTypingDelayMs, config.maxTypingDelayMs)
        });
      } else {
        await this.page!.keyboard.type(char, {
          delay: randomDelay(config.minTypingDelayMs, config.maxTypingDelayMs)
        });
      }

      // Occasional longer pause
      if (Math.random() < config.pauseChance) {
        await this.page!.waitForTimeout(randomDelay(config.minPauseMs, config.maxPauseMs));
      }

      // Extra slight pause after certain characters
      if (hesitationChars.has(char) && Math.random() < 0.3) {
        await this.page!.waitForTimeout(randomDelay(50, 150));
      }
    }
  }

  /**
   * Wait for response to load
   * Includes human-like idle behavior during wait periods
   */
  protected async waitForResponse(): Promise<void> {
    const selectors = this.getSelectors();
    const useHuman = this.webConfig.enableHumanBehavior !== false;

    // Wait for loading to complete if indicator exists
    if (selectors.loadingIndicator) {
      try {
        // Wait for loading to appear
        await this.page!.waitForSelector(selectors.loadingIndicator, {
          timeout: 5000,
          state: 'visible',
        });
        // Wait for loading to disappear
        await this.page!.waitForFunction(
          () => !document.querySelector('[data-loading]'),
          { timeout: this.webConfig.pageLoadTimeoutMs }
        );
      } catch {
        // Loading indicator might not appear for fast responses
      }
    }

    // Wait for response container
    await this.page!.waitForSelector(selectors.responseContainer, {
      timeout: this.webConfig.pageLoadTimeoutMs,
      state: 'visible',
    });

    // Additional wait for content to stabilize with human-like behavior
    if (useHuman) {
      // Variable stabilization wait (more natural than fixed 500ms)
      const stabilizeWait = randomDelay(800, 1500);
      await this.page!.waitForTimeout(stabilizeWait);

      // Occasionally do idle behavior while waiting
      if (this.page?.mouse && Math.random() < 0.2) {
        const viewport = this.page.viewportSize?.() || { width: 1200, height: 800 };
        const x = randomDelay(200, viewport.width - 200);
        const y = randomDelay(200, viewport.height - 200);
        await this.page.mouse.move(x, y, { steps: randomDelay(5, 12) });
      }
    } else {
      await this.page!.waitForTimeout(500);
    }
  }

  /**
   * Capture evidence from the page based on config options
   */
  protected async captureEvidence(): Promise<CapturedEvidence> {
    const evidence: CapturedEvidence = {
      capturedAt: new Date(),
    };

    // Capture screenshot if enabled
    if (this.webConfig.captureScreenshots) {
      const screenshot = await this.page!.screenshot({
        fullPage: true,
        type: 'png',
        quality: this.webConfig.screenshotQuality,
      });
      evidence.screenshot = screenshot.toString('base64');
    }

    // Capture HTML if enabled
    if (this.webConfig.captureHtml) {
      evidence.htmlContent = await this.page!.content();
    }

    // Extract images if enabled
    if (this.webConfig.captureImages) {
      evidence.images = await this.extractImages();
    }

    return evidence;
  }

  /**
   * Extract images from the response area of the page
   */
  protected async extractImages(): Promise<CapturedImage[]> {
    try {
      // Get all images within the response container
      const images = await this.page!.evaluate(() => {
        const responseContainer = document.querySelector('[data-response-container]') ||
                                   document.querySelector('.response') ||
                                   document.body;

        const imgElements = responseContainer.querySelectorAll('img');
        const imageData: Array<{
          src: string;
          alt: string;
          width: number;
          height: number;
          isGenerated: boolean;
        }> = [];

        imgElements.forEach((img: HTMLImageElement) => {
          // Skip tiny images (likely icons) and tracking pixels
          if (img.naturalWidth < 50 || img.naturalHeight < 50) return;
          // Skip data URIs that are too small (likely placeholders)
          if (img.src.startsWith('data:') && img.src.length < 1000) return;

          imageData.push({
            src: img.src,
            alt: img.alt || '',
            width: img.naturalWidth,
            height: img.naturalHeight,
            // Heuristic: AI-generated images often have specific patterns
            isGenerated: img.src.includes('generated') ||
                         img.src.includes('dalle') ||
                         img.src.includes('midjourney') ||
                         img.alt.toLowerCase().includes('generated'),
          });
        });

        return imageData;
      });

      // Convert to CapturedImage format
      const capturedImages: CapturedImage[] = [];

      for (const img of images) {
        // For data URIs, extract the base64 data directly
        if (img.src.startsWith('data:')) {
          const [header, data] = img.src.split(',');
          const mimeMatch = header.match(/data:([^;]+)/);
          capturedImages.push({
            data: data,
            mimeType: mimeMatch ? mimeMatch[1] : 'image/png',
            altText: img.alt,
            width: img.width,
            height: img.height,
            isGenerated: img.isGenerated,
          });
        } else {
          // For external URLs, just store the URL reference
          // (actual fetching would require additional network requests)
          capturedImages.push({
            data: '', // Would need to fetch and convert to base64
            mimeType: 'image/unknown',
            sourceUrl: img.src,
            altText: img.alt,
            width: img.width,
            height: img.height,
            isGenerated: img.isGenerated,
          });
        }
      }

      return capturedImages;
    } catch (error) {
      // Return empty array if image extraction fails
      return [];
    }
  }

  /**
   * Ensure we have a browser page
   */
  protected async ensurePage(): Promise<void> {
    if (!this.page) {
      this.browser = await this.browserProvider.getBrowser();
      this.context = await this.browser.newContext({
        viewport: this.webConfig.sessionConfig?.viewport ?? { width: 1280, height: 720 },
        userAgent: this.webConfig.sessionConfig?.userAgent,
        proxy: this.webConfig.sessionConfig?.proxy ? {
          server: `${this.webConfig.sessionConfig.proxy.protocol ?? 'http'}://${this.webConfig.sessionConfig.proxy.host}:${this.webConfig.sessionConfig.proxy.port}`,
          username: this.webConfig.sessionConfig.proxy.username,
          password: this.webConfig.sessionConfig.proxy.password,
        } : undefined,
      });

      // Set cookies if provided
      if (this.webConfig.sessionConfig?.cookies) {
        await this.context.addCookies(this.webConfig.sessionConfig.cookies);
      }

      this.page = await this.context.newPage();
    }
  }

  /**
   * Create timing for web requests
   */
  protected createWebTiming(startTime: number): ResponseTiming {
    const totalMs = Date.now() - startTime;
    return {
      totalMs,
      responseMs: totalMs,
    };
  }

  /**
   * Close the adapter
   */
  async close(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = undefined;
    }
    if (this.context) {
      await this.context.close();
      this.context = undefined;
    }
    if (this.browser) {
      await this.browserProvider.releaseBrowser(this.browser);
      this.browser = undefined;
    }
  }
}
