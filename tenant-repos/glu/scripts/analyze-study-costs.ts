#!/usr/bin/env npx tsx
/**
 * Analyze costs for the HUFT visibility studies
 */

import * as fs from 'fs';

// OpenAI pricing as of Jan 2026 (approximate)
const PRICING = {
  'gpt-4o': {
    inputPer1M: 2.50,   // $2.50 per 1M input tokens
    outputPer1M: 10.00, // $10.00 per 1M output tokens
  },
  'gpt-4o-websearch': {
    inputPer1M: 2.50,
    outputPer1M: 10.00,
    webSearchPerQuery: 0.03, // Estimated per-search cost
  },
};

// Estimate tokens from character count (rough: 1 token ≈ 4 chars)
function estimateTokens(text: string | undefined): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

interface StudyData {
  study: number;
  surface: string;
  ip: string;
  prompt: string;
  results: Array<{
    queryIndex: number;
    query: string;
    response: string;
  }>;
}

const studies = [
  { num: 1, file: 'studies/study1-india-ip-original.json', surface: 'ChatGPT Web' },
  { num: 2, file: 'studies/study2-india-ip-indiasuffix.json', surface: 'ChatGPT Web' },
  { num: 3, file: 'studies/study3-us-ip-indiasuffix.json', surface: 'ChatGPT Web' },
  { num: 4, file: 'studies/study4-chat-api-us-india-suffix.json', surface: 'Chat API' },
  { num: 5, file: 'studies/study5-chat-api-india-proxy-india-suffix.json', surface: 'Chat API' },
  { num: 6, file: 'studies/study6-websearch-api-us-india-suffix.json', surface: 'Web Search API' },
  { num: 7, file: 'studies/study7-websearch-api-india-proxy-india-suffix.json', surface: 'Web Search API' },
  { num: 8, file: 'studies/study8-chat-api-us-original.json', surface: 'Chat API' },
  { num: 9, file: 'studies/study9-websearch-api-us-original.json', surface: 'Web Search API' },
  { num: 10, file: 'studies/study10-chat-api-india-original.json', surface: 'Chat API' },
  { num: 11, file: 'studies/study11-websearch-api-india-original.json', surface: 'Web Search API' },
  { num: 12, file: 'studies/study12-chatgpt-web-us-original.json', surface: 'ChatGPT Web' },
];

console.log('='.repeat(80));
console.log('HUFT Study Cost Analysis');
console.log('='.repeat(80));
console.log('');

let totalCost = 0;
const surfaceCosts: Record<string, { queries: number; inputTokens: number; outputTokens: number; cost: number }> = {
  'ChatGPT Web': { queries: 0, inputTokens: 0, outputTokens: 0, cost: 0 },
  'Chat API': { queries: 0, inputTokens: 0, outputTokens: 0, cost: 0 },
  'Web Search API': { queries: 0, inputTokens: 0, outputTokens: 0, cost: 0 },
};

for (const study of studies) {
  if (!fs.existsSync(study.file)) {
    console.log(`Skipping ${study.file} (not found)`);
    continue;
  }

  const data: StudyData = JSON.parse(fs.readFileSync(study.file, 'utf-8'));
  const surface = study.surface;

  let studyInputTokens = 0;
  let studyOutputTokens = 0;
  let studyCost = 0;

  for (const result of data.results) {
    const inputTokens = estimateTokens(result.query);
    const outputTokens = estimateTokens(result.response);

    studyInputTokens += inputTokens;
    studyOutputTokens += outputTokens;

    surfaceCosts[surface].queries++;
    surfaceCosts[surface].inputTokens += inputTokens;
    surfaceCosts[surface].outputTokens += outputTokens;
  }

  // Calculate cost based on surface
  if (surface === 'ChatGPT Web') {
    // ChatGPT Web is "free" for users with subscriptions, but has time cost
    // For this analysis, we'll mark it as $0 API cost but note the manual effort
    studyCost = 0;
  } else if (surface === 'Chat API') {
    studyCost =
      (studyInputTokens / 1_000_000) * PRICING['gpt-4o'].inputPer1M +
      (studyOutputTokens / 1_000_000) * PRICING['gpt-4o'].outputPer1M;
  } else if (surface === 'Web Search API') {
    studyCost =
      (studyInputTokens / 1_000_000) * PRICING['gpt-4o-websearch'].inputPer1M +
      (studyOutputTokens / 1_000_000) * PRICING['gpt-4o-websearch'].outputPer1M +
      data.results.length * PRICING['gpt-4o-websearch'].webSearchPerQuery;
  }

  surfaceCosts[surface].cost += studyCost;
  totalCost += studyCost;

  console.log(`Study ${study.num} (${surface})`);
  console.log(`  Queries: ${data.results.length}`);
  console.log(`  Input tokens:  ${studyInputTokens.toLocaleString()}`);
  console.log(`  Output tokens: ${studyOutputTokens.toLocaleString()}`);
  console.log(`  API Cost: $${studyCost.toFixed(4)}`);
  console.log('');
}

