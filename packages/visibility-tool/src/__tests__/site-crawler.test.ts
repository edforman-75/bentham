/**
 * Tests for Site Crawler
 */

import { describe, it, expect } from 'vitest';
import {
  classifyPageType,
  summarizeDiscoveredPages,
  filterPagesByType,
  getPagesByType,
  type DiscoveredPage,
  type PageType,
} from '../collectors/site-crawler.js';

describe('Site Crawler', () => {
  describe('classifyPageType', () => {
    it('should classify product pages', () => {
      expect(classifyPageType('https://example.com/products/blue-widget')).toBe('product');
      expect(classifyPageType('https://example.com/product/12345')).toBe('product');
      expect(classifyPageType('https://example.com/p/widget')).toBe('product');
      expect(classifyPageType('https://example.com/item/abc123')).toBe('product');
      expect(classifyPageType('https://amazon.com/dp/B0123456789')).toBe('product');
    });

    it('should classify collection/category pages', () => {
      expect(classifyPageType('https://example.com/collections/shoes')).toBe('collection');
      expect(classifyPageType('https://example.com/collection/running')).toBe('collection');
      expect(classifyPageType('https://example.com/category/electronics')).toBe('collection');
      expect(classifyPageType('https://example.com/c/apparel')).toBe('collection');
      expect(classifyPageType('https://example.com/shop')).toBe('collection');
      expect(classifyPageType('https://example.com/catalog/new')).toBe('collection');
    });

    it('should classify article pages', () => {
      expect(classifyPageType('https://example.com/blog/how-to-run')).toBe('article');
      expect(classifyPageType('https://example.com/article/fitness-tips')).toBe('article');
      expect(classifyPageType('https://example.com/news/product-launch')).toBe('article');
      expect(classifyPageType('https://example.com/post/update')).toBe('article');
    });

    it('should classify blog index pages', () => {
      expect(classifyPageType('https://example.com/blog')).toBe('blog-index');
      expect(classifyPageType('https://example.com/blog/')).toBe('blog-index');
      expect(classifyPageType('https://example.com/news')).toBe('blog-index');
      expect(classifyPageType('https://example.com/articles')).toBe('blog-index');
    });

    it('should classify FAQ pages', () => {
      expect(classifyPageType('https://example.com/faq')).toBe('faq');
      expect(classifyPageType('https://example.com/frequently-asked-questions')).toBe('faq');
      expect(classifyPageType('https://example.com/help')).toBe('faq');
      expect(classifyPageType('https://example.com/support')).toBe('faq');
    });

    it('should classify landing pages', () => {
      expect(classifyPageType('https://example.com/landing/summer-sale')).toBe('landing');
      expect(classifyPageType('https://example.com/lp/promo')).toBe('landing');
      expect(classifyPageType('https://example.com/campaign/holiday')).toBe('landing');
      expect(classifyPageType('https://example.com/sale')).toBe('landing');
    });

    it('should classify policy pages', () => {
      expect(classifyPageType('https://example.com/privacy')).toBe('policy');
      expect(classifyPageType('https://example.com/privacy-policy')).toBe('policy');
      expect(classifyPageType('https://example.com/terms-and-conditions')).toBe('policy');
      expect(classifyPageType('https://example.com/shipping-policy')).toBe('policy');
      expect(classifyPageType('https://example.com/returns')).toBe('policy');
    });

    it('should classify contact pages', () => {
      expect(classifyPageType('https://example.com/contact')).toBe('contact');
      expect(classifyPageType('https://example.com/contact-us')).toBe('contact');
      expect(classifyPageType('https://example.com/store-locator')).toBe('contact');
      expect(classifyPageType('https://example.com/locations')).toBe('contact');
    });

    it('should classify about pages', () => {
      expect(classifyPageType('https://example.com/about')).toBe('about');
      expect(classifyPageType('https://example.com/about-us')).toBe('about');
      expect(classifyPageType('https://example.com/our-story')).toBe('about');
      expect(classifyPageType('https://example.com/company')).toBe('about');
    });

    it('should classify homepage', () => {
      expect(classifyPageType('https://example.com/')).toBe('homepage');
      expect(classifyPageType('https://example.com')).toBe('homepage');
    });

    it('should classify unknown pages as other', () => {
      expect(classifyPageType('https://example.com/random-page')).toBe('other');
      expect(classifyPageType('https://example.com/xyz/abc/def')).toBe('other');
    });

    it('should handle invalid URLs gracefully', () => {
      expect(classifyPageType('not-a-url')).toBe('other');
      expect(classifyPageType('')).toBe('other');
    });
  });

  describe('summarizeDiscoveredPages', () => {
    const createPage = (type: PageType, source: 'sitemap' | 'crawl' | 'link'): DiscoveredPage => ({
      url: `https://example.com/${type}/${Math.random()}`,
      title: `${type} page`,
      pageType: type,
      lastModified: null,
      priority: null,
      source,
    });

    it('should summarize pages by type', () => {
      const pages: DiscoveredPage[] = [
        createPage('product', 'sitemap'),
        createPage('product', 'sitemap'),
        createPage('product', 'crawl'),
        createPage('collection', 'sitemap'),
        createPage('article', 'link'),
        createPage('faq', 'crawl'),
      ];

      const summary = summarizeDiscoveredPages(pages);

      expect(summary.total).toBe(6);
      expect(summary.byType.product).toBe(3);
      expect(summary.byType.collection).toBe(1);
      expect(summary.byType.article).toBe(1);
      expect(summary.byType.faq).toBe(1);
      expect(summary.byType.homepage).toBe(0);
    });

    it('should summarize pages by source', () => {
      const pages: DiscoveredPage[] = [
        createPage('product', 'sitemap'),
        createPage('product', 'sitemap'),
        createPage('product', 'crawl'),
        createPage('collection', 'link'),
        createPage('article', 'link'),
      ];

      const summary = summarizeDiscoveredPages(pages);

      expect(summary.bySource.sitemap).toBe(2);
      expect(summary.bySource.crawl).toBe(1);
      expect(summary.bySource.link).toBe(2);
    });

    it('should handle empty list', () => {
      const summary = summarizeDiscoveredPages([]);

      expect(summary.total).toBe(0);
      expect(summary.byType.product).toBe(0);
      expect(summary.bySource.sitemap).toBe(0);
    });
  });

  describe('filterPagesByType', () => {
    const pages: DiscoveredPage[] = [
      { url: 'https://example.com/products/a', title: 'A', pageType: 'product', lastModified: null, priority: null, source: 'sitemap' },
      { url: 'https://example.com/products/b', title: 'B', pageType: 'product', lastModified: null, priority: null, source: 'sitemap' },
      { url: 'https://example.com/blog/x', title: 'X', pageType: 'article', lastModified: null, priority: null, source: 'crawl' },
      { url: 'https://example.com/faq', title: 'FAQ', pageType: 'faq', lastModified: null, priority: null, source: 'link' },
    ];

    it('should filter by single type', () => {
      const filtered = filterPagesByType(pages, ['product']);
      expect(filtered).toHaveLength(2);
      expect(filtered.every(p => p.pageType === 'product')).toBe(true);
    });

    it('should filter by multiple types', () => {
      const filtered = filterPagesByType(pages, ['product', 'article']);
      expect(filtered).toHaveLength(3);
    });

    it('should return empty for non-matching type', () => {
      const filtered = filterPagesByType(pages, ['homepage']);
      expect(filtered).toHaveLength(0);
    });
  });

  describe('getPagesByType', () => {
    const pages: DiscoveredPage[] = [
      { url: 'https://example.com/products/a', title: 'A', pageType: 'product', lastModified: null, priority: null, source: 'sitemap' },
      { url: 'https://example.com/products/b', title: 'B', pageType: 'product', lastModified: null, priority: null, source: 'sitemap' },
      { url: 'https://example.com/blog/x', title: 'X', pageType: 'article', lastModified: null, priority: null, source: 'crawl' },
    ];

    it('should get pages of specific type', () => {
      const products = getPagesByType(pages, 'product');
      expect(products).toHaveLength(2);

      const articles = getPagesByType(pages, 'article');
      expect(articles).toHaveLength(1);

      const faqs = getPagesByType(pages, 'faq');
      expect(faqs).toHaveLength(0);
    });
  });
});
