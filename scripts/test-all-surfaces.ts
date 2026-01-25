#!/usr/bin/env npx tsx
/**
 * End-to-End Test: Query All Surfaces
 *
 * Tests all available surface adapters with a single query.
 * - API surfaces: Uses environment API keys
 * - Web surfaces: Uses captured Chrome sessions
 *
 * Usage:
 *   npx tsx scripts/test-all-surfaces.ts [query]
 *   npx tsx scripts/test-all-surfaces.ts "What is 2+2?"
 */

import {
  // API Adapters
  createOpenAIAdapter,
  createAnthropicAdapter,
  createGoogleAIAdapter,
  createPerplexityAdapter,
  createXAIAdapter,
  createTogetherAdapter,
  // Web Chatbot Adapters
  createChatGPTWebAdapter,
  createPerplexityWebAdapter,
  createXGrokWebAdapter,
  createMetaAIWebAdapter,
  createCopilotWebAdapter,
  // E-commerce Adapters
  createAmazonWebAdapter,
  createAmazonRufusAdapter,
  createZapposWebAdapter,
  // Search Adapters
  createGoogleSearchAdapter,
  createBingSearchAdapter,
  // Browser & Session
  createSessionManager,
  createPlaywrightProvider,
  createProviderWithSession,
  // Types
  type SurfaceAdapter,
  type SurfaceQueryResponse,
} from '../packages/surface-adapters/src/index.js';

// Test query
const DEFAULT_QUERY = 'What is the capital of France? Answer in one sentence.';
const ECOMMERCE_QUERY = 'running shoes';

interface TestResult {
  surfaceId: string;
  category: string;
  success: boolean;
  responsePreview?: string;
  error?: string;
  durationMs: number;
}

async function testApiSurface(
  name: string,
  createAdapter: () => SurfaceAdapter,
  query: string
): Promise<TestResult> {
  const start = Date.now();
  try {
    const adapter = createAdapter();

    const response = await adapter.query({
      query,
    });

    // Close if method exists
    if ('close' in adapter && typeof adapter.close === 'function') {
      await adapter.close();
    }

    return {
      surfaceId: name,
      category: 'api',
      success: true,
      responsePreview: (response.responseText || '').substring(0, 100) + ((response.responseText || '').length > 100 ? '...' : ''),
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      surfaceId: name,
      category: 'api',
      success: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - start,
    };
  }
}

