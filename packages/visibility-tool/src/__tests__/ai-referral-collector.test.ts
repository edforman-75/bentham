/**
 * Tests for AI Referral Traffic Collector
 */

import { describe, it, expect } from 'vitest';
import {
  matchAISource,
  isAIReferrer,
  getKnownAISources,
  AI_REFERRAL_SOURCES,
  type PagePerformanceEntry,
  type PagePerformanceResult,
} from '../collectors/ai-referral-collector.js';

describe('AI Referral Collector', () => {
  describe('matchAISource', () => {
    it('should match ChatGPT sources', () => {
      expect(matchAISource('chat.openai.com')).toEqual({ name: 'ChatGPT', type: 'chatbot' });
      expect(matchAISource('chatgpt.com')).toEqual({ name: 'ChatGPT', type: 'chatbot' });
      expect(matchAISource('https://chat.openai.com/share/abc')).toEqual({ name: 'ChatGPT', type: 'chatbot' });
    });

    it('should match Claude sources', () => {
      expect(matchAISource('claude.ai')).toEqual({ name: 'Claude', type: 'chatbot' });
      expect(matchAISource('https://claude.ai/chat/123')).toEqual({ name: 'Claude', type: 'chatbot' });
    });

    it('should match Perplexity sources', () => {
      expect(matchAISource('perplexity.ai')).toEqual({ name: 'Perplexity', type: 'search' });
      expect(matchAISource('www.perplexity.ai')).toEqual({ name: 'Perplexity', type: 'search' });
    });

    it('should match Google AI sources', () => {
      expect(matchAISource('gemini.google.com')).toEqual({ name: 'Gemini', type: 'chatbot' });
      expect(matchAISource('bard.google.com')).toEqual({ name: 'Bard', type: 'chatbot' });
    });

    it('should match Bing/Copilot sources', () => {
      expect(matchAISource('bing.com')).toEqual({ name: 'Bing/Copilot', type: 'search' });
      expect(matchAISource('copilot.microsoft.com')).toEqual({ name: 'Copilot', type: 'chatbot' });
    });

    it('should match other AI sources', () => {
      expect(matchAISource('you.com')).toEqual({ name: 'You.com', type: 'search' });
      expect(matchAISource('phind.com')).toEqual({ name: 'Phind', type: 'search' });
      expect(matchAISource('search.brave.com')).toEqual({ name: 'Brave Search', type: 'search' });
    });

    it('should match Meta AI', () => {
      expect(matchAISource('meta.ai')).toEqual({ name: 'Meta AI', type: 'chatbot' });
    });

    it('should match alternate domains', () => {
      expect(matchAISource('claude.com')).toEqual({ name: 'Claude', type: 'chatbot' });
      expect(matchAISource('perplexity.com')).toEqual({ name: 'Perplexity', type: 'search' });
      expect(matchAISource('copilot.com')).toEqual({ name: 'Copilot', type: 'chatbot' });
    });

    it('should return unknown for non-AI sources', () => {
      expect(matchAISource('google.com')).toEqual({ name: null, type: 'unknown' });
      expect(matchAISource('facebook.com')).toEqual({ name: null, type: 'unknown' });
      expect(matchAISource('twitter.com')).toEqual({ name: null, type: 'unknown' });
      expect(matchAISource('reddit.com')).toEqual({ name: null, type: 'unknown' });
    });

    it('should be case insensitive', () => {
      expect(matchAISource('CHAT.OPENAI.COM')).toEqual({ name: 'ChatGPT', type: 'chatbot' });
      expect(matchAISource('Perplexity.AI')).toEqual({ name: 'Perplexity', type: 'search' });
    });
  });

  describe('isAIReferrer', () => {
    it('should return true for known AI referrers', () => {
      expect(isAIReferrer('chat.openai.com')).toBe(true);
      expect(isAIReferrer('claude.ai')).toBe(true);
      expect(isAIReferrer('perplexity.ai')).toBe(true);
      expect(isAIReferrer('bing.com')).toBe(true);
    });

    it('should return false for non-AI referrers', () => {
      expect(isAIReferrer('google.com')).toBe(false);
      expect(isAIReferrer('facebook.com')).toBe(false);
      expect(isAIReferrer('direct')).toBe(false);
      expect(isAIReferrer('(none)')).toBe(false);
    });
  });

  describe('getKnownAISources', () => {
    it('should return all known AI sources', () => {
      const sources = getKnownAISources();
      expect(sources.length).toBe(AI_REFERRAL_SOURCES.length);
      expect(sources.length).toBeGreaterThan(10);
    });

    it('should include major AI platforms', () => {
      const sources = getKnownAISources();
      const domains = sources.map(s => s.domain);

      expect(domains).toContain('chat.openai.com');
      expect(domains).toContain('claude.ai');
      expect(domains).toContain('perplexity.ai');
      expect(domains).toContain('gemini.google.com');
      expect(domains).toContain('bing.com');
    });

    it('should categorize sources correctly', () => {
      const sources = getKnownAISources();

      const chatbots = sources.filter(s => s.type === 'chatbot');
      const searchEngines = sources.filter(s => s.type === 'search');

      expect(chatbots.length).toBeGreaterThan(0);
      expect(searchEngines.length).toBeGreaterThan(0);

      // ChatGPT should be a chatbot
      expect(chatbots.some(s => s.name === 'ChatGPT')).toBe(true);

      // Perplexity should be a search engine
      expect(searchEngines.some(s => s.name === 'Perplexity')).toBe(true);
    });
  });

  describe('AI_REFERRAL_SOURCES constant', () => {
    it('should have required fields for each source', () => {
      for (const source of AI_REFERRAL_SOURCES) {
        expect(source.domain).toBeDefined();
        expect(source.domain.length).toBeGreaterThan(0);
        expect(source.name).toBeDefined();
        expect(source.name.length).toBeGreaterThan(0);
        expect(['chatbot', 'search']).toContain(source.type);
      }
    });

    it('should not have duplicate domains', () => {
      const domains = AI_REFERRAL_SOURCES.map(s => s.domain);
      const uniqueDomains = new Set(domains);
      expect(uniqueDomains.size).toBe(domains.length);
    });
  });

  describe('PagePerformance types', () => {
    it('should have correct structure for page performance entry', () => {
      const entry: PagePerformanceEntry = {
        pagePath: '/products/test-product',
        pageTitle: 'Test Product',
        pageviews: 1000,
        users: 800,
        avgTimeOnPage: 45.5,
        bounceRate: 0.35,
        exitRate: 0.25,
        transactions: 50,
        revenue: 2500.00,
        conversionRate: 0.05,
        addToCarts: 150,
        date: '2024-01-15',
      };

      expect(entry.pagePath).toBe('/products/test-product');
      expect(entry.pageviews).toBe(1000);
      expect(entry.conversionRate).toBe(0.05);
      expect(entry.revenue).toBe(2500.00);
    });

    it('should have correct structure for page performance result', () => {
      const result: PagePerformanceResult = {
        propertyId: 'properties/123456789',
        startDate: '30daysAgo',
        endDate: 'today',
        timestamp: new Date().toISOString(),
        success: true,
        pages: [],
        totals: {
          totalPageviews: 10000,
          totalUsers: 8000,
          totalTransactions: 500,
          totalRevenue: 25000,
        },
      };

      expect(result.success).toBe(true);
      expect(result.totals.totalPageviews).toBe(10000);
      expect(result.totals.totalRevenue).toBe(25000);
    });
  });
});
