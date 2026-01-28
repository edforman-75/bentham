#!/usr/bin/env npx tsx

import { testChatCompletions } from './chat-completions';
import { testResponsesApi } from './responses-api';
import type { TestCase, TestResult } from './types';

const TEST_CASES: TestCase[] = [
  {
    name: 'Simple greeting',
    prompt: 'Say hello and introduce yourself in one sentence.',
    expectedBehavior: 'Short, friendly response',
  },
  {
    name: 'AI Visibility domain question',
    prompt: 'What are the key factors that determine how often a brand gets mentioned in AI assistant responses?',
    systemPrompt: 'You are a helpful AI assistant for Bentham, an AI visibility analytics platform.',
    expectedBehavior: 'Helpful guidance about AI visibility factors',
  },
  {
    name: 'Multi-step reasoning',
    prompt: 'If a brand appears in 30% of relevant queries on ChatGPT but only 10% on Google AI Overview, and ChatGPT has 3x the user volume, what is the relative visibility advantage of ChatGPT for this brand?',
    expectedBehavior: 'Correct reasoning through the calculation',
  },
  {
    name: 'Summarization',
    prompt: 'Summarize the key points a brand should consider when evaluating their AI visibility strategy.',
    systemPrompt: 'You are a helpful AI assistant specializing in AI visibility analytics.',
    expectedBehavior: 'Concise, accurate strategy summary',
  },
];

export async function runAllTests(): Promise<void> {
  console.log('='.repeat(60));
  console.log('OpenAI API Comparison Test');
  console.log('='.repeat(60));
  console.log();

  const allResults: { testCase: string; cc: TestResult | null; resp: TestResult | null }[] = [];

  for (const testCase of TEST_CASES) {
    console.log(`\n## Test: ${testCase.name}`);
    console.log(`Prompt: "${testCase.prompt.substring(0, 50)}..."`);
    console.log('-'.repeat(40));

    let ccResult: TestResult | null = null;
    let respResult: TestResult | null = null;

    try {
      // Test Chat Completions
      console.log('\n### Chat Completions API');
      ccResult = await testChatCompletions(testCase);
      printResult(ccResult);
    } catch (error) {
      console.error(`Chat Completions Error:`, error instanceof Error ? error.message : error);
    }

    try {
      // Test Responses API
      console.log('\n### Responses API');
      respResult = await testResponsesApi(testCase);
      printResult(respResult);
    } catch (error) {
      console.error(`Responses API Error:`, error instanceof Error ? error.message : error);
    }

    // Compare if both succeeded
    if (ccResult && respResult) {
      console.log('\n### Comparison');
      compareResults(ccResult, respResult);
    }

    allResults.push({ testCase: testCase.name, cc: ccResult, resp: respResult });
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  let totalCcLatency = 0;
  let totalRespLatency = 0;
  let totalCcCost = 0;
  let totalRespCost = 0;
  let bothSucceeded = 0;

  for (const result of allResults) {
    if (result.cc && result.resp) {
      bothSucceeded++;
      totalCcLatency += result.cc.latencyMs;
      totalRespLatency += result.resp.latencyMs;
      totalCcCost += result.cc.cost;
      totalRespCost += result.resp.cost;
    }
  }

  if (bothSucceeded > 0) {
    console.log(`\nTests where both APIs succeeded: ${bothSucceeded}/${TEST_CASES.length}`);
    console.log(`\nAverage Latency:`);
    console.log(`  Chat Completions: ${Math.round(totalCcLatency / bothSucceeded)}ms`);
    console.log(`  Responses API:    ${Math.round(totalRespLatency / bothSucceeded)}ms`);
    console.log(`  Difference:       ${totalRespLatency < totalCcLatency ? 'Responses faster' : 'Chat Completions faster'} by ${Math.abs(Math.round((totalRespLatency - totalCcLatency) / bothSucceeded))}ms avg`);

    console.log(`\nTotal Cost:`);
    console.log(`  Chat Completions: $${totalCcCost.toFixed(6)}`);
    console.log(`  Responses API:    $${totalRespCost.toFixed(6)}`);

    console.log(`\nRecommendation:`);
    if (totalRespLatency < totalCcLatency && totalRespCost <= totalCcCost) {
      console.log(`  Responses API appears better for Bentham (faster and same/lower cost)`);
    } else if (totalCcLatency < totalRespLatency) {
      console.log(`  Chat Completions is faster, but Responses API may have better caching over time`);
    } else {
      console.log(`  Both APIs perform similarly; consider Responses API for built-in tools and caching`);
    }
  }
}

function printResult(result: TestResult): void {
  console.log(`Model: ${result.model}`);
  console.log(`Latency: ${result.latencyMs}ms`);
  console.log(`Tokens: ${result.inputTokens} in / ${result.outputTokens} out`);
  console.log(`Est. Cost: $${result.cost.toFixed(6)}`);
  console.log(`Response: "${result.response.substring(0, 100)}..."`);
}

function compareResults(cc: TestResult, resp: TestResult): void {
  const latencyDiff = resp.latencyMs - cc.latencyMs;
  const costDiff = resp.cost - cc.cost;

  console.log(`Latency: Responses is ${latencyDiff > 0 ? 'slower' : 'faster'} by ${Math.abs(latencyDiff)}ms`);
  console.log(`Cost: Responses is ${costDiff > 0 ? 'more expensive' : 'cheaper'} by $${Math.abs(costDiff).toFixed(6)}`);
}

// Run if called directly
runAllTests().catch(console.error);
