/**
 * Google Search + AI Overview Surface Adapter
 *
 * Adapter for querying Google Search and capturing AI Overview responses.
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
 * Google Search adapter configuration
 */
export interface GoogleSearchAdapterConfig extends WebAdapterConfig {
  /** Geographic location for search (country code) */
  geoLocation?: string;
  /** Language for search results */
  language?: string;
  /** Whether to capture only AI Overview or full results */
  aiOverviewOnly?: boolean;
  /** Safe search setting */
  safeSearch?: 'off' | 'medium' | 'strict';
}

/**
 * Google Search surface metadata
 */
export const GOOGLE_SEARCH_METADATA: SurfaceMetadata = {
  id: 'google-search',
  name: 'Google Search + AI Overview',
  category: 'search',
  authRequirement: 'none',
  baseUrl: 'https://www.google.com',
  capabilities: {
    streaming: false,
    systemPrompts: false,
    conversationHistory: false,
    fileUploads: false,
    modelSelection: false,
    responseFormat: false,
  },
  rateLimit: 100,
  enabled: true,
};

/**
 * Google Search selectors
 */
const GOOGLE_SELECTORS: WebSurfaceSelectors = {
  queryInput: 'textarea[name="q"], input[name="q"]',
  submitButton: 'input[name="btnK"], button[type="submit"]',
  responseContainer: '#search',
  loadingIndicator: '#searchform',
  errorContainer: '.error',
  captchaIndicator: '#captcha-form, .g-recaptcha',
};

/**
 * Selectors for AI Overview
 */
const AI_OVERVIEW_SELECTORS = {
  container: [
    '[data-attrid="SGEAnswer"]',
    '[class*="aiOverview"]',
    '[data-feature-id*="ai"]',
    '.kno-rdesc',
    '[data-md*="ai"]',
  ],
  content: [
    '[data-attrid="SGEAnswer"] .LGOjhe',
    '[class*="aiOverview"] [class*="content"]',
    '.kno-rdesc span',
  ],
  sources: [
    '[data-attrid="SGEAnswer"] [class*="source"]',
    '[class*="aiOverview"] a[href]',
  ],
};

/**
 * Google Search + AI Overview Surface Adapter
 */
export class GoogleSearchAdapter extends BaseWebAdapter {
  private googleConfig: GoogleSearchAdapterConfig;

  constructor(
    config: GoogleSearchAdapterConfig,
    browserProvider: BrowserProvider
  ) {
    super(GOOGLE_SEARCH_METADATA, config, browserProvider);
    this.googleConfig = config;
  }

  /**
   * Get selectors for Google
   */
  protected getSelectors(): WebSurfaceSelectors {
    return GOOGLE_SELECTORS;
  }

  /**
   * Get Google search URL
   */
  protected getQueryUrl(query: string): string {
    const params = new URLSearchParams({
      q: query,
    });

    // Add geographic location
    if (this.googleConfig.geoLocation) {
      params.set('gl', this.googleConfig.geoLocation);
    }

    // Add language
    if (this.googleConfig.language) {
      params.set('hl', this.googleConfig.language);
    }

    // Add safe search
    if (this.googleConfig.safeSearch) {
      const safeMap = { off: '0', medium: '1', strict: '2' };
      params.set('safe', safeMap[this.googleConfig.safeSearch]);
    }

    return `${GOOGLE_SEARCH_METADATA.baseUrl}/search?${params.toString()}`;
  }

  /**
   * Extract response - prioritize AI Overview
   */
  protected async extractResponse(page: BrowserPage): Promise<string> {
    // First try to get AI Overview
    const aiOverview = await this.extractAIOverview(page);
    if (aiOverview) {
      return aiOverview;
    }

    // If no AI Overview, get featured snippet or first result
    if (!this.googleConfig.aiOverviewOnly) {
      const snippet = await this.extractFeaturedSnippet(page);
      if (snippet) {
        return snippet;
      }
    }

    // Fallback to indicating no AI Overview found
    return '[No AI Overview available for this query]';
  }

