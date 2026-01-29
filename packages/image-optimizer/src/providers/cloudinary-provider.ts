/**
 * Cloudinary Image Optimization Provider
 *
 * Uses Cloudinary's Fetch API to optimize images on-the-fly from remote URLs.
 * No upload required - images are fetched, transformed, and cached by Cloudinary.
 *
 * @see https://cloudinary.com/documentation/fetch_remote_images
 */

import type {
  ImageOptimizerConfig,
  TransformationPreset,
  OptimizedImageSet,
  PartialOptimizedImageSet,
  PresetName,
} from '../types.js';
import { BaseImageProvider } from './base-provider.js';
import { buildTransformationString } from '../transformations/builder.js';
import { PRESETS } from '../transformations/presets.js';

/**
 * Cloudinary-specific configuration
 */
export interface CloudinaryConfig extends ImageOptimizerConfig {
  /** Enable signed URLs for additional security (requires apiKey + apiSecret) */
  signedUrls?: boolean;
}

/**
 * Cloudinary Image Optimization Provider
 *
 * Uses Cloudinary's Fetch API to transform remote images on-the-fly.
 * Images are fetched from the source URL, transformed according to presets,
 * and cached on Cloudinary's CDN.
 *
 * Benefits:
 * - No storage costs (source images stay on origin CDN)
 * - Automatic caching on Cloudinary's CDN
 * - On-the-fly transformation
 * - Automatic format selection (WebP/AVIF for supported browsers)
 */
export class CloudinaryProvider extends BaseImageProvider {
  readonly name = 'cloudinary';
  private readonly cloudName: string;
  private readonly secure: boolean;

  constructor(config: CloudinaryConfig) {
    super();

    if (!config.cloudName) {
      throw new Error('CloudinaryProvider requires cloudName configuration');
    }

    this.cloudName = config.cloudName;
    this.secure = config.secure ?? true;
  }

  /**
   * Generate an optimized URL using Cloudinary Fetch API
   *
   * @param sourceUrl - Original image URL (e.g., Shopify CDN URL)
   * @param preset - Transformation preset to apply
   * @returns Cloudinary Fetch URL with transformations
   *
   * @example
   * ```typescript
   * const optimizedUrl = provider.getOptimizedUrl(
   *   'https://cdn.shopify.com/s/files/1/xxx/product.jpg',
   *   { width: 800, format: 'auto', quality: 'auto' }
   * );
   * // Returns: https://res.cloudinary.com/mycloud/image/fetch/w_800,f_auto,q_auto/https%3A%2F%2Fcdn.shopify.com%2F...
   * ```
   */
  getOptimizedUrl(sourceUrl: string, preset: TransformationPreset): string {
    if (!this.isValidSourceUrl(sourceUrl)) {
      throw new Error(`Invalid source URL: ${sourceUrl}`);
    }

    const protocol = this.secure ? 'https' : 'http';
    const transformationString = buildTransformationString(preset);

    // URL-encode the source URL to handle special characters
    // Cloudinary Fetch API format: /image/fetch/<transformations>/<encoded_source_url>
    const encodedSourceUrl = encodeURIComponent(sourceUrl);

    return `${protocol}://res.cloudinary.com/${this.cloudName}/image/fetch/${transformationString}/${encodedSourceUrl}`;
  }

  /**
   * Generate all standard preset URLs for a source image
   *
   * @param sourceUrl - Original image URL
   * @param presets - Optional subset of presets to generate (defaults to all)
   * @returns Object with optimized URLs for each preset
   */
  getOptimizedImageSet(
    sourceUrl: string,
    presets?: PresetName[]
  ): OptimizedImageSet | PartialOptimizedImageSet {
    if (!this.isValidSourceUrl(sourceUrl)) {
      throw new Error(`Invalid source URL: ${sourceUrl}`);
    }

    const presetsToGenerate = presets || (['ogImage', 'productMain', 'productThumbnail', 'schemaImage'] as PresetName[]);
    const generatedAt = new Date().toISOString();

    const result: PartialOptimizedImageSet = {
      original: sourceUrl,
      provider: 'cloudinary',
      generatedAt,
    };

    for (const presetName of presetsToGenerate) {
      const preset = PRESETS[presetName];
      if (preset) {
        result[presetName] = this.getOptimizedUrl(sourceUrl, preset);
      }
    }

    // If all presets were generated, return as full OptimizedImageSet
    if (
      result.ogImage &&
      result.productMain &&
      result.productThumbnail &&
      result.schemaImage
    ) {
      return result as OptimizedImageSet;
    }

    return result;
  }

  /**
   * Validate source URL for Cloudinary Fetch
   *
   * Cloudinary Fetch requires:
   * - Valid HTTP/HTTPS URL
   * - Publicly accessible (no auth required)
   * - Image content type
   */
  override isValidSourceUrl(url: string): boolean {
    if (!super.isValidSourceUrl(url)) {
      return false;
    }

    // Additional validation for image URLs
    if (!this.isImageUrl(url)) {
      return false;
    }

    return true;
  }

  /**
   * Get the Cloudinary cloud name
   */
  getCloudName(): string {
    return this.cloudName;
  }

  /**
   * Build a custom transformation URL with raw transformation string
   *
   * @param sourceUrl - Original image URL
   * @param transformations - Raw Cloudinary transformation string (e.g., "w_500,h_500,c_fill")
   */
  getCustomUrl(sourceUrl: string, transformations: string): string {
    if (!this.isValidSourceUrl(sourceUrl)) {
      throw new Error(`Invalid source URL: ${sourceUrl}`);
    }

    const protocol = this.secure ? 'https' : 'http';
    const encodedSourceUrl = encodeURIComponent(sourceUrl);

    return `${protocol}://res.cloudinary.com/${this.cloudName}/image/fetch/${transformations}/${encodedSourceUrl}`;
  }
}

/**
 * Create a Cloudinary provider instance
 *
 * @param config - Cloudinary configuration
 * @returns Configured CloudinaryProvider instance
 *
 * @example
 * ```typescript
 * const provider = createCloudinaryProvider({
 *   cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
 * });
 *
 * const ogImageUrl = provider.getOptimizedUrl(shopifyImageUrl, PRESETS.ogImage);
 * ```
 */
export function createCloudinaryProvider(config: CloudinaryConfig): CloudinaryProvider {
  return new CloudinaryProvider(config);
}
