/**
 * Collectors Index
 * Export all data collectors
 */

export * from './jsonld-collector.js';
export * from './openai-api.js';
export * from './ai-files-collector.js';
export * from './metadata-collector.js';
export * from './reachability-collector.js';
export * from './site-crawler.js';
export * from './ai-referral-collector.js';
export * from './citation-collector.js';
export * from './url-discovery.js';
export {
  oxylabsRequest,
  scrapeAmazonProduct,
  scrapeAmazonSearch,
  scrapeWalmartProduct,
  scrapeWalmartSearch,
  scrapeGoogleSearch,
  scrapeGoogleShopping,
  scrapeUrl,
  scrapeWithLocations,
  scrapeBatch,
  summarizeResults as summarizeOxylabsResults,
  type OxylabsSource,
  type OxylabsRequest,
  type OxylabsResult,
  type OxylabsCredentials,
  type AmazonRequest,
  type GoogleRequest,
  type WalmartRequest,
  type UniversalRequest,
  type AmazonProductData,
  type AmazonSearchData,
  type GoogleSearchData,
  type WalmartProductData,
  type AmazonDomain,
  type GoogleDomain,
  type BatchOptions,
} from './oxylabs-collector.js';
export {
  queryGoogle,
  queryBing,
  queryPerplexitySurface,
  queryChatGPT,
  queryAllSurfaces,
  queryAcrossLocations,
  summarizeAISurfaceResults,
  filterCitationsForBrand as filterAISurfaceCitations,
  type AISurface,
  type AISurfaceCitation,
  type AISurfaceResult,
  type AISurfaceOptions,
} from './ai-surfaces-collector.js';
// Future: export * from './gemini-api.js';
// Future: export * from './serpapi.js';
