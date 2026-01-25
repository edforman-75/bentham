#!/usr/bin/env npx tsx
/**
 * Add comprehensive cost analysis tab to the HUFT Excel file
 * Shows all 12 studies with cost breakdown by category
 */

import * as fs from 'fs';
import XLSX from 'xlsx';

// Load existing workbook
const workbook = XLSX.readFile('studies/huft-analysis.xlsx');

// Pricing (Jan 2026) - matches Bentham core config
const PRICING = {
  'gpt-4o': {
    inputPer1K: 0.0025,
    outputPer1K: 0.01,
  },
  webSearchTool: 0.03,  // per query
  proxy: {
    'India': 0.025,     // residential, Cherry Proxy
    'US': 0.00,         // no proxy needed
  },
  chatgptSubscription: {
    monthly: 20.00,
    queriesPerMonth: 1000,  // assumption for amortization
  },
};

// All 12 studies
const studies = [
  { num: 1, surface: 'ChatGPT Web', ip: 'India', prompt: 'Original', file: 'studies/study1-india-ip-original.json' },
  { num: 2, surface: 'ChatGPT Web', ip: 'India', prompt: 'India Suffix', file: 'studies/study2-india-ip-indiasuffix.json' },
  { num: 3, surface: 'ChatGPT Web', ip: 'US', prompt: 'India Suffix', file: 'studies/study3-us-ip-indiasuffix.json' },
  { num: 4, surface: 'Chat API', ip: 'US', prompt: 'India Suffix', file: 'studies/study4-chat-api-us-india-suffix.json' },
  { num: 5, surface: 'Chat API', ip: 'India', prompt: 'India Suffix', file: 'studies/study5-chat-api-india-proxy-india-suffix.json' },
  { num: 6, surface: 'Web Search API', ip: 'US', prompt: 'India Suffix', file: 'studies/study6-websearch-api-us-india-suffix.json' },
  { num: 7, surface: 'Web Search API', ip: 'India', prompt: 'India Suffix', file: 'studies/study7-websearch-api-india-proxy-india-suffix.json' },
  { num: 8, surface: 'Chat API', ip: 'US', prompt: 'Original', file: 'studies/study8-chat-api-us-original.json' },
  { num: 9, surface: 'Web Search API', ip: 'US', prompt: 'Original', file: 'studies/study9-websearch-api-us-original.json' },
  { num: 10, surface: 'Chat API', ip: 'India', prompt: 'Original', file: 'studies/study10-chat-api-india-original.json' },
  { num: 11, surface: 'Web Search API', ip: 'India', prompt: 'Original', file: 'studies/study11-websearch-api-india-original.json' },
  { num: 12, surface: 'ChatGPT Web', ip: 'US', prompt: 'Original', file: 'studies/study12-chatgpt-web-us-original.json' },
];

function estimateTokens(text: string | undefined): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// Build cost data - ALL 12 STUDIES
const costData: any[][] = [
  ['HUFT Visibility Study - Cost Analysis'],
  ['All 12 Studies with Cost Breakdown per 1,000 Queries'],
  [],
  ['Study', 'Surface', 'IP', 'Prompt', 'Queries', 'Output Tokens', 'API Tokens ($)', 'Web Search ($)', 'Proxy ($)', 'Subscription ($)', 'TOTAL ($)', 'Per Query ($)'],
];

let grandTotalApi = 0;
let grandTotalWebSearch = 0;
let grandTotalProxy = 0;
let grandTotalSubscription = 0;
let grandTotalQueries = 0;

for (const study of studies) {
  let queryCount = 20;
  let outputTokens = 0;

  if (fs.existsSync(study.file)) {
    const data = JSON.parse(fs.readFileSync(study.file, 'utf-8'));
    queryCount = data.results?.length || 20;
    for (const result of data.results || []) {
      outputTokens += estimateTokens(result.response);
    }
  }

  // Calculate costs per 1000 queries
  let apiTokenCost = 0;
  let webSearchCost = 0;
  let proxyCost = 0;
  let subscriptionCost = 0;

  const avgOutputTokensPerQuery = outputTokens / queryCount;

  if (study.surface === 'ChatGPT Web') {
    subscriptionCost = (PRICING.chatgptSubscription.monthly / PRICING.chatgptSubscription.queriesPerMonth) * 1000;
    if (study.ip === 'India') {
      proxyCost = PRICING.proxy['India'] * 1000;
    }
  } else if (study.surface === 'Chat API') {
    apiTokenCost = ((avgOutputTokensPerQuery / 1000) * PRICING['gpt-4o'].outputPer1K) * 1000;
    if (study.ip === 'India') {
      proxyCost = PRICING.proxy['India'] * 1000;
    }
  } else if (study.surface === 'Web Search API') {
    apiTokenCost = ((avgOutputTokensPerQuery / 1000) * PRICING['gpt-4o'].outputPer1K) * 1000;
    webSearchCost = PRICING.webSearchTool * 1000;
    if (study.ip === 'India') {
      proxyCost = PRICING.proxy['India'] * 1000;
    }
  }

  const totalCost = apiTokenCost + webSearchCost + proxyCost + subscriptionCost;
  const perQueryCost = totalCost / 1000;

  grandTotalApi += apiTokenCost;
  grandTotalWebSearch += webSearchCost;
  grandTotalProxy += proxyCost;
  grandTotalSubscription += subscriptionCost;
  grandTotalQueries += queryCount;

  costData.push([
    study.num,
    study.surface,
    study.ip,
    study.prompt,
    queryCount,
    outputTokens,
    apiTokenCost.toFixed(2),
    webSearchCost.toFixed(2),
    proxyCost.toFixed(2),
    subscriptionCost.toFixed(2),
    totalCost.toFixed(2),
    perQueryCost.toFixed(4),
  ]);
}

