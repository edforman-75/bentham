/**
 * Bing Search Surface Adapter
 *
 * Adapter for Microsoft Bing search, capturing both traditional search results
 * and AI-generated overviews (Copilot integration) when present.
 */

import {
  BaseWebAdapter,
  type WebAdapterConfig,
  type BrowserProvider,
  type WebSurfaceSelectors,
  type BrowserPage,
} from '../base/web-adapter.js';
import type { SurfaceMetadata, SurfaceQueryResponse, SurfaceQueryRequest, SourceCitation } from '../types.js';

/**
 * Bing Search adapter configuration
 */
export interface BingSearchAdapterConfig extends Partial<WebAdapterConfig> {
  /** Whether to capture AI overview/Copilot answers (default: true) */
  captureAiOverview?: boolean;
  /** Whether to capture organic search results (default: true) */
  captureOrganicResults?: boolean;
  /** Maximum organic results to capture */
  maxOrganicResults?: number;
  /** Search region/market (e.g., 'en-US') */
  market?: string;
  /** Time to wait for AI Overview to load (ms) */
  aiOverviewWaitMs?: number;
}

/**
 * Bing Search surface metadata
 */
export const BING_SEARCH_METADATA: SurfaceMetadata = {
  id: 'bing-search',
  name: 'Bing Search + AI Overview',
  category: 'search',
  authRequirement: 'none',
  baseUrl: 'https://www.bing.com',
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
 * Bing Search selectors
 */
const BING_SELECTORS: WebSurfaceSelectors = {
  queryInput: '#sb_form_q',
  submitButton: '#sb_form_go',
  responseContainer: '#b_results',
  loadingIndicator: '.b_searchboxForm[aria-busy="true"]',
  captchaIndicator: '.b_captcha, [data-tag="CaptchaContainer"]',
};

// Note: AI Overview selectors are embedded in the extractAIOverviewStructured method
// for better maintainability

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
 * Bing Search Web Adapter
 */
export class BingSearchAdapter extends BaseWebAdapter {
  private searchConfig: BingSearchAdapterConfig;

  constructor(config: BingSearchAdapterConfig, browserProvider: BrowserProvider) {
    super(BING_SEARCH_METADATA, config, browserProvider);
    this.searchConfig = {
      captureAiOverview: true,
      captureOrganicResults: true,
      maxOrganicResults: 10,
      market: 'en-US',
      aiOverviewWaitMs: 3000,
      ...config,
    };
  }

  protected getSelectors(): WebSurfaceSelectors {
    return BING_SELECTORS;
  }

  protected getQueryUrl(query: string): string {
    const encodedQuery = encodeURIComponent(query);
    const market = this.searchConfig.market || 'en-US';
    return `https://www.bing.com/search?q=${encodedQuery}&setmkt=${market}`;
  }

  protected async checkLoginRequired(_page: BrowserPage): Promise<boolean> {
    // Bing search doesn't require login
    return false;
  }

  /**
   * Extract response - AI Overview and/or organic results
   */
  protected async extractResponse(page: BrowserPage): Promise<string> {
    const captureAi = this.searchConfig.captureAiOverview !== false;
    const captureOrganic = this.searchConfig.captureOrganicResults !== false;

    let responseText = '';

    // Extract AI Overview if enabled
    if (captureAi) {
      const aiOverview = await this.extractAIOverviewStructured(page);
      if (aiOverview.hasAiOverview) {
        responseText += '=== AI Overview (Copilot) ===\n';
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

    return responseText.trim() || '[No results found]';
  }

  /**
   * Extract AI Overview / Copilot content with structured data
   */
  private async extractAIOverviewStructured(page: BrowserPage): Promise<AIOverviewData> {
    const result: AIOverviewData = {
      content: '',
      sources: [],
      hasAiOverview: false,
    };

    const aiData = await page.evaluate(() => {
      const data = {
        content: '',
        sources: [] as Array<{ title: string; url: string }>,
        found: false,
      };

      // Bing AI Overview / Copilot selectors (in order of preference)
      const containerSelectors = [
        '#b_sydWidget',               // Sydney/Copilot widget
        '.b_aiOverview',              // AI overview section
        '[data-tag="AIOverview"]',    // AI overview data tag
        '.b_aiGeneratedContent',      // AI generated content
        '#sydcpi',                    // Sydney Copilot integration
        '[data-tag="RelatedQnA"]',    // Related Q&A
        '.b_ans[data-bm*="ai"]',      // AI answer box
      ];

      // Try to find AI Overview container
      for (const selector of containerSelectors) {
        const container = document.querySelector(selector);
        if (container) {
          const text = container.textContent?.trim();
          if (text && text.length > 50) {
            data.content = text;
            data.found = true;

            // Extract source links
            const links = container.querySelectorAll('a[href]');
            links.forEach((link) => {
              const anchor = link as HTMLAnchorElement;
              if (anchor.href &&
                  !anchor.href.includes('bing.com') &&
                  !anchor.href.includes('microsoft.com') &&
                  !anchor.href.startsWith('#')) {
                data.sources.push({
                  title: anchor.textContent?.trim() || new URL(anchor.href).hostname,
                  url: anchor.href,
                });
              }
            });

            break;
          }
        }
      }

      // Fallback: Check for answer boxes that might be AI-generated
      if (!data.found) {
        const answerBoxes = document.querySelectorAll('.b_ans, .b_focusTextLarge, .b_factrow');
        for (const box of answerBoxes) {
          const text = box.textContent?.trim();
          if (text && text.length > 50 && text.length < 2000) {
            // Check if it looks like an AI answer (longer, well-formed text)
            if (text.split(' ').length > 20) {
              data.content = text;
              data.found = true;
              break;
            }
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
    const maxResults = this.searchConfig.maxOrganicResults || 10;

    const results = await page.evaluate(() => {
      const items: Array<{
        title: string;
        url: string;
        displayUrl: string;
        snippet: string;
        position: number;
      }> = [];

      // Bing organic result selectors
      const resultContainers = document.querySelectorAll('#b_results .b_algo');

      resultContainers.forEach((container) => {
        // Skip if this looks like an AI answer or ad
        if (container.closest('#b_sydWidget') ||
            container.closest('.b_aiOverview') ||
            container.closest('.b_ad')) {
          return;
        }

        const titleEl = container.querySelector('h2 a');
        const snippetEl = container.querySelector('.b_caption p, .b_algoSlug');
        const displayUrlEl = container.querySelector('cite, .b_attribution cite');

        if (titleEl) {
          const linkEl = titleEl as HTMLAnchorElement;
          if (linkEl.href && !linkEl.href.includes('bing.com')) {
            items.push({
              title: titleEl.textContent?.trim() || '',
              url: linkEl.href,
              displayUrl: displayUrlEl?.textContent?.trim() || new URL(linkEl.href).hostname,
              snippet: snippetEl?.textContent?.trim() || '',
              position: items.length + 1,
            });
          }
        }
      });

      return items;
    });

    return results.slice(0, maxResults);
  }

  /**
   * Override executeQuery to add structured data
   */
  protected async executeQuery(request: SurfaceQueryRequest): Promise<SurfaceQueryResponse> {
    const response = await super.executeQuery(request);

    if (response.success && this.page) {
      // Add structured search data
      const aiOverview = this.searchConfig.captureAiOverview !== false
        ? await this.extractAIOverviewStructured(this.page)
        : null;
      const organicResults = this.searchConfig.captureOrganicResults !== false
        ? await this.extractOrganicResults(this.page)
        : [];

      response.structured = {
        mainResponse: response.responseText || '',
        sources: organicResults.map((r, i) => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
          index: i + 1,
        })),
      };

      // Add AI overview as additional metadata
      if (aiOverview?.hasAiOverview) {
        (response.structured as any).aiOverview = {
          content: aiOverview.content,
          sources: aiOverview.sources,
        };
      }
    }

    return response;
  }

  /**
   * Skip query submission since we use URL-based queries
   */
  protected async submitQuery(_query: string): Promise<void> {
    // Query is in URL, no need to submit
  }

  /**
   * Wait for search results to load
   */
  protected async waitForResponse(): Promise<void> {
    const selectors = this.getSelectors();

    // Wait for results container
    await this.page!.waitForSelector(selectors.responseContainer, {
      timeout: this.webConfig.pageLoadTimeoutMs,
      state: 'visible',
    });

    // Wait for at least one result
    try {
      await this.page!.waitForSelector('#b_results .b_algo', {
        timeout: 10000,
        state: 'visible',
      });
    } catch {
      // Results might not appear for some queries
    }

    // If waiting for AI overview, give extra time
    if (this.searchConfig.captureAiOverview !== false) {
      const waitTime = this.searchConfig.aiOverviewWaitMs || 3000;
      await this.page!.waitForTimeout(waitTime);
    }
  }
}

/**
 * Create a Bing Search adapter
 */
export function createBingSearchAdapter(
  config: BingSearchAdapterConfig,
  browserProvider: BrowserProvider
): BingSearchAdapter {
  return new BingSearchAdapter(config, browserProvider);
}
