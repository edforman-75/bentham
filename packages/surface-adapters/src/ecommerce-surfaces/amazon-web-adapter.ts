/**
 * Amazon Web Surface Adapter
 *
 * Adapter for querying Amazon's product search and information.
 * Requires authenticated session for personalized results.
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
 * Amazon Web adapter configuration
 */
export interface AmazonWebAdapterConfig extends WebAdapterConfig {
  /** Amazon domain to use */
  domain?: 'amazon.com' | 'amazon.co.uk' | 'amazon.de' | 'amazon.fr' | 'amazon.ca';
}

/**
 * Amazon Web surface metadata
 */
export const AMAZON_WEB_METADATA: SurfaceMetadata = {
  id: 'amazon-web',
  name: 'Amazon Web',
  category: 'web_chatbot', // Using existing category, could be 'ecommerce' in future
  authRequirement: 'session',
  baseUrl: 'https://www.amazon.com',
  capabilities: {
    streaming: false,
    systemPrompts: false,
    conversationHistory: false,
    fileUploads: false,
    modelSelection: false,
    responseFormat: false,
    maxInputTokens: 500, // Search query limit
    maxOutputTokens: 10000, // Product listings
  },
  rateLimit: 30, // Conservative to avoid blocks
  enabled: true,
};

/**
 * Amazon Web selectors
 */
const AMAZON_SELECTORS: WebSurfaceSelectors = {
  queryInput: '#twotabsearchtextbox',
  submitButton: '#nav-search-submit-button',
  responseContainer: '.s-main-slot',
  loadingIndicator: '.s-result-list-placeholder',
  errorContainer: '.a-alert-content',
  loginRequired: '#nav-link-accountList',
  captchaIndicator: '.a-box-inner img[src*="captcha"]',
};

/**
 * Alternative selectors for Amazon
 */
const AMAZON_ALT_SELECTORS = {
  queryInput: [
    '#twotabsearchtextbox',
    'input[name="field-keywords"]',
    '#nav-bb-search input',
  ],
  submitButton: [
    '#nav-search-submit-button',
    '.nav-input[type="submit"]',
    'input.nav-input[value="Go"]',
  ],
  responseContainer: [
    '.s-main-slot',
    '#search .s-search-results',
    '[data-component-type="s-search-results"]',
  ],
  productTitle: [
    '.a-size-medium.a-color-base.a-text-normal',
    '.a-size-base-plus.a-color-base.a-text-normal',
    'h2 .a-link-normal',
  ],
  productPrice: [
    '.a-price .a-offscreen',
    '.a-price-whole',
    '.a-color-price',
  ],
  productRating: [
    '.a-icon-star-small .a-icon-alt',
    'span[aria-label*="out of 5 stars"]',
  ],
};

/**
 * Amazon search result structure
 */
interface AmazonProduct {
  title: string;
  price?: string;
  rating?: string;
  url?: string;
  asin?: string;
}

/**
 * Amazon Web Surface Adapter
 */
export class AmazonWebAdapter extends BaseWebAdapter {
  private domain: string;

  constructor(
    config: AmazonWebAdapterConfig,
    browserProvider: BrowserProvider
  ) {
    const metadata = {
      ...AMAZON_WEB_METADATA,
      baseUrl: `https://www.${config.domain || 'amazon.com'}`,
    };
    super(metadata, config, browserProvider);
    this.domain = config.domain || 'amazon.com';
  }

  /**
   * Get selectors for Amazon
   */
  protected getSelectors(): WebSurfaceSelectors {
    return AMAZON_SELECTORS;
  }

  /**
   * Get search URL for Amazon
   */
  protected getQueryUrl(query: string): string {
    const encodedQuery = encodeURIComponent(query);
    return `https://www.${this.domain}/s?k=${encodedQuery}`;
  }

  /**
   * Extract response from Amazon search results
   */
  protected async extractResponse(page: BrowserPage): Promise<string> {
    const products = await page.evaluate(() => {
      const results: AmazonProduct[] = [];
      const productCards = document.querySelectorAll('[data-component-type="s-search-result"]');

      productCards.forEach((card, index) => {
        if (index >= 10) return; // Limit to top 10 results

        const titleEl = card.querySelector('h2 .a-link-normal, .a-size-medium.a-color-base');
        const priceEl = card.querySelector('.a-price .a-offscreen, .a-price-whole');
        const ratingEl = card.querySelector('.a-icon-star-small .a-icon-alt, [aria-label*="out of 5"]');
        const linkEl = card.querySelector('h2 a.a-link-normal');
        const asin = card.getAttribute('data-asin');

        if (titleEl) {
          results.push({
            title: titleEl.textContent?.trim() || '',
            price: priceEl?.textContent?.trim(),
            rating: ratingEl?.getAttribute('aria-label') || ratingEl?.textContent?.trim(),
            url: linkEl?.getAttribute('href') || undefined,
            asin: asin || undefined,
          });
        }
      });

      return results;
    });

    if (products.length === 0) {
      // Try to get any error or no-results message
      const noResults = await page.textContent('.a-section.a-spacing-small.a-spacing-top-small');
      if (noResults?.includes('No results')) {
        return 'No products found for this search query.';
      }
      throw new Error('Could not extract Amazon search results');
    }

    // Format results as readable text
    let response = `Found ${products.length} products:\n\n`;
    products.forEach((product, i) => {
      response += `${i + 1}. ${product.title}\n`;
      if (product.price) response += `   Price: ${product.price}\n`;
      if (product.rating) response += `   Rating: ${product.rating}\n`;
      if (product.asin) response += `   ASIN: ${product.asin}\n`;
      response += '\n';
    });

    return response;
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
        return true; // Treat CAPTCHA as requiring human intervention
      }
    } catch {
      // Ignore
    }

    return false;
  }

  /**
   * Submit search query
   */
  protected async submitQuery(query: string): Promise<void> {
    // Navigate directly to search URL instead of using input
    const searchUrl = this.getQueryUrl(query);
    await this.page!.goto(searchUrl, {
      waitUntil: 'domcontentloaded',
      timeout: this.webConfig.pageLoadTimeoutMs,
    });
  }

  /**
   * Wait for search results
   */
  protected async waitForResponse(): Promise<void> {
    // Wait for search results to load
    for (const selector of AMAZON_ALT_SELECTORS.responseContainer) {
      try {
        await this.page!.waitForSelector(selector, {
          timeout: 10000,
          state: 'visible',
        });
        break;
      } catch {
        continue;
      }
    }

    // Additional stabilization
    await this.page!.waitForTimeout(1000);
  }
}

/**
 * Create an Amazon Web adapter
 */
export function createAmazonWebAdapter(
  config: AmazonWebAdapterConfig,
  browserProvider: BrowserProvider
): AmazonWebAdapter {
  return new AmazonWebAdapter(config, browserProvider);
}
