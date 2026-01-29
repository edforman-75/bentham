/**
 * Flipkart AI Surface Adapter
 *
 * Adapter for querying Flipkart's AI shopping assistant (Flippi).
 * Flipkart is India's leading e-commerce platform.
 * The AI assistant helps with product recommendations and shopping queries.
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
 * Flipkart AI adapter configuration
 */
export interface FlipkartAIAdapterConfig extends WebAdapterConfig {
  /** Flipkart region (currently only India) */
  region?: 'in';
}

/**
 * Flipkart AI surface metadata
 */
export const FLIPKART_AI_METADATA: SurfaceMetadata = {
  id: 'flipkart-ai',
  name: 'Flipkart AI (Flippi)',
  category: 'web_chatbot',
  authRequirement: 'session',
  baseUrl: 'https://www.flipkart.com',
  capabilities: {
    streaming: true,
    systemPrompts: false,
    conversationHistory: true,
    fileUploads: false,
    modelSelection: false,
    responseFormat: false,
    maxInputTokens: 2000,
    maxOutputTokens: 4000,
  },
  rateLimit: 20, // Conservative for AI assistant
  enabled: true,
};

/**
 * Flipkart AI selectors
 * Note: Flipkart's AI assistant (Flippi) is typically accessed via mobile app
 * but may have web presence for product search assistance
 */
const FLIPKART_AI_SELECTORS: WebSurfaceSelectors = {
  queryInput: '[data-testid="flippi-input"], .flippi-chat-input, #flippi-input',
  submitButton: '[data-testid="flippi-send"], .flippi-send-btn',
  responseContainer: '[data-testid="flippi-response"], .flippi-message',
  loadingIndicator: '[data-testid="flippi-loading"], .flippi-typing',
  errorContainer: '.flippi-error',
  loginRequired: '._2xg6Ul',
  captchaIndicator: '.captcha-container',
};

/**
 * Alternative selectors for Flipkart AI
 */
const FLIPKART_ALT_SELECTORS = {
  // Search-based AI assistance
  searchBox: [
    'input[name="q"]',
    '._3704LK input',
    '._1Y6hK input',
    'input[placeholder*="Search"]',
  ],
  searchSuggestions: [
    '._2wDnnC',
    '._1mkGI',
    '.search-suggestions',
  ],
  // AI chat interface (if available)
  chatContainer: [
    '[data-testid="flippi-container"]',
    '.flippi-widget',
    '#flippi-chat',
    '[class*="flippi"]',
    '[class*="assistant"]',
  ],
  queryInput: [
    '[data-testid="flippi-input"]',
    '.flippi-chat-input',
    'textarea[placeholder*="Ask"]',
    'input[placeholder*="Ask"]',
  ],
  submitButton: [
    '[data-testid="flippi-send"]',
    '.flippi-send-btn',
    'button[aria-label*="Send"]',
  ],
  responseContainer: [
    '[data-testid="flippi-response"]',
    '.flippi-message.assistant',
    '[data-role="assistant"]',
    '.assistant-message',
  ],
  // Flippi trigger button
  flippiTrigger: [
    '[data-testid="flippi-trigger"]',
    'button[aria-label*="Flippi"]',
    '.flippi-icon',
    '[class*="flippi-trigger"]',
  ],
  // Product recommendations container (AI-powered)
  recommendations: [
    '._1YokD2._1S5QT7',
    '._1YokD2',
    '.recommended-products',
    '[data-testid="recommendations"]',
  ],
};

/**
 * Flipkart AI Surface Adapter
 */
export class FlipkartAIAdapter extends BaseWebAdapter {
  constructor(
    config: FlipkartAIAdapterConfig,
    browserProvider: BrowserProvider
  ) {
    super(FLIPKART_AI_METADATA, config, browserProvider);
  }

  /**
   * Get selectors for Flipkart AI
   */
  protected getSelectors(): WebSurfaceSelectors {
    return FLIPKART_AI_SELECTORS;
  }

  /**
   * Get URL for Flipkart
   */
  protected getQueryUrl(_query: string): string {
    return FLIPKART_AI_METADATA.baseUrl;
  }

