/**
 * @bentham/image-optimizer
 *
 * Image optimization using Cloudinary Fetch API for AI visibility.
 * Transforms and optimizes remote images on-the-fly without uploading.
 *
 * @example
 * ```typescript
 * import { createCloudinaryProvider, PRESETS } from '@bentham/image-optimizer';
 *
 * const provider = createCloudinaryProvider({
 *   cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
 * });
 *
 * // Generate optimized OG image URL
 * const ogImageUrl = provider.getOptimizedUrl(
 *   'https://cdn.shopify.com/s/files/1/xxx/product.jpg',
 *   PRESETS.ogImage
 * );
 *
 * // Generate all preset URLs at once
 * const imageSet = provider.getOptimizedImageSet(shopifyImageUrl);
 * console.log(imageSet.ogImage);        // 1200x630 for social
 * console.log(imageSet.productMain);    // 800w for product pages
 * console.log(imageSet.schemaImage);    // 1000w for JSON-LD
 * ```
 */

// Types
export type {
  TransformationPreset,
  PresetName,
  OptimizedImageSet,
  PartialOptimizedImageSet,
  ImageOptimizerConfig,
  BatchProcessingOptions,
  BatchProcessingResult,
  ImageOptimizationProvider,
} from './types.js';

// Providers
export {
  BaseImageProvider,
  CloudinaryProvider,
  createCloudinaryProvider,
  type CloudinaryConfig,
} from './providers/index.js';

// Presets
export {
  PRESETS,
  getPreset,
  getPresetNames,
  extendPreset,
} from './transformations/presets.js';

// URL Builder
export {
  buildTransformationString,
  buildFetchUrl,
  buildFetchUrlEncoded,
  parseFetchUrl,
} from './transformations/builder.js';

// Batch Processing
export {
  processBatch,
  processProductImages,
  createRateLimitedOptimizer,
} from './utils/batch-processor.js';

// Image Extraction
export {
  extractShopifyProductImages,
  extractJsonLdImages,
  extractOgImages,
  normalizeShopifyCdnUrl,
  getHighResShopifyUrl,
  isShopifyCdnUrl,
  extractAllProductImages,
} from './utils/image-extractor.js';

// Background Removal (remove.bg)
export {
  removeBackground,
  likelyNeedsBackgroundRemoval,
  type RemoveBgConfig,
  type RemoveBgResult,
} from './providers/removebg-provider.js';

// Marketplace Processing (Amazon/Walmart)
export {
  getCloudinaryMarketplaceUrl,
  getEdgeToEdgeTransformUrl,
  getProcessingRules,
  recommendProcessingApproach,
  PROCESSING_RULES,
  type ImageAnalysis,
  type MarketplaceImageOptions,
  type MarketplaceProcessorConfig,
  type ProcessedImage,
} from './processors/marketplace-processor.js';
