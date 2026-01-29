/**
 * Base Image Optimization Provider
 *
 * Abstract base class for image optimization providers.
 */

import type {
  ImageOptimizationProvider,
  TransformationPreset,
  OptimizedImageSet,
  PartialOptimizedImageSet,
  PresetName,
} from '../types.js';

/**
 * Abstract base class for image optimization providers
 */
export abstract class BaseImageProvider implements ImageOptimizationProvider {
  abstract readonly name: string;

  /**
   * Generate an optimized URL for a source image
   */
  abstract getOptimizedUrl(sourceUrl: string, preset: TransformationPreset): string;

  /**
   * Generate all preset URLs for a source image
   */
  abstract getOptimizedImageSet(
    sourceUrl: string,
    presets?: PresetName[]
  ): OptimizedImageSet | PartialOptimizedImageSet;

  /**
   * Validate that a source URL can be optimized
   * Default implementation checks for valid HTTP(S) URLs
   */
  isValidSourceUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Check if URL is from a supported image CDN
   */
  protected isCdnUrl(url: string): boolean {
    const cdnPatterns = [
      'cdn.shopify.com',
      'images.unsplash.com',
      'images.pexels.com',
      'i.imgur.com',
      's3.amazonaws.com',
      'storage.googleapis.com',
    ];

    try {
      const parsed = new URL(url);
      return cdnPatterns.some((pattern) => parsed.hostname.includes(pattern));
    } catch {
      return false;
    }
  }

  /**
   * Extract file extension from URL
   */
  protected getFileExtension(url: string): string | null {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname;
      const match = pathname.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
      return match ? match[1].toLowerCase() : null;
    } catch {
      return null;
    }
  }

  /**
   * Check if URL points to an image (by extension)
   */
  protected isImageUrl(url: string): boolean {
    const ext = this.getFileExtension(url);
    if (!ext) return true; // Allow URLs without extensions (CDN URLs often work)

    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'tiff', 'svg'];
    return imageExtensions.includes(ext);
  }
}
