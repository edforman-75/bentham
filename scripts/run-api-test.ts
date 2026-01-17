#!/usr/bin/env npx tsx
/**
 * API Surface Test Runner
 *
 * Runs queries from a manifest against all configured API surfaces.
 * Usage: OPENAI_API_KEY=xxx ANTHROPIC_API_KEY=xxx npx tsx scripts/run-api-test.ts
 */

import {
  createOpenAIAdapter,
  createAnthropicAdapter,
  createGoogleAIAdapter,
  createPerplexityAdapter,
  createXAIAdapter,
  createTogetherAdapter,
} from '../packages/surface-adapters/src/index.js';
import type { SurfaceAdapter, SurfaceQueryRequest } from '../packages/surface-adapters/src/types.js';

interface TestResult {
  surface: string;
  query: string;
  success: boolean;
  response?: string;
  error?: string;
  tokens?: { input: number; output: number; total: number };
  responseTimeMs: number;
}

// Test queries from the valid-full manifest
const TEST_QUERIES = [
  'What are the health benefits of green tea?',
  'How do I invest in index funds?',
  'What is the best programming language to learn in 2024?',
];

async function createAdapters(): Promise<Map<string, SurfaceAdapter>> {
  const adapters = new Map<string, SurfaceAdapter>();

  if (process.env.OPENAI_API_KEY) {
    adapters.set('openai-api', createOpenAIAdapter({
      apiConfig: { apiKey: process.env.OPENAI_API_KEY },
      defaultModel: 'gpt-4o-mini', // Latest mini model
      maxRetries: 0,
      timeoutMs: 30000,
    }));
    console.log('✓ OpenAI adapter configured (gpt-4o-mini)');
  } else {
    console.log('⊘ OPENAI_API_KEY not set');
  }

  if (process.env.ANTHROPIC_API_KEY) {
    adapters.set('anthropic-api', createAnthropicAdapter({
      apiConfig: { apiKey: process.env.ANTHROPIC_API_KEY },
      defaultModel: 'claude-3-5-haiku-latest', // Latest Haiku
      maxRetries: 0,
      timeoutMs: 30000,
    }));
    console.log('✓ Anthropic adapter configured (claude-3-5-haiku-latest)');
  } else {
    console.log('⊘ ANTHROPIC_API_KEY not set');
  }

  if (process.env.GOOGLE_AI_API_KEY) {
    adapters.set('google-ai-api', createGoogleAIAdapter({
      apiConfig: { apiKey: process.env.GOOGLE_AI_API_KEY },
      // Uses default gemini-2.0-flash
      maxRetries: 0,
      timeoutMs: 30000,
    }));
    console.log('✓ Google AI adapter configured (gemini-2.0-flash)');
  } else {
    console.log('⊘ GOOGLE_AI_API_KEY not set');
  }

  if (process.env.PERPLEXITY_API_KEY) {
    adapters.set('perplexity-api', createPerplexityAdapter({
      apiConfig: { apiKey: process.env.PERPLEXITY_API_KEY },
      // Uses default sonar
      maxRetries: 0,
      timeoutMs: 30000,
    }));
    console.log('✓ Perplexity adapter configured (sonar)');
  } else {
    console.log('⊘ PERPLEXITY_API_KEY not set');
  }

  if (process.env.XAI_API_KEY) {
    adapters.set('xai-api', createXAIAdapter({
      apiConfig: { apiKey: process.env.XAI_API_KEY },
      // Uses default grok-2-latest
      maxRetries: 0,
      timeoutMs: 30000,
    }));
    console.log('✓ xAI adapter configured (grok-3)');
  } else {
    console.log('⊘ XAI_API_KEY not set');
  }

  if (process.env.TOGETHER_API_KEY) {
    adapters.set('together-api', createTogetherAdapter({
      apiConfig: { apiKey: process.env.TOGETHER_API_KEY },
      // Uses default Llama 3.3 70B
      maxRetries: 0,
      timeoutMs: 30000,
    }));
    console.log('✓ Together adapter configured (Llama-3.3-70B)');
  } else {
    console.log('⊘ TOGETHER_API_KEY not set');
  }

  return adapters;
}

