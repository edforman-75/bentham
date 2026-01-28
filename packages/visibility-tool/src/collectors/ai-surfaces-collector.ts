/**
 * AI Surfaces Collector
 *
 * Queries AI-powered search surfaces and extracts responses + citations.
 * Uses Oxylabs Web Scraper API for reliable scraping with geo-targeting.
 *
 * Supported surfaces:
 * - Google Search (with and without AI Overviews)
 * - Bing Search (with Copilot responses)
 * - Perplexity.com
 * - ChatGPT.com
 */

import {
  oxylabsRequest,
  type OxylabsCredentials,
  type GoogleDomain,
} from './oxylabs-collector.js';

/**
 * AI Surface types
 */
export type AISurface =
  | 'google'
  | 'google-ai-overview'
  | 'bing'
  | 'bing-copilot'
  | 'perplexity'
  | 'chatgpt';

/**
 * Citation extracted from an AI surface response
 */
export interface AISurfaceCitation {
  /** URL of the cited source */
  url: string;
  /** Title of the source */
  title: string | null;
  /** Domain of the source */
  domain: string;
  /** Snippet/context around the citation */
  snippet: string | null;
  /** Position in the response (1-indexed) */
  position: number;
}

/**
 * Result from querying an AI surface
 */
export interface AISurfaceResult {
  /** The surface that was queried */
  surface: AISurface;
  /** The query that was sent */
  query: string;
  /** Geo-location used */
  geo_location?: string;
  /** The AI-generated response text */
  response_text: string;
  /** Whether AI features were present (AI Overview, Copilot, etc.) */
  has_ai_response: boolean;
  /** Extracted citations */
  citations: AISurfaceCitation[];
  /** Organic search results (for Google/Bing) */
  organic_results?: Array<{
    position: number;
    url: string;
    title: string;
    snippet: string;
  }>;
  /** Timestamp */
  timestamp: string;
  /** Whether the request succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Raw data for debugging */
  raw_data?: unknown;
}

/**
 * Options for AI surface queries
 */
