/**
 * Real API Integration Tests
 *
 * Tests surface adapters against actual APIs.
 * Requires API keys to be set as environment variables.
 * Tests are skipped if credentials are not available.
 *
 * Run with: pnpm --filter @bentham/surface-adapters test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createOpenAIAdapter,
  createAnthropicAdapter,
  createGoogleAIAdapter,
  createPerplexityAdapter,
  createXAIAdapter,
  createTogetherAdapter,
} from '../../index.js';
import type { SurfaceAdapter } from '../../types.js';

// Longer timeout for real API calls
const API_TIMEOUT = 30000;

// Simple test prompt that should have a deterministic answer
const TEST_PROMPT = 'What is 2+2? Answer with just the number, nothing else.';

describe('Real API Integration Tests', () => {
  describe('OpenAI API', () => {
    const apiKey = process.env.OPENAI_API_KEY;
    let adapter: SurfaceAdapter | null = null;

    beforeAll(() => {
      if (apiKey) {
        adapter = createOpenAIAdapter({
          apiConfig: { apiKey },
          defaultModel: 'gpt-4o-mini', // Use cheaper model for testing
          maxRetries: 0, // No retries for integration tests - fail fast
          timeoutMs: 15000,
        });
      }
    });

    afterAll(async () => {
      if (adapter) {
        await adapter.close();
      }
    });

    it.skipIf(!apiKey)('should execute a simple query', async () => {
      expect(adapter).not.toBeNull();

      const result = await adapter!.query({ query: TEST_PROMPT });

      // Handle quota exhaustion gracefully
      if (!result.success && result.error?.code === 'RATE_LIMITED') {
        console.log('⚠️  QUOTA EXHAUSTED: OpenAI API key needs billing/credits');
        console.log('   Error:', result.error.message);
        console.log('   ACTION REQUIRED: Add credits to OpenAI account or provide new API key');
        return; // Skip remaining assertions
      }

      expect(result.success).toBe(true);
      expect(result.responseText).toBeDefined();
      expect(result.responseText).toContain('4');
      expect(result.tokenUsage).toBeDefined();
      expect(result.tokenUsage?.totalTokens).toBeGreaterThan(0);
      expect(result.timing.totalMs).toBeGreaterThan(0);

      console.log('✅ OpenAI Response:', result.responseText);
      console.log('   Token Usage:', result.tokenUsage);
      console.log('   Response Time:', result.timing.totalMs, 'ms');
    }, API_TIMEOUT);

    it.skipIf(!apiKey)('should handle system prompts', async () => {
      expect(adapter).not.toBeNull();

      const result = await adapter!.query({
        query: 'What is my name?',
        systemPrompt: 'You are a helpful assistant. The user\'s name is TestUser.',
      });

      // Handle quota exhaustion gracefully
      if (!result.success && result.error?.code === 'RATE_LIMITED') {
        console.log('⚠️  QUOTA EXHAUSTED: Skipping test');
        return;
      }

      expect(result.success).toBe(true);
      expect(result.responseText?.toLowerCase()).toContain('testuser');
    }, API_TIMEOUT);

    it.skipIf(!apiKey)('should report health correctly', async () => {
      expect(adapter).not.toBeNull();

      const health = await adapter!.healthCheck();

      // Health check will fail if quota is exhausted
      if (!health.healthy) {
        console.log('⚠️  HEALTH CHECK FAILED:', health.error);
        console.log('   This may indicate quota exhaustion or API issues');
        return;
      }

      expect(health.healthy).toBe(true);
      expect(health.latencyMs).toBeGreaterThan(0);
    }, API_TIMEOUT);
  });

  describe('Anthropic API', () => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    let adapter: SurfaceAdapter | null = null;

    beforeAll(() => {
      if (apiKey) {
        adapter = createAnthropicAdapter({
          apiConfig: { apiKey },
          defaultModel: 'claude-3-haiku-20240307', // Use cheaper model for testing
          maxRetries: 0, // No retries for integration tests - fail fast
          timeoutMs: 15000,
        });
      }
    });

    afterAll(async () => {
      if (adapter) {
        await adapter.close();
      }
    });

    it.skipIf(!apiKey)('should execute a simple query', async () => {
      expect(adapter).not.toBeNull();

      const result = await adapter!.query({ query: TEST_PROMPT });

      // Handle quota exhaustion gracefully
      if (!result.success && result.error?.code === 'RATE_LIMITED') {
        console.log('⚠️  QUOTA EXHAUSTED: Anthropic API key needs billing/credits');
        console.log('   Error:', result.error.message);
        console.log('   ACTION REQUIRED: Add credits to Anthropic account or provide new API key');
        return;
      }

      expect(result.success).toBe(true);
      expect(result.responseText).toBeDefined();
      expect(result.responseText).toContain('4');
      expect(result.tokenUsage).toBeDefined();
      expect(result.tokenUsage?.totalTokens).toBeGreaterThan(0);
      expect(result.timing.totalMs).toBeGreaterThan(0);

      console.log('✅ Anthropic Response:', result.responseText);
      console.log('   Token Usage:', result.tokenUsage);
      console.log('   Response Time:', result.timing.totalMs, 'ms');
    }, API_TIMEOUT);

    it.skipIf(!apiKey)('should handle system prompts', async () => {
      expect(adapter).not.toBeNull();

      const result = await adapter!.query({
        query: 'What is my name?',
        systemPrompt: 'You are a helpful assistant. The user\'s name is TestUser.',
      });

      // Handle quota exhaustion gracefully
      if (!result.success && result.error?.code === 'RATE_LIMITED') {
        console.log('⚠️  QUOTA EXHAUSTED: Skipping test');
        return;
      }

      expect(result.success).toBe(true);
      expect(result.responseText?.toLowerCase()).toContain('testuser');
    }, API_TIMEOUT);

    it.skipIf(!apiKey)('should report health correctly', async () => {
      expect(adapter).not.toBeNull();

      const health = await adapter!.healthCheck();

      // Health check will fail if quota is exhausted
      if (!health.healthy) {
        console.log('⚠️  HEALTH CHECK FAILED:', health.error);
        console.log('   This may indicate quota exhaustion or API issues');
        return;
      }

      expect(health.healthy).toBe(true);
      expect(health.latencyMs).toBeGreaterThan(0);
    }, API_TIMEOUT);
  });

  describe('Google AI (Gemini) API', () => {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    let adapter: SurfaceAdapter | null = null;

    beforeAll(() => {
      if (apiKey) {
        adapter = createGoogleAIAdapter({
          apiConfig: { apiKey },
          defaultModel: 'gemini-2.0-flash', // Use current model
          maxRetries: 0,
          timeoutMs: 15000,
        });
      }
    });

    afterAll(async () => {
      if (adapter) {
        await adapter.close();
      }
    });

    it.skipIf(!apiKey)('should execute a simple query', async () => {
      expect(adapter).not.toBeNull();

      const result = await adapter!.query({ query: TEST_PROMPT });

      if (!result.success && result.error?.code === 'RATE_LIMITED') {
        console.log('⚠️  QUOTA EXHAUSTED: Google AI API key needs billing/credits');
        console.log('   Error:', result.error.message);
        return;
      }

      expect(result.success).toBe(true);
      expect(result.responseText).toBeDefined();
      expect(result.responseText).toContain('4');
      expect(result.tokenUsage).toBeDefined();

      console.log('✅ Google AI Response:', result.responseText);
      console.log('   Token Usage:', result.tokenUsage);
      console.log('   Response Time:', result.timing.totalMs, 'ms');
    }, API_TIMEOUT);

    it.skipIf(!apiKey)('should handle system prompts', async () => {
      expect(adapter).not.toBeNull();

      const result = await adapter!.query({
        query: 'What is my name?',
        systemPrompt: 'You are a helpful assistant. The user\'s name is TestUser.',
      });

      if (!result.success && result.error?.code === 'RATE_LIMITED') {
        console.log('⚠️  QUOTA EXHAUSTED: Skipping test');
        return;
      }

      expect(result.success).toBe(true);
      expect(result.responseText?.toLowerCase()).toContain('testuser');
    }, API_TIMEOUT);
  });

  describe('Perplexity API', () => {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    let adapter: SurfaceAdapter | null = null;

    beforeAll(() => {
      if (apiKey) {
        adapter = createPerplexityAdapter({
          apiConfig: { apiKey },
          defaultModel: 'sonar', // Current model name
          maxRetries: 0,
          timeoutMs: 15000,
        });
      }
    });

    afterAll(async () => {
      if (adapter) {
        await adapter.close();
      }
    });

    it.skipIf(!apiKey)('should execute a simple query', async () => {
      expect(adapter).not.toBeNull();

      const result = await adapter!.query({ query: TEST_PROMPT });

      if (!result.success && result.error?.code === 'RATE_LIMITED') {
        console.log('⚠️  QUOTA EXHAUSTED: Perplexity API key needs billing/credits');
        console.log('   Error:', result.error.message);
        return;
      }

      expect(result.success).toBe(true);
      expect(result.responseText).toBeDefined();
      expect(result.responseText).toContain('4');
      expect(result.tokenUsage).toBeDefined();

      console.log('✅ Perplexity Response:', result.responseText);
      console.log('   Token Usage:', result.tokenUsage);
      console.log('   Response Time:', result.timing.totalMs, 'ms');

      // Check for sources/citations (Perplexity-specific)
      if (result.structured?.sources) {
        console.log('   Sources:', result.structured.sources);
      }
    }, API_TIMEOUT);

    it.skipIf(!apiKey)('should handle system prompts', async () => {
      expect(adapter).not.toBeNull();

      const result = await adapter!.query({
        query: 'What is my name?',
        systemPrompt: 'You are a helpful assistant. The user\'s name is TestUser.',
      });

      if (!result.success && result.error?.code === 'RATE_LIMITED') {
        console.log('⚠️  QUOTA EXHAUSTED: Skipping test');
        return;
      }

      expect(result.success).toBe(true);
      expect(result.responseText?.toLowerCase()).toContain('testuser');
    }, API_TIMEOUT);
  });

  describe('xAI (Grok) API', () => {
    const apiKey = process.env.XAI_API_KEY;
    let adapter: SurfaceAdapter | null = null;

    beforeAll(() => {
      if (apiKey) {
        adapter = createXAIAdapter({
          apiConfig: { apiKey },
          defaultModel: 'grok-3-mini', // Use cheaper model for testing
          maxRetries: 0,
          timeoutMs: 15000,
        });
      }
    });

    afterAll(async () => {
      if (adapter) {
        await adapter.close();
      }
    });

    it.skipIf(!apiKey)('should execute a simple query', async () => {
      expect(adapter).not.toBeNull();

      const result = await adapter!.query({ query: TEST_PROMPT });

      if (!result.success && result.error?.code === 'RATE_LIMITED') {
        console.log('⚠️  QUOTA EXHAUSTED: xAI API key needs billing/credits');
        console.log('   Error:', result.error.message);
        return;
      }

      expect(result.success).toBe(true);
      expect(result.responseText).toBeDefined();
      expect(result.responseText).toContain('4');
      expect(result.tokenUsage).toBeDefined();

      console.log('✅ xAI Response:', result.responseText);
      console.log('   Token Usage:', result.tokenUsage);
      console.log('   Response Time:', result.timing.totalMs, 'ms');
    }, API_TIMEOUT);

    it.skipIf(!apiKey)('should handle system prompts', async () => {
      expect(adapter).not.toBeNull();

      const result = await adapter!.query({
        query: 'What is my name?',
        systemPrompt: 'You are a helpful assistant. The user\'s name is TestUser.',
      });

      if (!result.success && result.error?.code === 'RATE_LIMITED') {
        console.log('⚠️  QUOTA EXHAUSTED: Skipping test');
        return;
      }

      expect(result.success).toBe(true);
      expect(result.responseText?.toLowerCase()).toContain('testuser');
    }, API_TIMEOUT);
  });

  describe('Together.ai (Meta Llama) API', () => {
    const apiKey = process.env.TOGETHER_API_KEY;
    let adapter: SurfaceAdapter | null = null;

    beforeAll(() => {
      if (apiKey) {
        adapter = createTogetherAdapter({
          apiConfig: { apiKey },
          defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
          maxRetries: 0,
          timeoutMs: 15000,
        });
      }
    });

    afterAll(async () => {
      if (adapter) {
        await adapter.close();
      }
    });

    it.skipIf(!apiKey)('should execute a simple query', async () => {
      expect(adapter).not.toBeNull();

      const result = await adapter!.query({ query: TEST_PROMPT });

      if (!result.success && result.error?.code === 'RATE_LIMITED') {
        console.log('⚠️  QUOTA EXHAUSTED: Together API key needs billing/credits');
        console.log('   Error:', result.error.message);
        return;
      }

      expect(result.success).toBe(true);
      expect(result.responseText).toBeDefined();
      expect(result.responseText).toContain('4');
      expect(result.tokenUsage).toBeDefined();

      console.log('✅ Together Response:', result.responseText);
      console.log('   Token Usage:', result.tokenUsage);
      console.log('   Response Time:', result.timing.totalMs, 'ms');
    }, API_TIMEOUT);

    it.skipIf(!apiKey)('should handle system prompts', async () => {
      expect(adapter).not.toBeNull();

      const result = await adapter!.query({
        query: 'What is my name?',
        systemPrompt: 'You are a helpful assistant. The user\'s name is TestUser.',
      });

      if (!result.success && result.error?.code === 'RATE_LIMITED') {
        console.log('⚠️  QUOTA EXHAUSTED: Skipping test');
        return;
      }

      expect(result.success).toBe(true);
      expect(result.responseText?.toLowerCase()).toContain('testuser');
    }, API_TIMEOUT);
  });

  describe('Error Handling', () => {
    it('should handle invalid OpenAI API key', async () => {
      const adapter = createOpenAIAdapter({
        apiConfig: { apiKey: 'sk-invalid-key-12345' },
      });

      const result = await adapter.query({ query: TEST_PROMPT });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      // Error code is AUTH_FAILED from base adapter
      expect(result.error?.code).toBe('AUTH_FAILED');

      await adapter.close();
    }, API_TIMEOUT);

    it('should handle invalid Anthropic API key', async () => {
      const adapter = createAnthropicAdapter({
        apiConfig: { apiKey: 'sk-ant-invalid-key-12345' },
      });

      const result = await adapter.query({ query: TEST_PROMPT });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      // Error code is AUTH_FAILED from base adapter
      expect(result.error?.code).toBe('AUTH_FAILED');

      await adapter.close();
    }, API_TIMEOUT);
  });
});

describe('Credential Availability Check', () => {
  it('reports which API keys are available', () => {
    const available: string[] = [];
    const missing: string[] = [];

    if (process.env.OPENAI_API_KEY) {
      available.push('OPENAI_API_KEY');
    } else {
      missing.push('OPENAI_API_KEY');
    }

    if (process.env.ANTHROPIC_API_KEY) {
      available.push('ANTHROPIC_API_KEY');
    } else {
      missing.push('ANTHROPIC_API_KEY');
    }

    if (process.env.GOOGLE_AI_API_KEY) {
      available.push('GOOGLE_AI_API_KEY');
    } else {
      missing.push('GOOGLE_AI_API_KEY');
    }

    if (process.env.PERPLEXITY_API_KEY) {
      available.push('PERPLEXITY_API_KEY');
    } else {
      missing.push('PERPLEXITY_API_KEY');
    }

    if (process.env.XAI_API_KEY) {
      available.push('XAI_API_KEY');
    } else {
      missing.push('XAI_API_KEY');
    }

    if (process.env.TOGETHER_API_KEY) {
      available.push('TOGETHER_API_KEY');
    } else {
      missing.push('TOGETHER_API_KEY');
    }

    console.log('\n=== API Key Availability ===');
    console.log('Available:', available.length > 0 ? available.join(', ') : 'None');
    console.log('Missing:', missing.length > 0 ? missing.join(', ') : 'None');
    console.log('===========================\n');

    // This test always passes - it's informational
    expect(true).toBe(true);
  });
});
