/**
 * Cloudinary URL Builder
 *
 * Builds Cloudinary Fetch API URLs with transformation parameters.
 */

import type { TransformationPreset } from '../types.js';

/**
 * Build transformation string from preset configuration
 */
export function buildTransformationString(preset: TransformationPreset): string {
  const parts: string[] = [];

  // Width
  if (preset.width) {
    parts.push(`w_${preset.width}`);
  }

  // Height
  if (preset.height) {
    parts.push(`h_${preset.height}`);
  }

  // Crop mode
  if (preset.crop) {
    parts.push(`c_${preset.crop}`);
  }

  // Gravity (for cropping focus)
  if (preset.gravity) {
    parts.push(`g_${preset.gravity}`);
  }

  // Format
  if (preset.format) {
    parts.push(`f_${preset.format}`);
  }

  // Quality
  if (preset.quality !== undefined) {
    if (typeof preset.quality === 'number') {
      parts.push(`q_${preset.quality}`);
    } else {
      parts.push(`q_${preset.quality}`);
    }
  }

  // DPR
  if (preset.dpr) {
    parts.push(`dpr_${preset.dpr}`);
  }

  // Raw transformation string (appended at end)
  if (preset.raw) {
    parts.push(preset.raw);
  }

  return parts.join(',');
}

/**
 * Build a Cloudinary Fetch URL
 *
 * @param cloudName - Cloudinary cloud name
 * @param sourceUrl - Original image URL to fetch and transform
 * @param preset - Transformation preset to apply
 * @param options - Additional options
 */
export function buildFetchUrl(
  cloudName: string,
  sourceUrl: string,
  preset: TransformationPreset,
  options: { secure?: boolean } = {}
): string {
  const { secure = true } = options;

  const protocol = secure ? 'https' : 'http';
  const transformationString = buildTransformationString(preset);

  // Cloudinary Fetch API URL format:
  // https://res.cloudinary.com/<cloud_name>/image/fetch/<transformations>/<source_url>
  return `${protocol}://res.cloudinary.com/${cloudName}/image/fetch/${transformationString}/${encodeURIComponent(sourceUrl)}`;
}

/**
 * Build a Cloudinary Fetch URL with URL-safe encoding
 * Note: Cloudinary accepts both encoded and non-encoded URLs, but encoding is safer
 */
export function buildFetchUrlEncoded(
  cloudName: string,
  sourceUrl: string,
  preset: TransformationPreset,
  options: { secure?: boolean } = {}
): string {
  const { secure = true } = options;

  const protocol = secure ? 'https' : 'http';
  const transformationString = buildTransformationString(preset);

  // URL-encode the source URL for safety
  const encodedSourceUrl = encodeURIComponent(sourceUrl);

  return `${protocol}://res.cloudinary.com/${cloudName}/image/fetch/${transformationString}/${encodedSourceUrl}`;
}

/**
 * Parse a Cloudinary Fetch URL back to its components
 */
export function parseFetchUrl(fetchUrl: string): {
  cloudName: string;
  transformations: string;
  sourceUrl: string;
} | null {
  const match = fetchUrl.match(
    /^https?:\/\/res\.cloudinary\.com\/([^/]+)\/image\/fetch\/([^/]+)\/(.+)$/
  );

  if (!match) {
    return null;
  }

  return {
    cloudName: match[1],
    transformations: match[2],
    sourceUrl: decodeURIComponent(match[3]),
  };
}
