/**
 * Bentham Visibility Tool
 * Public API exports
 */

// Schema and types
export {
  ManifestSchema,
  BrandSchema,
  QuerySchema,
  TestSchema,
  ReportConfigSchema,
  JobSettingsSchema,
  ExecutionOptionsSchema,
  SurfaceType,
  validateManifest,
  createManifestTemplate,
  type Manifest,
  type Brand,
  type Query,
  type Test,
  type ReportConfig,
  type JobSettings,
  type ExecutionOptions,
} from './manifest-schema.js';

// Executor
export {
  createJob,
  executeJob,
  isDeadlineExceeded,
  saveJobState,
  loadJobState,
  formatTestSummary,
  formatJobSummary,
  type Job,
  type JobResult,
  type TestExecution,
  type TestStatus,
  type ProgressCallback,
} from './executor/index.js';

// Collectors
export {
  collectFromUrl,
  collectFromUrls,
  extractJsonLd,
  summarizeResults,
  type CollectionResult,
  type CollectorOptions,
} from './collectors/jsonld-collector.js';

export {
  queryOpenAI,
  runQueries,
  countBrandMentions,
  summarizeOpenAIResults,
  type OpenAIResult,
  type OpenAICollectorOptions,
} from './collectors/openai-api.js';

// URL Discovery (Marketplaces)
export {
  discoverBrandSiteProducts,
  discoverAmazonProducts,
  discoverWalmartProducts,
  discoverFlipkartProducts,
  discoverAllProducts,
  detectAmazonRegion,
  AMAZON_DOMAINS,
  type DiscoveredProduct,
  type DiscoveryOptions,
  type AllProductsOptions,
  type AmazonRegion,
} from './collectors/url-discovery.js';

// AI Files Discovery
export {
  collectAIFiles,
  collectAIFilesFromDomains,
  compareAIReadiness,
  type AIFilesResult,
  type LlmsTxtContent,
  type RobotsTxtContent,
  type AIBotRule,
} from './collectors/ai-files-collector.js';

// Metadata Extraction
export {
  extractPageMetadata,
  scoreMetadataCompleteness,
  type PageMetadataResult,
  type MetaTags,
  type OpenGraphTags,
  type TwitterCardTags,
  type ProductMetadata,
  type CollectionMetadata,
} from './collectors/metadata-collector.js';

// LLM Reachability
export {
  analyzeReachability,
  analyzeReachabilityBatch,
  summarizeReachability,
  type ReachabilityResult,
  type PageContent,
  type ContentComparison,
} from './collectors/reachability-collector.js';

// Site Crawler
export {
  crawlSite,
  classifyPageType,
  summarizeDiscoveredPages,
  filterPagesByType,
  getPagesByType,
  type DiscoveredPage,
  type PageType,
  type CrawlOptions,
} from './collectors/site-crawler.js';

// AI Referral Traffic & Page Performance
export {
  collectAIReferrals,
  collectPagePerformance,
  matchAISource,
  isAIReferrer,
  getKnownAISources,
  AI_REFERRAL_SOURCES,
  type AIReferralResult,
  type AIReferralEntry,
  type AIReferralOptions,
  type PagePerformanceResult,
  type PagePerformanceEntry,
  type PagePerformanceOptions,
} from './collectors/ai-referral-collector.js';

// Citation Extraction
export {
  queryPerplexity,
  scrapeGoogleCitations,
  collectCitations,
  summarizeCitations,
  filterCitationsForBrand,
  type Citation,
  type CitationResult,
  type CitationSummary,
  type PerplexityOptions,
} from './collectors/citation-collector.js';

// Scoring
export {
  scoreJsonLd,
  getGradeColor,
  type ScoringResult,
  type ScoreBreakdown,
} from './scoring/jsonld-scorer.js';

// Report generation
export {
  generateReport,
  saveReport,
  saveResults,
  type StudyResults,
} from './report/generator.js';

// Report types
export {
  ceoStrategicReport,
  competitiveIntelReport,
  technicalAuditReport,
  reportTypes,
  getReportType,
  listReportTypes,
  generateReportPrompt,
  buildReportContext,
  type ReportType,
  type ReportContext,
} from './report-types/index.js';

// Oxylabs Web Scraper API
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
} from './collectors/oxylabs-collector.js';

// AI Surfaces (Oxylabs-based: Google, Bing, Perplexity)
export {
  queryGoogle,
  queryBing,
  queryPerplexitySurface,
  queryAllSurfaces,
  queryAcrossLocations,
  summarizeAISurfaceResults,
  filterCitationsForBrand as filterAISurfaceCitations,
  type AISurface,
  type AISurfaceCitation,
  type AISurfaceResult,
  type AISurfaceOptions,
} from './collectors/ai-surfaces-collector.js';

// SerpApi (Google, Bing, Bing Copilot)
export {
  searchGoogle,
  searchBing,
  searchBingCopilot,
  searchMultipleEngines,
  searchAcrossLocations,
  summarizeSerpApiResults,
  filterCitationsForBrand as filterSerpApiCitations,
  serpApiRequest,
  type SerpApiEngine,
  type SerpApiRequest,
  type SerpApiResult,
  type SerpApiCredentials,
  type GoogleSearchResponse,
  type BingSearchResponse,
  type BingCopilotResponse,
  type OrganicResult,
  type AIOverviewResult,
  type CopilotTextBlock,
  type CopilotCitation,
} from './collectors/serpapi-collector.js';

// ChatGPT (Browser Session)
export {
  queryChatGPT,
  queryChatGPTBatch,
  interactiveLogin as chatgptLogin,
  hasValidSession as hasChatGPTSession,
  verifySession as verifyChatGPTSession,
  summarizeChatGPTResults,
  type ChatGPTResult,
  type ChatGPTCitation,
  type ChatGPTSessionOptions,
} from './collectors/chatgpt-collector.js';

// API server
export { startServer } from './api.js';
