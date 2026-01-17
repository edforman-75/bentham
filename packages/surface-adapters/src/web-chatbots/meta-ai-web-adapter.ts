/**
 * Meta AI Web Surface Adapter
 *
 * Adapter for querying Meta AI via the web interface.
 * Requires authenticated Meta/Facebook session.
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
 * Meta AI Web adapter configuration
 */
export interface MetaAIWebAdapterConfig extends WebAdapterConfig {
  /** Enable image generation */
  imageGeneration?: boolean;
}

/**
 * Meta AI Web surface metadata
 */
export const META_AI_WEB_METADATA: SurfaceMetadata = {
  id: 'meta-ai-web',
  name: 'Meta AI Web',
  category: 'web_chatbot',
  authRequirement: 'session',
  baseUrl: 'https://www.meta.ai',
  capabilities: {
    streaming: true,
    systemPrompts: false,
    conversationHistory: true,
    fileUploads: true,
    modelSelection: false, // Uses Llama internally
    responseFormat: false,
    maxInputTokens: 4096,
    maxOutputTokens: 4096,
  },
  rateLimit: 30,
  enabled: true,
};

/**
 * Meta AI Web selectors
 */
const META_AI_SELECTORS: WebSurfaceSelectors = {
  queryInput: '[data-testid="mwai-input-field"]',
  submitButton: '[data-testid="mwai-send-button"]',
  responseContainer: '[data-testid="mwai-message"]',
  loadingIndicator: '[data-testid="mwai-typing"]',
  errorContainer: '[data-testid="mwai-error"]',
  loginRequired: '[data-testid="login-button"]',
  captchaIndicator: '[data-testid="captcha"]',
};

/**
 * Alternative selectors for Meta AI
 */
const META_AI_ALT_SELECTORS = {
  queryInput: [
    '[data-testid="mwai-input-field"]',
    'textarea[placeholder*="Ask Meta AI"]',
    '[contenteditable="true"]',
    'textarea',
  ],
  submitButton: [
    '[data-testid="mwai-send-button"]',
    'button[aria-label*="Send"]',
    'button[type="submit"]',
  ],
  responseContainer: [
    '[data-testid="mwai-message"]',
    '[data-testid="message-content"]',
    '.message-bubble',
    '[role="article"]',
  ],
};

/**
 * Meta AI Web Surface Adapter
 */
export class MetaAIWebAdapter extends BaseWebAdapter {
  constructor(
    config: MetaAIWebAdapterConfig,
    browserProvider: BrowserProvider
  ) {
    super(META_AI_WEB_METADATA, config, browserProvider);
  }

  /**
   * Get selectors for Meta AI
   */
  protected getSelectors(): WebSurfaceSelectors {
    return META_AI_SELECTORS;
  }

  /**
   * Get Meta AI URL
   */
  protected getQueryUrl(_query: string): string {
    return META_AI_WEB_METADATA.baseUrl;
  }

  /**
   * Extract response from Meta AI
   */
  protected async extractResponse(page: BrowserPage): Promise<string> {
    const response = await page.evaluate(() => {
      const selectors = [
        '[data-testid="mwai-message"]',
        '[data-testid="message-content"]',
        '.message-bubble',
        '[role="article"]',
      ];

      for (const selector of selectors) {
        const messages = document.querySelectorAll(selector);
        if (messages.length > 0) {
          // Get the last assistant message
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

    throw new Error('Could not extract response from Meta AI');
  }

  /**
   * Check if login is required
   */
  protected async checkLoginRequired(page: BrowserPage): Promise<boolean> {
    const url = page.url();
    if (url.includes('/login') || url.includes('facebook.com/login')) {
      return true;
    }

    try {
      const loginButton = await page.isVisible('[data-testid="login-button"]');
      if (loginButton) {
        return true;
      }
    } catch {
      // Ignore
    }

    return false;
  }

  /**
   * Submit query to Meta AI
   */
  protected async submitQuery(query: string): Promise<void> {
    // Navigate to Meta AI
    await this.page!.goto(META_AI_WEB_METADATA.baseUrl, {
      waitUntil: 'domcontentloaded',
      timeout: this.webConfig.pageLoadTimeoutMs,
    });

    await this.page!.waitForTimeout(2000);

    // Find and fill the input
    let inputFound = false;
    for (const selector of META_AI_ALT_SELECTORS.queryInput) {
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
      throw new Error('Could not find Meta AI input field');
    }

    await this.page!.waitForTimeout(100);

    // Try to click send button
    let submitFound = false;
    for (const selector of META_AI_ALT_SELECTORS.submitButton) {
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
      for (const selector of META_AI_ALT_SELECTORS.queryInput) {
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
   * Wait for Meta AI response
   */
  protected async waitForResponse(): Promise<void> {
    // Wait for response to appear
    let responseVisible = false;
    for (const selector of META_AI_ALT_SELECTORS.responseContainer) {
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
      throw new Error('Meta AI response did not appear');
    }

    // Wait for typing indicator to disappear
    try {
      await this.page!.waitForFunction(
        () => !document.querySelector('[data-testid="mwai-typing"]'),
        { timeout: this.webConfig.pageLoadTimeoutMs }
      );
    } catch {
      // May complete quickly
    }

    await this.page!.waitForTimeout(1500);
  }
}

/**
 * Create a Meta AI Web adapter
 */
export function createMetaAIWebAdapter(
  config: MetaAIWebAdapterConfig,
  browserProvider: BrowserProvider
): MetaAIWebAdapter {
  return new MetaAIWebAdapter(config, browserProvider);
}