export interface AISurfaceOptions {
  /** Geo-location (ZIP, city, country) */
  geo_location?: string;
  /** Google/Bing domain */
  domain?: GoogleDomain;
  /** Language/locale */
  locale?: string;
  /** Oxylabs credentials */
  credentials?: Partial<OxylabsCredentials>;
  /** Include raw response data */
  include_raw?: boolean;
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Query Google Search and extract AI Overview if present
 */
export async function queryGoogle(
  query: string,
  options: AISurfaceOptions & { include_ai_overview?: boolean } = {}
): Promise<AISurfaceResult> {
  const timestamp = new Date().toISOString();
  const surface: AISurface = options.include_ai_overview !== false ? 'google-ai-overview' : 'google';

  try {
    const result = await oxylabsRequest<GoogleSearchParsed>({
      source: 'google_search',
      query,
      domain: options.domain || 'com',
      geo_location: options.geo_location,
      locale: options.locale,
      parse: true,
    }, options.credentials);

    if (!result.success) {
      return {
        surface,
        query,
        geo_location: options.geo_location,
        response_text: '',
        has_ai_response: false,
        citations: [],
        timestamp,
        success: false,
        error: result.error,
      };
    }

    const data = result.data;
    const citations: AISurfaceCitation[] = [];
    let responseText = '';
    let hasAiResponse = false;

    // Extract AI Overview if present
    if (data?.results?.ai_overview) {
      hasAiResponse = true;
      responseText = data.results.ai_overview.text || '';

      // Extract citations from AI Overview
      if (data.results.ai_overview.sources) {
        data.results.ai_overview.sources.forEach((source, index) => {
          citations.push({
            url: source.url,
            title: source.title || null,
            domain: extractDomain(source.url),
            snippet: source.snippet || null,
            position: index + 1,
          });
        });
      }
    }

    // Extract featured snippet if present
    if (data?.results?.featured_snippet && !hasAiResponse) {
      responseText = data.results.featured_snippet.desc || '';
      if (data.results.featured_snippet.url) {
        citations.push({
          url: data.results.featured_snippet.url,
          title: data.results.featured_snippet.title || null,
          domain: extractDomain(data.results.featured_snippet.url),
          snippet: responseText,
          position: 1,
        });
      }
    }

    // Extract organic results
    const organicResults = data?.results?.organic?.map((r, i) => ({
      position: r.pos || i + 1,
      url: r.url,
      title: r.title,
      snippet: r.desc || '',
    })) || [];

    return {
      surface,
      query,
      geo_location: options.geo_location,
      response_text: responseText,
      has_ai_response: hasAiResponse,
      citations,
      organic_results: organicResults,
      timestamp,
      success: true,
      raw_data: options.include_raw ? data : undefined,
    };

  } catch (error) {
    return {
      surface,
      query,
      geo_location: options.geo_location,
      response_text: '',
      has_ai_response: false,
      citations: [],
      timestamp,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Query Bing Search and extract Copilot response if present
 */
export async function queryBing(
  query: string,
  options: AISurfaceOptions = {}
): Promise<AISurfaceResult> {
  const timestamp = new Date().toISOString();

  try {
    // Use universal source to scrape Bing
    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;

    const result = await oxylabsRequest<string>({
      source: 'universal',
      url: searchUrl,
      geo_location: options.geo_location,
      render: 'html',
    }, options.credentials);

    if (!result.success) {
      return {
        surface: 'bing',
        query,
        geo_location: options.geo_location,
        response_text: '',
        has_ai_response: false,
        citations: [],
        timestamp,
        success: false,
        error: result.error,
      };
    }

    // Parse the HTML response
    const html = result.data;
    const citations: AISurfaceCitation[] = [];
    let responseText = '';
    let hasAiResponse = false;

    // Look for Copilot/AI response in HTML
    // Bing Copilot appears in elements with specific data attributes
    const copilotMatch = html.match(/class="[^"]*b_ai[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (copilotMatch) {
      hasAiResponse = true;
      // Strip HTML tags for text
      responseText = copilotMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Extract citations from Copilot response
    const citationMatches = html.matchAll(/<a[^>]*href="([^"]+)"[^>]*class="[^"]*b_ai[^"]*"[^>]*>([^<]*)</g);
    let position = 1;
    for (const match of citationMatches) {
      const url = match[1];
      const title = match[2];
      if (url && !url.includes('bing.com')) {
        citations.push({
          url,
          title: title || null,
          domain: extractDomain(url),
          snippet: null,
          position: position++,
        });
      }
    }

    // Extract organic results
    const organicResults: Array<{ position: number; url: string; title: string; snippet: string }> = [];
    const resultMatches = html.matchAll(/<li class="b_algo"[^>]*>[\s\S]*?<a href="([^"]+)"[^>]*>([^<]*)<[\s\S]*?<p[^>]*>([^<]*)</g);
    let pos = 1;
    for (const match of resultMatches) {
      organicResults.push({
        position: pos++,
        url: match[1],
        title: match[2],
        snippet: match[3],
      });
    }

    return {
      surface: hasAiResponse ? 'bing-copilot' : 'bing',
      query,
      geo_location: options.geo_location,
      response_text: responseText,
      has_ai_response: hasAiResponse,
      citations,
      organic_results: organicResults,
      timestamp,
      success: true,
      raw_data: options.include_raw ? html : undefined,
    };

  } catch (error) {
    return {
      surface: 'bing',
      query,
      geo_location: options.geo_location,
      response_text: '',
      has_ai_response: false,
      citations: [],
      timestamp,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Query Perplexity.com
 */
export async function queryPerplexitySurface(
  query: string,
  options: AISurfaceOptions = {}
): Promise<AISurfaceResult> {
  const timestamp = new Date().toISOString();

  try {
    // Perplexity search URL
    const searchUrl = `https://www.perplexity.ai/search?q=${encodeURIComponent(query)}`;

    const result = await oxylabsRequest<string>({
      source: 'universal',
      url: searchUrl,
      geo_location: options.geo_location,
      render: 'html',
    }, options.credentials);

    if (!result.success) {
      return {
        surface: 'perplexity',
        query,
        geo_location: options.geo_location,
        response_text: '',
        has_ai_response: false,
        citations: [],
        timestamp,
        success: false,
        error: result.error,
      };
    }

    const html = result.data;
    const citations: AISurfaceCitation[] = [];
    let responseText = '';

    // Perplexity renders its response in specific elements
    // The answer typically appears in a prose container
    const answerMatch = html.match(/class="[^"]*prose[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (answerMatch) {
      responseText = answerMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Extract citations - Perplexity shows numbered citations [1], [2], etc.
    // Citations are typically in a sources section
    const sourceMatches = html.matchAll(/<a[^>]*href="([^"]+)"[^>]*data-testid="source[^"]*"[^>]*>[\s\S]*?<span[^>]*>([^<]*)</g);
    let position = 1;
    for (const match of sourceMatches) {
      const url = match[1];
      const title = match[2];
      if (url && !url.includes('perplexity.ai')) {
        citations.push({
          url,
          title: title || null,
          domain: extractDomain(url),
          snippet: null,
          position: position++,
        });
      }
    }

    // Alternative: look for citation links with numbered references
    const citationLinkMatches = html.matchAll(/\[(\d+)\][^<]*<a[^>]*href="([^"]+)"[^>]*>([^<]*)</g);
    for (const match of citationLinkMatches) {
      const url = match[2];
      const title = match[3];
      if (url && !citations.some(c => c.url === url)) {
        citations.push({
          url,
          title: title || null,
          domain: extractDomain(url),
          snippet: null,
          position: parseInt(match[1], 10),
        });
      }
    }

    return {
      surface: 'perplexity',
      query,
      geo_location: options.geo_location,
      response_text: responseText,
      has_ai_response: responseText.length > 0,
      citations,
      timestamp,
      success: true,
      raw_data: options.include_raw ? html : undefined,
    };

  } catch (error) {
    return {
      surface: 'perplexity',
      query,
      geo_location: options.geo_location,
      response_text: '',
      has_ai_response: false,
      citations: [],
      timestamp,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Query ChatGPT.com (requires authentication context)
 * Note: ChatGPT requires login, so results may be limited without auth
 */
export async function queryChatGPT(
  query: string,
  options: AISurfaceOptions = {}
): Promise<AISurfaceResult> {
  const timestamp = new Date().toISOString();

  try {
    // ChatGPT doesn't have a direct search URL like Perplexity
    // We'll try the main page and note that full functionality requires auth
    const chatUrl = 'https://chatgpt.com/';

    const result = await oxylabsRequest<string>({
      source: 'universal',
      url: chatUrl,
      geo_location: options.geo_location,
      render: 'html',
    }, options.credentials);

    if (!result.success) {
      return {
        surface: 'chatgpt',
        query,
        geo_location: options.geo_location,
        response_text: '',
        has_ai_response: false,
        citations: [],
        timestamp,
        success: false,
        error: result.error || 'ChatGPT requires authentication for queries',
      };
    }

    // Note: Without authentication, we can't actually query ChatGPT
    // This would need Oxylabs Browser Agent with auth or a separate approach
    return {
      surface: 'chatgpt',
      query,
      geo_location: options.geo_location,
      response_text: '',
      has_ai_response: false,
      citations: [],
      timestamp,
      success: true,
      error: 'ChatGPT requires authentication. Use Oxylabs Browser Agent with saved auth session.',
      raw_data: options.include_raw ? result.data : undefined,
    };

  } catch (error) {
    return {
      surface: 'chatgpt',
      query,
      geo_location: options.geo_location,
      response_text: '',
      has_ai_response: false,
      citations: [],
      timestamp,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Query all AI surfaces with a single query
 */
export async function queryAllSurfaces(
  query: string,
  surfaces: AISurface[] = ['google-ai-overview', 'bing', 'perplexity'],
  options: AISurfaceOptions = {}
): Promise<AISurfaceResult[]> {
  const results: AISurfaceResult[] = [];

  for (const surface of surfaces) {
    let result: AISurfaceResult;

    switch (surface) {
      case 'google':
        result = await queryGoogle(query, { ...options, include_ai_overview: false });
        break;
      case 'google-ai-overview':
        result = await queryGoogle(query, { ...options, include_ai_overview: true });
        break;
      case 'bing':
      case 'bing-copilot':
        result = await queryBing(query, options);
        break;
      case 'perplexity':
        result = await queryPerplexitySurface(query, options);
        break;
      case 'chatgpt':
        result = await queryChatGPT(query, options);
        break;
      default:
        continue;
    }

    results.push(result);

    // Rate limiting between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return results;
}

/**
 * Query surfaces across multiple locations
 */
export async function queryAcrossLocations(
  query: string,
  surfaces: AISurface[],
  locations: string[],
  options: Omit<AISurfaceOptions, 'geo_location'> & {
    onProgress?: (completed: number, total: number) => void;
  } = {}
): Promise<AISurfaceResult[]> {
  const results: AISurfaceResult[] = [];
  const total = surfaces.length * locations.length;
  let completed = 0;

  for (const location of locations) {
    for (const surface of surfaces) {
      const surfaceResults = await queryAllSurfaces(query, [surface], {
        ...options,
        geo_location: location,
      });

      results.push(...surfaceResults);
      completed++;
      options.onProgress?.(completed, total);
    }
  }

  return results;
}

/**
 * Summarize results across surfaces
 */
export function summarizeAISurfaceResults(results: AISurfaceResult[]): {
  total_queries: number;
  successful: number;
  failed: number;
  surfaces_with_ai: string[];
  total_citations: number;
  citations_by_domain: Record<string, number>;
  citations_by_surface: Record<string, number>;
  brand_mentions?: Record<string, number>;
} {
  const summary = {
    total_queries: results.length,
    successful: 0,
    failed: 0,
    surfaces_with_ai: [] as string[],
    total_citations: 0,
    citations_by_domain: {} as Record<string, number>,
    citations_by_surface: {} as Record<string, number>,
  };

  for (const result of results) {
    if (result.success) {
      summary.successful++;
    } else {
      summary.failed++;
    }

    if (result.has_ai_response && !summary.surfaces_with_ai.includes(result.surface)) {
      summary.surfaces_with_ai.push(result.surface);
    }

    summary.total_citations += result.citations.length;
    summary.citations_by_surface[result.surface] =
      (summary.citations_by_surface[result.surface] || 0) + result.citations.length;

    for (const citation of result.citations) {
      summary.citations_by_domain[citation.domain] =
        (summary.citations_by_domain[citation.domain] || 0) + 1;
    }
  }

  return summary;
}

/**
 * Filter citations for a specific brand's domains
 */
export function filterCitationsForBrand(
  results: AISurfaceResult[],
  brandDomains: string[]
): AISurfaceCitation[] {
  const allCitations = results.flatMap(r => r.citations);
  const brandDomainsLower = brandDomains.map(d => d.toLowerCase());

  return allCitations.filter(citation => {
    const citationDomain = citation.domain.toLowerCase();
    return brandDomainsLower.some(bd =>
      citationDomain.includes(bd) || bd.includes(citationDomain)
    );
  });
}

// Type definitions for parsed Google response
interface GoogleSearchParsed {
  results?: {
    organic?: Array<{
      pos?: number;
      url: string;
      title: string;
      desc?: string;
    }>;
    featured_snippet?: {
      url: string;
      title: string;
      desc: string;
    };
    ai_overview?: {
      text: string;
      sources?: Array<{
        url: string;
        title?: string;
        snippet?: string;
      }>;
    };
    knowledge_graph?: {
      title: string;
      description: string;
    };
    people_also_ask?: Array<{
      question: string;
      answer: string;
    }>;
  };
}
