#!/usr/bin/env npx tsx
/**
 * End-to-End Test: Query All Surfaces (Parallel)
 *
 * Tests all available surface adapters with a single query.
 * Runs API surfaces in parallel, web surfaces in parallel (with separate browser contexts).
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
  createProviderWithSession,
  // Types
  type SurfaceAdapter,
} from '../packages/surface-adapters/src/index.js';

// Test query
const DEFAULT_QUERY = 'What is the capital of France? Answer in one sentence.';
const ECOMMERCE_QUERY = 'running shoes';

// Timeout for each surface test (15 seconds for API, 30 for web)
const API_TIMEOUT_MS = 15000;
const WEB_TIMEOUT_MS = 30000;

interface TestResult {
  surfaceId: string;
  category: string;
  success: boolean;
  responsePreview?: string;
  error?: string;
  durationMs: number;
}

function withTimeout<T>(promise: Promise<T>, ms: number, surfaceId: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ]);
}

async function testApiSurface(
  name: string,
  createAdapter: () => SurfaceAdapter,
  query: string
): Promise<TestResult> {
  const start = Date.now();
  try {
    const adapter = createAdapter();

    const response = await withTimeout(
      adapter.query({ query }),
      API_TIMEOUT_MS,
      name
    );

    if ('close' in adapter && typeof adapter.close === 'function') {
      await adapter.close();
    }

    return {
      surfaceId: name,
      category: 'api',
      success: response.success,
      responsePreview: response.success
        ? (response.responseText || '').substring(0, 100) + ((response.responseText || '').length > 100 ? '...' : '')
        : response.error?.message,
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
    const provider = createProviderWithSession(session, { headless: false });
    const adapter = createAdapter(provider);

    const response = await withTimeout(
      adapter.query({ query }),
      WEB_TIMEOUT_MS,
      name
    );

    if ('close' in adapter && typeof adapter.close === 'function') {
      await adapter.close();
    }
    await provider.closeAll();

    return {
      surfaceId: name,
      category: 'web',
      success: response.success,
      responsePreview: response.success
        ? (response.responseText || '').substring(0, 100) + ((response.responseText || '').length > 100 ? '...' : '')
        : response.error?.message,
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
  console.log('  Bentham End-to-End Surface Test (Parallel)');
  console.log('='.repeat(60));
  console.log(`\nQuery: "${query}"\n`);

  const sessionManager = createSessionManager({ sessionDir: '.bentham-sessions' });

  // ========== API Surfaces (in parallel) ==========
  console.log('\n--- API Surfaces (running in parallel) ---\n');

  const apiTests: Promise<TestResult>[] = [];

  if (process.env.OPENAI_API_KEY) {
    apiTests.push(testApiSurface('openai-api', () =>
      createOpenAIAdapter({ apiConfig: { apiKey: process.env.OPENAI_API_KEY! }, defaultModel: 'gpt-4o-mini' }), query));
  } else {
    apiTests.push(Promise.resolve({ surfaceId: 'openai-api', category: 'api', success: false, error: 'OPENAI_API_KEY not set', durationMs: 0 }));
  }

  if (process.env.ANTHROPIC_API_KEY) {
    apiTests.push(testApiSurface('anthropic-api', () =>
      createAnthropicAdapter({ apiConfig: { apiKey: process.env.ANTHROPIC_API_KEY! }, defaultModel: 'claude-3-5-haiku-latest' }), query));
  } else {
    apiTests.push(Promise.resolve({ surfaceId: 'anthropic-api', category: 'api', success: false, error: 'ANTHROPIC_API_KEY not set', durationMs: 0 }));
  }

  if (process.env.GOOGLE_AI_API_KEY) {
    apiTests.push(testApiSurface('google-ai-api', () =>
      createGoogleAIAdapter({ apiConfig: { apiKey: process.env.GOOGLE_AI_API_KEY! }, defaultModel: 'gemini-2.0-flash' }), query));
  } else {
    apiTests.push(Promise.resolve({ surfaceId: 'google-ai-api', category: 'api', success: false, error: 'GOOGLE_AI_API_KEY not set', durationMs: 0 }));
  }

  if (process.env.PERPLEXITY_API_KEY) {
    apiTests.push(testApiSurface('perplexity-api', () =>
      createPerplexityAdapter({ apiConfig: { apiKey: process.env.PERPLEXITY_API_KEY! }, defaultModel: 'sonar' }), query));
  } else {
    apiTests.push(Promise.resolve({ surfaceId: 'perplexity-api', category: 'api', success: false, error: 'PERPLEXITY_API_KEY not set', durationMs: 0 }));
  }

  if (process.env.XAI_API_KEY) {
    apiTests.push(testApiSurface('xai-api', () =>
      createXAIAdapter({ apiConfig: { apiKey: process.env.XAI_API_KEY! }, defaultModel: 'grok-3-mini' }), query));
  } else {
    apiTests.push(Promise.resolve({ surfaceId: 'xai-api', category: 'api', success: false, error: 'XAI_API_KEY not set', durationMs: 0 }));
  }

  if (process.env.TOGETHER_API_KEY) {
    apiTests.push(testApiSurface('together-api', () =>
      createTogetherAdapter({ apiConfig: { apiKey: process.env.TOGETHER_API_KEY! }, defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' }), query));
  } else {
    apiTests.push(Promise.resolve({ surfaceId: 'together-api', category: 'api', success: false, error: 'TOGETHER_API_KEY not set', durationMs: 0 }));
  }

  // Run API tests in parallel
  console.log(`Testing ${apiTests.length} API surfaces in parallel...`);
  const apiStartTime = Date.now();
  const apiResults = await Promise.all(apiTests);
  console.log(`API tests completed in ${Date.now() - apiStartTime}ms\n`);

  // ========== Web Chatbot Surfaces (in parallel) ==========
  console.log('\n--- Web Chatbot Surfaces (running in parallel) ---\n');

  const webChatbots = [
    { id: 'chatgpt-web', create: (p: any) => createChatGPTWebAdapter({}, p) },
    { id: 'perplexity-web', create: (p: any) => createPerplexityWebAdapter({}, p) },
    { id: 'x-grok-web', create: (p: any) => createXGrokWebAdapter({}, p) },
    { id: 'meta-ai-web', create: (p: any) => createMetaAIWebAdapter({}, p) },
    { id: 'copilot-web', create: (p: any) => createCopilotWebAdapter({}, p) },
  ];

  console.log(`Testing ${webChatbots.length} web chatbot surfaces in parallel...`);
  const webChatbotStartTime = Date.now();
  const webChatbotResults = await Promise.all(
    webChatbots.map(chatbot => testWebSurface(chatbot.id, chatbot.create, query, sessionManager))
  );
  console.log(`Web chatbot tests completed in ${Date.now() - webChatbotStartTime}ms\n`);

  // ========== E-commerce Surfaces (in parallel) ==========
  console.log('\n--- E-commerce Surfaces (running in parallel) ---\n');

  const ecommerceSurfaces = [
    { id: 'amazon-web', create: (p: any) => createAmazonWebAdapter({}, p), query: ECOMMERCE_QUERY },
    { id: 'amazon-rufus', create: (p: any) => createAmazonRufusAdapter({}, p), query: query },
    { id: 'zappos-web', create: (p: any) => createZapposWebAdapter({}, p), query: ECOMMERCE_QUERY },
  ];

  console.log(`Testing ${ecommerceSurfaces.length} e-commerce surfaces in parallel...`);
  const ecommerceStartTime = Date.now();
  const ecommerceResults = await Promise.all(
    ecommerceSurfaces.map(surface =>
      testWebSurface(surface.id, surface.create, surface.query, sessionManager)
    )
  );
  console.log(`E-commerce tests completed in ${Date.now() - ecommerceStartTime}ms\n`);

  // ========== Search Surfaces (in parallel) ==========
  console.log('\n--- Search Surfaces (running in parallel) ---\n');

  const searchSurfaces = [
    { id: 'google-search', create: (p: any) => createGoogleSearchAdapter({}, p) },
    { id: 'bing-search', create: (p: any) => createBingSearchAdapter({}, p) },
  ];

  console.log(`Testing ${searchSurfaces.length} search surfaces in parallel...`);
  const searchStartTime = Date.now();
  const searchResults = await Promise.all(
    searchSurfaces.map(surface => testWebSurface(surface.id, surface.create, query, sessionManager))
  );
  console.log(`Search tests completed in ${Date.now() - searchStartTime}ms\n`);

  // ========== Results Summary ==========
  const allResults = [...apiResults, ...webChatbotResults, ...ecommerceResults, ...searchResults];

  console.log('\n' + '='.repeat(60));
  console.log('  Results Summary');
  console.log('='.repeat(60) + '\n');

  const successful = allResults.filter(r => r.success);
  const failed = allResults.filter(r => !r.success);

  console.log(`Total: ${allResults.length} surfaces`);
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
      console.log(`❌ ${result.surfaceId} (${result.durationMs}ms)`);
      console.log(`   ${result.error || result.responsePreview}`);
      console.log('');
    }
  }

  // Exit with error code if any real failures
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