// Add totals row
costData.push([]);
costData.push([
  'TOTALS',
  '',
  '',
  '',
  grandTotalQueries,
  '',
  grandTotalApi.toFixed(2),
  grandTotalWebSearch.toFixed(2),
  grandTotalProxy.toFixed(2),
  grandTotalSubscription.toFixed(2),
  (grandTotalApi + grandTotalWebSearch + grandTotalProxy + grandTotalSubscription).toFixed(2),
  '',
]);

// Add summary by surface
costData.push([]);
costData.push([]);
costData.push(['SUMMARY BY SURFACE (Cost per 1,000 Queries)']);
costData.push([]);
costData.push(['Surface', 'IP', 'API Tokens', 'Web Search', 'Proxy', 'Subscription', 'TOTAL/1K', 'Notes']);

const summaryConfigs = [
  { surface: 'ChatGPT Web', ip: 'India', notes: 'Best for HUFT visibility, requires browser automation' },
  { surface: 'ChatGPT Web', ip: 'US', notes: 'Lower HUFT visibility than India IP' },
  { surface: 'Chat API', ip: 'US', notes: 'Lowest cost, lowest HUFT visibility' },
  { surface: 'Chat API', ip: 'India', notes: 'Proxy adds cost, minimal visibility improvement' },
  { surface: 'Web Search API', ip: 'US', notes: 'Moderate cost, exposes source citations' },
  { surface: 'Web Search API', ip: 'India', notes: 'Highest cost, source analysis possible' },
];

for (const config of summaryConfigs) {
  let apiCost = 0;
  let webSearchCost = 0;
  let proxyCost = 0;
  let subscriptionCost = 0;

  if (config.surface === 'ChatGPT Web') {
    subscriptionCost = 20.00;
    if (config.ip === 'India') proxyCost = 25.00;
  } else if (config.surface === 'Chat API') {
    apiCost = 3.50;  // ~350 output tokens avg
    if (config.ip === 'India') proxyCost = 25.00;
  } else if (config.surface === 'Web Search API') {
    apiCost = 5.00;  // ~500 output tokens avg
    webSearchCost = 30.00;
    if (config.ip === 'India') proxyCost = 25.00;
  }

  const total = apiCost + webSearchCost + proxyCost + subscriptionCost;

  costData.push([
    config.surface,
    config.ip,
    `$${apiCost.toFixed(2)}`,
    `$${webSearchCost.toFixed(2)}`,
    `$${proxyCost.toFixed(2)}`,
    `$${subscriptionCost.toFixed(2)}`,
    `$${total.toFixed(2)}`,
    config.notes,
  ]);
}

// Add pricing assumptions
costData.push([]);
costData.push([]);
costData.push(['PRICING ASSUMPTIONS (January 2026)']);
costData.push([]);
costData.push(['Cost Category', 'Rate', 'Source']);
costData.push(['GPT-4o Input Tokens', '$2.50 / 1M tokens', 'OpenAI pricing']);
costData.push(['GPT-4o Output Tokens', '$10.00 / 1M tokens', 'OpenAI pricing']);
costData.push(['Web Search Tool', '$0.03 / query', 'OpenAI Responses API']);
costData.push(['Residential Proxy (India)', '$0.025 / request', 'Cherry Proxy']);
costData.push(['Residential Proxy (US)', '$0.00 (direct)', 'No proxy needed']);
costData.push(['ChatGPT Plus Subscription', '$20.00 / month', 'Amortized @ 1K queries/mo']);

// Add ACTUAL COST for the 20-query study
costData.push([]);
costData.push([]);
costData.push(['ACTUAL COST: This 20-Query Study']);
costData.push([]);
costData.push(['Study', 'Surface', 'IP', 'Queries', 'API ($)', 'Web Search ($)', 'Proxy ($)', 'Subscription ($)', 'TOTAL ($)']);

