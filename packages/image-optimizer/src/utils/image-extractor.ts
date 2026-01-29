/**
 * Image Extractor Utilities
 *
 * Utilities for extracting image URLs from various data structures,
 * including Shopify products, JSON-LD, and HTML.
 */

/**
 * Extract image URLs from a Shopify product
 */
export function extractShopifyProductImages(product: {
  images?: Array<{ src: string; alt?: string | null }>;
  variants?: Array<{ featured_image?: { src: string } }>;
}): string[] {
  const urls = new Set<string>();

  // Main product images
  if (product.images) {
    for (const image of product.images) {
      if (image.src) {
        urls.add(image.src);
      }
    }
  }

  // Variant featured images
  if (product.variants) {
    for (const variant of product.variants) {
      if (variant.featured_image?.src) {
        urls.add(variant.featured_image.src);
      }
    }
  }

  return Array.from(urls);
}

/**
 * Extract image URLs from JSON-LD Product schema
 */
export function extractJsonLdImages(jsonLd: Record<string, unknown>): string[] {
  const urls: string[] = [];

  if (!jsonLd) return urls;

  // Direct image property
  if (typeof jsonLd.image === 'string') {
    urls.push(jsonLd.image);
  } else if (Array.isArray(jsonLd.image)) {
    for (const img of jsonLd.image) {
      if (typeof img === 'string') {
        urls.push(img);
      } else if (typeof img === 'object' && img !== null && 'url' in img) {
        urls.push((img as { url: string }).url);
      }
    }
  } else if (typeof jsonLd.image === 'object' && jsonLd.image !== null) {
    const imgObj = jsonLd.image as Record<string, unknown>;
    if ('url' in imgObj && typeof imgObj.url === 'string') {
      urls.push(imgObj.url);
    }
  }

  // Offers with images
  if (jsonLd.offers) {
    const offers = Array.isArray(jsonLd.offers) ? jsonLd.offers : [jsonLd.offers];
    for (const offer of offers) {
      if (typeof offer === 'object' && offer !== null && 'image' in offer) {
        const offerImg = (offer as Record<string, unknown>).image;
        if (typeof offerImg === 'string') {
          urls.push(offerImg);
        }
      }
    }
  }

  return urls;
}

/**
 * Extract OG image URLs from meta tags
 */
export function extractOgImages(ogTags: Record<string, string>): string[] {
  const urls: string[] = [];

  // Standard OG image
  if (ogTags['og:image']) {
    urls.push(ogTags['og:image']);
  }

  // Additional OG images (og:image:url, etc.)
  for (const [key, value] of Object.entries(ogTags)) {
    if (key.startsWith('og:image') && value && !urls.includes(value)) {
      urls.push(value);
    }
  }

  return urls;
}

/**
 * Normalize Shopify CDN URL
 *
 * Shopify CDN URLs can have size suffixes like _100x100, _small, etc.
 * This removes those to get the original/full-size URL.
 */
export function normalizeShopifyCdnUrl(url: string): string {
  // Pattern matches Shopify size suffixes: _100x100, _small, _medium, etc.
  // before the file extension
  const sizePattern = /_(pico|icon|thumb|small|compact|medium|large|grande|1024x1024|\d+x\d*)(\.[a-zA-Z]+)(\?.*)?$/;

  if (sizePattern.test(url)) {
    return url.replace(sizePattern, '$2$3');
  }

  return url;
}

/**
 * Get highest resolution Shopify image URL
 *
 * Converts a Shopify CDN URL to request the highest resolution version.
 */
export function getHighResShopifyUrl(url: string, maxWidth: number = 2048): string {
  // First normalize to remove any existing size suffix
  const normalized = normalizeShopifyCdnUrl(url);

  // Add size parameter for max width (Shopify respects this)
  // Format: image.jpg?width=2048
  const urlObj = new URL(normalized);
  urlObj.searchParams.set('width', String(maxWidth));

  return urlObj.toString();
}

/**
 * Check if URL is a Shopify CDN URL
 */
export function isShopifyCdnUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'cdn.shopify.com';
  } catch {
    return false;
  }
}

/**
 * Extract all images from a scraped product (combines all sources)
 */
export function extractAllProductImages(product: {
  images?: Array<{ src: string }>;
  variants?: Array<{ featured_image?: { src: string } }>;
  jsonLd?: Record<string, unknown> | null;
  ogTags?: Record<string, string>;
}): {
  shopifyImages: string[];
  jsonLdImages: string[];
  ogImages: string[];
  allUnique: string[];
} {
  const shopifyImages = extractShopifyProductImages(product);
  const jsonLdImages = product.jsonLd ? extractJsonLdImages(product.jsonLd) : [];
  const ogImages = product.ogTags ? extractOgImages(product.ogTags) : [];

  // Combine and deduplicate
  const allUnique = Array.from(new Set([...shopifyImages, ...jsonLdImages, ...ogImages]));

  return {
    shopifyImages,
    jsonLdImages,
    ogImages,
    allUnique,
  };
}
