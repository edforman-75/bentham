/**
 * Shopify/Store Scraper Types
 *
 * Re-exports types from all scraper modules.
 */

// Shopify-specific types
export type {
  ShopifyProduct,
  ShopifyVariant,
  ShopifyImage,
  ShopifyOption,
  ShopifyCollection,
  ScrapedProduct,
  ScrapedCollection,
  ScrapeResult,
  ScrapeOptions,
  CsvExportOptions,
} from './index';

// Generic scraper types
export type {
  GenericProduct,
  GenericCollection,
  GenericScrapeResult,
  GenericScrapeOptions,
} from './generic-scraper';

// Unified types
export type {
  UnifiedScrapeOptions,
  UnifiedScrapeResult,
} from './scrape-store';

// Image optimization types
export type {
  CloudinaryConfig,
  OptimizedImageSet,
  OptimizedShopifyImage,
  ScrapedProductWithOptimizedImages,
  ImageOptimizationOptions,
} from './image-integration';

// ============================================================================
// Additional Types for Integration
// ============================================================================

/**
 * Content change detection for staged review integration
 */
export interface ContentChange {
  url: string;
  handle: string;
  field: 'title' | 'description' | 'metaDescription' | 'jsonLd' | 'images';
  before: any;
  after: any;
  impact: 'high' | 'medium' | 'low';
  detectedAt: string;
}

/**
 * Comparison between two scrape snapshots
 */
export interface ScrapeComparison {
  store: string;
  beforeDate: string;
  afterDate: string;
  changes: ContentChange[];
  newProducts: string[];
  removedProducts: string[];
  summary: {
    totalProducts: number;
    changedProducts: number;
    highImpactChanges: number;
    mediumImpactChanges: number;
    lowImpactChanges: number;
  };
}

/**
 * Write-back job for Shopify bulk import
 */
export interface WriteBackJob {
  id: string;
  store: string;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  csvPath: string;
  productCount: number;
  createdAt: string;
  completedAt?: string;
  error?: string;
  results?: {
    updated: number;
    failed: number;
    skipped: number;
  };
}

/**
 * Optimization suggestion from scrape analysis
 */
export interface OptimizationSuggestion {
  productHandle: string;
  productUrl: string;
  field: string;
  currentValue: string;
  suggestedValue?: string;
  issue: string;
  recommendation: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: 'json-ld' | 'meta' | 'content' | 'images';
}

/**
 * Scrape schedule configuration
 */
export interface ScrapeSchedule {
  store: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  dayOfWeek?: number; // 0-6 for weekly
  dayOfMonth?: number; // 1-31 for monthly
  hour: number; // 0-23
  timezone: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  notifications?: {
    onComplete: boolean;
    onChangesDetected: boolean;
    onError: boolean;
    email?: string;
    webhook?: string;
  };
}