console.log('='.repeat(80));
console.log('COST BY SURFACE');
console.log('='.repeat(80));
console.log('');

console.log('Surface          | Queries | Input Tokens | Output Tokens | API Cost  | Cost/Query');
console.log('-'.repeat(85));

for (const [surface, data] of Object.entries(surfaceCosts)) {
  const costPerQuery = data.queries > 0 ? data.cost / data.queries : 0;
  console.log(
    surface.padEnd(16) + ' | ' +
    String(data.queries).padStart(7) + ' | ' +
    data.inputTokens.toLocaleString().padStart(12) + ' | ' +
    data.outputTokens.toLocaleString().padStart(13) + ' | ' +
    ('$' + data.cost.toFixed(4)).padStart(9) + ' | ' +
    ('$' + costPerQuery.toFixed(4)).padStart(10)
  );
}

console.log('-'.repeat(85));
console.log(`${'TOTAL'.padEnd(16)} | ${String(240).padStart(7)} | ${''} | ${''} | ${'$' + totalCost.toFixed(4).padStart(8)} |`);

console.log('');
console.log('='.repeat(80));
console.log('NOTES');
console.log('='.repeat(80));
console.log('');
console.log('1. ChatGPT Web shows $0 API cost because it uses a subscription, not API.');
console.log('   Real cost = subscription ($20/month) + manual effort for browser automation.');
console.log('');
console.log('2. Proxy costs are NOT included. Cherry Proxy (India) is approx:');
console.log('   - Residential: ~$3/GB or ~$0.01-0.05 per request');
console.log('   - For 80 India-proxied requests: ~$0.80-4.00');
console.log('');
console.log('3. Web Search API includes estimated $0.03/query for web search tool.');
console.log('');
console.log('4. Token estimates use 4 chars/token approximation.');
console.log('');

// Cost comparison table
console.log('='.repeat(80));
console.log('COST COMPARISON: Per-Query by Surface');
console.log('='.repeat(80));
console.log('');
console.log('If running 20 queries:');
console.log('');

const perQuery = {
  'ChatGPT Web': { api: 0, proxy: 0.02, total: 0.02, note: '+ subscription' },
  'Chat API': { api: surfaceCosts['Chat API'].cost / surfaceCosts['Chat API'].queries, proxy: 0, total: 0 },
  'Web Search API': { api: surfaceCosts['Web Search API'].cost / surfaceCosts['Web Search API'].queries, proxy: 0, total: 0 },
};
perQuery['Chat API'].total = perQuery['Chat API'].api;
perQuery['Web Search API'].total = perQuery['Web Search API'].api;

console.log('Surface          | API/Query | Proxy/Query | Total/Query | 20 Queries');
console.log('-'.repeat(70));
for (const [surface, costs] of Object.entries(perQuery)) {
  console.log(
    surface.padEnd(16) + ' | ' +
    ('$' + costs.api.toFixed(4)).padStart(9) + ' | ' +
    ('$' + costs.proxy.toFixed(4)).padStart(11) + ' | ' +
    ('$' + costs.total.toFixed(4)).padStart(11) + ' | ' +
    ('$' + (costs.total * 20).toFixed(2)).padStart(10)
  );
}
console.log('');
