/**
 * Oxylabs Collector
 *
 * Web scraping via Oxylabs API - handles proxies, CAPTCHA, parsing.
 * Supports Amazon, Google, Walmart, and general web scraping with
 * geo-location targeting.
 *
 * @see https://developers.oxylabs.io/scraping-solutions/web-scraper-api
 */

/**
 * Oxylabs data sources
 */
export type OxylabsSource =
  // Amazon sources
  | 'amazon'
  | 'amazon_product'
  | 'amazon_search'
  | 'amazon_pricing'
  | 'amazon_reviews'
  | 'amazon_questions'
  | 'amazon_bestsellers'
  | 'amazon_sellers'
  // Google sources
  | 'google'
  | 'google_search'
  | 'google_shopping'
  | 'google_shopping_product'
  | 'google_shopping_pricing'
  // Walmart sources
  | 'walmart'
  | 'walmart_search'
  | 'walmart_product'
  // Other e-commerce
  | 'universal_ecommerce'
  // General web
  | 'universal';

/**
 * Amazon domain/locale options
 */
export type AmazonDomain =
  | 'com' | 'co.uk' | 'de' | 'fr' | 'es' | 'it'
  | 'ca' | 'in' | 'co.jp' | 'com.au' | 'com.mx' | 'com.br';

/**
 * Google domain options
 */
export type GoogleDomain =
  | 'com' | 'co.uk' | 'de' | 'fr' | 'es' | 'it'
  | 'ca' | 'co.in' | 'co.jp' | 'com.au';

/**
 * Oxylabs API credentials
 */
export interface OxylabsCredentials {
  username: string;
  password: string;
}

/**
 * Base request options
 */
export interface OxylabsRequestBase {
  /** Data source type */
  source: OxylabsSource;
  /** Parse response into structured JSON (recommended) */
  parse?: boolean;
  /** Callback URL for async results */
  callback_url?: string;
  /** Custom user agent */
  user_agent_type?: 'desktop' | 'mobile' | 'tablet';
}

/**
 * Amazon-specific request options
 */
export interface AmazonRequest extends OxylabsRequestBase {
  source: 'amazon' | 'amazon_product' | 'amazon_search' | 'amazon_pricing' |
          'amazon_reviews' | 'amazon_questions' | 'amazon_bestsellers' | 'amazon_sellers';
  /** ASIN for product requests, search term for search requests */
  query: string;
  /** Amazon domain (e.g., 'com', 'in', 'co.uk') */
  domain?: AmazonDomain;
  /** Geo-location: ZIP code, city, or country */
  geo_location?: string;
  /** Start page for pagination */
  start_page?: number;
  /** Number of pages to retrieve */
  pages?: number;
}

/**
 * Google-specific request options
 */
export interface GoogleRequest extends OxylabsRequestBase {
  source: 'google' | 'google_search' | 'google_shopping' |
          'google_shopping_product' | 'google_shopping_pricing';
  /** Search query */
  query: string;
  /** Google domain */
  domain?: GoogleDomain;
  /** Geo-location: city, state, country or coordinates */
  geo_location?: string;
  /** Language code (e.g., 'en', 'hi') */
  locale?: string;
  /** Start page */
  start_page?: number;
  /** Number of pages */
  pages?: number;
}

/**
 * Walmart-specific request options
 */
export interface WalmartRequest extends OxylabsRequestBase {
  source: 'walmart' | 'walmart_search' | 'walmart_product';
  /** Product ID or search query */
  query: string;
  /** Geo-location (ZIP code recommended for Walmart) */
  geo_location?: string;
  /** Start page */
  start_page?: number;
  /** Number of pages */
  pages?: number;
}

/**
 * Universal/general web scraping request
 */
export interface UniversalRequest extends OxylabsRequestBase {
  source: 'universal' | 'universal_ecommerce';
  /** URL to scrape */
  url: string;
  /** Geo-location */
  geo_location?: string;
  /** Render JavaScript */
  render?: 'html' | 'png';
}

/**
 * Union of all request types
 */
export type OxylabsRequest =
  | AmazonRequest
  | GoogleRequest
  | WalmartRequest
  | UniversalRequest;

/**
 * Oxylabs API response structure
 */
export interface OxylabsResponse<T = unknown> {
  results: Array<{
    content: T;
    created_at: string;
    updated_at: string;
    page: number;
    url: string;
    job_id: string;
    status_code: number;
  }>;
}

/**
 * Parsed Amazon product data
 */
export interface AmazonProductData {
  title: string;
  asin: string;
  price: number;
  currency: string;
  price_string: string;
  rating: number;
  reviews_count: number;
  url: string;
  images: string[];
  description: string;
  features: string[];
  categories: string[];
  brand: string;
  availability: string;
  seller: {
    name: string;
    url: string;
  };
  variations?: Array<{
    asin: string;
    title: string;
    price: number;
  }>;
}

/**
 * Parsed Amazon search data
 */
