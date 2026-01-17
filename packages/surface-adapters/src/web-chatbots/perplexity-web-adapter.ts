/**
 * Perplexity Web Surface Adapter
 *
 * Adapter for querying Perplexity AI via the web interface.
 * Can work with anonymous sessions but authenticated provides better experience.
 */

import {
  BaseWebAdapter,
  type WebAdapterConfig,
  type WebSurfaceSelectors,
  type BrowserProvider,
  type BrowserPage,
} from '../base/web-adapter.js';
import type { SurfaceMetadata, SourceCitation, SurfaceQueryResponse } from '../types.js';

/**
 * Perplexity Web adapter configuration
 */
export interface PerplexityWebAdapterConfig extends WebAdapterConfig {
  /** Focus mode: web, academic, writing, wolfram, youtube, reddit */
  focusMode?: 'web' | 'academic' | 'writing' | 'wolfram' | 'youtube' | 'reddit';
  /** Whether to use Pro mode (requires subscription) */
  proMode?: boolean;
}

/**
 * Perplexity Web surface metadata
 */
export const PERPLEXITY_WEB_METADATA: SurfaceMetadata = {
  id: 'perplexity-web',
  name: 'Perplexity Web',
  category: 'web_chatbot',
  authRequirement: 'none', // Works without auth but limited
  baseUrl: 'https://www.perplexity.ai',
  capabilities: {
    streaming: true,
    systemPrompts: false,
    conversationHistory: true,
    fileUploads: true,
    modelSelection: true,
    responseFormat: false,
  },
  rateLimit: 30, // Conservative for free tier
  enabled: true,
};

/**
 * Perplexity Web selectors
 */
const PERPLEXITY_SELECTORS: WebSurfaceSelectors = {
  queryInput: 'textarea[placeholder*="Ask"]',
  submitButton: 'button[aria-label="Submit"]',
  responseContainer: '[class*="prose"]',
  loadingIndicator: '[class*="loading"]',
  errorContainer: '[class*="error"]',
  loginRequired: '[class*="login"]',
};

/**
 * Alternative selectors for Perplexity
 */
const PERPLEXITY_ALT_SELECTORS = {
  queryInput: [
    'textarea[placeholder*="Ask"]',
    'textarea[placeholder*="ask"]',
    'textarea[data-testid="query-input"]',
    '#query-input',
  ],
  submitButton: [
    'button[aria-label="Submit"]',
    'button[type="submit"]',
    'button[class*="submit"]',
  ],
  responseContainer: [
    '[class*="prose"]',
    '[class*="answer"]',
    '[class*="response"]',
    '[data-testid="answer-content"]',
  ],
  sourcesContainer: [
    '[class*="sources"]',
    '[class*="citations"]',
    '[data-testid="sources"]',
  ],
};

/**
 * Perplexity Web Surface Adapter
 */
export class PerplexityWebAdapter extends BaseWebAdapter {
  private perplexityConfig: PerplexityWebAdapterConfig;

  constructor(
    config: PerplexityWebAdapterConfig,
    browserProvider: BrowserProvider
  ) {
    super(PERPLEXITY_WEB_METADATA, config, browserProvider);
    this.perplexityConfig = config;
  }

  /**
   * Get selectors for Perplexity
   */
  protected getSelectors(): WebSurfaceSelectors {
    return PERPLEXITY_SELECTORS;
  }

  /**
   * Get query URL - Perplexity supports URL-based queries
   */
  protected getQueryUrl(query: string): string {
    const encodedQuery = encodeURIComponent(query);
    const focus = this.perplexityConfig.focusMode ?? 'web';
    return `${PERPLEXITY_WEB_METADATA.baseUrl}/search?q=${encodedQuery}&focus=${focus}`;
  }