async function testWebSurface(
  name: string,
  createAdapter: (provider: any) => SurfaceAdapter,
  query: string,
  sessionManager: ReturnType<typeof createSessionManager>
): Promise<TestResult> {
  const start = Date.now();

  // Check if session exists
  const session = sessionManager.getSession(name);
  if (!session) {
    return {
      surfaceId: name,
      category: 'web',
      success: false,
      error: 'No session captured. Run: npx tsx scripts/capture-session.ts ' + name,
      durationMs: Date.now() - start,
    };
  }

  if (!sessionManager.hasValidSession(name)) {
    return {
      surfaceId: name,
      category: 'web',
      success: false,
      error: 'Session expired. Re-capture with: npx tsx scripts/capture-session.ts ' + name,
      durationMs: Date.now() - start,
    };
  }

  try {
    const provider = createProviderWithSession(session, { headless: true });
    const adapter = createAdapter(provider);

    const response = await adapter.query({
      query,
    });

    // Close if method exists
    if ('close' in adapter && typeof adapter.close === 'function') {
      await adapter.close();
    }
    await provider.closeAll();

    return {
      surfaceId: name,
      category: 'web',
      success: true,
      responsePreview: (response.responseText || '').substring(0, 100) + ((response.responseText || '').length > 100 ? '...' : ''),
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      surfaceId: name,
      category: 'web',
      success: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - start,
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const query = args[0] || DEFAULT_QUERY;

  console.log('='.repeat(60));
  console.log('  Bentham End-to-End Surface Test');
  console.log('='.repeat(60));
  console.log(`\nQuery: "${query}"\n`);

  const results: TestResult[] = [];
  const sessionManager = createSessionManager({ sessionDir: '.bentham-sessions' });

  // ========== API Surfaces ==========
  console.log('\n--- API Surfaces ---\n');

  // OpenAI
  if (process.env.OPENAI_API_KEY) {
    console.log('Testing openai-api...');
    results.push(await testApiSurface('openai-api', () =>
      createOpenAIAdapter({ apiConfig: { apiKey: process.env.OPENAI_API_KEY! }, defaultModel: 'gpt-4o-mini' }), query));
  } else {
    results.push({ surfaceId: 'openai-api', category: 'api', success: false, error: 'OPENAI_API_KEY not set', durationMs: 0 });
  }

  // Anthropic
  if (process.env.ANTHROPIC_API_KEY) {
    console.log('Testing anthropic-api...');
    results.push(await testApiSurface('anthropic-api', () =>
      createAnthropicAdapter({ apiConfig: { apiKey: process.env.ANTHROPIC_API_KEY! }, defaultModel: 'claude-3-5-haiku-latest' }), query));
  } else {
    results.push({ surfaceId: 'anthropic-api', category: 'api', success: false, error: 'ANTHROPIC_API_KEY not set', durationMs: 0 });
  }

  // Google AI
  if (process.env.GOOGLE_AI_API_KEY) {
    console.log('Testing google-ai-api...');
    results.push(await testApiSurface('google-ai-api', () =>
      createGoogleAIAdapter({ apiConfig: { apiKey: process.env.GOOGLE_AI_API_KEY! }, defaultModel: 'gemini-2.0-flash' }), query));
  } else {
    results.push({ surfaceId: 'google-ai-api', category: 'api', success: false, error: 'GOOGLE_AI_API_KEY not set', durationMs: 0 });
  }

  // Perplexity
  if (process.env.PERPLEXITY_API_KEY) {
    console.log('Testing perplexity-api...');
    results.push(await testApiSurface('perplexity-api', () =>
      createPerplexityAdapter({ apiConfig: { apiKey: process.env.PERPLEXITY_API_KEY! }, defaultModel: 'sonar' }), query));
  } else {
    results.push({ surfaceId: 'perplexity-api', category: 'api', success: false, error: 'PERPLEXITY_API_KEY not set', durationMs: 0 });
  }

  // xAI
  if (process.env.XAI_API_KEY) {
    console.log('Testing xai-api...');
    results.push(await testApiSurface('xai-api', () =>
      createXAIAdapter({ apiConfig: { apiKey: process.env.XAI_API_KEY! }, defaultModel: 'grok-3-mini' }), query));
  } else {
    results.push({ surfaceId: 'xai-api', category: 'api', success: false, error: 'XAI_API_KEY not set', durationMs: 0 });
  }

  // Together
  if (process.env.TOGETHER_API_KEY) {
    console.log('Testing together-api...');
    results.push(await testApiSurface('together-api', () =>
      createTogetherAdapter({ apiConfig: { apiKey: process.env.TOGETHER_API_KEY! }, defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' }), query));
  } else {
    results.push({ surfaceId: 'together-api', category: 'api', success: false, error: 'TOGETHER_API_KEY not set', durationMs: 0 });
  }

  // ========== Web Chatbot Surfaces ==========
  console.log('\n--- Web Chatbot Surfaces ---\n');

  const webChatbots = [
    { id: 'chatgpt-web', create: (p: any) => createChatGPTWebAdapter({}, p) },
    { id: 'perplexity-web', create: (p: any) => createPerplexityWebAdapter({}, p) },
    { id: 'x-grok-web', create: (p: any) => createXGrokWebAdapter({}, p) },
    { id: 'meta-ai-web', create: (p: any) => createMetaAIWebAdapter({}, p) },
    { id: 'copilot-web', create: (p: any) => createCopilotWebAdapter({}, p) },
  ];

  for (const chatbot of webChatbots) {
    console.log(`Testing ${chatbot.id}...`);
    results.push(await testWebSurface(chatbot.id, chatbot.create, query, sessionManager));
  }

  // ========== E-commerce Surfaces ==========
  console.log('\n--- E-commerce Surfaces ---\n');

  const ecommerceSurfaces = [
    { id: 'amazon-web', create: (p: any) => createAmazonWebAdapter({}, p) },
    { id: 'amazon-rufus', create: (p: any) => createAmazonRufusAdapter({}, p), isAI: true },
    { id: 'zappos-web', create: (p: any) => createZapposWebAdapter({}, p) },
  ];

  for (const surface of ecommerceSurfaces) {
    console.log(`Testing ${surface.id}...`);
    // Use AI query for Rufus, product search for others
    const surfaceQuery = (surface as any).isAI ? query : ECOMMERCE_QUERY;
    results.push(await testWebSurface(surface.id, surface.create, surfaceQuery, sessionManager));
  }

  // ========== Search Surfaces ==========
  console.log('\n--- Search Surfaces ---\n');

  console.log('Testing google-search...');
  results.push(await testWebSurface('google-search', (p: any) => createGoogleSearchAdapter({}, p), query, sessionManager));

  console.log('Testing bing-search...');
  results.push(await testWebSurface('bing-search', (p: any) => createBingSearchAdapter({}, p), query, sessionManager));

  // ========== Results Summary ==========
  console.log('\n' + '='.repeat(60));
  console.log('  Results Summary');
  console.log('='.repeat(60) + '\n');

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`Total: ${results.length} surfaces`);
  console.log(`✅ Passed: ${successful.length}`);
  console.log(`❌ Failed: ${failed.length}`);

  if (successful.length > 0) {
    console.log('\n--- Successful Responses ---\n');
    for (const result of successful) {
      console.log(`✅ ${result.surfaceId} (${result.durationMs}ms)`);
      console.log(`   ${result.responsePreview}`);
      console.log('');
    }
  }

  if (failed.length > 0) {
    console.log('\n--- Failed Surfaces ---\n');
    for (const result of failed) {
      console.log(`❌ ${result.surfaceId}`);
      console.log(`   ${result.error}`);
      console.log('');
    }
  }

  // Exit with error code if any failed (excluding missing sessions/keys)
  const realFailures = failed.filter(r =>
    !r.error?.includes('not set') &&
    !r.error?.includes('No session') &&
    !r.error?.includes('expired')
  );

  if (realFailures.length > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
