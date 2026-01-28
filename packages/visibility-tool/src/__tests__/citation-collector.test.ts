/**
 * Tests for Citation Collector
 */

import { describe, it, expect } from 'vitest';
import {
  summarizeCitations,
  filterCitationsForBrand,
  type CitationResult,
  type Citation,
} from '../collectors/citation-collector.js';

// Helper to create mock citations
function createCitation(overrides: Partial<Citation> = {}): Citation {
  return {
    url: 'https://example.com/article',
    title: 'Example Article',
    domain: 'example.com',
    context: 'Some context about the citation',
    position: 1,
    surface: 'perplexity',
    ...overrides,
  };
}

// Helper to create mock results
function createResult(overrides: Partial<CitationResult> = {}): CitationResult {
  return {
    query: 'test query',
    responseText: 'Test response with citations',
    citations: [],
    timestamp: new Date().toISOString(),
    surface: 'perplexity',
    success: true,
    ...overrides,
  };
}

describe('Citation Collector', () => {
  describe('summarizeCitations', () => {
    it('should summarize empty results', () => {
      const summary = summarizeCitations([]);

      expect(summary.totalQueries).toBe(0);
      expect(summary.totalCitations).toBe(0);
      expect(summary.uniqueDomains).toHaveLength(0);
    });

    it('should count total citations', () => {
      const results: CitationResult[] = [
        createResult({
          citations: [
            createCitation({ domain: 'site1.com' }),
            createCitation({ domain: 'site2.com' }),
          ],
        }),
        createResult({
          citations: [
            createCitation({ domain: 'site1.com' }),
            createCitation({ domain: 'site3.com' }),
          ],
        }),
      ];

      const summary = summarizeCitations(results);

      expect(summary.totalQueries).toBe(2);
      expect(summary.totalCitations).toBe(4);
      expect(summary.uniqueDomains).toHaveLength(3);
      expect(summary.uniqueDomains).toContain('site1.com');
      expect(summary.uniqueDomains).toContain('site2.com');
      expect(summary.uniqueDomains).toContain('site3.com');
    });

    it('should count citations by domain', () => {
      const results: CitationResult[] = [
        createResult({
          citations: [
            createCitation({ domain: 'popular.com' }),
            createCitation({ domain: 'popular.com' }),
            createCitation({ domain: 'rare.com' }),
          ],
        }),
      ];

      const summary = summarizeCitations(results);

      expect(summary.citationsByDomain['popular.com']).toBe(2);
      expect(summary.citationsByDomain['rare.com']).toBe(1);
    });

    it('should count citations by surface', () => {
      const results: CitationResult[] = [
        createResult({
          citations: [
            createCitation({ surface: 'perplexity' }),
            createCitation({ surface: 'perplexity' }),
            createCitation({ surface: 'google-ai-overview' }),
          ],
        }),
      ];

      const summary = summarizeCitations(results);

      expect(summary.citationsBySurface['perplexity']).toBe(2);
      expect(summary.citationsBySurface['google-ai-overview']).toBe(1);
    });
  });

  describe('filterCitationsForBrand', () => {
    it('should filter citations matching brand domains', () => {
      const results: CitationResult[] = [
        createResult({
          citations: [
            createCitation({ domain: 'hoka.com', url: 'https://hoka.com/running-shoes' }),
            createCitation({ domain: 'nike.com', url: 'https://nike.com/shoes' }),
            createCitation({ domain: 'runnersworld.com', url: 'https://runnersworld.com/review' }),
          ],
        }),
      ];

      const brandCitations = filterCitationsForBrand(results, ['hoka.com']);

      expect(brandCitations).toHaveLength(1);
      expect(brandCitations[0].domain).toBe('hoka.com');
    });

    it('should match subdomains', () => {
      const results: CitationResult[] = [
        createResult({
          citations: [
            createCitation({ domain: 'shop.hoka.com' }),
            createCitation({ domain: 'blog.hoka.com' }),
            createCitation({ domain: 'nike.com' }),
          ],
        }),
      ];

      const brandCitations = filterCitationsForBrand(results, ['hoka.com']);

      expect(brandCitations).toHaveLength(2);
    });

    it('should be case insensitive', () => {
      const results: CitationResult[] = [
        createResult({
          citations: [
            createCitation({ domain: 'HOKA.COM' }),
            createCitation({ domain: 'Hoka.com' }),
          ],
        }),
      ];

      const brandCitations = filterCitationsForBrand(results, ['hoka.com']);

      expect(brandCitations).toHaveLength(2);
    });

    it('should return empty for no matches', () => {
      const results: CitationResult[] = [
        createResult({
          citations: [
            createCitation({ domain: 'competitor.com' }),
          ],
        }),
      ];

      const brandCitations = filterCitationsForBrand(results, ['hoka.com']);

      expect(brandCitations).toHaveLength(0);
    });

    it('should handle multiple brand domains', () => {
      const results: CitationResult[] = [
        createResult({
          citations: [
            createCitation({ domain: 'hoka.com' }),
            createCitation({ domain: 'hoka.eu' }),
            createCitation({ domain: 'nike.com' }),
          ],
        }),
      ];

      const brandCitations = filterCitationsForBrand(results, ['hoka.com', 'hoka.eu']);

      expect(brandCitations).toHaveLength(2);
    });
  });

  describe('Citation type structure', () => {
    it('should have all required fields', () => {
      const citation: Citation = {
        url: 'https://example.com/page',
        title: 'Page Title',
        domain: 'example.com',
        context: 'The context around this citation',
        position: 1,
        surface: 'perplexity',
      };

      expect(citation.url).toBeDefined();
      expect(citation.domain).toBeDefined();
      expect(citation.position).toBeDefined();
      expect(citation.surface).toBeDefined();
    });

    it('should allow null title and context', () => {
      const citation: Citation = {
        url: 'https://example.com/page',
        title: null,
        domain: 'example.com',
        context: null,
        position: 1,
        surface: 'google-featured-snippet',
      };

      expect(citation.title).toBeNull();
      expect(citation.context).toBeNull();
    });
  });

  describe('CitationResult type structure', () => {
    it('should have all required fields for success', () => {
      const result: CitationResult = {
        query: 'best running shoes',
        responseText: 'Here are the best running shoes...',
        citations: [createCitation()],
        timestamp: new Date().toISOString(),
        surface: 'perplexity',
        success: true,
      };

      expect(result.query).toBeDefined();
      expect(result.responseText).toBeDefined();
      expect(result.citations).toHaveLength(1);
      expect(result.success).toBe(true);
    });

    it('should have error field for failures', () => {
      const result: CitationResult = {
        query: 'test query',
        responseText: '',
        citations: [],
        timestamp: new Date().toISOString(),
        surface: 'perplexity',
        success: false,
        error: 'API key not provided',
      };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
