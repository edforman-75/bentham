/**
 * X Grok Web Surface Adapter
 *
 * Adapter for querying Grok AI via X (Twitter) web interface.
 * Requires authenticated X/Twitter session.
 */

import {
  BaseWebAdapter,
  type WebAdapterConfig,
  type WebSurfaceSelectors,
  type BrowserProvider,
  type BrowserPage,
} from '../base/web-adapter.js';
import type { SurfaceMetadata } from '../types.js';

/**
 * X Grok Web adapter configuration
 */
export interface XGrokWebAdapterConfig extends WebAdapterConfig {
  /** Use Grok 2 if available */
  useGrok2?: boolean;
}

/**
 * X Grok Web surface metadata
 */
export const X_GROK_WEB_METADATA: SurfaceMetadata = {
  id: 'x-grok-web',
  name: 'X Grok Web',
  category: 'web_chatbot',
  authRequirement: 'session',
  baseUrl: 'https://x.com/i/grok',
  capabilities: {
    streaming: true,
    systemPrompts: false,
    conversationHistory: true,
    fileUploads: true,
    modelSelection: true, // Grok 2 vs Grok
    responseFormat: false,
    maxInputTokens: 25000,
    maxOutputTokens: 8000,
  },
  rateLimit: 20,
  enabled: true,
};

/**
 * X Grok Web selectors
 */
const GROK_SELECTORS: WebSurfaceSelectors = {
  queryInput: '[data-testid="grok-composer"] textarea',
  submitButton: '[data-testid="grok-send-button"]',
  responseContainer: '[data-testid="grok-message"]',
  loadingIndicator: '[data-testid="grok-loading"]',
  errorContainer: '[data-testid="grok-error"]',
  loginRequired: '[data-testid="loginButton"]',
  captchaIndicator: '[data-testid="captcha"]',
};

/**
 * Alternative selectors for Grok
 */
const GROK_ALT_SELECTORS = {
  queryInput: [
    '[data-testid="grok-composer"] textarea',
    'textarea[placeholder*="Ask"]',
    '[role="textbox"]',
  ],
  submitButton: [
    '[data-testid="grok-send-button"]',
    'button[aria-label*="Send"]',
    '[data-testid="sendButton"]',
  ],
  responseContainer: [
    '[data-testid="grok-message"]',
    '[data-testid="messageContent"]',
    '.grok-response',
  ],
};

/**
 * X Grok Web Surface Adapter
 */
export class XGrokWebAdapter extends BaseWebAdapter {
  constructor(
    config: XGrokWebAdapterConfig,
    browserProvider: BrowserProvider
  ) {
    super(X_GROK_WEB_METADATA, config, browserProvider);
  }

  /**
   * Get selectors for Grok
   */
  protected getSelectors(): WebSurfaceSelectors {
    return GROK_SELECTORS;
  }

  /**
   * Get Grok URL
   */
  protected getQueryUrl(_query: string): string {
    return X_GROK_WEB_METADATA.baseUrl;
  }

  /**
   * Extract response from Grok
   */
  protected async extractResponse(page: BrowserPage): Promise<string> {
    const response = await page.evaluate(() => {
      const selectors = [
        '[data-testid="grok-message"]',
        '[data-testid="messageContent"]',
        '.grok-response',
      ];

      for (const selector of selectors) {
        const messages = document.querySelectorAll(selector);
        if (messages.length > 0) {
          const lastMessage = messages[messages.length - 1];
          const text = lastMessage.textContent?.trim();
          if (text) {
            return text;
          }
        }
      }
      return '';
    });

    if (response) {
      return response;
    }

    throw new Error('Could not extract response from Grok');
  }

  /**
   * Check if login is required
   */
  protected async checkLoginRequired(page: BrowserPage): Promise<boolean> {
    const url = page.url();
    if (url.includes('/login') || url.includes('/i/flow/login')) {
      return true;
    }

    try {
      const loginButton = await page.isVisible('[data-testid="loginButton"]');
      if (loginButton) {
        return true;
      }
    } catch {
      // Ignore
    }

    return false;
  }

  /**
   * Submit query to Grok
   */
  protected async submitQuery(query: string): Promise<void> {
    // Navigate to Grok
    await this.page!.goto(X_GROK_WEB_METADATA.baseUrl, {
      waitUntil: 'domcontentloaded',
      timeout: this.webConfig.pageLoadTimeoutMs,
    });

    // Wait for page to load
    await this.page!.waitForTimeout(2000);

    // Find and fill the input
    let inputFound = false;
    for (const selector of GROK_ALT_SELECTORS.queryInput) {
      try {
        const isVisible = await this.page!.isVisible(selector);
        if (isVisible) {
          await this.page!.fill(selector, query);
          inputFound = true;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!inputFound) {
      throw new Error('Could not find Grok input field');
    }

    await this.page!.waitForTimeout(100);

    // Try to click send button
    let submitFound = false;
    for (const selector of GROK_ALT_SELECTORS.submitButton) {
      try {
        const isVisible = await this.page!.isVisible(selector);
        if (isVisible) {
          await this.page!.click(selector);
          submitFound = true;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!submitFound) {
      // Try pressing Enter
      for (const selector of GROK_ALT_SELECTORS.queryInput) {
        try {
          await this.page!.press(selector, 'Enter');
          break;
        } catch {
          continue;
        }
      }
    }
  }

  /**
   * Wait for Grok response
   */
  protected async waitForResponse(): Promise<void> {
    // Wait for response to appear
    let responseVisible = false;
    for (const selector of GROK_ALT_SELECTORS.responseContainer) {
      try {
        await this.page!.waitForSelector(selector, {
          timeout: 15000,
          state: 'visible',
        });
        responseVisible = true;
        break;
      } catch {
        continue;
      }
    }

    if (!responseVisible) {
      throw new Error('Grok response did not appear');
    }

    // Wait for streaming to complete
    try {
      await this.page!.waitForFunction(
        () => !document.querySelector('[data-testid="grok-loading"]'),
        { timeout: this.webConfig.pageLoadTimeoutMs }
      );
    } catch {
      // May complete quickly
    }

    await this.page!.waitForTimeout(1500);
  }
}

/**
 * Create an X Grok Web adapter
 */
export function createXGrokWebAdapter(
  config: XGrokWebAdapterConfig,
  browserProvider: BrowserProvider
): XGrokWebAdapter {
  return new XGrokWebAdapter(config, browserProvider);
}
