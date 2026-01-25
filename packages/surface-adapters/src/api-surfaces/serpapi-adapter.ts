/**
 * SerpAPI Surface Adapter
 *
 * Adapter for querying Google Search and AI Overviews via SerpAPI.
 * This is the recommended method for Google surfaces - avoids bot detection,
 * handles CAPTCHAs automatically, and provides structured AI Overview data.
 *
 * Surfaces supported:
 * - google-search: Standard Google search results
 * - google-ai-overview: Google AI Overview (SGE) responses
 */

import {
  BaseSurfaceAdapter,
  type BaseAdapterConfig,
} from '../base/base-adapter.js';
import type {
  SurfaceMetadata,
  SurfaceQueryRequest,
  SurfaceQueryResponse,
  ApiConfig,
  SourceCitation,
} from '../types.js';

/**
 * SerpAPI adapter configuration
 */
export interface SerpApiAdapterConfig extends Partial<BaseAdapterConfig> {
  /** API configuration (must include apiKey) */
  apiConfig: ApiConfig;
  /** Target surface: 'google-search' or 'google-ai-overview' */
  targetSurface?: 'google-search' | 'google-ai-overview';
  /** Location configuration */
  location?: SerpApiLocation;
  /** Whether to capture organic results (default: true for google-search) */
  captureOrganicResults?: boolean;
  /** Maximum organic results to return (default: 10) */
  maxOrganicResults?: number;
}

/**
 * SerpAPI location configuration
 */
export interface SerpApiLocation {
  /** Location name (e.g., 'Mumbai,Maharashtra,India') */
  location: string;
  /** Google domain (e.g., 'google.co.in') */
  googleDomain?: string;
  /** Country code for gl parameter (e.g., 'in') */
  gl?: string;
  /** Language code (default: 'en') */
  hl?: string;
}

/**
 * SerpAPI raw response structure
 */
interface SerpApiRawResponse {
  search_metadata?: {
    id: string;
    status: string;
    json_endpoint: string;
    created_at: string;
    processed_at: string;
    google_url: string;
    raw_html_file: string;
    total_time_taken: number;
  };
  search_parameters?: {
    q: string;
    location: string;
    gl: string;
    hl: string;
  };
  search_information?: {
    total_results: number;
    time_taken_displayed: number;
    query_displayed: string;
  };
  ai_overview?: {
    text?: string;
    text_blocks?: Array<{
      type: string;
      text?: string;
      snippet?: string;
      list?: string[];
    }>;
    references?: Array<{
      title?: string;
      link?: string;
      source?: string;
    }>;
  };
  answer_box?: {
    type?: string;
    title?: string;
    snippet?: string;
    answer?: string;
    contents?: {
      parts?: Array<{ text?: string }>;
    };
    link?: string;
    displayed_link?: string;
  };
  knowledge_graph?: {
    title?: string;
    type?: string;
    description?: string;
    source?: {
      name?: string;
      link?: string;
    };
  };
  organic_results?: Array<{
    position: number;
    title: string;
    link: string;
    displayed_link?: string;
    snippet?: string;
    snippet_highlighted_words?: string[];
    date?: string;
    rich_snippet?: Record<string, unknown>;
    about_this_result?: {
      source?: {
        description?: string;
      };
    };
  }>;
  related_questions?: Array<{
    question: string;
    snippet?: string;
    link?: string;
  }>;
  error?: string;
}

/**
 * Parsed AI Overview result
 */
interface ParsedAiOverview {
  text: string;
  sources: SourceCitation[];
  hasAiOverview: boolean;
}

/**
 * Parsed organic result
 */
interface ParsedOrganicResult {
  position: number;
  title: string;
  url: string;
  displayUrl: string;
  snippet: string;
}

/**
 * Google Search surface metadata
 */
