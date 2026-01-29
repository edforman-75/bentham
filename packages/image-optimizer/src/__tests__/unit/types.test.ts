/**
 * Image Optimizer Type Tests
 */

import { describe, it, expect } from 'vitest';
import type { PresetName, TransformationPreset, OptimizedImageSet } from '../../types.js';

describe('Image Optimizer Types', () => {
  describe('PresetName', () => {
    it('should include standard presets', () => {
      const presets: PresetName[] = [
        'ogImage',
        'productMain',
        'productThumbnail',
        'schemaImage',
        'amazonMain',
        'walmartMain',
      ];
      expect(presets).toHaveLength(6);
    });
  });

  describe('TransformationPreset', () => {
    it('should accept valid preset configuration', () => {
      const preset: TransformationPreset = {
        width: 800,
        height: 600,
        crop: 'fill',
        format: 'auto',
        quality: 'auto',
      };
      expect(preset.width).toBe(800);
      expect(preset.height).toBe(600);
    });
  });

  describe('OptimizedImageSet', () => {
    it('should accept valid image set', () => {
      const imageSet: OptimizedImageSet = {
        original: 'https://example.com/image.jpg',
        ogImage: 'https://cdn.example.com/og.jpg',
        productMain: 'https://cdn.example.com/main.jpg',
        productThumbnail: 'https://cdn.example.com/thumb.jpg',
        schemaImage: 'https://cdn.example.com/schema.jpg',
        provider: 'cloudinary',
        generatedAt: new Date().toISOString(),
      };
      expect(imageSet.provider).toBe('cloudinary');
    });

    it('should accept optional marketplace presets', () => {
      const imageSet: OptimizedImageSet = {
        original: 'https://example.com/image.jpg',
        ogImage: 'https://cdn.example.com/og.jpg',
        productMain: 'https://cdn.example.com/main.jpg',
        productThumbnail: 'https://cdn.example.com/thumb.jpg',
        schemaImage: 'https://cdn.example.com/schema.jpg',
        amazonMain: 'https://cdn.example.com/amazon.jpg',
        walmartMain: 'https://cdn.example.com/walmart.jpg',
        provider: 'cloudinary',
        generatedAt: new Date().toISOString(),
      };
      expect(imageSet.amazonMain).toBe('https://cdn.example.com/amazon.jpg');
      expect(imageSet.walmartMain).toBe('https://cdn.example.com/walmart.jpg');
    });
  });
});
