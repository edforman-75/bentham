/**
 * Walmart AI Surface Adapter
 *
 * Adapter for querying Walmart's AI shopping assistant.
 * Walmart has been rolling out AI-powered search and shopping assistance
 * to compete with Amazon Rufus.
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
 * Walmart AI adapter configuration
 */
export interface WalmartAIAdapterConfig extends WebAdapterConfig {
  /** Walmart domain to use */
  domain?: 'walmart.com' | 'walmart.ca';
}

/**
 * Walmart AI surface metadata
 */
export const WALMART_AI_METADATA: SurfaceMetadata = {
  id: 'walmart-ai',
  name: 'Walmart AI',
  category: 'web_chatbot',
  authRequirement: 'none', // Walmart AI works without login
  baseUrl: 'https://www.walmart.com',
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
  rateLimit: 20,
  enabled: true,
};

/**
 * Walmart AI selectors
 */
const WALMART_AI_SELECTORS: WebSurfaceSelectors = {
  queryInput: '[data-testid="search-input"], #global-search-input, input[name="query"]',
  submitButton: '[data-testid="search-submit"], button[type="submit"]',
  responseContainer: '[data-testid="ai-response"], .ai-assistant-response',
  loadingIndicator: '[data-testid="ai-loading"], .ai-typing-indicator',
  errorContainer: '.ai-error-message',
  loginRequired: '[data-testid="sign-in-btn"]',
  captchaIndicator: '[data-testid="captcha"], .captcha-challenge',
};

/**
 * Alternative selectors for Walmart AI
 */
const WALMART_ALT_SELECTORS = {
  // Search bar
  searchBox: [
    '[data-testid="search-input"]',
    '#global-search-input',
    'input[name="query"]',
    'input[aria-label*="Search"]',
    '.search-input-field input',
  ],
  searchSubmit: [
    '[data-testid="search-submit"]',
    'button[type="submit"]',
    '[aria-label="Search"]',
    '.search-submit-btn',
  ],
  // AI Assistant interface (Walmart's conversational AI)
  aiChatContainer: [
    '[data-testid="ai-assistant"]',
    '.ai-shopping-assistant',
    '[class*="assistant-container"]',
    '[class*="chat-widget"]',
  ],
  aiChatInput: [
    '[data-testid="ai-chat-input"]',
    '.ai-assistant-input',
    'textarea[placeholder*="Ask"]',
    'input[placeholder*="Ask"]',
  ],
  aiChatSubmit: [
    '[data-testid="ai-send"]',
    '.ai-send-btn',
    'button[aria-label*="Send"]',
  ],
  aiResponse: [
    '[data-testid="ai-response"]',
    '.ai-assistant-response',
    '[data-role="assistant"]',
    '.assistant-message',
  ],
  aiTrigger: [
    '[data-testid="ai-assistant-trigger"]',
    'button[aria-label*="Assistant"]',
    '.ai-help-btn',
    '[class*="assistant-trigger"]',
  ],
  // Search results with AI summary
  aiSearchSummary: [
    '[data-testid="ai-search-summary"]',
    '.search-ai-overview',
    '[class*="ai-summary"]',
    '.intelligent-search-result',
  ],
  // Product recommendations
  productResults: [
    '[data-testid="search-results"]',
    '.search-result-listview',
    '[data-item-id]',
    '.product-tile',
  ],
};

/**
 * Walmart AI Surface Adapter
 */
export class WalmartAIAdapter extends BaseWebAdapter {
  private domain: string;

  constructor(
    config: WalmartAIAdapterConfig,
    browserProvider: BrowserProvider
  ) {
    const metadata = {
      ...WALMART_AI_METADATA,
      baseUrl: `https://www.${config.domain || 'walmart.com'}`,
    };
    super(metadata, config, browserProvider);
    this.domain = config.domain || 'walmart.com';
  }

  /**
   * Get selectors for Walmart AI
   */
  protected getSelectors(): WebSurfaceSelectors {
    return WALMART_AI_SELECTORS;
  }

  /**
   * Get URL for Walmart
   */
  protected getQueryUrl(_query: string): string {
    return `https://www.${this.domain}`;
  }

