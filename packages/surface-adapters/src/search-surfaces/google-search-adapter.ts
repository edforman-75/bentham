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
  /** Whether to capture AI Overview (default: true) */
  captureAiOverview?: boolean;
  /** Whether to capture organic search results (default: true) */
  captureOrganicResults?: boolean;
  /** Maximum organic results to capture */
  maxOrganicResults?: number;
  /** Time to wait for AI Overview to load (ms) */
  aiOverviewWaitMs?: number;
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

// Note: AI Overview selectors are embedded in the extractAIOverviewStructured method
// for better maintainability and to allow dynamic selector construction

/**
 * Structured AI Overview response
 */
interface AIOverviewData {
  content: string;
  sources: SourceCitation[];
  hasAiOverview: boolean;
}

/**
 * Structured organic search result
 */
interface OrganicSearchResult {
  title: string;
  url: string;
  displayUrl: string;
  snippet: string;
  position: number;
}

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
   * Extract response - AI Overview and/or organic results
   */
  protected async extractResponse(page: BrowserPage): Promise<string> {
    const captureAi = this.googleConfig.captureAiOverview !== false;
    const captureOrganic = this.googleConfig.captureOrganicResults !== false;

    let responseText = '';

    // Extract AI Overview if enabled
    if (captureAi) {
      const aiOverview = await this.extractAIOverviewStructured(page);
      if (aiOverview.hasAiOverview) {
        responseText += '=== AI Overview ===\n';
        responseText += aiOverview.content + '\n';
        if (aiOverview.sources.length > 0) {
          responseText += '\nSources:\n';
          aiOverview.sources.forEach((s, i) => {
            responseText += `[${i + 1}] ${s.title}: ${s.url}\n`;
          });
        }
        responseText += '\n';
      } else {
        responseText += '[No AI Overview available for this query]\n\n';
      }
    }

    // Extract organic results if enabled
    if (captureOrganic) {
      const organicResults = await this.extractOrganicResults(page);
      if (organicResults.length > 0) {
        responseText += '=== Organic Search Results ===\n';
        organicResults.forEach((result) => {
          responseText += `${result.position}. ${result.title}\n`;
          responseText += `   ${result.displayUrl}\n`;
          responseText += `   ${result.snippet}\n\n`;
        });
      }
    }

    // If aiOverviewOnly and no AI Overview, try featured snippet
    if (this.googleConfig.aiOverviewOnly && responseText.includes('[No AI Overview')) {
      const snippet = await this.extractFeaturedSnippet(page);
      if (snippet) {
        return snippet;
      }
    }

    return responseText.trim() || '[No results found]';
  }

  /**
   * Extract AI Overview content with structured data
   */
  private async extractAIOverviewStructured(page: BrowserPage): Promise<AIOverviewData> {
    const result: AIOverviewData = {
      content: '',
      sources: [],
      hasAiOverview: false,
    };

    // Try page evaluation for more robust extraction
    const aiData = await page.evaluate(() => {
      const data = {
        content: '',
        sources: [] as Array<{ title: string; url: string }>,
        found: false,
      };

      // AI Overview selectors (in order of preference)
      const containerSelectors = [
        '[data-attrid="SGEAnswer"]',
        '[data-async-type="agi"]',
        '.M8OgIe',
        '[data-hveid][data-ved] [role="article"]',
        'div[jsname][data-nh]',
      ];

      // Try to find AI Overview container
      for (const selector of containerSelectors) {
        const container = document.querySelector(selector);
        if (container) {
          // Get text content, excluding source links text
          const clonedContainer = container.cloneNode(true) as Element;
          // Remove source/citation elements to get clean content
          clonedContainer.querySelectorAll('a[href], cite, [class*="source"]').forEach(el => {
            if (el.parentNode === clonedContainer) {
              // Keep link text, just mark we've found it
            }
          });

          const text = container.textContent?.trim();
          if (text && text.length > 50) {
            data.content = text;
            data.found = true;

            // Extract source links
            const links = container.querySelectorAll('a[href]');
            links.forEach((link) => {
              const anchor = link as HTMLAnchorElement;
              if (anchor.href && !anchor.href.includes('google.com') && !anchor.href.startsWith('#')) {
                data.sources.push({
                  title: anchor.textContent?.trim() || anchor.hostname,
                  url: anchor.href,
                });
              }
            });

            break;
          }
        }
      }

      // Fallback: Look for SGE elements with different attribute patterns
      if (!data.found) {
        const sgeElements = document.querySelectorAll('[data-attrid*="SGE"], [class*="ai-overview"], [data-feature-id*="ai"]');
        for (const el of sgeElements) {
          const text = el.textContent?.trim();
          if (text && text.length > 50) {
            data.content = text;
            data.found = true;
            break;
          }
        }
      }

      // Also check for Knowledge panel as potential AI content
      if (!data.found) {
        const knowledgePanel = document.querySelector('.kno-rdesc');
        if (knowledgePanel) {
          const text = knowledgePanel.textContent?.trim();
          if (text && text.length > 30) {
            data.content = text;
            data.found = true;
          }
        }
      }

      return data;
    });

    if (aiData.found) {
      result.content = aiData.content;
      result.hasAiOverview = true;
      result.sources = aiData.sources.map((s, i) => ({
        title: s.title,
        url: s.url,
        index: i + 1,
      }));
    }

    return result;
  }

  /**
   * Extract organic search results
   */
  private async extractOrganicResults(page: BrowserPage): Promise<OrganicSearchResult[]> {
    const maxResults = this.googleConfig.maxOrganicResults || 10;

    const results = await page.evaluate(() => {
      const items: Array<{
        title: string;
        url: string;
        displayUrl: string;
        snippet: string;
        position: number;
      }> = [];

      // Google organic result selectors
      const resultContainers = document.querySelectorAll('#search .g, #rso .g, [data-sokoban-container] .g');

      resultContainers.forEach((container) => {
        // Skip if this looks like an AI overview or ad
        if (container.closest('[data-attrid="SGEAnswer"]') ||
            container.closest('[data-async-type="agi"]') ||
            container.querySelector('[data-text-ad]')) {
          return;
        }

        const titleEl = container.querySelector('h3');
        const linkEl = container.querySelector('a[href]') as HTMLAnchorElement;
        const snippetEl = container.querySelector('.VwiC3b, .IsZvec, [data-sncf]');
        const displayUrlEl = container.querySelector('cite, .qLRx3b');

        if (titleEl && linkEl && linkEl.href && !linkEl.href.includes('google.com')) {
          items.push({
            title: titleEl.textContent?.trim() || '',
            url: linkEl.href,
            displayUrl: displayUrlEl?.textContent?.trim() || new URL(linkEl.href).hostname,
            snippet: snippetEl?.textContent?.trim() || '',
            position: items.length + 1,
          });
        }
      });

      return items;
    });

    return results.slice(0, maxResults);
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
