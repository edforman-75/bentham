/**
 * Image Optimization Integration for Shopify Scraper
 *
 * Integrates @bentham/image-optimizer with the Shopify scraper
 * to generate optimized Cloudinary URLs for product images.
 */

import type { ScrapedProduct, ShopifyImage } from './index';

// ============================================================================
// Types
// ============================================================================

/**
 * Cloudinary configuration for image optimization
 */
export interface CloudinaryConfig {
  cloudName: string;
  secure?: boolean;
}

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
 * Extended Shopify image with optimization URLs
 */
export interface OptimizedShopifyImage extends ShopifyImage {
  optimizedUrls?: OptimizedImageSet;
}

/**
 * Product with optimized images
 */
export interface ScrapedProductWithOptimizedImages extends Omit<ScrapedProduct, 'images'> {
  images: OptimizedShopifyImage[];
  /** Primary optimized image set (first image) */
  primaryOptimizedImage?: OptimizedImageSet;
}

/**
 * Image optimization options
 */
export interface ImageOptimizationOptions {
  /** Cloudinary cloud name */
  cloudName: string;
  /** Which presets to generate */
  presets?: ('ogImage' | 'productMain' | 'productThumbnail' | 'schemaImage')[];
  /** Progress callback */
  onProgress?: (completed: number, total: number, message: string) => void;
}

// ============================================================================
// Transformation Presets (matching @bentham/image-optimizer)
// ============================================================================

const PRESETS = {
  ogImage: {
    width: 1200,
    height: 630,
    crop: 'fill',
    gravity: 'auto',
    format: 'auto',
    quality: 'auto',
  },
  productMain: {
    width: 800,
    crop: 'limit',
    format: 'auto',
    quality: 'auto',
  },
  productThumbnail: {
    width: 200,
    crop: 'limit',
    format: 'auto',
    quality: 'auto',
  },
  schemaImage: {
    width: 1000,
    crop: 'limit',
    format: 'auto',
    quality: 90,
  },
} as const;

type PresetName = keyof typeof PRESETS;
type Preset = (typeof PRESETS)[PresetName];

// ============================================================================
// URL Building
// ============================================================================

/**
 * Build Cloudinary transformation string from preset
 */
function buildTransformationString(preset: Preset): string {
  const parts: string[] = [];

  if ('width' in preset && preset.width) {
    parts.push(`w_${preset.width}`);
  }
  if ('height' in preset && preset.height) {
    parts.push(`h_${preset.height}`);
  }
  if ('crop' in preset && preset.crop) {
    parts.push(`c_${preset.crop}`);
  }
  if ('gravity' in preset && preset.gravity) {
    parts.push(`g_${preset.gravity}`);
  }
  if ('format' in preset && preset.format) {
    parts.push(`f_${preset.format}`);
  }
  if ('quality' in preset && preset.quality !== undefined) {
    parts.push(`q_${preset.quality}`);
  }

  return parts.join(',');
}

/**
 * Build Cloudinary Fetch URL for a source image
 */
function buildCloudinaryFetchUrl(
  cloudName: string,
  sourceUrl: string,
  preset: Preset
): string {
  const transformationString = buildTransformationString(preset);
  const encodedSourceUrl = encodeURIComponent(sourceUrl);

  return `https://res.cloudinary.com/${cloudName}/image/fetch/${transformationString}/${encodedSourceUrl}`;
}

/**
 * Generate optimized image set for a source URL
 */
function generateOptimizedImageSet(
  cloudName: string,
  sourceUrl: string,
  presets: PresetName[] = ['ogImage', 'productMain', 'productThumbnail', 'schemaImage']
): OptimizedImageSet {
  const result: Partial<OptimizedImageSet> = {
    original: sourceUrl,
    provider: 'cloudinary',
    generatedAt: new Date().toISOString(),
  };

  for (const presetName of presets) {
    const preset = PRESETS[presetName];
    result[presetName] = buildCloudinaryFetchUrl(cloudName, sourceUrl, preset);
  }

  return result as OptimizedImageSet;
}

// ============================================================================
// Product Image Optimization
// ============================================================================

/**
 * Optimize all images for a single product
 */
export function optimizeProductImages(
  product: ScrapedProduct,
  config: CloudinaryConfig,
  presets?: PresetName[]
): ScrapedProductWithOptimizedImages {
  const optimizedImages: OptimizedShopifyImage[] = product.images.map((image) => ({
    ...image,
    optimizedUrls: generateOptimizedImageSet(config.cloudName, image.src, presets),
  }));

  return {
    ...product,
    images: optimizedImages,
    primaryOptimizedImage: optimizedImages[0]?.optimizedUrls,
  };
}