async function runQuery(
  surface: string,
  adapter: SurfaceAdapter,
  query: string
): Promise<TestResult> {
  const request: SurfaceQueryRequest = {
    query,
    options: {},
  };

  const startTime = Date.now();

  try {
    const result = await adapter.query(request);
    const responseTimeMs = Date.now() - startTime;

    if (result.success && result.responseText) {
      return {
        surface,
        query,
        success: true,
        response: result.responseText.substring(0, 200) + (result.responseText.length > 200 ? '...' : ''),
        tokens: result.tokenUsage ? {
          input: result.tokenUsage.inputTokens,
          output: result.tokenUsage.outputTokens,
          total: result.tokenUsage.totalTokens,
        } : undefined,
        responseTimeMs,
      };
    } else {
      return {
        surface,
        query,
        success: false,
        error: result.error?.message || 'Unknown error',
        responseTimeMs,
      };
    }
  } catch (err) {
    return {
      surface,
      query,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      responseTimeMs: Date.now() - startTime,
    };
  }
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║           Bentham API Surface Test Runner                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const adapters = await createAdapters();

  if (adapters.size === 0) {
    console.error('\n❌ No API keys configured. Set environment variables and try again.');
    process.exit(1);
  }

  console.log(`\nRunning ${TEST_QUERIES.length} queries across ${adapters.size} surfaces...\n`);
  console.log('─'.repeat(70));

  const results: TestResult[] = [];
  let totalTokens = 0;
  let totalTime = 0;

  for (const query of TEST_QUERIES) {
    console.log(`\n📝 Query: "${query.substring(0, 50)}..."\n`);

    for (const [surface, adapter] of adapters) {
      process.stdout.write(`   ${surface.padEnd(18)}`);

      const result = await runQuery(surface, adapter, query);
      results.push(result);

      if (result.success) {
        console.log(`✅ ${result.responseTimeMs}ms | ${result.tokens?.total || 0} tokens`);
        if (result.tokens) totalTokens += result.tokens.total;
        totalTime += result.responseTimeMs;
      } else {
        console.log(`❌ ${result.error}`);
      }
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(70));
  console.log('SUMMARY');
  console.log('═'.repeat(70));

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`Total queries:    ${results.length}`);
  console.log(`Successful:       ${successful} (${((successful / results.length) * 100).toFixed(1)}%)`);
  console.log(`Failed:           ${failed}`);
  console.log(`Total tokens:     ${totalTokens}`);
  console.log(`Total time:       ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`Avg response:     ${(totalTime / successful).toFixed(0)}ms`);

  // Per-surface breakdown
  console.log('\nPer-Surface Results:');
  for (const [surface] of adapters) {
    const surfaceResults = results.filter(r => r.surface === surface);
    const surfaceSuccess = surfaceResults.filter(r => r.success).length;
    const surfaceTokens = surfaceResults
      .filter(r => r.tokens)
      .reduce((sum, r) => sum + (r.tokens?.total || 0), 0);
    const avgTime = surfaceResults
      .filter(r => r.success)
      .reduce((sum, r) => sum + r.responseTimeMs, 0) / surfaceSuccess || 0;

    console.log(`  ${surface.padEnd(18)} ${surfaceSuccess}/${surfaceResults.length} success | ${surfaceTokens} tokens | ${avgTime.toFixed(0)}ms avg`);
  }

  // Sample responses
  console.log('\n' + '─'.repeat(70));
  console.log('SAMPLE RESPONSES (first query)');
  console.log('─'.repeat(70));

  const firstQueryResults = results.filter(r => r.query === TEST_QUERIES[0] && r.success);
  for (const result of firstQueryResults) {
    console.log(`\n[${result.surface}]`);
    console.log(result.response);
  }

  // Close adapters
  for (const [, adapter] of adapters) {
    await adapter.close();
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
