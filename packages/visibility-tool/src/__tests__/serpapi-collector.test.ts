/**
 * Tests for SerpApi Collector
 */

import { describe, it, expect } from 'vitest';
import {
  summarizeSerpApiResults,
  filterCitationsForBrand as filterSerpApiCitations,
  type SerpApiResult,
} from '../collectors/serpapi-collector.js';

// Helper to create mock results
function createResult(overrides: Partial<SerpApiResult> = {}): SerpApiResult {
  return {
    engine: 'google',
    query: 'best running shoes',
    location: 'California, United States',
    has_ai_response: true,
    ai_response_text: 'Here are the best running shoes...',
    citations: [],
    organic_results: [],
    timestamp: new Date().toISOString(),
    success: true,
    ...overrides,
  };
}

describe('SerpApi Collector', () => {
  describe('summarizeSerpApiResults', () => {
    it('should summarize empty results', () => {
      const summary = summarizeSerpApiResults([]);

      expect(summary.total_queries).toBe(0);
      expect(summary.successful).toBe(0);
      expect(summary.failed).toBe(0);
      expect(summary.total_citations).toBe(0);
    });

    it('should count successful and failed queries', () => {
      const results: SerpApiResult[] = [
        createResult({ success: true }),
        createResult({ success: true }),
        createResult({ success: false, error: 'API error' }),
      ];

      const summary = summarizeSerpApiResults(results);

      expect(summary.total_queries).toBe(3);
      expect(summary.successful).toBe(2);
      expect(summary.failed).toBe(1);
    });

    it('should track engines with AI responses', () => {
      const results: SerpApiResult[] = [
        createResult({ engine: 'google', has_ai_response: true }),
        createResult({ engine: 'bing', has_ai_response: false }),
        createResult({ engine: 'bing_copilot', has_ai_response: true }),
      ];

      const summary = summarizeSerpApiResults(results);

      expect(summary.engines_with_ai).toContain('google');
      expect(summary.engines_with_ai).toContain('bing_copilot');
      expect(summary.engines_with_ai).not.toContain('bing');
    });

    it('should count citations by domain', () => {
      const results: SerpApiResult[] = [
        createResult({
          citations: [
            { position: 1, title: 'Test', url: 'https://hoka.com/shoes', domain: 'hoka.com', snippet: null },
            { position: 2, title: 'Test', url: 'https://hoka.com/altra', domain: 'hoka.com', snippet: null },
            { position: 3, title: 'Test', url: 'https://nike.com/shoes', domain: 'nike.com', snippet: null },
          ],
        }),
      ];

      const summary = summarizeSerpApiResults(results);

      expect(summary.total_citations).toBe(3);
      expect(summary.citations_by_domain['hoka.com']).toBe(2);
      expect(summary.citations_by_domain['nike.com']).toBe(1);
    });

    it('should count citations by engine', () => {
      const results: SerpApiResult[] = [
        createResult({
          engine: 'google',
          citations: [
            { position: 1, title: 'Test', url: 'https://example.com', domain: 'example.com', snippet: null },
            { position: 2, title: 'Test', url: 'https://example2.com', domain: 'example2.com', snippet: null },
          ],
        }),
        createResult({
          engine: 'bing_copilot',
          citations: [
            { position: 1, title: 'Test', url: 'https://example3.com', domain: 'example3.com', snippet: null },
          ],
        }),
      ];

      const summary = summarizeSerpApiResults(results);

      expect(summary.citations_by_engine['google']).toBe(2);
      expect(summary.citations_by_engine['bing_copilot']).toBe(1);
    });
  });

  describe('filterSerpApiCitations', () => {
    it('should filter citations matching brand domains', () => {
      const results: SerpApiResult[] = [
        createResult({
          citations: [
            { position: 1, title: 'Hoka Shoes', url: 'https://hoka.com/running', domain: 'hoka.com', snippet: null },
            { position: 2, title: 'Nike Shoes', url: 'https://nike.com/running', domain: 'nike.com', snippet: null },
            { position: 3, title: 'Review', url: 'https://runnersworld.com', domain: 'runnersworld.com', snippet: null },
          ],
        }),
      ];

      const brandCitations = filterSerpApiCitations(results, ['hoka.com']);

      expect(brandCitations).toHaveLength(1);
      expect(brandCitations[0].domain).toBe('hoka.com');
    });

    it('should match subdomains', () => {
      const results: SerpApiResult[] = [
        createResult({
          citations: [
            { position: 1, title: 'Shop', url: 'https://shop.hoka.com', domain: 'shop.hoka.com', snippet: null },
            { position: 2, title: 'Blog', url: 'https://blog.hoka.com', domain: 'blog.hoka.com', snippet: null },
            { position: 3, title: 'Nike', url: 'https://nike.com', domain: 'nike.com', snippet: null },
          ],
        }),
      ];

      const brandCitations = filterSerpApiCitations(results, ['hoka.com']);

      expect(brandCitations).toHaveLength(2);
    });
  });

  describe('SerpApiResult structure', () => {
    it('should have correct structure for Google with AI Overview', () => {
      const result: SerpApiResult = {
        engine: 'google',
        query: 'best running shoes',
        location: 'New York, NY',
        has_ai_response: true,
        ai_response_text: 'Based on expert reviews, the best running shoes are...',
        citations: [
          {
            position: 1,
            title: 'Best Running Shoes 2025',
            url: 'https://runnersworld.com/best-shoes',
            domain: 'runnersworld.com',
            snippet: 'Our experts tested over 100 shoes...',
          },
        ],
        organic_results: [
          {
            position: 1,
            title: 'Running Shoes | Nike.com',
            link: 'https://nike.com/running-shoes',
            snippet: 'Shop the latest running shoes...',
          },
        ],
        related_questions: [
          {
            question: 'What are the best running shoes for beginners?',
            snippet: 'For beginners, we recommend...',
            link: 'https://example.com/beginners',
          },
        ],
        timestamp: new Date().toISOString(),
        success: true,
      };

      expect(result.engine).toBe('google');
      expect(result.has_ai_response).toBe(true);
      expect(result.citations).toHaveLength(1);
      expect(result.organic_results).toHaveLength(1);
      expect(result.related_questions).toHaveLength(1);
    });

    it('should have correct structure for Bing Copilot', () => {
      const result: SerpApiResult = {
        engine: 'bing_copilot',
        query: 'how to make sourdough starter',
        has_ai_response: true,
        ai_response_text: 'To make a sourdough starter, you need flour and water...',
        citations: [
          {
            position: 1,
            title: 'Sourdough Starter Recipe',
            url: 'https://kingarthurbaking.com/recipes/sourdough-starter',
            domain: 'kingarthurbaking.com',
            snippet: 'Mix equal parts flour and water...',
          },
        ],
        organic_results: [],
        timestamp: new Date().toISOString(),
        success: true,
      };

      expect(result.engine).toBe('bing_copilot');
      expect(result.has_ai_response).toBe(true);
      expect(result.ai_response_text).toContain('sourdough');
    });
  });
});
