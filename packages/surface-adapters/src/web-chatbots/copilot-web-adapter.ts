/**
 * Microsoft Copilot Web Surface Adapter
 *
 * Adapter for querying Microsoft Copilot via the web interface.
 * Requires authenticated Microsoft account session.
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
 * Microsoft Copilot Web adapter configuration
 */
export interface CopilotWebAdapterConfig extends WebAdapterConfig {
  /** Conversation style: creative, balanced, or precise */
  conversationStyle?: 'creative' | 'balanced' | 'precise';
}

/**
 * Microsoft Copilot Web surface metadata
 */
export const COPILOT_WEB_METADATA: SurfaceMetadata = {
  id: 'copilot-web',
  name: 'Microsoft Copilot Web',
  category: 'web_chatbot',
  authRequirement: 'session',
  baseUrl: 'https://copilot.microsoft.com',
  capabilities: {
    streaming: true,
    systemPrompts: false,
    conversationHistory: true,
    fileUploads: true,
    modelSelection: true, // Creative/Balanced/Precise modes
    responseFormat: false,
    maxInputTokens: 4000,
    maxOutputTokens: 4000,
  },
  rateLimit: 30,
  enabled: true,
};

/**
 * Microsoft Copilot Web selectors
 */
const COPILOT_SELECTORS: WebSurfaceSelectors = {
  queryInput: '#userInput',
  submitButton: '#submitButton',
  responseContainer: '.response-message',
  loadingIndicator: '.typing-indicator',
  errorContainer: '.error-message',
  loginRequired: '#signInLink',
  captchaIndicator: '.captcha-container',
};

/**
 * Alternative selectors for Copilot
 */
const COPILOT_ALT_SELECTORS = {
  queryInput: [
    '#userInput',
    'textarea[placeholder*="Ask"]',
    '[data-testid="chat-input"]',
    'textarea[name="q"]',
    '#searchbox',
  ],
  submitButton: [
    '#submitButton',
    'button[aria-label*="Submit"]',
    '[data-testid="submit-button"]',
    'button[type="submit"]',
  ],
  responseContainer: [
    '.response-message',
    '[data-testid="bot-response"]',
    '.cib-message-content',
    '[role="article"]',
  ],
  conversationStyleButtons: {
    creative: '[data-testid="tone-creative"]',
    balanced: '[data-testid="tone-balanced"]',
    precise: '[data-testid="tone-precise"]',
  },
};

/**
 * Microsoft Copilot Web Surface Adapter
 */
export class CopilotWebAdapter extends BaseWebAdapter {
  private conversationStyle: 'creative' | 'balanced' | 'precise';

  constructor(
    config: CopilotWebAdapterConfig,
    browserProvider: BrowserProvider
  ) {
    super(COPILOT_WEB_METADATA, config, browserProvider);
    this.conversationStyle = config.conversationStyle || 'balanced';
  }

  /**
   * Get selectors for Copilot
   */
  protected getSelectors(): WebSurfaceSelectors {
    return COPILOT_SELECTORS;
  }

  /**
   * Get Copilot URL
   */
  protected getQueryUrl(_query: string): string {
    return COPILOT_WEB_METADATA.baseUrl;
  }

  /**
   * Extract response from Copilot
   */
  protected async extractResponse(page: BrowserPage): Promise<string> {
    const response = await page.evaluate(() => {
      const selectors = [
        '.response-message',
        '[data-testid="bot-response"]',
        '.cib-message-content',
        '[role="article"]',
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

    throw new Error('Could not extract response from Copilot');
  }

  /**
   * Check if login is required
   */
  protected async checkLoginRequired(page: BrowserPage): Promise<boolean> {
    const url = page.url();
    if (url.includes('login.microsoftonline.com') || url.includes('login.live.com')) {
      return true;
    }

    try {
      const signInLink = await page.isVisible('#signInLink, [data-testid="sign-in"]');
      if (signInLink) {
        // Sign-in link being visible doesn't always mean login is required
        // Copilot works without login but with limited features
        return false;
      }
    } catch {
      // Ignore
    }

    return false;
  }

  /**
   * Set conversation style if available
   */
  private async setConversationStyle(): Promise<void> {
    const styleSelector = COPILOT_ALT_SELECTORS.conversationStyleButtons[this.conversationStyle];
    try {
      const isVisible = await this.page!.isVisible(styleSelector);
      if (isVisible) {
        await this.page!.click(styleSelector);
        await this.page!.waitForTimeout(500);
      }
    } catch {
      // Style selector may not be available
    }
  }

  /**
   * Submit query to Copilot
   */
  protected async submitQuery(query: string): Promise<void> {
    // Navigate to Copilot
    await this.page!.goto(COPILOT_WEB_METADATA.baseUrl, {
      waitUntil: 'domcontentloaded',
      timeout: this.webConfig.pageLoadTimeoutMs,
    });

    await this.page!.waitForTimeout(2000);

    // Try to set conversation style
    await this.setConversationStyle();

    // Find and fill the input
    let inputFound = false;
    for (const selector of COPILOT_ALT_SELECTORS.queryInput) {
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
      throw new Error('Could not find Copilot input field');
    }

    await this.page!.waitForTimeout(100);

    // Try to click send button
    let submitFound = false;
    for (const selector of COPILOT_ALT_SELECTORS.submitButton) {
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
      for (const selector of COPILOT_ALT_SELECTORS.queryInput) {
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
   * Wait for Copilot response
   */
  protected async waitForResponse(): Promise<void> {
    // Wait for response to appear
    let responseVisible = false;
    for (const selector of COPILOT_ALT_SELECTORS.responseContainer) {
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
      throw new Error('Copilot response did not appear');
    }

    // Wait for typing indicator to disappear
    try {
      await this.page!.waitForFunction(
        () => !document.querySelector('.typing-indicator, [data-testid="typing"]'),
        { timeout: this.webConfig.pageLoadTimeoutMs }
      );
    } catch {
      // May complete quickly
    }

    await this.page!.waitForTimeout(1500);
  }
}

/**
 * Create a Microsoft Copilot Web adapter
 */
export function createCopilotWebAdapter(
  config: CopilotWebAdapterConfig,
  browserProvider: BrowserProvider
): CopilotWebAdapter {
  return new CopilotWebAdapter(config, browserProvider);
}
