/**
 * ChatGPT Web Surface Adapter
 *
 * Adapter for querying ChatGPT via the web interface.
 * Requires authenticated session cookies.
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
 * ChatGPT Web adapter configuration
 */
export interface ChatGPTWebAdapterConfig extends WebAdapterConfig {
  /** Model to use (if selectable) */
  model?: 'gpt-4' | 'gpt-4o' | 'gpt-3.5';
}

/**
 * ChatGPT Web surface metadata
 */
export const CHATGPT_WEB_METADATA: SurfaceMetadata = {
  id: 'chatgpt-web',
  name: 'ChatGPT Web',
  category: 'web_chatbot',
  authRequirement: 'session',
  baseUrl: 'https://chatgpt.com',
  capabilities: {
    streaming: true,
    systemPrompts: false, // Not directly accessible in web UI
    conversationHistory: true,
    fileUploads: true,
    modelSelection: true,
    responseFormat: false,
    maxInputTokens: 128000,
    maxOutputTokens: 4096,
  },
  rateLimit: 50, // Web interface has stricter limits
  enabled: true,
};

/**
 * ChatGPT Web selectors (may need updates as UI changes)
 */
const CHATGPT_SELECTORS: WebSurfaceSelectors = {
  queryInput: 'textarea[data-id="root"]',
  submitButton: 'button[data-testid="send-button"]',
  responseContainer: '[data-message-author-role="assistant"]',
  loadingIndicator: '[data-testid="stop-button"]',
  errorContainer: '.error-message',
  loginRequired: '[data-testid="login-button"]',
  captchaIndicator: '.cf-turnstile',
};

/**
 * Alternative selectors (ChatGPT UI changes frequently)
 */
const CHATGPT_ALT_SELECTORS = {
  queryInput: [
    'textarea[data-id="root"]',
    '#prompt-textarea',
    'textarea[placeholder*="Send a message"]',
    'textarea[placeholder*="Message"]',
  ],
  submitButton: [
    'button[data-testid="send-button"]',
    'button[aria-label="Send message"]',
    'form button[type="submit"]',
  ],
  responseContainer: [
    '[data-message-author-role="assistant"]',
    '.markdown.prose',
    '[class*="agent-turn"]',
  ],
};

/**
 * ChatGPT Web Surface Adapter
 */
export class ChatGPTWebAdapter extends BaseWebAdapter {
  constructor(
    config: ChatGPTWebAdapterConfig,
    browserProvider: BrowserProvider
  ) {
    super(CHATGPT_WEB_METADATA, config, browserProvider);
    // Note: config.model can be used for model selection in future
  }

  /**
   * Get selectors for ChatGPT
   */
  protected getSelectors(): WebSurfaceSelectors {
    return CHATGPT_SELECTORS;
  }

  /**
   * Get query URL - ChatGPT uses single page, so just the base URL
   */
  protected getQueryUrl(_query: string): string {
    return CHATGPT_WEB_METADATA.baseUrl;
  }

  /**
   * Extract response from ChatGPT page
   */
  protected async extractResponse(page: BrowserPage): Promise<string> {
    // Try multiple selectors
    for (const selector of CHATGPT_ALT_SELECTORS.responseContainer) {
      try {
        const isVisible = await page.isVisible(selector);
        if (isVisible) {
          // Get the last response (most recent)
          const response = await page.evaluate(() => {
            const responses = document.querySelectorAll('[data-message-author-role="assistant"]');
            if (responses.length > 0) {
              const lastResponse = responses[responses.length - 1];
              return lastResponse.textContent?.trim() ?? '';
            }
            // Fallback to markdown prose
            const proseElements = document.querySelectorAll('.markdown.prose');
            if (proseElements.length > 0) {
              const lastProse = proseElements[proseElements.length - 1];
              return lastProse.textContent?.trim() ?? '';
            }
            return '';
          });

          if (response) {
            return response;
          }
        }
      } catch {
        continue;
      }
    }

    throw new Error('Could not extract response from ChatGPT');
  }

  /**
   * Check if login is required
   */
  protected async checkLoginRequired(page: BrowserPage): Promise<boolean> {
    try {
      // Check for login button or login page URL
      const url = page.url();
      if (url.includes('auth') || url.includes('login')) {
        return true;
      }

      const loginButton = await page.isVisible('[data-testid="login-button"]');
      if (loginButton) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Submit query with retry for different selectors
   */
  protected async submitQuery(query: string): Promise<void> {
    // Try to find and fill the input
    let inputFound = false;
    for (const selector of CHATGPT_ALT_SELECTORS.queryInput) {
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
      throw new Error('Could not find ChatGPT input field');
    }

    // Small delay before clicking
    await this.page!.waitForTimeout(100);

    // Try to find and click submit button
    let submitFound = false;
    for (const selector of CHATGPT_ALT_SELECTORS.submitButton) {
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

    // If no button found, try pressing Enter
    if (!submitFound) {
      for (const selector of CHATGPT_ALT_SELECTORS.queryInput) {
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
   * Wait for ChatGPT response with streaming support
   */
  protected async waitForResponse(): Promise<void> {
    // Wait for the response to start appearing
    let responseVisible = false;
    for (const selector of CHATGPT_ALT_SELECTORS.responseContainer) {
      try {
        await this.page!.waitForSelector(selector, {
          timeout: 10000,
          state: 'visible',
        });
        responseVisible = true;
        break;
      } catch {
        continue;
      }
    }

    if (!responseVisible) {
      throw new Error('Response did not appear');
    }

    // Wait for streaming to complete (stop button disappears)
    try {
      await this.page!.waitForFunction(
        () => !document.querySelector('[data-testid="stop-button"]'),
        { timeout: this.webConfig.pageLoadTimeoutMs }
      );
    } catch {
      // Streaming might complete quickly
    }

    // Additional stabilization wait
    await this.page!.waitForTimeout(1000);
  }
}

/**
 * Create a ChatGPT Web adapter
 */
export function createChatGPTWebAdapter(
  config: ChatGPTWebAdapterConfig,
  browserProvider: BrowserProvider
): ChatGPTWebAdapter {
  return new ChatGPTWebAdapter(config, browserProvider);
}
