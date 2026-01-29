/**
 * Image Optimizer Types
 *
 * Type definitions for Cloudinary-based image optimization using the Fetch API.
 */

/**
 * Image transformation preset configuration
 */
export interface TransformationPreset {
  /** Target width in pixels */
  width?: number;
  /** Target height in pixels */
  height?: number;
  /** Crop mode for resizing */
  crop?: 'fill' | 'fit' | 'scale' | 'crop' | 'pad' | 'limit';
  /** Output format (auto uses WebP/AVIF when supported) */
  format?: 'auto' | 'webp' | 'jpg' | 'png' | 'avif';
  /** Quality setting (auto optimizes automatically) */
  quality?: 'auto' | 'auto:best' | 'auto:good' | 'auto:eco' | 'auto:low' | number;
  /** Gravity for cropping (where to focus) */
  gravity?: 'auto' | 'face' | 'center' | 'north' | 'south' | 'east' | 'west';
  /** DPR (device pixel ratio) for retina displays */
  dpr?: 'auto' | number;
  /** Additional raw transformation string */
  raw?: string;
}

/**
 * Named preset identifiers
 */
export type PresetName = 'ogImage' | 'productMain' | 'productThumbnail' | 'schemaImage';

/**
 * Optimized image URLs for a single source image
 */
export interface OptimizedImageSet {
  /** Original source URL (Shopify CDN) */
  original: string;
  /** 1200x630 OG image for social/AI previews */
  ogImage: string;
  /** 800w main product image */
  productMain: string;
  /** 200w thumbnail for grids */
  productThumbnail: string;
  /** 1000w high-quality image for JSON-LD schema */
  schemaImage: string;
  /** Provider that generated these URLs */
  provider: 'cloudinary';
  /** Timestamp when URLs were generated */
  generatedAt: string;
}

/**
 * Partial optimized set (when only some presets are requested)
 */
export type PartialOptimizedImageSet = Partial<Omit<OptimizedImageSet, 'original' | 'provider' | 'generatedAt'>> & {
  original: string;
  provider: 'cloudinary';
  generatedAt: string;
};

/**
 * Configuration for image optimization provider
 */
export interface ImageOptimizerConfig {
  /** Cloudinary cloud name */
  cloudName: string;
  /** Cloudinary API key (optional for fetch API, required for uploads) */
  apiKey?: string;
  /** Cloudinary API secret (optional for fetch API, required for uploads) */
  apiSecret?: string;
  /** Custom delivery subdomain (optional) */
  deliverySubdomain?: string;
  /** Use secure URLs (https) - default true */
  secure?: boolean;
}

/**
 * Batch processing options
 */
export interface BatchProcessingOptions {
  /** Which presets to generate */
  presets?: PresetName[];
  /** Maximum concurrent operations */
  concurrency?: number;
  /** Progress callback */
  onProgress?: (completed: number, total: number, currentUrl: string) => void;
  /** Error callback (allows continuing on error) */
  onError?: (url: string, error: Error) => void;
}

/**
 * Result of batch processing
 */
export interface BatchProcessingResult<T> {
  /** Successfully processed items */
  successful: T[];
  /** Failed items with errors */
  failed: Array<{ item: T; error: string }>;
  /** Processing statistics */
  stats: {
    total: number;
    successful: number;
    failed: number;
    durationMs: number;
  };
}

/**
 * Image optimization provider interface
 */
export interface ImageOptimizationProvider {
  /** Provider name */
  readonly name: string;

  /**
   * Generate an optimized URL for a source image
   */
  getOptimizedUrl(sourceUrl: string, preset: TransformationPreset): string;

  /**
   * Generate all preset URLs for a source image
   */
  getOptimizedImageSet(sourceUrl: string, presets?: PresetName[]): OptimizedImageSet | PartialOptimizedImageSet;

  /**
   * Validate that a source URL can be optimized
   */
  isValidSourceUrl(url: string): boolean;
}
