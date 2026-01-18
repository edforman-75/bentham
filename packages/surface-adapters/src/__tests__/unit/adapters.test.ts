/**
 * Unit tests for Surface Adapters
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  OpenAIAdapter,
  createOpenAIAdapter,
  OPENAI_METADATA,
  AnthropicAdapter,
  createAnthropicAdapter,
  ANTHROPIC_METADATA,
  ChatGPTWebAdapter,
  createChatGPTWebAdapter,
  CHATGPT_WEB_METADATA,
  PerplexityWebAdapter,
  createPerplexityWebAdapter,
  PERPLEXITY_WEB_METADATA,
  GoogleSearchAdapter,
  createGoogleSearchAdapter,
  GOOGLE_SEARCH_METADATA,
  MockBrowserProvider,
  type ApiConfig,
  type SurfaceQueryRequest,
  getAllSurfaceIds,
  getSurfaceMetadata,
  getSurfacesByCategory,
} from '../../index.js';

describe('Surface Adapters', () => {
  describe('Surface Metadata', () => {
    it('should have all Tier 1 surfaces', () => {
      const surfaceIds = getAllSurfaceIds();
      expect(surfaceIds).toContain('openai-api');
      expect(surfaceIds).toContain('anthropic-api');
      expect(surfaceIds).toContain('chatgpt-web');
      expect(surfaceIds).toContain('perplexity-web');
      expect(surfaceIds).toContain('google-search');
    });

    it('should get metadata by ID', () => {
      const openai = getSurfaceMetadata('openai-api');
      expect(openai).toBeDefined();
      expect(openai!.name).toBe('OpenAI API');
      expect(openai!.category).toBe('api');
    });

    it('should return undefined for unknown surface', () => {
      const unknown = getSurfaceMetadata('unknown-surface');
      expect(unknown).toBeUndefined();
    });

    it('should get surfaces by category', () => {
      const apiSurfaces = getSurfacesByCategory('api');
      expect(apiSurfaces.length).toBe(6);
      expect(apiSurfaces.map(s => s.id)).toContain('openai-api');
      expect(apiSurfaces.map(s => s.id)).toContain('anthropic-api');
      expect(apiSurfaces.map(s => s.id)).toContain('google-ai-api');
      expect(apiSurfaces.map(s => s.id)).toContain('perplexity-api');
      expect(apiSurfaces.map(s => s.id)).toContain('xai-api');
      expect(apiSurfaces.map(s => s.id)).toContain('together-api');

      const webChatbots = getSurfacesByCategory('web_chatbot');
      expect(webChatbots.length).toBe(8); // chatgpt, perplexity, x-grok, meta-ai, copilot, amazon, rufus, zappos

      const searchSurfaces = getSurfacesByCategory('search');
      expect(searchSurfaces.length).toBe(2); // google-search, bing-search
    });
  });

  describe('OpenAI Adapter', () => {
    const apiConfig: ApiConfig = {
      apiKey: 'test-api-key',
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should create adapter with config', () => {
      const adapter = createOpenAIAdapter({ apiConfig });
      expect(adapter).toBeInstanceOf(OpenAIAdapter);
      expect(adapter.metadata).toEqual(OPENAI_METADATA);
    });

    it('should throw without API key', () => {
      expect(() => createOpenAIAdapter({ apiConfig: { apiKey: '' } })).toThrow('API key is required');
    });

    it('should have correct metadata', () => {
      expect(OPENAI_METADATA.id).toBe('openai-api');
      expect(OPENAI_METADATA.category).toBe('api');
      expect(OPENAI_METADATA.capabilities.streaming).toBe(true);
      expect(OPENAI_METADATA.capabilities.systemPrompts).toBe(true);
      expect(OPENAI_METADATA.capabilities.modelSelection).toBe(true);
    });

    it('should make API request and parse response', async () => {
      const adapter = createOpenAIAdapter({ apiConfig });

      // Mock fetch
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4-turbo',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello! How can I help you?' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 8,
          total_tokens: 18,
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const request: SurfaceQueryRequest = {
        query: 'Hello',
      };

      const response = await adapter.query(request);

      expect(response.success).toBe(true);
      expect(response.responseText).toBe('Hello! How can I help you?');
      expect(response.tokenUsage).toBeDefined();
      expect(response.tokenUsage!.totalTokens).toBe(18);

      await adapter.close();
    });

    it('should handle API errors', async () => {
      const adapter = createOpenAIAdapter({ apiConfig, maxRetries: 0 });

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limit exceeded'),
      });

      const response = await adapter.query({ query: 'test' });

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('RATE_LIMITED');

      await adapter.close();
    });

    it('should track statistics', async () => {
      const adapter = createOpenAIAdapter({ apiConfig });

      const mockResponse = {
        id: 'chatcmpl-123',
        choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await adapter.query({ query: 'test' });
      await adapter.query({ query: 'test2' });

      const stats = adapter.getStats();
      expect(stats.totalQueries).toBe(2);
      expect(stats.successfulQueries).toBe(2);
      expect(stats.totalTokensUsed).toBe(12);

      await adapter.close();
    });
  });

  describe('Anthropic Adapter', () => {
    const apiConfig: ApiConfig = {
      apiKey: 'test-anthropic-key',
    };

    it('should create adapter with config', () => {
      const adapter = createAnthropicAdapter({ apiConfig });
      expect(adapter).toBeInstanceOf(AnthropicAdapter);
      expect(adapter.metadata).toEqual(ANTHROPIC_METADATA);
    });

    it('should have correct metadata', () => {
      expect(ANTHROPIC_METADATA.id).toBe('anthropic-api');
      expect(ANTHROPIC_METADATA.category).toBe('api');
      expect(ANTHROPIC_METADATA.capabilities.streaming).toBe(true);
      expect(ANTHROPIC_METADATA.capabilities.systemPrompts).toBe(true);
      expect(ANTHROPIC_METADATA.capabilities.maxInputTokens).toBe(200000);
    });

    it('should make API request and parse response', async () => {
      const adapter = createAnthropicAdapter({ apiConfig });

      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello from Claude!' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10,
          output_tokens: 5,
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const response = await adapter.query({ query: 'Hello' });

      expect(response.success).toBe(true);
      expect(response.responseText).toBe('Hello from Claude!');
      expect(response.tokenUsage).toBeDefined();
      expect(response.tokenUsage!.inputTokens).toBe(10);
      expect(response.tokenUsage!.outputTokens).toBe(5);

      await adapter.close();
    });
  });

  describe('ChatGPT Web Adapter', () => {
    let browserProvider: MockBrowserProvider;

    beforeEach(() => {
      browserProvider = new MockBrowserProvider();
      browserProvider.setMockResponse('test', 'This is a test response from ChatGPT.');
    });

    it('should create adapter with config', () => {
      const adapter = createChatGPTWebAdapter({}, browserProvider);
      expect(adapter).toBeInstanceOf(ChatGPTWebAdapter);
      expect(adapter.metadata).toEqual(CHATGPT_WEB_METADATA);
    });

    it('should have correct metadata', () => {
      expect(CHATGPT_WEB_METADATA.id).toBe('chatgpt-web');
      expect(CHATGPT_WEB_METADATA.category).toBe('web_chatbot');
      expect(CHATGPT_WEB_METADATA.authRequirement).toBe('session');
      expect(CHATGPT_WEB_METADATA.capabilities.streaming).toBe(true);
    });

    it('should query using browser automation', async () => {
      const adapter = createChatGPTWebAdapter({ maxRetries: 0, timeoutMs: 5000 }, browserProvider);

      const response = await adapter.query({ query: 'test' });

      expect(response.success).toBe(true);
      expect(response.responseText).toBeDefined();
      expect(response.timing).toBeDefined();

      await adapter.close();
    });
  });

  describe('Perplexity Web Adapter', () => {
    let browserProvider: MockBrowserProvider;

    beforeEach(() => {
      browserProvider = new MockBrowserProvider();
      browserProvider.setMockResponse('search', 'This is a search result from Perplexity with sources.');
    });

    it('should create adapter with config', () => {
      const adapter = createPerplexityWebAdapter({}, browserProvider);
      expect(adapter).toBeInstanceOf(PerplexityWebAdapter);
      expect(adapter.metadata).toEqual(PERPLEXITY_WEB_METADATA);
    });

    it('should have correct metadata', () => {
      expect(PERPLEXITY_WEB_METADATA.id).toBe('perplexity-web');
      expect(PERPLEXITY_WEB_METADATA.category).toBe('web_chatbot');
      expect(PERPLEXITY_WEB_METADATA.authRequirement).toBe('none');
    });

    it('should construct correct search URL', async () => {
      const adapter = createPerplexityWebAdapter({ focusMode: 'academic' }, browserProvider);

      // The URL would be constructed internally
      const response = await adapter.query({ query: 'quantum computing' });

      expect(response.success).toBe(true);
      await adapter.close();
    });
  });

  describe('Google Search Adapter', () => {
    let browserProvider: MockBrowserProvider;

    beforeEach(() => {
      browserProvider = new MockBrowserProvider();
      browserProvider.setMockResponse('search', 'AI Overview: This is the AI-generated summary for your query.');
    });

    it('should create adapter with config', () => {
      const adapter = createGoogleSearchAdapter({}, browserProvider);
      expect(adapter).toBeInstanceOf(GoogleSearchAdapter);
      expect(adapter.metadata).toEqual(GOOGLE_SEARCH_METADATA);
    });

    it('should have correct metadata', () => {
      expect(GOOGLE_SEARCH_METADATA.id).toBe('google-search');
      expect(GOOGLE_SEARCH_METADATA.category).toBe('search');
      expect(GOOGLE_SEARCH_METADATA.authRequirement).toBe('none');
    });

    it.skip('should construct correct search URL with params', async () => {
      // TODO: Fix mock browser provider for Google Search adapter
      const adapter = createGoogleSearchAdapter({
        geoLocation: 'US',
        language: 'en',
      }, browserProvider);

      const response = await adapter.query({ query: 'test query' });

      expect(response.success).toBe(true);
      await adapter.close();
    }, 15000);
  });

  describe('Error Classification', () => {
    const apiConfig: ApiConfig = { apiKey: 'test-key' };

    it('should classify rate limit errors as retryable', async () => {
      const adapter = createOpenAIAdapter({ apiConfig, maxRetries: 0 });

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limit exceeded'),
      });

      const response = await adapter.query({ query: 'test' });

      expect(response.error?.code).toBe('RATE_LIMITED');
      expect(response.error?.retryable).toBe(true);

      await adapter.close();
    });

    it('should classify auth errors as non-retryable', async () => {
      const adapter = createOpenAIAdapter({ apiConfig, maxRetries: 0 });

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      const response = await adapter.query({ query: 'test' });

      expect(response.error?.code).toBe('AUTH_FAILED');
      expect(response.error?.retryable).toBe(false);

      await adapter.close();
    });

    it('should classify network errors as retryable', async () => {
      const adapter = createOpenAIAdapter({ apiConfig, maxRetries: 0 });

      global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const response = await adapter.query({ query: 'test' });

      expect(response.error?.code).toBe('NETWORK_ERROR');
      expect(response.error?.retryable).toBe(true);

      await adapter.close();
    });
  });

  describe('Rate Limit Tracking', () => {
    const apiConfig: ApiConfig = { apiKey: 'test-key' };

    it('should track rate limit status', async () => {
      const adapter = createOpenAIAdapter({ apiConfig });

      const mockResponse = {
        id: 'chatcmpl-123',
        choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      // Make some queries
      await adapter.query({ query: 'test1' });
      await adapter.query({ query: 'test2' });

      const status = adapter.getRateLimitStatus();
      expect(status.currentCount).toBe(2);
      expect(status.isLimited).toBe(false);

      await adapter.close();
    });
  });

  describe('Health Checks', () => {
    const apiConfig: ApiConfig = { apiKey: 'test-key' };

    it('should perform health check', async () => {
      const adapter = createOpenAIAdapter({ apiConfig });

      const mockResponse = {
        id: 'chatcmpl-123',
        choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const health = await adapter.healthCheck();
      expect(health.healthy).toBe(true);
      expect(health.failureCount).toBe(0);

      await adapter.close();
    });

    it('should track failures in health state', async () => {
      const adapter = createOpenAIAdapter({ apiConfig, maxRetries: 0 });

      global.fetch = vi.fn().mockRejectedValue(new Error('Service unavailable'));

      // Make a failing query
      await adapter.query({ query: 'test' });

      const health = await adapter.healthCheck();
      // Health check also fails
      expect(health.failureCount).toBeGreaterThan(0);

      await adapter.close();
    });
  });

  describe('Conversation History', () => {
    const apiConfig: ApiConfig = { apiKey: 'test-key' };

    it('should include conversation history in request', async () => {
      const adapter = createOpenAIAdapter({ apiConfig });
      let capturedBody: string | undefined;

      global.fetch = vi.fn().mockImplementation((_url, options) => {
        capturedBody = options.body;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            id: 'chatcmpl-123',
            choices: [{ message: { content: 'Context acknowledged' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
          }),
        });
      });

      await adapter.query({
        query: 'What did I just say?',
        conversationHistory: [
          { role: 'user', content: 'My name is Alice' },
          { role: 'assistant', content: 'Hello Alice!' },
        ],
      });

      expect(capturedBody).toBeDefined();
      const body = JSON.parse(capturedBody!);
      expect(body.messages).toHaveLength(3); // 2 history + 1 current
      expect(body.messages[0].content).toBe('My name is Alice');

      await adapter.close();
    });

    it('should include system prompt for OpenAI', async () => {
      const adapter = createOpenAIAdapter({ apiConfig });
      let capturedBody: string | undefined;

      global.fetch = vi.fn().mockImplementation((_url, options) => {
        capturedBody = options.body;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            id: 'chatcmpl-123',
            choices: [{ message: { content: 'Yo!' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 15, completion_tokens: 2, total_tokens: 17 },
          }),
        });
      });

      await adapter.query({
        query: 'Hello',
        systemPrompt: 'You are a helpful pirate. Always say "Arrr!"',
      });

      expect(capturedBody).toBeDefined();
      const body = JSON.parse(capturedBody!);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[0].content).toContain('pirate');

      await adapter.close();
    });
  });
});