  /**
   * Extract response from Perplexity page
   */
  protected async extractResponse(page: BrowserPage): Promise<string> {
    // Try multiple selectors
    for (const selector of PERPLEXITY_ALT_SELECTORS.responseContainer) {
      try {
        const isVisible = await page.isVisible(selector);
        if (isVisible) {
          const response = await page.textContent(selector);
          if (response && response.trim()) {
            return response.trim();
          }
        }
      } catch {
        continue;
      }
    }

    // Fallback: extract from page evaluation
    const response = await page.evaluate(() => {
      // Find the main answer content
      const answerElements = document.querySelectorAll('[class*="prose"], [class*="answer"]');
      for (const el of answerElements) {
        const text = el.textContent?.trim();
        if (text && text.length > 50) {
          return text;
        }
      }
      return '';
    });

    if (response) {
      return response;
    }

    throw new Error('Could not extract response from Perplexity');
  }

  /**
   * Extract sources from Perplexity response
   */
  protected async extractSources(page: BrowserPage): Promise<SourceCitation[]> {
    const sources: SourceCitation[] = [];

    try {
      const sourceData = await page.evaluate(() => {
        const citations: Array<{ title?: string; url?: string; snippet?: string }> = [];
        const sourceElements = document.querySelectorAll('[class*="source"], [class*="citation"] a');

        sourceElements.forEach((el) => {
          const anchor = el as HTMLAnchorElement;
          citations.push({
            title: anchor.textContent?.trim(),
            url: anchor.href,
            snippet: anchor.closest('[class*="source"]')?.textContent?.trim(),
          });
        });

        return citations;
      });

      sourceData.forEach((data, index) => {
        sources.push({
          title: data.title,
          url: data.url,
          snippet: data.snippet,
          index: index + 1,
        });
      });
    } catch {
      // Sources extraction is optional
    }

    return sources;
  }

  /**
   * Check if login is required
   */
  protected async checkLoginRequired(page: BrowserPage): Promise<boolean> {
    // Perplexity works without login, but check for rate limit wall
    try {
      const url = page.url();
      if (url.includes('login') || url.includes('signin')) {
        return true;
      }

      // Check for rate limit message
      const rateLimitMessage = await page.evaluate(() => {
        const body = document.body.textContent?.toLowerCase() ?? '';
        return body.includes('rate limit') || body.includes('too many requests');
      });

      return rateLimitMessage;
    } catch {
      return false;
    }
  }

  /**
   * Submit query - Perplexity often uses URL-based queries
   */
  protected async submitQuery(query: string): Promise<void> {
    // If we navigated directly to search URL, query is already submitted
    const url = this.page!.url();
    if (url.includes('search?q=')) {
      return;
    }

    // Otherwise, submit via form
    await super.submitQuery(query);
  }

  /**
   * Wait for Perplexity response
   */
  protected async waitForResponse(): Promise<void> {
    // Wait for response container to appear
    let responseVisible = false;
    for (const selector of PERPLEXITY_ALT_SELECTORS.responseContainer) {
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

    // Wait for streaming to complete
    await this.page!.waitForTimeout(2000);

    // Check if content is still loading
    try {
      await this.page!.waitForFunction(
        () => {
          const loading = document.querySelector('[class*="loading"], [class*="streaming"]');
          return !loading;
        },
        { timeout: this.webConfig.pageLoadTimeoutMs }
      );
    } catch {
      // May have completed already
    }

    // Additional stabilization
    await this.page!.waitForTimeout(500);
  }

  /**
   * Override execute query to include sources
   */
  protected async executeQuery(request: import('../types.js').SurfaceQueryRequest): Promise<SurfaceQueryResponse> {
    const response = await super.executeQuery(request);

    // If successful, try to extract sources
    if (response.success && this.page) {
      try {
        const sources = await this.extractSources(this.page);
        if (sources.length > 0 && response.structured) {
          response.structured.sources = sources;
        }
      } catch {
        // Sources are optional
      }
    }

    return response;
  }
}

/**
 * Create a Perplexity Web adapter
 */
export function createPerplexityWebAdapter(
  config: PerplexityWebAdapterConfig,
  browserProvider: BrowserProvider
): PerplexityWebAdapter {
  return new PerplexityWebAdapter(config, browserProvider);
}