  /**
   * Extract AI Overview content
   */
  private async extractAIOverview(page: BrowserPage): Promise<string | null> {
    for (const selector of AI_OVERVIEW_SELECTORS.container) {
      try {
        const isVisible = await page.isVisible(selector);
        if (isVisible) {
          // Try to get content from the container
          for (const contentSelector of AI_OVERVIEW_SELECTORS.content) {
            try {
              const content = await page.textContent(contentSelector);
              if (content && content.trim().length > 20) {
                return content.trim();
              }
            } catch {
              continue;
            }
          }

          // Fallback to getting text from container
          const content = await page.textContent(selector);
          if (content && content.trim().length > 50) {
            return content.trim();
          }
        }
      } catch {
        continue;
      }
    }

    // Try page evaluation
    const aiContent = await page.evaluate(() => {
      // Look for AI Overview elements
      const aiElements = document.querySelectorAll('[data-attrid*="SGE"], [class*="ai-overview"]');
      for (const el of aiElements) {
        const text = el.textContent?.trim();
        if (text && text.length > 50) {
          return text;
        }
      }

      // Look for Knowledge panel with AI-generated content
      const knowledgePanel = document.querySelector('.kno-rdesc');
      if (knowledgePanel) {
        return knowledgePanel.textContent?.trim() ?? null;
      }

      return null;
    });

    return aiContent;
  }

  /**
   * Extract featured snippet as fallback
   */
  private async extractFeaturedSnippet(page: BrowserPage): Promise<string | null> {
    const snippet = await page.evaluate(() => {
      // Featured snippet selectors
      const snippetSelectors = [
        '.hgKElc', // Featured snippet text
        '.IZE3Td', // Alternative featured snippet
        '.LGOjhe', // Another variant
        '[data-attrid="wa:/description"]',
      ];

      for (const selector of snippetSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          const text = el.textContent?.trim();
          if (text && text.length > 20) {
            return text;
          }
        }
      }

      // Get first organic result as last resort
      const firstResult = document.querySelector('.VwiC3b, .IsZvec');
      return firstResult?.textContent?.trim() ?? null;
    });

    return snippet;
  }

  /**
   * Extract sources from AI Overview
   */
  protected async extractSources(page: BrowserPage): Promise<SourceCitation[]> {
    const sources: SourceCitation[] = [];

    try {
      const sourceData = await page.evaluate(() => {
        const citations: Array<{ title?: string; url?: string }> = [];

        // Find AI Overview sources
        const sourceElements = document.querySelectorAll('[data-attrid*="SGE"] a[href], [class*="aiOverview"] a[href]');
        sourceElements.forEach((el) => {
          const anchor = el as HTMLAnchorElement;
          if (anchor.href && !anchor.href.includes('google.com')) {
            citations.push({
              title: anchor.textContent?.trim() || anchor.href,
              url: anchor.href,
            });
          }
        });

        return citations;
      });

      sourceData.forEach((data, index) => {
        sources.push({
          title: data.title,
          url: data.url,
          index: index + 1,
        });
      });
    } catch {
      // Sources extraction is optional
    }

    return sources;
  }

  /**
   * Check if blocked or captcha required
   */
  protected async checkLoginRequired(page: BrowserPage): Promise<boolean> {
    try {
      // Check for captcha
      const hasCaptcha = await page.evaluate(() => {
        const body = document.body.innerHTML.toLowerCase();
        return (
          body.includes('captcha') ||
          body.includes('unusual traffic') ||
          body.includes('not a robot') ||
          !!document.querySelector('.g-recaptcha, #captcha-form')
        );
      });

      return hasCaptcha;
    } catch {
      return false;
    }
  }

  /**
   * Wait for search results
   */
  protected async waitForResponse(): Promise<void> {
    // Wait for search results to load
    await this.page!.waitForSelector('#search', {
      timeout: this.webConfig.pageLoadTimeoutMs,
      state: 'visible',
    });

    // Wait a bit for AI Overview to potentially load
    await this.page!.waitForTimeout(2000);

    // Check if there's a loading indicator for AI Overview
    try {
      await this.page!.waitForFunction(
        () => !document.querySelector('[class*="loading"], [data-loading]'),
        { timeout: 5000 }
      );
    } catch {
      // May not have AI Overview loading
    }
  }

  /**
   * Submit query - Google often uses URL-based queries
   */
  protected async submitQuery(_query: string): Promise<void> {
    // Query is already in URL, no need to submit via form
    // If we're on the homepage, we'd need to submit, but we navigate directly to search
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
        if (sources.length > 0) {
          if (!response.structured) {
            response.structured = { mainResponse: response.responseText ?? '' };
          }
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
 * Create a Google Search adapter
 */
export function createGoogleSearchAdapter(
  config: GoogleSearchAdapterConfig,
  browserProvider: BrowserProvider
): GoogleSearchAdapter {
  return new GoogleSearchAdapter(config, browserProvider);
}