export const GOOGLE_SEARCH_SERPAPI_METADATA: SurfaceMetadata = {
  id: 'google-search',
  name: 'Google Search (SerpAPI)',
  category: 'search',
  authRequirement: 'api_key',
  baseUrl: 'https://serpapi.com',
  capabilities: {
    streaming: false,
    systemPrompts: false,
    conversationHistory: false,
    fileUploads: false,
    modelSelection: false,
    responseFormat: false,
  },
  rateLimit: 100, // SerpAPI rate limit depends on plan
  enabled: true,
};

/**
 * Google AI Overview surface metadata
 */
export const GOOGLE_AI_OVERVIEW_SERPAPI_METADATA: SurfaceMetadata = {
  id: 'google-ai-overview',
  name: 'Google AI Overview (SerpAPI)',
  category: 'search',
  authRequirement: 'api_key',
  baseUrl: 'https://serpapi.com',
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
 * Default locations
 */
export const SERPAPI_LOCATIONS = {
  'in-mum': {
    location: 'Mumbai,Maharashtra,India',
    googleDomain: 'google.co.in',
    gl: 'in',
    hl: 'en',
  },
  'in-blr': {
    location: 'Bangalore,Karnataka,India',
    googleDomain: 'google.co.in',
    gl: 'in',
    hl: 'en',
  },
  'in-del': {
    location: 'Delhi,Delhi,India',
    googleDomain: 'google.co.in',
    gl: 'in',
    hl: 'en',
  },
  'us-national': {
    location: 'United States',
    googleDomain: 'google.com',
    gl: 'us',
    hl: 'en',
  },
  'us-nyc': {
    location: 'New York,New York,United States',
    googleDomain: 'google.com',
    gl: 'us',
    hl: 'en',
  },
  'uk-lon': {
    location: 'London,England,United Kingdom',
    googleDomain: 'google.co.uk',
    gl: 'uk',
    hl: 'en',
  },
} as const;

/**
 * SerpAPI Surface Adapter
 *
 * Provides reliable Google Search and AI Overview extraction without
 * browser automation or bot detection issues.
 */
export class SerpApiAdapter extends BaseSurfaceAdapter {
  private apiConfig: ApiConfig;
  private targetSurface: 'google-search' | 'google-ai-overview';
  private location?: SerpApiLocation;
  private captureOrganicResults: boolean;
  private maxOrganicResults: number;

  constructor(config: SerpApiAdapterConfig) {
    const metadata = config.targetSurface === 'google-ai-overview'
      ? GOOGLE_AI_OVERVIEW_SERPAPI_METADATA
      : GOOGLE_SEARCH_SERPAPI_METADATA;

    super(metadata, config);

    this.apiConfig = config.apiConfig;
    this.targetSurface = config.targetSurface ?? 'google-search';
    this.location = config.location;
    this.captureOrganicResults = config.captureOrganicResults ?? true;
    this.maxOrganicResults = config.maxOrganicResults ?? 10;

    if (!this.apiConfig.apiKey) {
      throw new Error('SerpAPI API key is required');
    }
  }

  /**
   * Execute a query against SerpAPI
   */
  protected async executeQuery(request: SurfaceQueryRequest): Promise<SurfaceQueryResponse> {
    const startTime = Date.now();

    try {
      // Build SerpAPI URL
      const params = new URLSearchParams({
        q: request.query,
        api_key: this.apiConfig.apiKey,
        engine: 'google',
      });

      // Add location parameters
      if (this.location) {
        params.set('location', this.location.location);
        if (this.location.googleDomain) {
          params.set('google_domain', this.location.googleDomain);
        }
        if (this.location.gl) {
          params.set('gl', this.location.gl);
        }
        if (this.location.hl) {
          params.set('hl', this.location.hl);
        }
      }

      // Allow location override in request options
      if (request.options?.location) {
        const loc = request.options.location as SerpApiLocation;
        params.set('location', loc.location);
        if (loc.googleDomain) params.set('google_domain', loc.googleDomain);
        if (loc.gl) params.set('gl', loc.gl);
        if (loc.hl) params.set('hl', loc.hl);
      }

      const url = `https://serpapi.com/search?${params.toString()}`;
      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SerpAPI error ${response.status}: ${errorText}`);
      }

      const data: SerpApiRawResponse = await response.json();

      if (data.error) {
        return {
          success: false,
          timing: this.createTiming(startTime),
          error: {
            code: 'SERPAPI_ERROR',
            message: data.error,
            retryable: true,
          },
        };
      }

      // Build response based on target surface
      const responseText = this.buildResponseText(data);
      const aiOverview = this.parseAiOverview(data);
      const organicResults = this.parseOrganicResults(data);

      // Determine success based on target surface
      const success = this.targetSurface === 'google-ai-overview'
        ? aiOverview.hasAiOverview
        : (aiOverview.hasAiOverview || organicResults.length > 0);

      return {
        success,
        responseText: success ? responseText : undefined,
        structured: {
          mainResponse: responseText,
          aiOverview: aiOverview.hasAiOverview ? aiOverview.text : undefined,
          hasAiOverview: aiOverview.hasAiOverview,
          sources: aiOverview.sources.length > 0 ? aiOverview.sources : undefined,
          organicResults: organicResults.length > 0 ? organicResults : undefined,
          searchMetadata: data.search_metadata,
        },
        timing: this.createTiming(startTime),
        error: success ? undefined : {
          code: 'NO_CONTENT',
          message: this.targetSurface === 'google-ai-overview'
            ? 'No AI Overview available for this query'
            : 'No results found',
          retryable: false,
        },
      };
    } catch (error) {
      throw error; // Let base class handle error classification
    }
  }

  /**
   * Parse AI Overview from SerpAPI response
   */
  private parseAiOverview(data: SerpApiRawResponse): ParsedAiOverview {
    const result: ParsedAiOverview = {
      text: '',
      sources: [],
      hasAiOverview: false,
    };

    // Try ai_overview field first (primary source)
    if (data.ai_overview) {
      if (data.ai_overview.text) {
        result.text = data.ai_overview.text;
        result.hasAiOverview = true;
      } else if (data.ai_overview.text_blocks) {
        const textParts: string[] = [];

        for (const block of data.ai_overview.text_blocks) {
          if (block.text) {
            textParts.push(block.text);
          } else if (block.snippet) {
            textParts.push(block.snippet);
          } else if (block.list && block.list.length > 0) {
            textParts.push(block.list.map((item, i) => `${i + 1}. ${item}`).join('\n'));
          }
        }

        if (textParts.length > 0) {
          result.text = textParts.join('\n\n');
          result.hasAiOverview = true;
        }
      }

      // Extract references/sources
      if (data.ai_overview.references) {
        result.sources = data.ai_overview.references
          .filter(ref => ref.link)
          .map((ref, index) => ({
            title: ref.title || ref.source,
            url: ref.link,
            index: index + 1,
          }));
      }
    }

    // Fallback to answer_box if no AI Overview
    if (!result.hasAiOverview && data.answer_box) {
      const ab = data.answer_box;
      const text = ab.snippet || ab.answer || '';

      if (!text && ab.contents?.parts) {
        const partTexts = ab.contents.parts
          .filter(p => p.text)
          .map(p => p.text!);
        if (partTexts.length > 0) {
          result.text = partTexts.join('\n');
          result.hasAiOverview = true;
        }
      } else if (text && text.length > 20) {
        result.text = text;
        result.hasAiOverview = true;

        if (ab.link) {
          result.sources.push({
            title: ab.title || ab.displayed_link,
            url: ab.link,
            index: 1,
          });
        }
      }
    }

    // Last resort: knowledge graph
    if (!result.hasAiOverview && data.knowledge_graph?.description) {
      result.text = data.knowledge_graph.description;
      result.hasAiOverview = true;

      if (data.knowledge_graph.source?.link) {
        result.sources.push({
          title: data.knowledge_graph.source.name || data.knowledge_graph.title,
          url: data.knowledge_graph.source.link,
          index: 1,
        });
      }
    }

    return result;
  }

  /**
   * Parse organic search results
   */
  private parseOrganicResults(data: SerpApiRawResponse): ParsedOrganicResult[] {
    if (!data.organic_results || !this.captureOrganicResults) {
      return [];
    }

    return data.organic_results
      .slice(0, this.maxOrganicResults)
      .map(result => ({
        position: result.position,
        title: result.title,
        url: result.link,
        displayUrl: result.displayed_link || new URL(result.link).hostname,
        snippet: result.snippet || '',
      }));
  }

  /**
   * Build response text based on target surface
   */
  private buildResponseText(data: SerpApiRawResponse): string {
    const aiOverview = this.parseAiOverview(data);
    const organicResults = this.parseOrganicResults(data);

    const parts: string[] = [];

    // Add AI Overview section
    if (aiOverview.hasAiOverview) {
      parts.push('=== AI Overview ===');
      parts.push(aiOverview.text);

      if (aiOverview.sources.length > 0) {
        parts.push('');
        parts.push('Sources:');
        for (const source of aiOverview.sources) {
          parts.push(`[${source.index}] ${source.title || 'Source'}: ${source.url}`);
        }
      }
    } else if (this.targetSurface === 'google-ai-overview') {
      parts.push('[No AI Overview available for this query]');
    }

    // Add organic results if this is google-search or if configured
    if (this.targetSurface === 'google-search' && organicResults.length > 0) {
      if (parts.length > 0) parts.push('');
      parts.push('=== Organic Search Results ===');

      for (const result of organicResults) {
        parts.push(`${result.position}. ${result.title}`);
        parts.push(`   ${result.displayUrl}`);
        if (result.snippet) {
          parts.push(`   ${result.snippet}`);
        }
        parts.push('');
      }
    }

    return parts.join('\n').trim() || '[No results found]';
  }

  /**
   * Health check
   */
  protected async executeHealthCheck(): Promise<SurfaceQueryResponse> {
    return this.executeQuery({
      query: 'test',
      options: {},
    });
  }

  /**
   * Set location for subsequent queries
   */
  setLocation(location: SerpApiLocation | keyof typeof SERPAPI_LOCATIONS): void {
    if (typeof location === 'string') {
      this.location = SERPAPI_LOCATIONS[location];
    } else {
      this.location = location;
    }
  }

  /**
   * Cleanup
   */
  async close(): Promise<void> {
    // No persistent connections to close
  }
}

/**
 * Create a SerpAPI adapter for Google Search
 */
export function createGoogleSearchSerpApiAdapter(
  apiKey: string,
  location?: SerpApiLocation | keyof typeof SERPAPI_LOCATIONS
): SerpApiAdapter {
  const loc = typeof location === 'string'
    ? SERPAPI_LOCATIONS[location]
    : location;

  return new SerpApiAdapter({
    apiConfig: { apiKey },
    targetSurface: 'google-search',
    location: loc,
    captureOrganicResults: true,
    maxOrganicResults: 10,
  });
}

/**
 * Create a SerpAPI adapter for Google AI Overview
 */
export function createGoogleAiOverviewAdapter(
  apiKey: string,
  location?: SerpApiLocation | keyof typeof SERPAPI_LOCATIONS
): SerpApiAdapter {
  const loc = typeof location === 'string'
    ? SERPAPI_LOCATIONS[location]
    : location;

  return new SerpApiAdapter({
    apiConfig: { apiKey },
    targetSurface: 'google-ai-overview',
    location: loc,
    captureOrganicResults: true, // Include for context
    maxOrganicResults: 5,
  });
}

/**
 * Create a SerpAPI adapter with custom configuration
 */
export function createSerpApiAdapter(config: SerpApiAdapterConfig): SerpApiAdapter {
  return new SerpApiAdapter(config);
}
