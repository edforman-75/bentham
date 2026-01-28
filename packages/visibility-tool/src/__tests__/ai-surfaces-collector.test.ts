/**
 * Tests for AI Surfaces Collector
 */

import { describe, it, expect } from 'vitest';
import {
  summarizeAISurfaceResults,
  filterCitationsForBrand as filterAISurfaceCitations,
  type AISurfaceResult,
  type AISurfaceCitation,
} from '../collectors/ai-surfaces-collector.js';

// Helper to create mock results
function createResult(overrides: Partial<AISurfaceResult> = {}): AISurfaceResult {
  return {
    surface: 'google-ai-overview',
    query: 'best running shoes',
    geo_location: '90210',
    response_text: 'Here are the best running shoes...',
    has_ai_response: true,
    citations: [],
    timestamp: new Date().toISOString(),
    success: true,
    ...overrides,
  };
}

// Helper to create mock citations
function createCitation(overrides: Partial<AISurfaceCitation> = {}): AISurfaceCitation {
  return {
    url: 'https://example.com/article',
    title: 'Example Article',
    domain: 'example.com',
    snippet: 'Some context about the citation',
    position: 1,
    ...overrides,
  };
}

describe('AI Surfaces Collector', () => {
  describe('summarizeAISurfaceResults', () => {
    it('should summarize empty results', () => {
      const summary = summarizeAISurfaceResults([]);

      expect(summary.total_queries).toBe(0);
      expect(summary.successful).toBe(0);
      expect(summary.failed).toBe(0);
      expect(summary.total_citations).toBe(0);
    });

    it('should count successful and failed queries', () => {
      const results: AISurfaceResult[] = [
        createResult({ success: true }),
        createResult({ success: true }),
        createResult({ success: false, error: 'API error' }),
      ];

      const summary = summarizeAISurfaceResults(results);

      expect(summary.total_queries).toBe(3);
      expect(summary.successful).toBe(2);
      expect(summary.failed).toBe(1);
    });

    it('should track surfaces with AI responses', () => {
      const results: AISurfaceResult[] = [
        createResult({ surface: 'google-ai-overview', has_ai_response: true }),
        createResult({ surface: 'google', has_ai_response: false }),
        createResult({ surface: 'perplexity', has_ai_response: true }),
      ];

      const summary = summarizeAISurfaceResults(results);

      expect(summary.surfaces_with_ai).toContain('google-ai-overview');
      expect(summary.surfaces_with_ai).toContain('perplexity');
      expect(summary.surfaces_with_ai).not.toContain('google');
    });

    it('should count citations by domain', () => {
      const results: AISurfaceResult[] = [
        createResult({
          citations: [
            createCitation({ domain: 'hoka.com' }),
            createCitation({ domain: 'hoka.com' }),
            createCitation({ domain: 'nike.com' }),
          ],
        }),
      ];

      const summary = summarizeAISurfaceResults(results);

      expect(summary.total_citations).toBe(3);
      expect(summary.citations_by_domain['hoka.com']).toBe(2);
      expect(summary.citations_by_domain['nike.com']).toBe(1);
    });

    it('should count citations by surface', () => {
      const results: AISurfaceResult[] = [
        createResult({
          surface: 'google-ai-overview',
          citations: [createCitation(), createCitation()],
        }),
        createResult({
          surface: 'perplexity',
          citations: [createCitation()],
        }),
      ];

      const summary = summarizeAISurfaceResults(results);

      expect(summary.citations_by_surface['google-ai-overview']).toBe(2);
      expect(summary.citations_by_surface['perplexity']).toBe(1);
    });
  });

  describe('filterAISurfaceCitations', () => {
    it('should filter citations matching brand domains', () => {
      const results: AISurfaceResult[] = [
        createResult({
          citations: [
            createCitation({ domain: 'hoka.com', url: 'https://hoka.com/running-shoes' }),
            createCitation({ domain: 'nike.com', url: 'https://nike.com/shoes' }),
            createCitation({ domain: 'runnersworld.com', url: 'https://runnersworld.com/review' }),
          ],
        }),
      ];

      const brandCitations = filterAISurfaceCitations(results, ['hoka.com']);

      expect(brandCitations).toHaveLength(1);
      expect(brandCitations[0].domain).toBe('hoka.com');
    });

    it('should match subdomains', () => {
      const results: AISurfaceResult[] = [
        createResult({
          citations: [
            createCitation({ domain: 'shop.hoka.com' }),
            createCitation({ domain: 'blog.hoka.com' }),
            createCitation({ domain: 'nike.com' }),
          ],
        }),
      ];

      const brandCitations = filterAISurfaceCitations(results, ['hoka.com']);

      expect(brandCitations).toHaveLength(2);
    });

    it('should be case insensitive', () => {
      const results: AISurfaceResult[] = [
        createResult({
          citations: [
            createCitation({ domain: 'HOKA.COM' }),
            createCitation({ domain: 'Hoka.com' }),
          ],
        }),
      ];

      const brandCitations = filterAISurfaceCitations(results, ['hoka.com']);

      expect(brandCitations).toHaveLength(2);
    });
  });

  describe('AISurfaceResult structure', () => {
    it('should have all required fields', () => {
      const result: AISurfaceResult = {
        surface: 'perplexity',
        query: 'best running shoes for marathon',
        geo_location: 'New York, NY',
        response_text: 'Based on my research, the best running shoes...',
        has_ai_response: true,
        citations: [
          {
            url: 'https://runnersworld.com/best-marathon-shoes',
            title: 'Best Marathon Shoes 2025',
            domain: 'runnersworld.com',
            snippet: 'Our experts tested...',
            position: 1,
          },
        ],
        timestamp: new Date().toISOString(),
        success: true,
      };

      expect(result.surface).toBe('perplexity');
      expect(result.has_ai_response).toBe(true);
      expect(result.citations).toHaveLength(1);
    });

    it('should allow organic results for search surfaces', () => {
      const result: AISurfaceResult = {
        surface: 'google',
        query: 'running shoes',
        response_text: '',
        has_ai_response: false,
        citations: [],
        organic_results: [
          { position: 1, url: 'https://example.com', title: 'Example', snippet: 'Test' },
          { position: 2, url: 'https://example2.com', title: 'Example 2', snippet: 'Test 2' },
        ],
        timestamp: new Date().toISOString(),
        success: true,
      };

      expect(result.organic_results).toHaveLength(2);
    });
  });
});