export interface AmazonSearchData {
  results: {
    organic: Array<{
      asin: string;
      title: string;
      price: number;
      currency: string;
      url: string;
      rating: number;
      reviews_count: number;
      image: string;
      is_sponsored: boolean;
      is_amazons_choice: boolean;
      is_best_seller: boolean;
    }>;
    paid: Array<{
      asin: string;
      title: string;
      price: number;
      url: string;
    }>;
  };
  total_results: number;
  page: number;
}

/**
 * Parsed Google search data
 */
export interface GoogleSearchData {
  results: {
    organic: Array<{
      pos: number;
      url: string;
      title: string;
      desc: string;
    }>;
    paid: Array<{
      pos: number;
      url: string;
      title: string;
      desc: string;
    }>;
    featured_snippet?: {
      url: string;
      title: string;
      desc: string;
    };
    knowledge_graph?: {
      title: string;
      description: string;
      url: string;
    };
    local_pack?: Array<{
      title: string;
      address: string;
      rating: number;
    }>;
    people_also_ask?: Array<{
      question: string;
      answer: string;
    }>;
  };
  total_results: number;
}

/**
 * Parsed Walmart product data
 */
export interface WalmartProductData {
  title: string;
  product_id: string;
  price: number;
  currency: string;
  rating: number;
  reviews_count: number;
  url: string;
  images: string[];
  description: string;
  brand: string;
  availability: string;
  seller: string;
  category: string[];
}

/**
 * Collector result wrapper
 */
export interface OxylabsResult<T = unknown> {
  /** The request that was made */
  request: OxylabsRequest;
  /** Geo-location used (if any) */
  geo_location?: string;
  /** Parsed data (if parse: true) */
  data: T;
  /** Raw HTML (if parse: false) */
  html?: string;
  /** Job ID for reference */
  job_id: string;
  /** Timestamp */
  timestamp: string;
  /** Whether request succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Status code from target site */
  status_code: number;
}

/**
 * Batch request options
 */
export interface BatchOptions {
  /** Parallel request limit */
  concurrency?: number;
  /** Delay between requests (ms) */
  delay?: number;
  /** Progress callback */
  onProgress?: (completed: number, total: number, result: OxylabsResult) => void;
}

const OXYLABS_API_URL = 'https://realtime.oxylabs.io/v1/queries';

/**
 * Get Oxylabs credentials from environment or options
 */
function getCredentials(options?: Partial<OxylabsCredentials>): OxylabsCredentials {
  const username = options?.username || process.env.OXYLABS_USERNAME;
  const password = options?.password || process.env.OXYLABS_PASSWORD;

  if (!username || !password) {
    throw new Error(
      'Oxylabs credentials not provided. Set OXYLABS_USERNAME and OXYLABS_PASSWORD env vars ' +
      'or pass credentials in options.'
    );
  }

  return { username, password };
}

/**
 * Make a single Oxylabs API request
 */
