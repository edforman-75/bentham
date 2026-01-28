/**
 * SerpApi Collector
 *
 * Search engine results via SerpApi - structured JSON output.
 * Better than raw HTML scraping for search engines.
 *
 * Supported engines:
 * - Google (google)
 * - Google AI Overview (google with AI features)
 * - Bing (bing)
 * - Bing Copilot (bing_copilot) - AI-augmented search
 *
 * @see https://serpapi.com/
 */

/**
 * SerpApi engine types
 */
export type SerpApiEngine =
  | 'google'
  | 'bing'
  | 'bing_copilot'
  | 'google_shopping'
  | 'google_local'
  | 'google_news';

/**
 * SerpApi credentials
 */
export interface SerpApiCredentials {
  api_key: string;
}

/**
 * Base request options
 */
export interface SerpApiRequestBase {
  /** Search engine */
  engine: SerpApiEngine;
  /** Search query */
  q: string;
  /** Location (city, state, country) */
  location?: string;
  /** Google domain (google.com, google.co.uk, etc.) */
  google_domain?: string;
  /** Language (en, es, fr, etc.) */
  hl?: string;
  /** Country code (us, uk, in, etc.) */
  gl?: string;
  /** Device type */
  device?: 'desktop' | 'mobile' | 'tablet';
  /** Number of results */
  num?: number;
  /** Start offset for pagination */
  start?: number;
}

/**
 * Google-specific options
 */
export interface GoogleSearchRequest extends SerpApiRequestBase {
  engine: 'google';
  /** Include AI overview if available */
  include_ai_overview?: boolean;
}

/**
 * Bing-specific options
 */
export interface BingSearchRequest extends SerpApiRequestBase {
  engine: 'bing';
}

/**
 * Bing Copilot-specific options
 */
export interface BingCopilotRequest extends SerpApiRequestBase {
  engine: 'bing_copilot';
}

/**
 * Union of all request types
 */
export type SerpApiRequest =
  | GoogleSearchRequest
  | BingSearchRequest
  | BingCopilotRequest
  | SerpApiRequestBase;

/**
 * Organic search result
 */
export interface OrganicResult {
  position: number;
  title: string;
  link: string;
  snippet: string;
  displayed_link?: string;
  favicon?: string;
  source?: string;
}

/**
 * AI Overview result (Google)
 */
export interface AIOverviewResult {
  text: string;
  sources?: Array<{
    title: string;
    link: string;
    snippet?: string;
  }>;
}

/**
 * Bing Copilot text block
 */
export interface CopilotTextBlock {
  type: 'text' | 'list' | 'code';
  content: string;
  items?: string[];
}

/**
 * Bing Copilot citation
 */
export interface CopilotCitation {
  position: number;
  title: string;
  link: string;
  snippet?: string;
  favicon?: string;
}

/**
 * Google search response
 */
export interface GoogleSearchResponse {
  search_metadata: {
    id: string;
    status: string;
    created_at: string;
    processed_at: string;
    total_time_taken: number;
  };
  search_parameters: {
    engine: string;
    q: string;
    location?: string;
    google_domain?: string;
  };
  organic_results?: OrganicResult[];
  ai_overview?: AIOverviewResult;
  featured_snippet?: {
    title: string;
    link: string;
    snippet: string;
  };
  knowledge_graph?: {
    title: string;
    description: string;
    source?: {
      name: string;
      link: string;
    };
  };
  related_questions?: Array<{
    question: string;
    snippet: string;
    link: string;
  }>;
  ads?: Array<{
    position: number;
    title: string;
    link: string;
    tracking_link: string;
  }>;
}

/**
 * Bing search response
 */
export interface BingSearchResponse {
  search_metadata: {
    id: string;
    status: string;
    created_at: string;
  };
  search_parameters: {
    engine: string;
    q: string;
  };
  organic_results?: OrganicResult[];
  knowledge_graph?: {
    title: string;
    description: string;
  };
  related_searches?: Array<{
    query: string;
    link: string;
  }>;
}

/**
 * Bing Copilot response
 */
export interface BingCopilotResponse {
  search_metadata: {
    id: string;
    status: string;
    created_at: string;
  };
  search_parameters: {
    engine: string;
    q: string;
  };
  /** Main header/title of the Copilot response */
  header?: string;
  /** AI-generated text blocks */
  text_blocks?: CopilotTextBlock[];
  /** Structured answer text */
  answer?: string;
  /** Citations/sources used by Copilot */
  citations?: CopilotCitation[];
  /** Follow-up questions suggested by Copilot */
  follow_up_questions?: string[];
  /** Related organic results */
  organic_results?: OrganicResult[];
}

/**
 * Unified result format
 */
export interface SerpApiResult {
  /** Engine used */
  engine: SerpApiEngine;
  /** Original query */
  query: string;
  /** Location used */
  location?: string;
  /** Whether AI features were present */
  has_ai_response: boolean;
  /** AI-generated response text */
  ai_response_text: string;
  /** Citations from AI response */
  citations: Array<{
    position: number;
    title: string;
    url: string;
    domain: string;
    snippet: string | null;
  }>;
  /** Organic search results */
  organic_results: OrganicResult[];
  /** Related questions (PAA) */
  related_questions?: Array<{
    question: string;
    snippet: string;
    link: string;
  }>;
  /** Timestamp */
  timestamp: string;
  /** Whether request succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Raw API response */
  raw_response?: unknown;
}

