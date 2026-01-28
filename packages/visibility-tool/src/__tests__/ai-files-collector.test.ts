/**
 * Tests for AI Files Collector
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocking
import {
  collectAIFiles,
  collectAIFilesFromDomains,
  compareAIReadiness,
  type AIFilesResult,
} from '../collectors/ai-files-collector.js';

describe('AI Files Collector', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('collectAIFiles', () => {
    it('should detect when llms.txt exists', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('llms.txt') && !url.includes('llms-full.txt')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve('# Example Site\n> AI-friendly content here\nhttps://example.com/products'),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const result = await collectAIFiles('example.com');

      expect(result.llmsTxt.exists).toBe(true);
      expect(result.llmsTxt.sections?.title).toBe('Example Site');
      expect(result.llmsTxt.sections?.description).toBe('AI-friendly content here');
      expect(result.llmsTxt.sections?.urls).toContain('https://example.com/products');
      expect(result.assessment.hasLlmsTxt).toBe(true);
    });

    it('should detect when llms.txt does not exist', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      const result = await collectAIFiles('example.com');

      expect(result.llmsTxt.exists).toBe(false);
      expect(result.assessment.hasLlmsTxt).toBe(false);
    });

    it('should parse robots.txt AI bot rules', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('robots.txt')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(`
User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Allow: /

User-agent: *
Allow: /
            `),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const result = await collectAIFiles('example.com');

      expect(result.robotsTxt.exists).toBe(true);
      expect(result.robotsTxt.aiAccess.gptBot).toBe('blocked');
      expect(result.robotsTxt.aiAccess.claudeBot).toBe('allowed');
      expect(result.assessment.blocksAIBots).toBe(true);
    });

    it('should handle domains without https prefix', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      const result = await collectAIFiles('example.com');

      expect(result.domain).toBe('https://example.com');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://example.com'),
        expect.any(Object)
      );
    });

    it('should calculate AI readiness score correctly', async () => {
      // Site with llms.txt and no blocking
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('llms.txt') && !url.includes('llms-full.txt')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve('# My Site\n> Description\nhttps://example.com'),
          });
        }
        if (url.includes('robots.txt')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve('User-agent: *\nAllow: /'),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const result = await collectAIFiles('example.com');

      // Should have high score: llms.txt (40+5+5+5) + robots allows (35) = 90
      expect(result.aiReadinessScore).toBeGreaterThan(70);
    });

    it('should penalize sites that block AI bots', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('robots.txt')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(`
User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: Google-Extended
Disallow: /
            `),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const result = await collectAIFiles('example.com');

      expect(result.aiReadinessScore).toBeLessThan(30);
      expect(result.assessment.blocksAIBots).toBe(true);
    });

    it('should provide recommendation when llms.txt is missing', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      const result = await collectAIFiles('example.com');

      expect(result.assessment.recommendation).toContain('llms.txt');
    });
  });

  describe('collectAIFilesFromDomains', () => {
    it('should collect from multiple domains', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      const results = await collectAIFilesFromDomains(['example.com', 'test.com']);

      expect(results).toHaveLength(2);
      expect(results[0].domain).toBe('https://example.com');
      expect(results[1].domain).toBe('https://test.com');
    });

    it('should call progress callback', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });
      const onProgress = vi.fn();

      await collectAIFilesFromDomains(['example.com', 'test.com'], onProgress);

      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(onProgress).toHaveBeenNthCalledWith(1, 1, 2, expect.any(Object));
      expect(onProgress).toHaveBeenNthCalledWith(2, 2, 2, expect.any(Object));
    });
  });

  describe('compareAIReadiness', () => {
    it('should rank domains by AI readiness score', () => {
      const results: AIFilesResult[] = [
        {
          domain: 'https://low.com',
          timestamp: new Date().toISOString(),
          llmsTxt: { exists: false, url: '', content: null },
          llmsFullTxt: { exists: false, url: '', content: null },
          robotsTxt: { exists: false, url: '', content: null, aiBotRules: [], aiAccess: { gptBot: 'blocked', claudeBot: 'blocked', googleExtended: 'blocked', bingBot: 'blocked', perplexityBot: 'blocked' } },
          aiReadinessScore: 10,
          assessment: { hasLlmsTxt: false, hasLlmsFullTxt: false, blocksAIBots: true, partialAIAccess: false, recommendation: '' },
        },
        {
          domain: 'https://high.com',
          timestamp: new Date().toISOString(),
          llmsTxt: { exists: true, url: '', content: 'content' },
          llmsFullTxt: { exists: false, url: '', content: null },
          robotsTxt: { exists: true, url: '', content: '', aiBotRules: [], aiAccess: { gptBot: 'allowed', claudeBot: 'allowed', googleExtended: 'allowed', bingBot: 'allowed', perplexityBot: 'allowed' } },
          aiReadinessScore: 80,
          assessment: { hasLlmsTxt: true, hasLlmsFullTxt: false, blocksAIBots: false, partialAIAccess: false, recommendation: '' },
        },
      ];

      const comparison = compareAIReadiness(results);

      expect(comparison.rankings[0].domain).toBe('https://high.com');
      expect(comparison.rankings[0].score).toBe(80);
      expect(comparison.rankings[1].domain).toBe('https://low.com');
      expect(comparison.insights.some(i => i.includes('1 of 2 sites have llms.txt'))).toBe(true);
    });

    it('should provide insight when no sites have llms.txt', () => {
      const results: AIFilesResult[] = [
        {
          domain: 'https://example.com',
          timestamp: new Date().toISOString(),
          llmsTxt: { exists: false, url: '', content: null },
          llmsFullTxt: { exists: false, url: '', content: null },
          robotsTxt: { exists: false, url: '', content: null, aiBotRules: [], aiAccess: { gptBot: 'not-specified', claudeBot: 'not-specified', googleExtended: 'not-specified', bingBot: 'not-specified', perplexityBot: 'not-specified' } },
          aiReadinessScore: 20,
          assessment: { hasLlmsTxt: false, hasLlmsFullTxt: false, blocksAIBots: false, partialAIAccess: false, recommendation: '' },
        },
      ];

      const comparison = compareAIReadiness(results);

      expect(comparison.insights.some(i => i.includes('None of the analyzed sites have llms.txt'))).toBe(true);
    });
  });
});
