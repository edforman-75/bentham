/**
 * Batch Image Processor
 *
 * Rate-limited batch processing for optimizing multiple images.
 */

import type {
  ImageOptimizationProvider,
  BatchProcessingOptions,
  BatchProcessingResult,
  OptimizedImageSet,
  PartialOptimizedImageSet,
  PresetName,
} from '../types.js';

/**
 * Default batch processing options
 */
const DEFAULT_OPTIONS: Required<Omit<BatchProcessingOptions, 'onProgress' | 'onError'>> = {
  presets: ['ogImage', 'productMain', 'productThumbnail', 'schemaImage'],
  concurrency: 10,
};

/**
 * Process a batch of image URLs through the optimization provider
 *
 * @param provider - Image optimization provider
 * @param sourceUrls - Array of source image URLs
 * @param options - Batch processing options
 * @returns Batch processing result with successful and failed items
 */
export async function processBatch(
  provider: ImageOptimizationProvider,
  sourceUrls: string[],
  options: BatchProcessingOptions = {}
): Promise<BatchProcessingResult<OptimizedImageSet | PartialOptimizedImageSet>> {
  const {
    presets = DEFAULT_OPTIONS.presets,
    concurrency = DEFAULT_OPTIONS.concurrency,
    onProgress,
    onError,
  } = options;

  const startTime = Date.now();
  const successful: (OptimizedImageSet | PartialOptimizedImageSet)[] = [];
  const failed: Array<{ item: string; error: string }> = [];

  // Process in concurrent batches
  const chunks = chunkArray(sourceUrls, concurrency);
  let completed = 0;

  for (const chunk of chunks) {
    const results = await Promise.allSettled(
      chunk.map(async (url) => {
        try {
          const result = provider.getOptimizedImageSet(url, presets);
          return { url, result };
        } catch (error) {
          throw { url, error };
        }
      })
    );

    for (const result of results) {
      completed++;

      if (result.status === 'fulfilled') {
        successful.push(result.value.result);
        onProgress?.(completed, sourceUrls.length, result.value.url);
      } else {
        const { url, error } = result.reason as { url: string; error: Error };
        const errorMessage = error instanceof Error ? error.message : String(error);
        failed.push({ item: url, error: errorMessage });
        onError?.(url, error instanceof Error ? error : new Error(errorMessage));
        onProgress?.(completed, sourceUrls.length, url);
      }
    }
  }

  return {
    successful,
    failed: failed.map((f) => ({ item: f.item as unknown as (OptimizedImageSet | PartialOptimizedImageSet), error: f.error })),
    stats: {
      total: sourceUrls.length,
      successful: successful.length,
      failed: failed.length,
      durationMs: Date.now() - startTime,
    },
  };
}

/**
 * Process images from product data structures
 *
 * @param provider - Image optimization provider
 * @param products - Array of products with images
 * @param options - Batch processing options
 * @returns Products with optimized image URLs added
 */
export async function processProductImages<T extends { images: Array<{ src: string }> }>(
  provider: ImageOptimizationProvider,
  products: T[],
  options: BatchProcessingOptions = {}
): Promise<{
  products: Array<T & { optimizedImages: Map<string, OptimizedImageSet | PartialOptimizedImageSet> }>;
  stats: BatchProcessingResult<string>['stats'];
}> {
  const { onProgress } = options;

  // Extract all unique image URLs
  const imageUrls = new Set<string>();
  for (const product of products) {
    for (const image of product.images) {
      if (image.src) {
        imageUrls.add(image.src);
      }
    }
  }

  const urlArray = Array.from(imageUrls);
  const startTime = Date.now();
  const optimizedMap = new Map<string, OptimizedImageSet | PartialOptimizedImageSet>();
  let completed = 0;
  let failedCount = 0;

  // Process all unique URLs
  for (const url of urlArray) {
    try {
      const optimized = provider.getOptimizedImageSet(url, options.presets);
      optimizedMap.set(url, optimized);
    } catch (error) {
      failedCount++;
      options.onError?.(url, error instanceof Error ? error : new Error(String(error)));
    }
    completed++;
    onProgress?.(completed, urlArray.length, url);
  }

  // Attach optimized URLs to products
  const enhancedProducts = products.map((product) => ({
    ...product,
    optimizedImages: new Map(
      product.images
        .filter((img) => img.src && optimizedMap.has(img.src))
        .map((img) => [img.src, optimizedMap.get(img.src)!])
    ),
  }));

  return {
    products: enhancedProducts,
    stats: {
      total: urlArray.length,
      successful: urlArray.length - failedCount,
      failed: failedCount,
      durationMs: Date.now() - startTime,
    },
  };
}

/**
 * Create a rate-limited optimization function
 *
 * @param provider - Image optimization provider
 * @param rateLimit - Maximum requests per minute
 * @returns Rate-limited optimization function
 */
export function createRateLimitedOptimizer(
  provider: ImageOptimizationProvider,
  rateLimit: number = 500
): (sourceUrl: string, presets?: PresetName[]) => Promise<OptimizedImageSet | PartialOptimizedImageSet> {
  const minInterval = (60 * 1000) / rateLimit; // ms between requests
  let lastRequest = 0;

  return async (sourceUrl: string, presets?: PresetName[]) => {
    const now = Date.now();
    const elapsed = now - lastRequest;

    if (elapsed < minInterval) {
      await new Promise((resolve) => setTimeout(resolve, minInterval - elapsed));
    }

    lastRequest = Date.now();
    return provider.getOptimizedImageSet(sourceUrl, presets);
  };
}

/**
 * Split array into chunks of specified size
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