let studyTotalCost = 0;
for (const study of studies) {
  let api = 0, ws = 0, proxy = 0, sub = 0;

  if (study.surface === 'ChatGPT Web') {
    sub = 20 * (20 / 1000);  // 20 queries out of 1000/month
    if (study.ip === 'India') proxy = 0.025 * 20;
  } else if (study.surface === 'Chat API') {
    api = 3.5 * (20 / 1000);
    if (study.ip === 'India') proxy = 0.025 * 20;
  } else if (study.surface === 'Web Search API') {
    api = 5 * (20 / 1000);
    ws = 0.03 * 20;
    if (study.ip === 'India') proxy = 0.025 * 20;
  }
  const total = api + ws + proxy + sub;
  studyTotalCost += total;

  costData.push([
    study.num,
    study.surface,
    study.ip,
    20,
    `$${api.toFixed(2)}`,
    `$${ws.toFixed(2)}`,
    `$${proxy.toFixed(2)}`,
    `$${sub.toFixed(2)}`,
    `$${total.toFixed(2)}`,
  ]);
}

costData.push([]);
costData.push(['', '', '', '', '', '', '', 'TOTAL:', `$${studyTotalCost.toFixed(2)}`]);

// Add cost comparison
costData.push([]);
costData.push([]);
costData.push(['COST COMPARISON: Which Surface for Which Use Case?']);
costData.push([]);
costData.push(['Use Case', 'Recommended Surface', 'Cost/1K', 'Tradeoff']);
costData.push(['Lowest cost monitoring', 'Chat API (US)', '$3.50', 'Low HUFT visibility, no source data']);
costData.push(['Consumer experience testing', 'ChatGPT Web (India)', '$45.00', 'Best HUFT visibility, requires automation']);
costData.push(['Source influence analysis', 'Web Search API (US)', '$35.00', 'Exposes citations, moderate visibility']);
costData.push(['Comprehensive India testing', 'Web Search API (India)', '$60.00', 'Full source data + India IP']);

// Create worksheet
const wsCost = XLSX.utils.aoa_to_sheet(costData);

// Set column widths
wsCost['!cols'] = [
  { wch: 10 },  // Study/Category
  { wch: 16 },  // Surface
  { wch: 8 },   // IP
  { wch: 14 },  // Prompt
  { wch: 8 },   // Queries
  { wch: 14 },  // Output Tokens
  { wch: 14 },  // API Tokens
  { wch: 14 },  // Web Search
  { wch: 12 },  // Proxy
  { wch: 16 },  // Subscription
  { wch: 12 },  // TOTAL
  { wch: 14 },  // Per Query
  { wch: 50 },  // Notes
];

// Replace existing Cost Analysis tab
if (workbook.SheetNames.includes('Cost Analysis')) {
  const idx = workbook.SheetNames.indexOf('Cost Analysis');
  workbook.SheetNames.splice(idx, 1);
  delete workbook.Sheets['Cost Analysis'];
}

XLSX.utils.book_append_sheet(workbook, wsCost, 'Cost Analysis');

// Save
XLSX.writeFile(workbook, 'studies/huft-analysis.xlsx');

console.log('Updated "Cost Analysis" tab with all 12 studies');
console.log('Tab order:', workbook.SheetNames);

// Print summary to console
console.log('\n' + '='.repeat(80));
console.log('COST SUMMARY: All 12 Studies (per 1,000 queries)');
console.log('='.repeat(80));
console.log('\nStudy | Surface          | IP    | API ($) | WebSearch ($) | Proxy ($) | Sub ($) | TOTAL ($)');
console.log('-'.repeat(95));

for (const study of studies) {
  let total = 0;
  let api = 0, ws = 0, proxy = 0, sub = 0;

  if (study.surface === 'ChatGPT Web') {
    sub = 20;
    if (study.ip === 'India') proxy = 25;
  } else if (study.surface === 'Chat API') {
    api = 3.5;
    if (study.ip === 'India') proxy = 25;
  } else if (study.surface === 'Web Search API') {
    api = 5;
    ws = 30;
    if (study.ip === 'India') proxy = 25;
  }
  total = api + ws + proxy + sub;

  console.log(
    `  ${String(study.num).padStart(2)}  | ${study.surface.padEnd(16)} | ${study.ip.padEnd(5)} | ${String(api.toFixed(2)).padStart(7)} | ${String(ws.toFixed(2)).padStart(13)} | ${String(proxy.toFixed(2)).padStart(9)} | ${String(sub.toFixed(2)).padStart(7)} | ${String(total.toFixed(2)).padStart(9)}`
  );
}
console.log('-'.repeat(95));
