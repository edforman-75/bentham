/**
 * Tests for Oxylabs Collector
 */

import { describe, it, expect } from 'vitest';
import {
  summarizeResults,
  type OxylabsResult,
  type AmazonRequest,
} from '../collectors/oxylabs-collector.js';

// Helper to create mock results
function createResult(overrides: Partial<OxylabsResult> = {}): OxylabsResult {
  return {
    request: {
      source: 'amazon_product',
      query: 'B07FZ8S74R',
      parse: true,
    } as AmazonRequest,
    geo_location: '90210',
    data: { title: 'Test Product' },
    job_id: 'job_123',
    timestamp: new Date().toISOString(),
    success: true,
    status_code: 200,
    ...overrides,
  };
}

describe('Oxylabs Collector', () => {
  describe('summarizeResults', () => {
    it('should summarize empty results', () => {
      const summary = summarizeResults([]);

      expect(summary.total).toBe(0);
      expect(summary.successful).toBe(0);
      expect(summary.failed).toBe(0);
      expect(Object.keys(summary.byLocation)).toHaveLength(0);
    });

    it('should count successful and failed results', () => {
      const results: OxylabsResult[] = [
        createResult({ success: true }),
        createResult({ success: true }),
        createResult({ success: false, error: 'API error' }),
      ];

      const summary = summarizeResults(results);

      expect(summary.total).toBe(3);
      expect(summary.successful).toBe(2);
      expect(summary.failed).toBe(1);
      expect(summary.errors).toContain('API error');
    });

    it('should group by location', () => {
      const results: OxylabsResult[] = [
        createResult({ geo_location: '90210' }),
        createResult({ geo_location: '90210' }),
        createResult({ geo_location: '10001' }),
        createResult({ geo_location: undefined }),
      ];

      const summary = summarizeResults(results);

      expect(summary.byLocation['90210']).toBe(2);
      expect(summary.byLocation['10001']).toBe(1);
      expect(summary.byLocation['default']).toBe(1);
    });

    it('should group by source', () => {
      const results: OxylabsResult[] = [
        createResult({
          request: { source: 'amazon_product', query: 'B123', parse: true } as AmazonRequest,
        }),
        createResult({
          request: { source: 'amazon_product', query: 'B456', parse: true } as AmazonRequest,
        }),
        createResult({
          request: { source: 'amazon_search', query: 'shoes', parse: true } as AmazonRequest,
        }),
      ];

      const summary = summarizeResults(results);

      expect(summary.bySource['amazon_product']).toBe(2);
      expect(summary.bySource['amazon_search']).toBe(1);
    });
  });

  describe('Request types', () => {
    it('should have correct Amazon request structure', () => {
      const request: AmazonRequest = {
        source: 'amazon_product',
        query: 'B07FZ8S74R',
        domain: 'in',
        geo_location: 'Mumbai, India',
        parse: true,
      };

      expect(request.source).toBe('amazon_product');
      expect(request.domain).toBe('in');
      expect(request.geo_location).toBe('Mumbai, India');
    });
  });

  describe('Result structure', () => {
    it('should have all required fields for success', () => {
      const result: OxylabsResult = {
        request: {
          source: 'amazon_product',
          query: 'B07FZ8S74R',
          parse: true,
        } as AmazonRequest,
        geo_location: '90210',
        data: { title: 'Test Product', price: 29.99 },
        job_id: 'job_abc123',
        timestamp: new Date().toISOString(),
        success: true,
        status_code: 200,
      };

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.job_id).toBeDefined();
    });

    it('should have error field for failures', () => {
      const result: OxylabsResult = {
        request: {
          source: 'amazon_product',
          query: 'INVALID',
          parse: true,
        } as AmazonRequest,
        data: null,
        job_id: '',
        timestamp: new Date().toISOString(),
        success: false,
        error: 'Product not found',
        status_code: 404,
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe('Product not found');
    });
  });
});
