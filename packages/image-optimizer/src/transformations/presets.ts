/**
 * Standard Image Transformation Presets
 *
 * Pre-configured transformations optimized for AI visibility use cases.
 */

import type { TransformationPreset, PresetName } from '../types.js';

/**
 * Standard presets for common image optimization scenarios
 */
export const PRESETS: Record<PresetName, TransformationPreset> = {
  /**
   * OG Image preset for social sharing and AI previews
   * - 1200x630 is the optimal size for Open Graph images
   * - Used by social platforms, AI crawlers, and preview generators
   * - Center crop to ensure important content is visible
   */
  ogImage: {
    width: 1200,
    height: 630,
    crop: 'fill',
    gravity: 'auto',
    format: 'auto',
    quality: 'auto',
  },

  /**
   * Product main image preset for product pages
   * - 800px width is optimal for most product page layouts
   * - Height auto-calculated to preserve aspect ratio
   * - High quality for detailed product viewing
   */
  productMain: {
    width: 800,
    crop: 'limit',
    format: 'auto',
    quality: 'auto',
  },

  /**
   * Product thumbnail preset for grids and lists
   * - 200px width for efficient grid layouts
   * - Small file size for fast loading
   * - Good quality maintained with auto optimization
   */
  productThumbnail: {
    width: 200,
    crop: 'limit',
    format: 'auto',
    quality: 'auto',
  },

  /**
   * Schema.org image preset for JSON-LD structured data
   * - 1000px width provides good detail for AI analysis
   * - Higher quality (90) ensures clear product representation
   * - Used in Product schema for search engines and AI
   */
  schemaImage: {
    width: 1000,
    crop: 'limit',
    format: 'auto',
    quality: 90,
  },
};

/**
 * Get a preset by name
 */
export function getPreset(name: PresetName): TransformationPreset {
  return PRESETS[name];
}

/**
 * Get all available preset names
 */
export function getPresetNames(): PresetName[] {
  return Object.keys(PRESETS) as PresetName[];
}

/**
 * Create a custom preset extending a base preset
 */
export function extendPreset(
  base: PresetName | TransformationPreset,
  overrides: Partial<TransformationPreset>
): TransformationPreset {
  const basePreset = typeof base === 'string' ? PRESETS[base] : base;
  return { ...basePreset, ...overrides };
}
