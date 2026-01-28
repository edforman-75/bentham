/**
 * Tests for LLM Reachability Collector
 */

import { describe, it, expect } from 'vitest';
import { summarizeReachability, type ReachabilityResult, type PageContent } from '../collectors/reachability-collector.js';

// Helper to create mock PageContent
function createPageContent(overrides: Partial<PageContent> = {}): PageContent {
  return {
    title: 'Test Page',
    description: 'Test description',
    h1: ['Main Heading'],
    h2: ['Sub heading'],
    textContent: 'This is test content with enough words to count.',
    wordCount: 10,
    productName: null,
    productPrice: null,
    productDescription: null,
    jsonLdTypes: [],
    imagesWithAlt: 5,
    imagesWithoutAlt: 2,
    linkCount: 10,
    metaRobots: null,
    canonical: 'https://example.com/test',
    ...overrides,
  };
}

// Helper to create mock ReachabilityResult
function createResult(overrides: Partial<ReachabilityResult> = {}): ReachabilityResult {
  return {
    url: 'https://example.com/test',
    timestamp: new Date().toISOString(),
    success: true,
    rawContent: createPageContent(),
    renderedContent: createPageContent(),
    comparisons: [],
    reachabilityScore: 80,
    isDarkToAI: false,
    issues: [],
    recommendations: [],
    ...overrides,
  };
}

describe('LLM Reachability Collector', () => {
  describe('summarizeReachability', () => {
    it('should summarize successful results', () => {
      const results: ReachabilityResult[] = [
        createResult({ reachabilityScore: 90 }),
        createResult({ reachabilityScore: 70 }),
        createResult({ reachabilityScore: 80 }),
      ];

      const summary = summarizeReachability(results);

      expect(summary.totalPages).toBe(3);
      expect(summary.successfulAnalysis).toBe(3);
      expect(summary.darkToAI).toBe(0);
      expect(summary.averageScore).toBe(80);
    });

    it('should count dark pages', () => {
      const results: ReachabilityResult[] = [
        createResult({ reachabilityScore: 90, isDarkToAI: false }),
        createResult({ reachabilityScore: 20, isDarkToAI: true }),
        createResult({ reachabilityScore: 30, isDarkToAI: true }),
      ];

      const summary = summarizeReachability(results);

      expect(summary.darkToAI).toBe(2);
    });

    it('should aggregate common issues', () => {
      const results: ReachabilityResult[] = [
        createResult({ issues: ['Missing title', 'No structured data'] }),
        createResult({ issues: ['Missing title', 'JS-dependent content'] }),
        createResult({ issues: ['Missing title'] }),
      ];

      const summary = summarizeReachability(results);

      expect(summary.commonIssues[0].issue).toBe('Missing title');
      expect(summary.commonIssues[0].count).toBe(3);
    });

    it('should handle failed results', () => {
      const results: ReachabilityResult[] = [
        createResult({ success: true, reachabilityScore: 80 }),
        createResult({ success: false, reachabilityScore: 0 }),
      ];

      const summary = summarizeReachability(results);

      expect(summary.totalPages).toBe(2);
      expect(summary.successfulAnalysis).toBe(1);
      expect(summary.averageScore).toBe(80); // Only counts successful
    });

    it('should handle empty results', () => {
      const summary = summarizeReachability([]);

      expect(summary.totalPages).toBe(0);
      expect(summary.successfulAnalysis).toBe(0);
      expect(summary.averageScore).toBe(0);
    });
  });

  describe('PageContent comparison scenarios', () => {
    it('should identify JS-dependent content', () => {
      const raw = createPageContent({
        wordCount: 50,
        h1: [],
        productName: null,
      });

      const rendered = createPageContent({
        wordCount: 500,
        h1: ['Product Title'],
        productName: 'Great Product',
      });

      // Raw has only 10% of content - this would be "dark to AI"
      const ratio = raw.wordCount / rendered.wordCount;
      expect(ratio).toBe(0.1);
    });

    it('should identify server-side rendered content', () => {
      const raw = createPageContent({
        wordCount: 500,
        h1: ['Product Title'],
        productName: 'Great Product',
        jsonLdTypes: ['Product', 'Organization'],
      });

      const rendered = createPageContent({
        wordCount: 520, // Slightly more after JS (ads, etc.)
        h1: ['Product Title'],
        productName: 'Great Product',
        jsonLdTypes: ['Product', 'Organization'],
      });

      // Raw has most content - good SSR
      const ratio = raw.wordCount / rendered.wordCount;
      expect(ratio).toBeGreaterThan(0.9);
    });

    it('should detect noindex directive', () => {
      const content = createPageContent({
        metaRobots: 'noindex, nofollow',
      });

      expect(content.metaRobots?.toLowerCase().includes('noindex')).toBe(true);
    });
  });
});
