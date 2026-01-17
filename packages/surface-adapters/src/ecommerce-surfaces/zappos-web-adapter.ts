/**
 * Zappos Web Surface Adapter
 *
 * Adapter for querying Zappos product search and information.
 * Zappos is an online shoe and clothing retailer (Amazon subsidiary).
 * Supports authenticated sessions for personalized recommendations.
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
 * Zappos Web adapter configuration
 */
export interface ZapposWebAdapterConfig extends WebAdapterConfig {
  /** Filter by department */
  department?: 'shoes' | 'clothing' | 'bags' | 'accessories';
}

/**
 * Zappos Web surface metadata
 */
export const ZAPPOS_WEB_METADATA: SurfaceMetadata = {
  id: 'zappos-web',
  name: 'Zappos Web',
  category: 'web_chatbot',
  authRequirement: 'none', // Works without login (session improves personalization)
  baseUrl: 'https://www.zappos.com',
  capabilities: {
    streaming: false,
    systemPrompts: false,
    conversationHistory: false,
    fileUploads: false,
    modelSelection: false,
    responseFormat: false,
    maxInputTokens: 500,
    maxOutputTokens: 10000,
  },
  rateLimit: 30,
  enabled: true,
};

/**
 * Zappos Web selectors
 */
const ZAPPOS_SELECTORS: WebSurfaceSelectors = {
  queryInput: '#searchAll',
  submitButton: 'button[type="submit"]',
  responseContainer: '#searchResults',
  loadingIndicator: '.loading-indicator',
  errorContainer: '.no-results',
  loginRequired: '#sign-in-link',
  captchaIndicator: '.captcha-container',
};

/**
 * Alternative selectors for Zappos
 */
const ZAPPOS_ALT_SELECTORS = {
  queryInput: [
    '#searchAll',
    'input[name="term"]',
    'input[placeholder*="Search"]',
    '[data-testid="search-input"]',
  ],
  submitButton: [
    'button[type="submit"]',
    '[data-testid="search-submit"]',
    '.search-button',
  ],
  responseContainer: [
    '#searchResults',
    '[data-testid="search-results"]',
    '.search-results-container',
    'article[data-product-id]',
  ],
  productCard: [
    'article[data-product-id]',
    '[data-testid="product-card"]',
    '.product-card',
  ],
  productTitle: [
    '[data-testid="product-name"]',
    '.product-name',
    'h2.product-title',
  ],
  productBrand: [
    '[data-testid="product-brand"]',
    '.product-brand',
    '.brand-name',
  ],
  productPrice: [
    '[data-testid="product-price"]',
    '.product-price',
    '.price',
  ],
  productRating: [
    '[data-testid="product-rating"]',
    '.product-rating',
    '[aria-label*="stars"]',
  ],
};

/**
 * Zappos product structure
 */
interface ZapposProduct {
  title: string;
  brand?: string;
  price?: string;
  rating?: string;
  url?: string;
}

/**
 * Zappos Web Surface Adapter
 */
export class ZapposWebAdapter extends BaseWebAdapter {
  private department?: string;

  constructor(
    config: ZapposWebAdapterConfig,
    browserProvider: BrowserProvider
  ) {
    super(ZAPPOS_WEB_METADATA, config, browserProvider);
    this.department = config.department;
  }

  /**
   * Get selectors for Zappos
   */
  protected getSelectors(): WebSurfaceSelectors {
    return ZAPPOS_SELECTORS;
  }

  /**
   * Get search URL for Zappos
   */
  protected getQueryUrl(query: string): string {
    const encodedQuery = encodeURIComponent(query);
    let url = `https://www.zappos.com/search?term=${encodedQuery}`;

    // Add department filter if specified
    if (this.department) {
      url += `&oq=${encodedQuery}&department=${this.department}`;
    }

    return url;
  }

  /**
   * Extract response from Zappos search results
   */
  protected async extractResponse(page: BrowserPage): Promise<string> {
    const products = await page.evaluate(() => {
      const results: ZapposProduct[] = [];

      // Find product cards
      const productCards = document.querySelectorAll(
        'article[data-product-id], [data-testid="product-card"], .product-card'
      );

      productCards.forEach((card, index) => {
        if (index >= 10) return; // Limit to top 10

        // Try to extract product info
        const titleEl = card.querySelector(
          '[data-testid="product-name"], .product-name, h2'
        );
        const brandEl = card.querySelector(
          '[data-testid="product-brand"], .product-brand, .brand-name'
        );
        const priceEl = card.querySelector(
          '[data-testid="product-price"], .product-price, .price'
        );
        const ratingEl = card.querySelector(
          '[data-testid="product-rating"], .product-rating, [aria-label*="stars"]'
        );
        const linkEl = card.querySelector('a[href*="/p/"]');

        if (titleEl || brandEl) {
          results.push({
            title: titleEl?.textContent?.trim() || 'Unknown Product',
            brand: brandEl?.textContent?.trim(),
            price: priceEl?.textContent?.trim(),
            rating: ratingEl?.getAttribute('aria-label') || ratingEl?.textContent?.trim(),
            url: linkEl?.getAttribute('href') || undefined,
          });
        }
      });

      return results;
    });

    if (products.length === 0) {
      // Check for no results message
      const noResults = await page.textContent('.no-results, [data-testid="no-results"]');
      if (noResults) {
        return 'No products found for this search query.';
      }
      throw new Error('Could not extract Zappos search results');
    }

    // Format results as readable text
    let response = `Found ${products.length} products:\n\n`;
    products.forEach((product, i) => {
      response += `${i + 1}. `;
      if (product.brand) response += `${product.brand} - `;
      response += `${product.title}\n`;
      if (product.price) response += `   Price: ${product.price}\n`;
      if (product.rating) response += `   Rating: ${product.rating}\n`;
      response += '\n';
    });

    return response;
  }

  /**
   * Check if login is required
   */
  protected async checkLoginRequired(page: BrowserPage): Promise<boolean> {
    const url = page.url();
    if (url.includes('/login') || url.includes('/signin')) {
      return true;
    }

    // Check for CAPTCHA
    try {
      const captcha = await page.isVisible('.captcha-container, [data-testid="captcha"]');
      if (captcha) {
        return true;
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
    // Navigate directly to search URL
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
    // Wait for product cards to appear
    for (const selector of ZAPPOS_ALT_SELECTORS.productCard) {
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
 * Create a Zappos Web adapter
 */
export function createZapposWebAdapter(
  config: ZapposWebAdapterConfig,
  browserProvider: BrowserProvider
): ZapposWebAdapter {
  return new ZapposWebAdapter(config, browserProvider);
}