const SERPAPI_URL = 'https://serpapi.com/search.json';

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
 * Get SerpApi API key from environment or options
 */
function getApiKey(credentials?: Partial<SerpApiCredentials>): string {
  const apiKey = credentials?.api_key || process.env.SERPAPI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'SerpApi API key not provided. Set SERPAPI_API_KEY env var or pass api_key in credentials.'
    );
  }

  return apiKey;
}

/**
 * Make a SerpApi request
 */
export async function serpApiRequest<T = unknown>(
  params: SerpApiRequest,
  credentials?: Partial<SerpApiCredentials>
): Promise<{ success: boolean; data?: T; error?: string }> {
  const apiKey = getApiKey(credentials);

  try {
    const searchParams = new URLSearchParams();
    searchParams.set('api_key', apiKey);
    searchParams.set('engine', params.engine);
    searchParams.set('q', params.q);

    if (params.location) searchParams.set('location', params.location);
    if (params.google_domain) searchParams.set('google_domain', params.google_domain);
    if (params.hl) searchParams.set('hl', params.hl);
    if (params.gl) searchParams.set('gl', params.gl);
    if (params.device) searchParams.set('device', params.device);
    if (params.num) searchParams.set('num', params.num.toString());
    if (params.start) searchParams.set('start', params.start.toString());

    const response = await fetch(`${SERPAPI_URL}?${searchParams.toString()}`);

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `SerpApi error: ${response.status} ${errorText}`,
      };
    }

    const data: T = await response.json();
    return { success: true, data };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Search Google
 */
export async function searchGoogle(
  query: string,
  options: {
    location?: string;
    google_domain?: string;
    language?: string;
    country?: string;
    device?: 'desktop' | 'mobile' | 'tablet';
    num?: number;
    credentials?: Partial<SerpApiCredentials>;
    include_raw?: boolean;
  } = {}
): Promise<SerpApiResult> {
  const timestamp = new Date().toISOString();

  const result = await serpApiRequest<GoogleSearchResponse>({
    engine: 'google',
    q: query,
    location: options.location,
    google_domain: options.google_domain,
    hl: options.language,
    gl: options.country,
    device: options.device,
    num: options.num,
  }, options.credentials);

  if (!result.success || !result.data) {
    return {
      engine: 'google',
      query,
      location: options.location,
      has_ai_response: false,
      ai_response_text: '',
      citations: [],
      organic_results: [],
      timestamp,
      success: false,
      error: result.error,
    };
  }

  const data = result.data;
  const citations: SerpApiResult['citations'] = [];
  let aiResponseText = '';
  let hasAiResponse = false;

  // Extract AI Overview if present
  if (data.ai_overview) {
    hasAiResponse = true;
    aiResponseText = data.ai_overview.text || '';

    if (data.ai_overview.sources) {
      data.ai_overview.sources.forEach((source, index) => {
        citations.push({
          position: index + 1,
          title: source.title,
          url: source.link,
          domain: extractDomain(source.link),
          snippet: source.snippet || null,
        });
      });
    }
  }

  // Extract featured snippet if no AI overview
  if (!hasAiResponse && data.featured_snippet) {
    aiResponseText = data.featured_snippet.snippet || '';
    citations.push({
      position: 1,
      title: data.featured_snippet.title,
      url: data.featured_snippet.link,
      domain: extractDomain(data.featured_snippet.link),
      snippet: data.featured_snippet.snippet,
    });
  }

  return {
    engine: 'google',
    query,
    location: options.location,
    has_ai_response: hasAiResponse,
    ai_response_text: aiResponseText,
    citations,
    organic_results: data.organic_results || [],
    related_questions: data.related_questions,
    timestamp,
    success: true,
    raw_response: options.include_raw ? data : undefined,
  };
}

/**
 * Search Bing (traditional)
 */
export async function searchBing(
  query: string,
  options: {
    location?: string;
    language?: string;
    country?: string;
    credentials?: Partial<SerpApiCredentials>;
    include_raw?: boolean;
  } = {}
): Promise<SerpApiResult> {
  const timestamp = new Date().toISOString();

  const result = await serpApiRequest<BingSearchResponse>({
    engine: 'bing',
    q: query,
    location: options.location,
    hl: options.language,
    gl: options.country,
  }, options.credentials);

  if (!result.success || !result.data) {
    return {
      engine: 'bing',
      query,
      location: options.location,
      has_ai_response: false,
      ai_response_text: '',
      citations: [],
      organic_results: [],
      timestamp,
      success: false,
      error: result.error,
    };
  }

  const data = result.data;

  return {
    engine: 'bing',
    query,
    location: options.location,
    has_ai_response: false,
    ai_response_text: '',
    citations: [],
    organic_results: data.organic_results || [],
    timestamp,
    success: true,
    raw_response: options.include_raw ? data : undefined,
  };
}

