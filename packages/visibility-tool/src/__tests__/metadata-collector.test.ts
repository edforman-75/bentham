/**
 * Tests for Metadata Collector
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scoreMetadataCompleteness, type PageMetadataResult } from '../collectors/metadata-collector.js';

describe('Metadata Collector', () => {
  describe('scoreMetadataCompleteness', () => {
    it('should score a well-optimized product page highly', () => {
      const metadata: PageMetadataResult = {
        url: 'https://example.com/products/test',
        timestamp: new Date().toISOString(),
        success: true,
        pageTitle: 'Test Product - Example Store',
        metaTags: {
          title: 'Test Product - Example Store',
          description: 'Buy Test Product with free shipping',
          keywords: 'test, product',
          robots: 'index, follow',
          canonical: 'https://example.com/products/test',
          author: null,
          viewport: 'width=device-width',
        },
        openGraph: {
          title: 'Test Product',
          description: 'Buy Test Product with free shipping',
          image: 'https://example.com/images/product.jpg',
          url: 'https://example.com/products/test',
          type: 'product',
          siteName: 'Example Store',
          locale: 'en_US',
          'product:price:amount': '29.99',
          'product:price:currency': 'USD',
        },
        twitterCard: {
          card: 'summary_large_image',
          title: 'Test Product',
          description: 'Buy Test Product with free shipping',
          image: 'https://example.com/images/product.jpg',
          site: '@examplestore',
          creator: null,
        },
        jsonLd: [
          {
            '@type': 'Product',
            name: 'Test Product',
            description: 'A great test product',
            sku: 'TEST-001',
            offers: {
              price: 29.99,
              priceCurrency: 'USD',
              availability: 'https://schema.org/InStock',
            },
            aggregateRating: {
              ratingValue: 4.5,
              reviewCount: 100,
            },
          },
        ],
        productSchema: {
          '@type': 'Product',
          name: 'Test Product',
        },
        organizationSchema: {
          '@type': 'Organization',
          name: 'Example Store',
        },
        breadcrumbSchema: {
          '@type': 'BreadcrumbList',
          itemListElement: [],
        },
        collectionSchema: null,
        collection: null,
        product: {
          name: 'Test Product',
          description: 'A great test product',
          price: '29.99',
          currency: 'USD',
          sku: 'TEST-001',
          brand: 'Example Brand',
          tags: ['featured', 'sale'],
          categories: ['Electronics'],
          variants: [],
          availability: 'InStock',
          rating: { value: 4.5, count: 100 },
          images: ['https://example.com/images/product.jpg'],
        },
        pageType: 'product',
        platform: 'shopify',
      };

      const result = scoreMetadataCompleteness(metadata);

      expect(result.score).toBeGreaterThanOrEqual(90);
      expect(result.missing).toHaveLength(0);
      expect(result.breakdown.metaTags).toBe(25);
      expect(result.breakdown.openGraph).toBe(25);
      expect(result.breakdown.structuredData).toBeGreaterThanOrEqual(15);
    });

    it('should identify missing metadata', () => {
      const metadata: PageMetadataResult = {
        url: 'https://example.com/products/test',
        timestamp: new Date().toISOString(),
        success: true,
        pageTitle: '',
        metaTags: {
          title: null,
          description: null,
          keywords: null,
          robots: null,
          canonical: null,
          author: null,
          viewport: null,
        },
        openGraph: {
          title: null,
          description: null,
          image: null,
          url: null,
          type: null,
          siteName: null,
          locale: null,
          'product:price:amount': null,
          'product:price:currency': null,
        },
        twitterCard: {
          card: null,
          title: null,
          description: null,
          image: null,
          site: null,
          creator: null,
        },
        jsonLd: [],
        productSchema: null,
        organizationSchema: null,
        breadcrumbSchema: null,
        collectionSchema: null,
        product: null,
        collection: null,
        pageType: 'product',
        platform: 'unknown',
      };

      const result = scoreMetadataCompleteness(metadata);

      expect(result.score).toBeLessThan(20);
      expect(result.missing).toContain('meta title');
      expect(result.missing).toContain('meta description');
      expect(result.missing).toContain('canonical URL');
      expect(result.missing).toContain('og:title');
      expect(result.missing).toContain('og:description');
      expect(result.missing).toContain('og:image');
      expect(result.missing).toContain('JSON-LD structured data');
      expect(result.missing).toContain('Product schema');
    });

    it('should give full product score to non-product pages', () => {
      const metadata: PageMetadataResult = {
        url: 'https://example.com/',
        timestamp: new Date().toISOString(),
        success: true,
        pageTitle: 'Example Store',
        metaTags: {
          title: 'Example Store - Home',
          description: 'Welcome to Example Store',
          keywords: null,
          robots: null,
          canonical: 'https://example.com/',
          author: null,
          viewport: null,
        },
        openGraph: {
          title: 'Example Store',
          description: 'Welcome to Example Store',
          image: 'https://example.com/logo.jpg',
          url: 'https://example.com/',
          type: 'website',
          siteName: 'Example Store',
          locale: null,
          'product:price:amount': null,
          'product:price:currency': null,
        },
        twitterCard: {
          card: 'summary',
          title: 'Example Store',
          description: null,
          image: 'https://example.com/logo.jpg',
          site: null,
          creator: null,
        },
        jsonLd: [{ '@type': 'Organization', name: 'Example Store' }],
        productSchema: null,
        organizationSchema: { '@type': 'Organization', name: 'Example Store' },
        breadcrumbSchema: null,
        collectionSchema: null,
        product: null,
        collection: null,
        pageType: 'homepage',
        platform: 'shopify',
      };

      const result = scoreMetadataCompleteness(metadata);

      // Non-product pages should get full product score (15 points)
      expect(result.breakdown.productData).toBe(15);
      // Should not require Product schema for homepage
      expect(result.missing).not.toContain('Product schema');
    });

    it('should score partial metadata correctly', () => {
      const metadata: PageMetadataResult = {
        url: 'https://example.com/products/test',
        timestamp: new Date().toISOString(),
        success: true,
        pageTitle: 'Test Product',
        metaTags: {
          title: 'Test Product',
          description: 'A test product',
          keywords: null,
          robots: null,
          canonical: null, // Missing
          author: null,
          viewport: null,
        },
        openGraph: {
          title: 'Test Product',
          description: null, // Missing
          image: null, // Missing
          url: null,
          type: null,
          siteName: null,
          locale: null,
          'product:price:amount': null,
          'product:price:currency': null,
        },
        twitterCard: {
          card: null,
          title: null,
          description: null,
          image: null,
          site: null,
          creator: null,
        },
        jsonLd: [{ '@type': 'Product', name: 'Test' }],
        productSchema: { '@type': 'Product', name: 'Test' },
        organizationSchema: null,
        breadcrumbSchema: null,
        collectionSchema: null,
        product: {
          name: 'Test Product',
          description: null,
          price: '10.00',
          currency: null,
          sku: null,
          brand: null,
          tags: [],
          categories: [],
          variants: [],
          availability: null,
          rating: { value: null, count: null },
          images: [],
        },
        collection: null,
        pageType: 'product',
        platform: 'custom',
      };

      const result = scoreMetadataCompleteness(metadata);

      // Should have some score but not full
      expect(result.score).toBeGreaterThan(30);
      expect(result.score).toBeLessThan(70);

      // Check specific missing items
      expect(result.missing).toContain('canonical URL');
      expect(result.missing).toContain('og:description');
      expect(result.missing).toContain('og:image');
    });
  });

  describe('CollectionMetadata interface', () => {
    it('should have correct structure for collection pages', () => {
      const metadata: PageMetadataResult = {
        url: 'https://example.com/collections/shoes',
        timestamp: new Date().toISOString(),
        success: true,
        pageTitle: 'Shoes Collection - Example Store',
        metaTags: {
          title: 'Shoes Collection - Example Store',
          description: 'Browse our shoes collection',
          keywords: null,
          robots: null,
          canonical: 'https://example.com/collections/shoes',
          author: null,
          viewport: null,
        },
        openGraph: {
          title: 'Shoes Collection',
          description: 'Browse our shoes collection',
          image: 'https://example.com/images/shoes.jpg',
          url: 'https://example.com/collections/shoes',
          type: 'website',
          siteName: 'Example Store',
          locale: null,
          'product:price:amount': null,
          'product:price:currency': null,
        },
        twitterCard: {
          card: 'summary',
          title: 'Shoes Collection',
          description: null,
          image: null,
          site: null,
          creator: null,
        },
        jsonLd: [{
          '@type': 'ItemList',
          name: 'Shoes',
          numberOfItems: 24,
        }],
        productSchema: null,
        organizationSchema: null,
        breadcrumbSchema: null,
        collectionSchema: {
          '@type': 'ItemList',
          name: 'Shoes',
          numberOfItems: 24,
        },
        product: null,
        collection: {
          name: 'Shoes',
          description: 'Browse our shoes collection',
          productCount: 24,
          subcategories: ['Running', 'Casual', 'Formal'],
          productUrls: [
            'https://example.com/products/shoe-1',
            'https://example.com/products/shoe-2',
          ],
          breadcrumbs: ['Home', 'Shop', 'Shoes'],
          filters: ['Size', 'Color', 'Price'],
        },
        pageType: 'collection',
        platform: 'shopify',
      };

      // Verify collection metadata structure
      expect(metadata.collection).not.toBeNull();
      expect(metadata.collection?.name).toBe('Shoes');
      expect(metadata.collection?.productCount).toBe(24);
      expect(metadata.collection?.subcategories).toHaveLength(3);
      expect(metadata.collection?.productUrls).toHaveLength(2);
      expect(metadata.collection?.breadcrumbs).toContain('Shoes');
      expect(metadata.collection?.filters).toContain('Size');

      // Verify page type
      expect(metadata.pageType).toBe('collection');

      // Collection pages should get full product score
      const result = scoreMetadataCompleteness(metadata);
      expect(result.breakdown.productData).toBe(15);
    });
  });
});
