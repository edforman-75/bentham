/**
 * Integration tests for surface adapter lifecycle
 *
 * Tests the basic adapter contract:
 * - Adapter creation and metadata
 * - Query execution interface
 * - Health checks
 * - Cleanup
 */

import { describe, it, expect } from 'vitest';
import {
  createOpenAIAdapter,
  createAnthropicAdapter,
  createChatGPTWebAdapter,
  createPerplexityWebAdapter,
  createGoogleSearchAdapter,
  MockBrowserProvider,
} from '../../index';

describe('Adapter Lifecycle Integration', () => {
  describe('API Adapters', () => {
    describe('OpenAI Adapter', () => {
      it('should have correct metadata', () => {
        const adapter = createOpenAIAdapter({
          apiConfig: { apiKey: 'test-api-key' },
          defaultModel: 'gpt-4',
        });

        expect(adapter.metadata.id).toBe('openai-api');
        expect(adapter.metadata.name).toBe('OpenAI API');
        expect(adapter.metadata.category).toBe('api');
        expect(adapter.metadata.capabilities).toBeDefined();
      });

      it('should have query method', () => {
        const adapter = createOpenAIAdapter({
          apiConfig: { apiKey: 'test-api-key' },
        });

        expect(typeof adapter.query).toBe('function');
      });

      it('should have healthCheck method', () => {
        const adapter = createOpenAIAdapter({
          apiConfig: { apiKey: 'test-api-key' },
        });

        expect(typeof adapter.healthCheck).toBe('function');
      });

      it('should have close method', () => {
        const adapter = createOpenAIAdapter({
          apiConfig: { apiKey: 'test-api-key' },
        });

        expect(typeof adapter.close).toBe('function');
      });

      it('should have getRateLimitStatus method', () => {
        const adapter = createOpenAIAdapter({
          apiConfig: { apiKey: 'test-api-key' },
        });

        expect(typeof adapter.getRateLimitStatus).toBe('function');
        const status = adapter.getRateLimitStatus();
        expect(status).toBeDefined();
        expect(status.isLimited).toBe(false);
      });

      it('should throw on empty API key', () => {
        expect(() =>
          createOpenAIAdapter({ apiConfig: { apiKey: '' } })
        ).toThrow();
      });
    });

    describe('Anthropic Adapter', () => {
      it('should have correct metadata', () => {
        const adapter = createAnthropicAdapter({
          apiConfig: { apiKey: 'test-anthropic-key' },
          defaultModel: 'claude-3-opus-20240229',
        });

        expect(adapter.metadata.id).toBe('anthropic-api');
        expect(adapter.metadata.name).toBe('Anthropic Claude API');
        expect(adapter.metadata.category).toBe('api');
        expect(adapter.metadata.capabilities).toBeDefined();
      });

      it('should implement SurfaceAdapter interface', () => {
        const adapter = createAnthropicAdapter({
          apiConfig: { apiKey: 'test-key' },
        });

        expect(typeof adapter.query).toBe('function');
        expect(typeof adapter.healthCheck).toBe('function');
        expect(typeof adapter.close).toBe('function');
        expect(typeof adapter.getRateLimitStatus).toBe('function');
      });
    });
  });

  describe('Web Adapters', () => {
    describe('ChatGPT Web Adapter', () => {
      it('should have correct metadata', () => {
        const browserProvider = new MockBrowserProvider();
        const adapter = createChatGPTWebAdapter({
          pageLoadTimeoutMs: 30000,
        }, browserProvider);

        expect(adapter.metadata.id).toBe('chatgpt-web');
        expect(adapter.metadata.name).toBe('ChatGPT Web');
        expect(adapter.metadata.category).toBe('web_chatbot');
      });

      it('should implement SurfaceAdapter interface', () => {
        const browserProvider = new MockBrowserProvider();
        const adapter = createChatGPTWebAdapter({}, browserProvider);

        expect(typeof adapter.query).toBe('function');
        expect(typeof adapter.healthCheck).toBe('function');
        expect(typeof adapter.close).toBe('function');
      });
    });

    describe('Perplexity Web Adapter', () => {
      it('should have correct metadata', () => {
        const browserProvider = new MockBrowserProvider();
        const adapter = createPerplexityWebAdapter({}, browserProvider);

        expect(adapter.metadata.id).toBe('perplexity-web');
        expect(adapter.metadata.name).toBe('Perplexity Web');
        expect(adapter.metadata.category).toBe('web_chatbot');
      });
    });

    describe('Google Search Adapter', () => {
      it('should have correct metadata', () => {
        const browserProvider = new MockBrowserProvider();
        const adapter = createGoogleSearchAdapter({
          aiOverviewOnly: true,
        }, browserProvider);

        expect(adapter.metadata.id).toBe('google-search');
        expect(adapter.metadata.name).toBe('Google Search + AI Overview');
        expect(adapter.metadata.category).toBe('search');
      });
    });
  });

  describe('Adapter Contract', () => {
    it('should create adapters with different configurations', () => {
      const openai = createOpenAIAdapter({ apiConfig: { apiKey: 'test' } });
      const anthropic = createAnthropicAdapter({ apiConfig: { apiKey: 'test' } });

      expect(openai.metadata.id).not.toBe(anthropic.metadata.id);
      expect(openai.metadata.category).toBe(anthropic.metadata.category);
    });

    it('should have consistent interface across adapters', () => {
      const browserProvider = new MockBrowserProvider();

      const adapters = [
        createOpenAIAdapter({ apiConfig: { apiKey: 'test' } }),
        createAnthropicAdapter({ apiConfig: { apiKey: 'test' } }),
        createChatGPTWebAdapter({}, browserProvider),
        createPerplexityWebAdapter({}, browserProvider),
        createGoogleSearchAdapter({}, browserProvider),
      ];

      for (const adapter of adapters) {
        expect(adapter.metadata).toBeDefined();
        expect(adapter.metadata.id).toBeDefined();
        expect(adapter.metadata.name).toBeDefined();
        expect(adapter.metadata.category).toBeDefined();
        expect(typeof adapter.query).toBe('function');
        expect(typeof adapter.healthCheck).toBe('function');
        expect(typeof adapter.close).toBe('function');
      }
    });
  });
});