/**
 * Search Bing Copilot (AI-augmented)
 */
export async function searchBingCopilot(
  query: string,
  options: {
    location?: string;
    language?: string;
    country?: string;
    credentials?: Partial<SerpApiCredentials>;
    include_raw?: boolean;
  } = {}
): Promise<SerpApiResult> {
  const timestamp = new Date().toISOString();

  const result = await serpApiRequest<BingCopilotResponse>({
    engine: 'bing_copilot',
    q: query,
    location: options.location,
    hl: options.language,
    gl: options.country,
  }, options.credentials);

  if (!result.success || !result.data) {
    return {
      engine: 'bing_copilot',
      query,
      location: options.location,
      has_ai_response: false,
      ai_response_text: '',
      citations: [],
      organic_results: [],
      timestamp,
      success: false,
      error: result.error,
    };
  }

  const data = result.data;
  const citations: SerpApiResult['citations'] = [];

  // Build AI response text from text blocks or answer
  let aiResponseText = data.answer || '';
  if (!aiResponseText && data.text_blocks) {
    aiResponseText = data.text_blocks
      .map(block => {
        if (block.type === 'list' && block.items) {
          return block.items.map(item => `• ${item}`).join('\n');
        }
        return block.content;
      })
      .join('\n\n');
  }

  // Extract citations
  if (data.citations) {
    data.citations.forEach((citation) => {
      citations.push({
        position: citation.position,
        title: citation.title,
        url: citation.link,
        domain: extractDomain(citation.link),
        snippet: citation.snippet || null,
      });
    });
  }

  return {
    engine: 'bing_copilot',
    query,
    location: options.location,
    has_ai_response: aiResponseText.length > 0 || citations.length > 0,
    ai_response_text: aiResponseText,
    citations,
    organic_results: data.organic_results || [],
    timestamp,
    success: true,
    raw_response: options.include_raw ? data : undefined,
  };
}

/**
 * Search across multiple engines
 */
export async function searchMultipleEngines(
  query: string,
  engines: SerpApiEngine[] = ['google', 'bing', 'bing_copilot'],
  options: {
    location?: string;
    credentials?: Partial<SerpApiCredentials>;
    include_raw?: boolean;
  } = {}
): Promise<SerpApiResult[]> {
  const results: SerpApiResult[] = [];

  for (const engine of engines) {
    let result: SerpApiResult;

    switch (engine) {
      case 'google':
        result = await searchGoogle(query, options);
        break;
      case 'bing':
        result = await searchBing(query, options);
        break;
      case 'bing_copilot':
        result = await searchBingCopilot(query, options);
        break;
      default:
        continue;
    }

    results.push(result);

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return results;
}

/**
 * Search across multiple locations
 */
export async function searchAcrossLocations(
  query: string,
  engines: SerpApiEngine[],
  locations: string[],
  options: {
    credentials?: Partial<SerpApiCredentials>;
    include_raw?: boolean;
    onProgress?: (completed: number, total: number) => void;
  } = {}
): Promise<SerpApiResult[]> {
  const results: SerpApiResult[] = [];
  const total = engines.length * locations.length;
  let completed = 0;

  for (const location of locations) {
    const locationResults = await searchMultipleEngines(query, engines, {
      ...options,
      location,
    });

    results.push(...locationResults);
    completed += engines.length;
    options.onProgress?.(completed, total);
  }

  return results;
}

/**
 * Summarize SerpApi results
 */
export function summarizeSerpApiResults(results: SerpApiResult[]): {
  total_queries: number;
  successful: number;
  failed: number;
  engines_with_ai: string[];
  total_citations: number;
  citations_by_domain: Record<string, number>;
  citations_by_engine: Record<string, number>;
} {
  const summary = {
    total_queries: results.length,
    successful: 0,
    failed: 0,
    engines_with_ai: [] as string[],
    total_citations: 0,
    citations_by_domain: {} as Record<string, number>,
    citations_by_engine: {} as Record<string, number>,
  };

  for (const result of results) {
    if (result.success) {
      summary.successful++;
    } else {
      summary.failed++;
    }

    if (result.has_ai_response && !summary.engines_with_ai.includes(result.engine)) {
      summary.engines_with_ai.push(result.engine);
    }

    summary.total_citations += result.citations.length;
    summary.citations_by_engine[result.engine] =
      (summary.citations_by_engine[result.engine] || 0) + result.citations.length;

    for (const citation of result.citations) {
      summary.citations_by_domain[citation.domain] =
        (summary.citations_by_domain[citation.domain] || 0) + 1;
    }
  }

  return summary;
}

/**
 * Filter citations for a brand's domains
 */
export function filterCitationsForBrand(
  results: SerpApiResult[],
  brandDomains: string[]
): SerpApiResult['citations'] {
  const allCitations = results.flatMap(r => r.citations);
  const brandDomainsLower = brandDomains.map(d => d.toLowerCase());

  return allCitations.filter(citation => {
    const citationDomain = citation.domain.toLowerCase();
    return brandDomainsLower.some(bd =>
      citationDomain.includes(bd) || bd.includes(citationDomain)
    );
  });
}