  /**
   * Extract response from Walmart AI
   */
  protected async extractResponse(page: BrowserPage): Promise<string> {
    // First try to get AI assistant response
    const aiResponse = await page.evaluate(() => {
      const selectors = [
        '[data-testid="ai-response"]',
        '.ai-assistant-response',
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

    if (aiResponse) {
      return aiResponse;
    }

    // Try AI search summary
    const searchSummary = await page.evaluate(() => {
      const selectors = [
        '[data-testid="ai-search-summary"]',
        '.search-ai-overview',
        '[class*="ai-summary"]',
        '.intelligent-search-result',
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          const text = element.textContent?.trim();
          if (text) {
            return text;
          }
        }
      }
      return '';
    });

    if (searchSummary) {
      return searchSummary;
    }

    // Fallback: Extract product results as structured response
    const productResults = await page.evaluate(() => {
      const products: string[] = [];
      const selectors = [
        '[data-testid="search-results"] [data-item-id]',
        '.search-result-listview .product-tile',
        '[data-testid="product-tile"]',
      ];

      for (const selector of selectors) {
        const items = document.querySelectorAll(selector);
        if (items.length > 0) {
          items.forEach((item, index) => {
            if (index < 10) {
              // Get product title
              const titleEl = item.querySelector(
                '[data-testid="product-title"], .product-title, h2, h3'
              );
              const title = titleEl?.textContent?.trim();
              if (title) {
                // Get price if available
                const priceEl = item.querySelector(
                  '[data-testid="price"], .price-main, [itemprop="price"]'
                );
                const price = priceEl?.textContent?.trim();

                // Get brand if available
                const brandEl = item.querySelector(
                  '[data-testid="brand"], .product-brand'
                );
                const brand = brandEl?.textContent?.trim();

                let productInfo = title;
                if (brand) productInfo = `${brand}: ${productInfo}`;
                if (price) productInfo += ` - ${price}`;

                products.push(productInfo);
              }
            }
          });
          break;
        }
      }

      if (products.length > 0) {
        return `Top search results:\n${products.map((p, i) => `${i + 1}. ${p}`).join('\n')}`;
      }
      return '';
    });

    if (productResults) {
      return productResults;
    }

    throw new Error('Could not extract response from Walmart AI');
  }

  /**
   * Check if login is required or if blocked
   */
  protected async checkLoginRequired(page: BrowserPage): Promise<boolean> {
    const url = page.url();
    if (url.includes('/account/login') || url.includes('/signin')) {
      return true;
    }

    // Check for CAPTCHA
    try {
      const captcha = await page.isVisible('[data-testid="captcha"], .captcha-challenge');
      if (captcha) {
        return true;
      }
    } catch {
      // Ignore
    }

    // Check for bot detection
    try {
      const botBlock = await page.evaluate(() => {
        const bodyText = document.body.innerText.toLowerCase();
        return bodyText.includes('robot') ||
               bodyText.includes('automated') ||
               bodyText.includes('verify you are human');
      });
      if (botBlock) {
        return true;
      }
    } catch {
      // Ignore
    }

    return false;
  }

  /**
   * Try to open Walmart AI assistant chat
   */
  private async openAIAssistant(): Promise<boolean> {
    // Try to find and click AI assistant trigger
    for (const selector of WALMART_ALT_SELECTORS.aiTrigger) {
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

    // Check if AI chat is already open
    for (const selector of WALMART_ALT_SELECTORS.aiChatContainer) {
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
   * Submit query to Walmart AI
   */
  protected async submitQuery(query: string): Promise<void> {
    // Navigate to Walmart
    await this.page!.goto(`https://www.${this.domain}`, {
      waitUntil: 'domcontentloaded',
      timeout: this.webConfig.pageLoadTimeoutMs,
    });

    await this.page!.waitForTimeout(2000);

    // First try to open AI assistant if available
    const aiOpened = await this.openAIAssistant();

    if (aiOpened) {
      // Use AI chat interface
      let inputFound = false;
      for (const selector of WALMART_ALT_SELECTORS.aiChatInput) {
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

      if (inputFound) {
        await this.page!.waitForTimeout(100);

        // Try to click send button
        let submitFound = false;
        for (const selector of WALMART_ALT_SELECTORS.aiChatSubmit) {
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
          for (const selector of WALMART_ALT_SELECTORS.aiChatInput) {
            try {
              await this.page!.press(selector, 'Enter');
              break;
            } catch {
              continue;
            }
          }
        }
        return;
      }
    }

    // Fallback: Use search bar (may trigger AI-powered results)
    let searchFound = false;
    for (const selector of WALMART_ALT_SELECTORS.searchBox) {
      try {
        const isVisible = await this.page!.isVisible(selector);
        if (isVisible) {
          await this.page!.fill(selector, query);
          searchFound = true;

          await this.page!.waitForTimeout(300);

          // Try to click search submit
          let submitClicked = false;
          for (const submitSelector of WALMART_ALT_SELECTORS.searchSubmit) {
            try {
              const submitVisible = await this.page!.isVisible(submitSelector);
              if (submitVisible) {
                await this.page!.click(submitSelector);
                submitClicked = true;
                break;
              }
            } catch {
              continue;
            }
          }

          if (!submitClicked) {
            // Press Enter to submit
            await this.page!.press(selector, 'Enter');
          }
          break;
        }
      } catch {
        continue;
      }
    }

    if (!searchFound) {
      throw new Error('Could not find Walmart search or AI assistant interface');
    }
  }

  /**
   * Wait for Walmart AI response
   */
  protected async waitForResponse(): Promise<void> {
    // Wait for AI response container
    let responseVisible = false;

    // First check for AI assistant response
    for (const selector of WALMART_ALT_SELECTORS.aiResponse) {
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

    // Check for AI search summary
    if (!responseVisible) {
      for (const selector of WALMART_ALT_SELECTORS.aiSearchSummary) {
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
    }

    // Fallback: Wait for product results
    if (!responseVisible) {
      for (const selector of WALMART_ALT_SELECTORS.productResults) {
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
      // Final fallback: just wait for page to stabilize
      await this.page!.waitForTimeout(5000);
    }

    // Wait for any typing indicator to disappear
    try {
      await this.page!.waitForFunction(
        () => !document.querySelector('[data-testid="ai-loading"], .ai-typing-indicator'),
        { timeout: this.webConfig.pageLoadTimeoutMs }
      );
    } catch {
      // May not have typing indicator
    }

    // Stabilization wait
    await this.page!.waitForTimeout(1500);
  }
}

/**
 * Create a Walmart AI adapter
 */
export function createWalmartAIAdapter(
  config: WalmartAIAdapterConfig,
  browserProvider: BrowserProvider
): WalmartAIAdapter {
  return new WalmartAIAdapter(config, browserProvider);
}