export async function oxylabsRequest<T = unknown>(
  request: OxylabsRequest,
  credentials?: Partial<OxylabsCredentials>
): Promise<OxylabsResult<T>> {
  const creds = getCredentials(credentials);
  const timestamp = new Date().toISOString();

  try {
    const response = await fetch(OXYLABS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${creds.username}:${creds.password}`).toString('base64'),
      },
      body: JSON.stringify({
        ...request,
        parse: request.parse ?? true, // Default to parsed output
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        request,
        geo_location: 'geo_location' in request ? request.geo_location : undefined,
        data: null as T,
        job_id: '',
        timestamp,
        success: false,
        error: `Oxylabs API error: ${response.status} ${errorText}`,
        status_code: response.status,
      };
    }

    const result: OxylabsResponse<T> = await response.json();
    const firstResult = result.results[0];

    return {
      request,
      geo_location: 'geo_location' in request ? request.geo_location : undefined,
      data: firstResult.content,
      job_id: firstResult.job_id,
      timestamp,
      success: true,
      status_code: firstResult.status_code,
    };

  } catch (error) {
    return {
      request,
      geo_location: 'geo_location' in request ? request.geo_location : undefined,
      data: null as T,
      job_id: '',
      timestamp,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      status_code: 0,
    };
  }
}

/**
 * Scrape Amazon product by ASIN
 */
export async function scrapeAmazonProduct(
  asin: string,
  options: {
    domain?: AmazonDomain;
    geo_location?: string;
    credentials?: Partial<OxylabsCredentials>;
  } = {}
): Promise<OxylabsResult<AmazonProductData>> {
  return oxylabsRequest<AmazonProductData>({
    source: 'amazon_product',
    query: asin,
    domain: options.domain || 'com',
    geo_location: options.geo_location,
    parse: true,
  }, options.credentials);
}

/**
 * Search Amazon
 */
export async function scrapeAmazonSearch(
  query: string,
  options: {
    domain?: AmazonDomain;
    geo_location?: string;
    pages?: number;
    credentials?: Partial<OxylabsCredentials>;
  } = {}
): Promise<OxylabsResult<AmazonSearchData>> {
  return oxylabsRequest<AmazonSearchData>({
    source: 'amazon_search',
    query,
    domain: options.domain || 'com',
    geo_location: options.geo_location,
    pages: options.pages || 1,
    parse: true,
  }, options.credentials);
}

/**
 * Scrape Walmart product
 */
export async function scrapeWalmartProduct(
  productId: string,
  options: {
    geo_location?: string;
    credentials?: Partial<OxylabsCredentials>;
  } = {}
): Promise<OxylabsResult<WalmartProductData>> {
  return oxylabsRequest<WalmartProductData>({
    source: 'walmart_product',
    query: productId,
    geo_location: options.geo_location,
    parse: true,
  }, options.credentials);
}

/**
 * Search Walmart
 */
export async function scrapeWalmartSearch(
  query: string,
  options: {
    geo_location?: string;
    pages?: number;
    credentials?: Partial<OxylabsCredentials>;
  } = {}
): Promise<OxylabsResult<unknown>> {
  return oxylabsRequest({
    source: 'walmart_search',
    query,
    geo_location: options.geo_location,
    pages: options.pages || 1,
    parse: true,
  }, options.credentials);
}

/**
 * Search Google
 */
export async function scrapeGoogleSearch(
  query: string,
  options: {
    domain?: GoogleDomain;
    geo_location?: string;
    locale?: string;
    pages?: number;
    credentials?: Partial<OxylabsCredentials>;
  } = {}
): Promise<OxylabsResult<GoogleSearchData>> {
  return oxylabsRequest<GoogleSearchData>({
    source: 'google_search',
    query,
    domain: options.domain || 'com',
    geo_location: options.geo_location,
    locale: options.locale,
    pages: options.pages || 1,
    parse: true,
  }, options.credentials);
}

/**
 * Scrape Google Shopping
 */
export async function scrapeGoogleShopping(
  query: string,
  options: {
    domain?: GoogleDomain;
    geo_location?: string;
    locale?: string;
    credentials?: Partial<OxylabsCredentials>;
  } = {}
): Promise<OxylabsResult<unknown>> {
  return oxylabsRequest({
    source: 'google_shopping',
    query,
    domain: options.domain || 'com',
    geo_location: options.geo_location,
    locale: options.locale,
    parse: true,
  }, options.credentials);
}

/**
 * Scrape any URL (universal scraper)
 */
export async function scrapeUrl(
  url: string,
  options: {
    geo_location?: string;
    render?: 'html';
    credentials?: Partial<OxylabsCredentials>;
  } = {}
): Promise<OxylabsResult<string>> {
  return oxylabsRequest<string>({
    source: 'universal',
    url,
    geo_location: options.geo_location,
    render: options.render,
    parse: false, // Universal returns HTML
  }, options.credentials);
}

/**
 * Run multiple requests across different locations
 */
export async function scrapeWithLocations<T = unknown>(
  baseRequest: Omit<OxylabsRequest, 'geo_location'>,
  locations: string[],
  options: BatchOptions & { credentials?: Partial<OxylabsCredentials> } = {}
): Promise<OxylabsResult<T>[]> {
  const { concurrency = 3, delay = 500, onProgress, credentials } = options;
  const results: OxylabsResult<T>[] = [];
  let completed = 0;

  // Process in batches
  for (let i = 0; i < locations.length; i += concurrency) {
    const batch = locations.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (location) => {
        const request = { ...baseRequest, geo_location: location } as OxylabsRequest;
        const result = await oxylabsRequest<T>(request, credentials);
        completed++;
        onProgress?.(completed, locations.length, result as OxylabsResult);
        return result;
      })
    );

    results.push(...batchResults);

    // Delay between batches
    if (i + concurrency < locations.length && delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return results;
}

/**
 * Run batch requests
 */
export async function scrapeBatch<T = unknown>(
  requests: OxylabsRequest[],
  options: BatchOptions & { credentials?: Partial<OxylabsCredentials> } = {}
): Promise<OxylabsResult<T>[]> {
  const { concurrency = 3, delay = 500, onProgress, credentials } = options;
  const results: OxylabsResult<T>[] = [];
  let completed = 0;

  // Process in batches
  for (let i = 0; i < requests.length; i += concurrency) {
    const batch = requests.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (request) => {
        const result = await oxylabsRequest<T>(request, credentials);
        completed++;
        onProgress?.(completed, requests.length, result as OxylabsResult);
        return result;
      })
    );

    results.push(...batchResults);

    // Delay between batches
    if (i + concurrency < requests.length && delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return results;
}

/**
 * Summarize batch results
 */
export function summarizeResults(results: OxylabsResult[]): {
  total: number;
  successful: number;
  failed: number;
  byLocation: Record<string, number>;
  bySource: Record<string, number>;
  errors: string[];
} {
  const summary = {
    total: results.length,
    successful: 0,
    failed: 0,
    byLocation: {} as Record<string, number>,
    bySource: {} as Record<string, number>,
    errors: [] as string[],
  };

  for (const result of results) {
    if (result.success) {
      summary.successful++;
    } else {
      summary.failed++;
      if (result.error) {
        summary.errors.push(result.error);
      }
    }

    const location = result.geo_location || 'default';
    summary.byLocation[location] = (summary.byLocation[location] || 0) + 1;

    const source = result.request.source;
    summary.bySource[source] = (summary.bySource[source] || 0) + 1;
  }

  return summary;
}