/**
 * Optimize images for multiple products
 */
export function optimizeAllProductImages(
  products: ScrapedProduct[],
  options: ImageOptimizationOptions
): ScrapedProductWithOptimizedImages[] {
  const { cloudName, presets, onProgress } = options;
  const config: CloudinaryConfig = { cloudName };

  const results: ScrapedProductWithOptimizedImages[] = [];
  const total = products.length;

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const optimizedProduct = optimizeProductImages(product, config, presets);
    results.push(optimizedProduct);

    onProgress?.(i + 1, total, `Optimized images for: ${product.handle}`);
  }

  return results;
}

// ============================================================================
// CSV Export Extensions
// ============================================================================

/**
 * Generate CSV headers for optimized images
 */
export function getOptimizedImageCsvHeaders(): string[] {
  return [
    'Primary OG Image URL (1200x630)',
    'Primary Product Image URL (800w)',
    'Primary Thumbnail URL (200w)',
    'Primary Schema Image URL (1000w)',
    'All Optimized OG Images',
    'All Optimized Product Images',
  ];
}

/**
 * Generate CSV row data for optimized images
 */
export function getOptimizedImageCsvRow(
  product: ScrapedProductWithOptimizedImages
): string[] {
  const primary = product.primaryOptimizedImage;

  // Collect all optimized URLs
  const allOgImages = product.images
    .map((img) => img.optimizedUrls?.ogImage)
    .filter(Boolean)
    .join(' | ');

  const allProductImages = product.images
    .map((img) => img.optimizedUrls?.productMain)
    .filter(Boolean)
    .join(' | ');

  return [
    primary?.ogImage || '',
    primary?.productMain || '',
    primary?.productThumbnail || '',
    primary?.schemaImage || '',
    allOgImages,
    allProductImages,
  ];
}

/**
 * Generate extended optimization CSV with image URLs
 */
export function generateOptimizationCsvWithImages(
  products: ScrapedProductWithOptimizedImages[]
): string {
  const headers = [
    'Handle',
    'URL',
    'Title',
    'Has JSON-LD',
    'Image Count',
    'Primary OG Image (1200x630)',
    'Primary Product Image (800w)',
    'Primary Schema Image (1000w)',
    'Optimization Notes',
  ];

  const rows: string[][] = [headers];

  for (const product of products) {
    const hasJsonLd = !!product.jsonLd;
    const primary = product.primaryOptimizedImage;

    // Basic optimization notes
    const notes: string[] = [];
    if (!hasJsonLd) {
      notes.push('Missing Product JSON-LD');
    }
    if (!product.metaDescription) {
      notes.push('Missing meta description');
    }
    if (product.images.length === 0) {
      notes.push('No images');
    }
    if (product.images.length === 1) {
      notes.push('Only 1 image - consider adding more');
    }

    const row = [
      product.handle,
      product.url,
      product.title,
      hasJsonLd ? 'Yes' : 'No',
      String(product.images.length),
      primary?.ogImage || '',
      primary?.productMain || '',
      primary?.schemaImage || '',
      notes.join('; '),
    ];

    rows.push(row);
  }

  return rows
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    )
    .join('\n');
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate Cloudinary configuration
 */
export function validateCloudinaryConfig(cloudName: string | undefined): boolean {
  if (!cloudName) {
    return false;
  }
  // Cloud name should be alphanumeric with hyphens/underscores
  return /^[a-zA-Z0-9_-]+$/.test(cloudName);
}

/**
 * Get stats about image optimization
 */
export function getImageOptimizationStats(
  products: ScrapedProductWithOptimizedImages[]
): {
  totalProducts: number;
  totalImages: number;
  productsWithImages: number;
  averageImagesPerProduct: number;
  optimizedUrls: number;
} {
  const totalProducts = products.length;
  let totalImages = 0;
  let productsWithImages = 0;
  let optimizedUrls = 0;

  for (const product of products) {
    const imageCount = product.images.length;
    totalImages += imageCount;

    if (imageCount > 0) {
      productsWithImages++;
    }

    // Count optimized URLs (4 per image: og, productMain, thumbnail, schema)
    optimizedUrls += imageCount * 4;
  }

  return {
    totalProducts,
    totalImages,
    productsWithImages,
    averageImagesPerProduct:
      totalProducts > 0 ? Math.round((totalImages / totalProducts) * 10) / 10 : 0,
    optimizedUrls,
  };
}