  /**
   * Extract response from Flipkart AI chat or recommendations
   */
  protected async extractResponse(page: BrowserPage): Promise<string> {
    // First, try to get Flippi chat response
    const chatResponse = await page.evaluate(() => {
      const selectors = [
        '[data-testid="flippi-response"]',
        '.flippi-message.assistant',
        '[data-role="assistant"]',
        '.assistant-message',
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

    if (chatResponse) {
      return chatResponse;
    }

    // Fallback: Try to get AI-powered recommendations or search results
    const recommendations = await page.evaluate(() => {
      const selectors = [
        '._1YokD2._1S5QT7',
        '._1YokD2',
        '.recommended-products',
        '[data-testid="recommendations"]',
      ];

      for (const selector of selectors) {
        const container = document.querySelector(selector);
        if (container) {
          // Extract product names and brief info
          const products = container.querySelectorAll('._4rR01T, ._1fQZEK, .product-name');
          if (products.length > 0) {
            const productList = Array.from(products)
              .slice(0, 10)
              .map((el) => el.textContent?.trim())
              .filter(Boolean)
              .join(', ');
            return `Recommended products: ${productList}`;
          }
        }
      }
      return '';
    });

    if (recommendations) {
      return recommendations;
    }

    throw new Error('Could not extract response from Flipkart AI');
  }

  /**
   * Check if login is required
   */
  protected async checkLoginRequired(page: BrowserPage): Promise<boolean> {
    const url = page.url();
    if (url.includes('/account/login') || url.includes('/signin')) {
      return true;
    }

    // Check for login modal
    try {
      const loginModal = await page.isVisible('._2xg6Ul');
      if (loginModal) {
        // Try to close it first
        const closeButton = await page.isVisible('._2KpZ6l._2doB4z');
        if (closeButton) {
          await page.click('._2KpZ6l._2doB4z');
          await page.waitForTimeout(500);
          return false;
        }
        return true;
      }
    } catch {
      // Ignore
    }

    // Check for CAPTCHA
    try {
      const captcha = await page.isVisible('.captcha-container');
      if (captcha) {
        return true;
      }
    } catch {
      // Ignore
    }

    return false;
  }

  /**
   * Open Flipkart AI chat interface (Flippi)
   */
  private async openFlippiChat(): Promise<boolean> {
    // Try to find and click Flippi trigger
    for (const selector of FLIPKART_ALT_SELECTORS.flippiTrigger) {
      try {
        const isVisible = await this.page!.isVisible(selector);
        if (isVisible) {
          await this.page!.click(selector);
          await this.page!.waitForTimeout(1000);
          return true;
        }
      } catch {
        continue;
      }
    }

    // Check if Flippi is already open
    for (const selector of FLIPKART_ALT_SELECTORS.chatContainer) {
      try {
        const isVisible = await this.page!.isVisible(selector);
        if (isVisible) {
          return true;
        }
      } catch {
        continue;
      }
    }

    return false;
  }

  /**
   * Submit query to Flipkart AI
   */
  protected async submitQuery(query: string): Promise<void> {
    // Navigate to Flipkart
    await this.page!.goto(FLIPKART_AI_METADATA.baseUrl, {
      waitUntil: 'domcontentloaded',
      timeout: this.webConfig.pageLoadTimeoutMs,
    });

    await this.page!.waitForTimeout(2000);

    // Close login modal if it appears
    try {
      const loginModal = await this.page!.isVisible('._2xg6Ul');
      if (loginModal) {
        const closeButton = await this.page!.isVisible('._2KpZ6l._2doB4z');
        if (closeButton) {
          await this.page!.click('._2KpZ6l._2doB4z');
          await this.page!.waitForTimeout(500);
        }
      }
    } catch {
      // Ignore
    }

    // Try to open Flippi chat first
    const flippiOpened = await this.openFlippiChat();

    if (flippiOpened) {
      // Use Flippi chat interface
      let inputFound = false;
      for (const selector of FLIPKART_ALT_SELECTORS.queryInput) {
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
        throw new Error('Could not find Flippi input field');
      }

      await this.page!.waitForTimeout(100);

      // Try to click send button
      let submitFound = false;
      for (const selector of FLIPKART_ALT_SELECTORS.submitButton) {
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
        for (const selector of FLIPKART_ALT_SELECTORS.queryInput) {
          try {
            await this.page!.press(selector, 'Enter');
            break;
          } catch {
            continue;
          }
        }
      }
    } else {
      // Fallback: Use search bar for AI-powered recommendations
      let searchFound = false;
      for (const selector of FLIPKART_ALT_SELECTORS.searchBox) {
        try {
          const isVisible = await this.page!.isVisible(selector);
          if (isVisible) {
            await this.page!.fill(selector, query);
            searchFound = true;

            // Wait for suggestions
            await this.page!.waitForTimeout(500);

            // Submit search
            await this.page!.press(selector, 'Enter');
            break;
          }
        } catch {
          continue;
        }
      }

      if (!searchFound) {
        throw new Error('Could not find Flipkart search or Flippi interface');
      }
    }
  }

  /**
   * Wait for Flipkart AI response
   */
  protected async waitForResponse(): Promise<void> {
    // If using Flippi, wait for chat response
    let responseVisible = false;
    for (const selector of FLIPKART_ALT_SELECTORS.responseContainer) {
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
      // Fallback: Wait for search results/recommendations
      for (const selector of FLIPKART_ALT_SELECTORS.recommendations) {
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
    }

    if (!responseVisible) {
      // Wait for general page load as final fallback
      await this.page!.waitForTimeout(3000);
    }

    // Wait for typing indicator to disappear
    try {
      await this.page!.waitForFunction(
        () => !document.querySelector('[data-testid="flippi-loading"], .flippi-typing'),
        { timeout: this.webConfig.pageLoadTimeoutMs }
      );
    } catch {
      // May complete quickly
    }

    // Stabilization wait
    await this.page!.waitForTimeout(1500);
  }
}

/**
 * Create a Flipkart AI adapter
 */
export function createFlipkartAIAdapter(
  config: FlipkartAIAdapterConfig,
  browserProvider: BrowserProvider
): FlipkartAIAdapter {
  return new FlipkartAIAdapter(config, browserProvider);
}
