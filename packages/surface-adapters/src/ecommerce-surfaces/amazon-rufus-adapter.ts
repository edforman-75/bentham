/**
 * Amazon Rufus Surface Adapter
 *
 * Adapter for querying Amazon's Rufus AI shopping assistant.
 * Rufus is Amazon's conversational AI for product recommendations and shopping help.
 * Requires authenticated Amazon session.
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
 * Amazon Rufus adapter configuration
 */
export interface AmazonRufusAdapterConfig extends WebAdapterConfig {
  /** Amazon domain to use */
  domain?: 'amazon.com' | 'amazon.co.uk' | 'amazon.de' | 'amazon.in';
}

/**
 * Amazon Rufus surface metadata
 */
export const AMAZON_RUFUS_METADATA: SurfaceMetadata = {
  id: 'amazon-rufus',
  name: 'Amazon Rufus',
  category: 'web_chatbot',
  authRequirement: 'session',
  baseUrl: 'https://www.amazon.com',
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
 * Amazon Rufus selectors
 * Note: Rufus is typically accessed via mobile app, but has web presence
 */
const RUFUS_SELECTORS: WebSurfaceSelectors = {
  queryInput: '[data-testid="rufus-input"], #rufus-chat-input',
  submitButton: '[data-testid="rufus-send"], #rufus-send-button',
  responseContainer: '[data-testid="rufus-response"], .rufus-message',
  loadingIndicator: '[data-testid="rufus-loading"], .rufus-typing',
  errorContainer: '.rufus-error',
  loginRequired: '#nav-link-accountList',
  captchaIndicator: '.a-box-inner img[src*="captcha"]',
};

/**
 * Alternative selectors for Rufus (UI may vary)
 *
 * Rufus appears as a LEFT SIDEBAR panel with:
 * - Header: "Rufus ai" with beta badge
 * - Input field at BOTTOM with placeholder "Ask Rufus a question"
 * - Blue circular send button
 * - Responses with formatted text and action buttons
 *
 * Updated: Jan 2026 based on UI analysis
 */
const RUFUS_ALT_SELECTORS = {
  // Nav bar trigger - "✨ Rufus" link in header
  rufusTrigger: [
    'a[href*="rufus"]',
    '#nav-rufus',
    '[data-csa-c-slot-id*="rufus"]',
    '[data-testid="rufus-trigger"]',
    'button[aria-label*="Rufus"]',
    '.rufus-icon',
  ],

  // Sidebar container
  chatContainer: [
    '[class*="rufus"][class*="panel"]',
    '[class*="rufus"][class*="sidebar"]',
    '[id*="rufus"]',
    '[data-testid*="rufus"]',
    '[data-testid="rufus-chat"]',
    '#rufus-container',
    '.rufus-chat-widget',
  ],

  // Input field at bottom of sidebar
  queryInput: [
    'input[placeholder*="Ask Rufus"]',
    'textarea[placeholder*="Ask Rufus"]',
    '[class*="rufus"] input',
    '[class*="rufus"] textarea',
    '[data-testid="rufus-input"]',
    '#rufus-chat-input',
  ],

  // Send button (blue arrow)
  submitButton: [
    '[class*="rufus"] button[type="submit"]',
    'button[aria-label*="send" i]',
    'button[aria-label*="submit" i]',
    '[class*="rufus"] button:has(svg)',
    '[data-testid="rufus-send"]',
    '#rufus-send-button',
  ],

  // Response container
  responseContainer: [
    '[class*="rufus"][class*="response"]',
    '[class*="rufus"][class*="message"]',
    '[class*="rufus"][class*="answer"]',
    '[class*="rufus"] [class*="content"]',
    '[data-testid="rufus-response"]',
    '.rufus-message.assistant',
    '[data-role="assistant"]',
  ],
};

/**
 * Amazon Rufus Surface Adapter
 */
export class AmazonRufusAdapter extends BaseWebAdapter {
  private domain: string;

  constructor(
    config: AmazonRufusAdapterConfig,
    browserProvider: BrowserProvider
  ) {
    const metadata = {
      ...AMAZON_RUFUS_METADATA,
      baseUrl: `https://www.${config.domain || 'amazon.com'}`,
    };
    super(metadata, config, browserProvider);
    this.domain = config.domain || 'amazon.com';
  }

  /**
   * Get selectors for Rufus
   */
  protected getSelectors(): WebSurfaceSelectors {
    return RUFUS_SELECTORS;
  }

  /**
   * Get URL for Amazon (Rufus is embedded)
   */
  protected getQueryUrl(_query: string): string {
    // Rufus is typically triggered from search or product pages
    return `https://www.${this.domain}`;
  }

  /**
   * Extract response from Rufus chat
   */
  protected async extractResponse(page: BrowserPage): Promise<string> {
    // Try to get the latest Rufus response using evaluate with selectors embedded
    const response = await page.evaluate(() => {
      // Updated selectors based on Jan 2026 UI analysis
      const selectors = [
        '[class*="rufus"][class*="response"]',
        '[class*="rufus"][class*="message"]',
        '[class*="rufus"][class*="answer"]',
        '[class*="rufus"] [class*="content"]',
        '[data-testid="rufus-response"]',
        '.rufus-message.assistant',
        '[data-role="assistant"]',
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

    throw new Error('Could not extract response from Rufus');
  }

  /**
   * Check if login is required
   */
  protected async checkLoginRequired(page: BrowserPage): Promise<boolean> {
    const url = page.url();
    if (url.includes('/ap/signin') || url.includes('/ap/cvf')) {
      return true;
    }

    // Check for CAPTCHA
    try {
      const captcha = await page.isVisible('.a-box-inner img[src*="captcha"]');
      if (captcha) {
        return true;
      }
    } catch {
      // Ignore
    }

    return false;
  }

  /**
   * Open Rufus chat interface
   */
  private async openRufusChat(): Promise<boolean> {
    // Try to find and click Rufus trigger
    for (const selector of RUFUS_ALT_SELECTORS.rufusTrigger) {
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

    // Check if Rufus is already open
    for (const selector of RUFUS_ALT_SELECTORS.chatContainer) {
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
   * Submit query to Rufus
   */
  protected async submitQuery(query: string): Promise<void> {
    // First, navigate to Amazon
    await this.page!.goto(`https://www.${this.domain}`, {
      waitUntil: 'domcontentloaded',
      timeout: this.webConfig.pageLoadTimeoutMs,
    });

    // Try to open Rufus chat
    const rufusOpened = await this.openRufusChat();
    if (!rufusOpened) {
      throw new Error('Rufus chat interface not found - may not be available in this region/account. Rufus appears as a sidebar panel and is triggered via nav link.');
    }

    // Find and fill the input
    let inputFound = false;
    for (const selector of RUFUS_ALT_SELECTORS.queryInput) {
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
      throw new Error('Could not find Rufus input field');
    }

    // Small delay
    await this.page!.waitForTimeout(100);

    // Try to click send button
    let submitFound = false;
    for (const selector of RUFUS_ALT_SELECTORS.submitButton) {
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
      for (const selector of RUFUS_ALT_SELECTORS.queryInput) {
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
   * Wait for Rufus response
   */
  protected async waitForResponse(): Promise<void> {
    // Wait for response to start appearing
    let responseVisible = false;
    for (const selector of RUFUS_ALT_SELECTORS.responseContainer) {
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
      throw new Error('Rufus response did not appear');
    }

    // Wait for typing indicator to disappear (streaming complete)
    try {
      await this.page!.waitForFunction(
        () => !document.querySelector('[data-testid="rufus-loading"], .rufus-typing, [class*="rufus"][class*="loading"], [class*="rufus"][class*="typing"]'),
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
 * Create an Amazon Rufus adapter
 */
export function createAmazonRufusAdapter(
  config: AmazonRufusAdapterConfig,
  browserProvider: BrowserProvider
): AmazonRufusAdapter {
  return new AmazonRufusAdapter(config, browserProvider);
}
