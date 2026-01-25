#!/usr/bin/env npx tsx
/**
 * Generate Web Layer Augmentation Report
 *
 * Analyzes how API responses are augmented when distributed through web surfaces:
 * - OpenAI API vs ChatGPT Web
 * - Gemini API vs Google AI Overviews
 *
 * Goal: Help brands understand how to optimize for AI-generated mentions
 */

import { readFileSync, writeFileSync } from 'fs';

interface QueryResult {
  query: string;
  queryIndex: number;
  surface: string;
  success: boolean;
  response?: string;
  aiOverview?: string;
  organicResults?: string[];
  error?: string;
  timestamp: string;
  responseTimeMs: number;
}

interface BrandMention {
  brand: string;
  count: number;
  queries: string[];
  contexts: string[];
}

// Known pet brands to track
const PET_BRANDS = [
  // Dog Food
  'Pedigree', 'Royal Canin', 'Drools', 'Farmina', 'Orijen', 'Acana',
  'Hills', 'Hill\'s', 'Purina', 'Whiskas', 'Iams', 'Eukanuba',
  'Blue Buffalo', 'Wellness', 'Taste of the Wild', 'Canidae',
  // Indian brands
  'Heads Up For Tails', 'HUFT', 'Kennel Kitchen', 'Fresh For Paws',
  'Dogsee', 'Chip Chops', 'Goofy Tails', 'Wiggles', 'Supertails',
  // Treats
  'Greenies', 'Dentastix', 'Milk-Bone', 'Zuke\'s',
  // Pet stores
  'Amazon', 'Chewy', 'Petco', 'PetSmart', 'Supertails', 'Zigly',
];

function extractBrandMentions(text: string, query: string): { brand: string; context: string }[] {
  const mentions: { brand: string; context: string }[] = [];
  const lowerText = text.toLowerCase();

  for (const brand of PET_BRANDS) {
    const lowerBrand = brand.toLowerCase();
    if (lowerText.includes(lowerBrand)) {
      // Extract context around mention (50 chars before and after)
      const idx = lowerText.indexOf(lowerBrand);
      const start = Math.max(0, idx - 50);
      const end = Math.min(text.length, idx + brand.length + 50);
      const context = text.slice(start, end).replace(/\n/g, ' ').trim();
      mentions.push({ brand, context: `...${context}...` });
    }
  }

  return mentions;
}

function analyzeWebLayerDifferences(apiResults: QueryResult[], webResults: QueryResult[]): {
  addedBrands: Map<string, number>;
  removedBrands: Map<string, number>;
  formatDifferences: { emojis: number; lists: number; links: number; longer: number; shorter: number };
  examples: { query: string; apiResponse: string; webResponse: string; difference: string }[];
} {
  const addedBrands = new Map<string, number>();
  const removedBrands = new Map<string, number>();
  const formatDifferences = { emojis: 0, lists: 0, links: 0, longer: 0, shorter: 0 };
  const examples: { query: string; apiResponse: string; webResponse: string; difference: string }[] = [];

  for (const apiResult of apiResults) {
    const webResult = webResults.find(w => w.queryIndex === apiResult.queryIndex && w.success);
    if (!apiResult.success || !webResult?.response || !apiResult.response) continue;

    const apiText = apiResult.response;
    const webText = webResult.response;

    // Brand analysis
    const apiBrands = new Set(extractBrandMentions(apiText, apiResult.query).map(m => m.brand));
    const webBrands = new Set(extractBrandMentions(webText, apiResult.query).map(m => m.brand));

    for (const brand of webBrands) {
      if (!apiBrands.has(brand)) {
        addedBrands.set(brand, (addedBrands.get(brand) || 0) + 1);
      }
    }

    for (const brand of apiBrands) {
      if (!webBrands.has(brand)) {
        removedBrands.set(brand, (removedBrands.get(brand) || 0) + 1);
      }
    }

    // Format analysis
    const webHasEmojis = /[\u{1F300}-\u{1F9FF}]/u.test(webText);
    const apiHasEmojis = /[\u{1F300}-\u{1F9FF}]/u.test(apiText);
    if (webHasEmojis && !apiHasEmojis) formatDifferences.emojis++;

    const webHasLists = (webText.match(/^[\s]*[-•*\d+\.]/gm) || []).length;
    const apiHasLists = (apiText.match(/^[\s]*[-•*\d+\.]/gm) || []).length;
    if (webHasLists > apiHasLists) formatDifferences.lists++;

    const webHasLinks = webText.includes('http') || webText.includes('www.');
    const apiHasLinks = apiText.includes('http') || apiText.includes('www.');
    if (webHasLinks && !apiHasLinks) formatDifferences.links++;

    if (webText.length > apiText.length * 1.2) formatDifferences.longer++;
    if (webText.length < apiText.length * 0.8) formatDifferences.shorter++;

    // Collect interesting examples
    if (examples.length < 5 && (webBrands.size !== apiBrands.size || webHasEmojis !== apiHasEmojis)) {
      examples.push({
        query: apiResult.query,
        apiResponse: apiText.slice(0, 500) + (apiText.length > 500 ? '...' : ''),
        webResponse: webText.slice(0, 500) + (webText.length > 500 ? '...' : ''),
        difference: `API brands: ${Array.from(apiBrands).join(', ') || 'none'}, Web brands: ${Array.from(webBrands).join(', ') || 'none'}`,
      });
    }
  }

  return { addedBrands, removedBrands, formatDifferences, examples };
}

function getBrandMentionStats(results: QueryResult[]): Map<string, BrandMention> {
  const brandStats = new Map<string, BrandMention>();

  for (const result of results) {
    if (!result.success || !result.response) continue;

    const text = result.aiOverview || result.response;
    const mentions = extractBrandMentions(text, result.query);

    for (const mention of mentions) {
      const existing = brandStats.get(mention.brand) || {
        brand: mention.brand,
        count: 0,
        queries: [],
        contexts: [],
      };
      existing.count++;
      if (!existing.queries.includes(result.query)) {
        existing.queries.push(result.query);
      }
      existing.contexts.push(mention.context);
      brandStats.set(mention.brand, existing);
    }
  }

  return brandStats;
}

async function main() {
  console.log('Loading study results...\n');

  // Load all results
  const mainStudy = JSON.parse(readFileSync('studies/huft-100-india-study-results.json', 'utf-8'));
  const geminiApi = JSON.parse(readFileSync('studies/huft-gemini-api-results.json', 'utf-8'));
  const googleBangalore = JSON.parse(readFileSync('studies/huft-google-india-bangalore-results.json', 'utf-8'));

  // Separate results by surface
  const openaiApi = mainStudy.results.filter((r: QueryResult) => r.surface === 'openai-api');
  const chatgptWeb = mainStudy.results.filter((r: QueryResult) => r.surface === 'chatgpt-web');
  const googleIndia = googleBangalore.results; // Use Bangalore (more complete)
  const geminiApiResults = geminiApi.results;

  console.log('Data loaded:');
  console.log(`  OpenAI API: ${openaiApi.filter((r: QueryResult) => r.success).length}/100`);
  console.log(`  ChatGPT Web: ${chatgptWeb.filter((r: QueryResult) => r.success).length}/100`);
  console.log(`  Google AI Overviews: ${googleIndia.filter((r: QueryResult) => r.success).length}/100`);
  console.log(`  Gemini API: ${geminiApiResults.filter((r: QueryResult) => r.success).length}/100`);
  console.log('');

  // Analyze OpenAI API vs ChatGPT Web
  console.log('Analyzing OpenAI API vs ChatGPT Web...');
  const openaiAnalysis = analyzeWebLayerDifferences(openaiApi, chatgptWeb);

  // Analyze Gemini API vs Google AI Overviews
  console.log('Analyzing Gemini API vs Google AI Overviews...');
  const googleAnalysis = analyzeWebLayerDifferences(geminiApiResults, googleIndia);

  // Get brand mention stats for each surface
  console.log('Extracting brand mentions...');
  const openaiApiBrands = getBrandMentionStats(openaiApi);
  const chatgptWebBrands = getBrandMentionStats(chatgptWeb);
  const googleBrands = getBrandMentionStats(googleIndia);
  const geminiBrands = getBrandMentionStats(geminiApiResults);

  // Build report data
  const reportData = {
    generatedAt: new Date().toISOString(),
    studyName: 'HUFT Pet Products Web Layer Augmentation Study',
    purpose: 'Analyze how API responses are augmented through web surfaces to help brands optimize AI visibility',

    dataSummary: {
      openaiApi: { total: 100, successful: openaiApi.filter((r: QueryResult) => r.success).length },
      chatgptWeb: { total: 100, successful: chatgptWeb.filter((r: QueryResult) => r.success).length },
      googleAiOverviews: {
        total: 100,
        successful: googleIndia.filter((r: QueryResult) => r.success).length,
        aiOverviewsFound: googleIndia.filter((r: QueryResult) => r.aiOverview).length,
      },
      geminiApi: { total: 100, successful: geminiApiResults.filter((r: QueryResult) => r.success).length },
    },

    openaiWebLayerAnalysis: {
      description: 'How ChatGPT Web augments OpenAI API responses',
      brandsAddedByWeb: Object.fromEntries([...openaiAnalysis.addedBrands.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)),
      brandsRemovedByWeb: Object.fromEntries([...openaiAnalysis.removedBrands.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)),
      formatChanges: openaiAnalysis.formatDifferences,
      examples: openaiAnalysis.examples,
    },

    googleWebLayerAnalysis: {
      description: 'How Google AI Overviews augment Gemini API responses',
      brandsAddedByWeb: Object.fromEntries([...googleAnalysis.addedBrands.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)),
      brandsRemovedByWeb: Object.fromEntries([...googleAnalysis.removedBrands.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)),
      formatChanges: googleAnalysis.formatDifferences,
      examples: googleAnalysis.examples,
    },

    brandVisibility: {
      openaiApi: Object.fromEntries([...openaiApiBrands.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 15).map(([k, v]) => [k, v.count])),
      chatgptWeb: Object.fromEntries([...chatgptWebBrands.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 15).map(([k, v]) => [k, v.count])),
      googleAiOverviews: Object.fromEntries([...googleBrands.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 15).map(([k, v]) => [k, v.count])),
      geminiApi: Object.fromEntries([...geminiBrands.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 15).map(([k, v]) => [k, v.count])),
    },

    keyInsights: [] as string[],
    recommendations: [] as string[],
  };

  // Generate insights
  const insights: string[] = [];

  // OpenAI insights
  const topAddedOpenAI = [...openaiAnalysis.addedBrands.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topAddedOpenAI) {
    insights.push(`ChatGPT Web adds "${topAddedOpenAI[0]}" ${topAddedOpenAI[1]} more times than the raw OpenAI API response`);
  }

  if (openaiAnalysis.formatDifferences.emojis > 10) {
    insights.push(`ChatGPT Web adds emojis in ${openaiAnalysis.formatDifferences.emojis}% of responses (API rarely uses emojis)`);
  }

  // Google insights
  const topAddedGoogle = [...googleAnalysis.addedBrands.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topAddedGoogle) {
    insights.push(`Google AI Overviews prominently feature "${topAddedGoogle[0]}" ${topAddedGoogle[1]} more times than Gemini API alone`);
  }

  const aiOverviewRate = googleIndia.filter((r: QueryResult) => r.aiOverview).length;
  insights.push(`Google shows AI Overviews for ${aiOverviewRate}% of pet product queries from India`);

  // Cross-platform insights
  const chatgptTopBrand = [...chatgptWebBrands.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  const googleTopBrand = [...googleBrands.entries()].sort((a, b) => b[1].count - a[1].count)[0];

  if (chatgptTopBrand && googleTopBrand) {
    if (chatgptTopBrand[0] === googleTopBrand[0]) {
      insights.push(`"${chatgptTopBrand[0]}" dominates both ChatGPT and Google AI Overviews`);
    } else {
      insights.push(`Different brands lead on different platforms: "${chatgptTopBrand[0]}" on ChatGPT vs "${googleTopBrand[0]}" on Google`);
    }
  }

  reportData.keyInsights = insights;

  // Generate recommendations
  reportData.recommendations = [
    'Ensure brand is mentioned in structured data and schema markup for Google AI Overview visibility',
    'Create content that directly answers common pet product questions in the format AI models prefer',
    'Focus on being cited in authoritative sources that AI models reference',
    'Use clear, factual claims that AI can confidently attribute to your brand',
    'Optimize for both API-level visibility (training data) and web-layer visibility (citations/links)',
    'Monitor brand mentions across both ChatGPT and Google AI Overviews as they differ',
  ];

  // Save JSON
  writeFileSync('studies/huft-web-layer-augmentation-report.json', JSON.stringify(reportData, null, 2));
  console.log('\n✅ Saved: studies/huft-web-layer-augmentation-report.json');

  // Generate Markdown
  const markdown = generateMarkdown(reportData, openaiApiBrands, chatgptWebBrands, googleBrands, geminiBrands);
  writeFileSync('studies/huft-web-layer-augmentation-report.md', markdown);
  console.log('✅ Saved: studies/huft-web-layer-augmentation-report.md');

  // Generate HTML
  const html = generateHTML(reportData, openaiApiBrands, chatgptWebBrands, googleBrands, geminiBrands);
  writeFileSync('studies/huft-web-layer-augmentation-report.html', html);
  console.log('✅ Saved: studies/huft-web-layer-augmentation-report.html');
}

function generateMarkdown(data: any, openaiApiBrands: Map<string, BrandMention>, chatgptWebBrands: Map<string, BrandMention>, googleBrands: Map<string, BrandMention>, geminiBrands: Map<string, BrandMention>): string {
  let md = `# HUFT Pet Products Web Layer Augmentation Study

**Generated:** ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

## Executive Summary

This study analyzes how AI foundation model responses are augmented when distributed through web surfaces. Understanding these augmentations helps brands optimize their visibility in AI-generated content.

**Key Question:** What do web surfaces (ChatGPT, Google AI Overviews) add beyond the foundation model?

---

## Data Collection Summary

| Surface | Queries | Successful | Notes |
|---------|---------|------------|-------|
| OpenAI API (GPT-4o) | 100 | ${data.dataSummary.openaiApi.successful} | Foundation model baseline |
| ChatGPT Web | 100 | ${data.dataSummary.chatgptWeb.successful} | OpenAI web layer |
| Gemini API | 100 | ${data.dataSummary.geminiApi.successful} | Google foundation model |
| Google AI Overviews | 100 | ${data.dataSummary.googleAiOverviews.successful} | ${data.dataSummary.googleAiOverviews.aiOverviewsFound} AI Overviews shown |

---

## OpenAI Web Layer Analysis

**How ChatGPT Web augments OpenAI API responses**

### Format Changes

- **Emojis added:** ${data.openaiWebLayerAnalysis.formatChanges.emojis} responses
- **More structured lists:** ${data.openaiWebLayerAnalysis.formatChanges.lists} responses
- **Links added:** ${data.openaiWebLayerAnalysis.formatChanges.links} responses
- **Longer responses:** ${data.openaiWebLayerAnalysis.formatChanges.longer} responses
- **Shorter responses:** ${data.openaiWebLayerAnalysis.formatChanges.shorter} responses

### Brands Added by Web Layer

These brands appear more frequently in ChatGPT Web than in raw API responses:

| Brand | Additional Mentions |
|-------|---------------------|
${Object.entries(data.openaiWebLayerAnalysis.brandsAddedByWeb).slice(0, 10).map(([brand, count]) => `| ${brand} | +${count} |`).join('\n')}

### Brands Reduced by Web Layer

These brands appear less frequently in ChatGPT Web than in raw API responses:

| Brand | Fewer Mentions |
|-------|----------------|
${Object.entries(data.openaiWebLayerAnalysis.brandsRemovedByWeb).slice(0, 10).map(([brand, count]) => `| ${brand} | -${count} |`).join('\n')}

---

## Google Web Layer Analysis

**How Google AI Overviews augment Gemini API responses**

### Format Changes

- **Emojis added:** ${data.googleWebLayerAnalysis.formatChanges.emojis} responses
- **More structured lists:** ${data.googleWebLayerAnalysis.formatChanges.lists} responses
- **Links added:** ${data.googleWebLayerAnalysis.formatChanges.links} responses
- **Longer responses:** ${data.googleWebLayerAnalysis.formatChanges.longer} responses
- **Shorter responses:** ${data.googleWebLayerAnalysis.formatChanges.shorter} responses

### Brands Added by Web Layer

These brands appear more frequently in Google AI Overviews than in raw Gemini API responses:

| Brand | Additional Mentions |
|-------|---------------------|
${Object.entries(data.googleWebLayerAnalysis.brandsAddedByWeb).slice(0, 10).map(([brand, count]) => `| ${brand} | +${count} |`).join('\n')}

### Brands Reduced by Web Layer

These brands appear less frequently in Google AI Overviews than in raw Gemini API responses:

| Brand | Fewer Mentions |
|-------|----------------|
${Object.entries(data.googleWebLayerAnalysis.brandsRemovedByWeb).slice(0, 10).map(([brand, count]) => `| ${brand} | -${count} |`).join('\n')}

---

## Brand Visibility Comparison

### Top Brands by Surface

| Rank | OpenAI API | ChatGPT Web | Gemini API | Google AI Overview |
|------|------------|-------------|------------|-------------------|
${[0,1,2,3,4,5,6,7,8,9].map(i => {
  const oai = Object.entries(data.brandVisibility.openaiApi)[i];
  const cgpt = Object.entries(data.brandVisibility.chatgptWeb)[i];
  const gem = Object.entries(data.brandVisibility.geminiApi)[i];
  const goog = Object.entries(data.brandVisibility.googleAiOverviews)[i];
  return `| ${i+1} | ${oai ? `${oai[0]} (${oai[1]})` : '-'} | ${cgpt ? `${cgpt[0]} (${cgpt[1]})` : '-'} | ${gem ? `${gem[0]} (${gem[1]})` : '-'} | ${goog ? `${goog[0]} (${goog[1]})` : '-'} |`;
}).join('\n')}

---

## Key Insights

${data.keyInsights.map((insight: string, i: number) => `${i + 1}. ${insight}`).join('\n')}

---

## Recommendations for Brands

${data.recommendations.map((rec: string, i: number) => `${i + 1}. ${rec}`).join('\n')}

---

## Methodology

- **Location:** India (Mumbai/Bangalore) via residential proxy
- **Date:** ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
- **Queries:** 100 pet product questions commonly asked by consumers
- **Surfaces:** OpenAI API, ChatGPT Web, Gemini API, Google AI Overviews

---

*Report generated by Bentham Web Layer Analysis*
`;

  return md;
}

function generateHTML(data: any, openaiApiBrands: Map<string, BrandMention>, chatgptWebBrands: Map<string, BrandMention>, googleBrands: Map<string, BrandMention>, geminiBrands: Map<string, BrandMention>): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HUFT Web Layer Augmentation Study</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px;
      border-radius: 12px;
      margin-bottom: 30px;
    }
    .header h1 { margin: 0 0 10px 0; font-size: 2em; }
    .header p { margin: 0; opacity: 0.9; }
    .card {
      background: white;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .card h2 {
      margin-top: 0;
      color: #333;
      border-bottom: 2px solid #667eea;
      padding-bottom: 10px;
    }
    .card h3 { color: #555; margin-top: 24px; }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin: 20px 0;
    }
    .stat-box {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
    }
    .stat-box .number {
      font-size: 2.5em;
      font-weight: bold;
      color: #667eea;
    }
    .stat-box .label { color: #666; font-size: 0.9em; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #eee;
    }
    th {
      background: #f8f9fa;
      font-weight: 600;
      color: #555;
    }
    tr:hover { background: #f8f9fa; }
    .positive { color: #22c55e; }
    .negative { color: #ef4444; }
    .insight-box {
      background: #f0f9ff;
      border-left: 4px solid #667eea;
      padding: 16px;
      margin: 12px 0;
      border-radius: 0 8px 8px 0;
    }
    .recommendation {
      background: #f0fdf4;
      border-left: 4px solid #22c55e;
      padding: 16px;
      margin: 12px 0;
      border-radius: 0 8px 8px 0;
    }
    .comparison-table th { text-align: center; }
    .comparison-table td { text-align: center; }
    .brand-winner { background: #fef3c7; font-weight: bold; }
    .section-divider {
      height: 2px;
      background: linear-gradient(90deg, #667eea, #764ba2);
      margin: 40px 0;
      border-radius: 1px;
    }
    .example-box {
      background: #fafafa;
      border: 1px solid #e5e5e5;
      border-radius: 8px;
      padding: 16px;
      margin: 16px 0;
      font-size: 0.9em;
    }
    .example-box h4 { margin-top: 0; color: #667eea; }
    .example-box .query { font-style: italic; color: #666; }
    .example-box .response {
      background: white;
      padding: 12px;
      border-radius: 4px;
      margin: 8px 0;
      border: 1px solid #eee;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🐕 HUFT Pet Products Web Layer Augmentation Study</h1>
    <p>Analyzing how AI foundation models are augmented through web surfaces</p>
    <p style="margin-top: 10px; font-size: 0.9em;">Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
  </div>

  <div class="card">
    <h2>📊 Executive Summary</h2>
    <p>This study compares foundation model API responses with their web-distributed counterparts to understand what augmentations occur. This helps brands optimize for visibility in AI-generated content.</p>

    <div class="stats-grid">
      <div class="stat-box">
        <div class="number">${data.dataSummary.openaiApi.successful}</div>
        <div class="label">OpenAI API Responses</div>
      </div>
      <div class="stat-box">
        <div class="number">${data.dataSummary.chatgptWeb.successful}</div>
        <div class="label">ChatGPT Web Responses</div>
      </div>
      <div class="stat-box">
        <div class="number">${data.dataSummary.geminiApi.successful}</div>
        <div class="label">Gemini API Responses</div>
      </div>
      <div class="stat-box">
        <div class="number">${data.dataSummary.googleAiOverviews.aiOverviewsFound}</div>
        <div class="label">Google AI Overviews</div>
      </div>
    </div>
  </div>

  <div class="section-divider"></div>

  <div class="card">
    <h2>🔵 OpenAI Web Layer Analysis</h2>
    <p><strong>Question:</strong> How does ChatGPT Web augment raw OpenAI API responses?</p>

    <h3>Format Changes</h3>
    <div class="stats-grid">
      <div class="stat-box">
        <div class="number">${data.openaiWebLayerAnalysis.formatChanges.emojis}</div>
        <div class="label">Emojis Added</div>
      </div>
      <div class="stat-box">
        <div class="number">${data.openaiWebLayerAnalysis.formatChanges.lists}</div>
        <div class="label">More Lists</div>
      </div>
      <div class="stat-box">
        <div class="number">${data.openaiWebLayerAnalysis.formatChanges.links}</div>
        <div class="label">Links Added</div>
      </div>
      <div class="stat-box">
        <div class="number">${data.openaiWebLayerAnalysis.formatChanges.longer}</div>
        <div class="label">Longer Responses</div>
      </div>
    </div>

    <h3>Brands Added by Web Layer</h3>
    <p>These brands appear MORE in ChatGPT Web than in raw API:</p>
    <table>
      <tr><th>Brand</th><th>Additional Mentions</th></tr>
      ${Object.entries(data.openaiWebLayerAnalysis.brandsAddedByWeb).slice(0, 10).map(([brand, count]) =>
        `<tr><td>${brand}</td><td class="positive">+${count}</td></tr>`
      ).join('')}
    </table>

    <h3>Brands Reduced by Web Layer</h3>
    <p>These brands appear LESS in ChatGPT Web than in raw API:</p>
    <table>
      <tr><th>Brand</th><th>Fewer Mentions</th></tr>
      ${Object.entries(data.openaiWebLayerAnalysis.brandsRemovedByWeb).slice(0, 10).map(([brand, count]) =>
        `<tr><td>${brand}</td><td class="negative">-${count}</td></tr>`
      ).join('')}
    </table>
  </div>

  <div class="card">
    <h2>🔴 Google Web Layer Analysis</h2>
    <p><strong>Question:</strong> How do Google AI Overviews augment raw Gemini API responses?</p>

    <h3>Format Changes</h3>
    <div class="stats-grid">
      <div class="stat-box">
        <div class="number">${data.googleWebLayerAnalysis.formatChanges.emojis}</div>
        <div class="label">Emojis Added</div>
      </div>
      <div class="stat-box">
        <div class="number">${data.googleWebLayerAnalysis.formatChanges.lists}</div>
        <div class="label">More Lists</div>
      </div>
      <div class="stat-box">
        <div class="number">${data.googleWebLayerAnalysis.formatChanges.links}</div>
        <div class="label">Links Added</div>
      </div>
      <div class="stat-box">
        <div class="number">${data.googleWebLayerAnalysis.formatChanges.shorter}</div>
        <div class="label">Shorter Responses</div>
      </div>
    </div>

    <h3>Brands Added by Web Layer</h3>
    <p>These brands appear MORE in AI Overviews than in raw Gemini API:</p>
    <table>
      <tr><th>Brand</th><th>Additional Mentions</th></tr>
      ${Object.entries(data.googleWebLayerAnalysis.brandsAddedByWeb).slice(0, 10).map(([brand, count]) =>
        `<tr><td>${brand}</td><td class="positive">+${count}</td></tr>`
      ).join('')}
    </table>

    <h3>Brands Reduced by Web Layer</h3>
    <p>These brands appear LESS in AI Overviews than in raw Gemini API:</p>
    <table>
      <tr><th>Brand</th><th>Fewer Mentions</th></tr>
      ${Object.entries(data.googleWebLayerAnalysis.brandsRemovedByWeb).slice(0, 10).map(([brand, count]) =>
        `<tr><td>${brand}</td><td class="negative">-${count}</td></tr>`
      ).join('')}
    </table>
  </div>

  <div class="section-divider"></div>

  <div class="card">
    <h2>🏆 Brand Visibility Comparison</h2>
    <p>Top mentioned brands across all surfaces:</p>

    <table class="comparison-table">
      <tr>
        <th>Rank</th>
        <th>OpenAI API</th>
        <th>ChatGPT Web</th>
        <th>Gemini API</th>
        <th>Google AI Overview</th>
      </tr>
      ${[0,1,2,3,4,5,6,7,8,9].map(i => {
        const oai = Object.entries(data.brandVisibility.openaiApi)[i];
        const cgpt = Object.entries(data.brandVisibility.chatgptWeb)[i];
        const gem = Object.entries(data.brandVisibility.geminiApi)[i];
        const goog = Object.entries(data.brandVisibility.googleAiOverviews)[i];
        return `<tr>
          <td><strong>${i+1}</strong></td>
          <td>${oai ? `${oai[0]} (${oai[1]})` : '-'}</td>
          <td>${cgpt ? `${cgpt[0]} (${cgpt[1]})` : '-'}</td>
          <td>${gem ? `${gem[0]} (${gem[1]})` : '-'}</td>
          <td>${goog ? `${goog[0]} (${goog[1]})` : '-'}</td>
        </tr>`;
      }).join('')}
    </table>
  </div>

  <div class="card">
    <h2>💡 Key Insights</h2>
    ${data.keyInsights.map((insight: string) => `<div class="insight-box">${insight}</div>`).join('')}
  </div>

  <div class="card">
    <h2>✅ Recommendations for Brands</h2>
    ${data.recommendations.map((rec: string, i: number) => `<div class="recommendation"><strong>${i+1}.</strong> ${rec}</div>`).join('')}
  </div>

  <div class="card" style="background: #f8f9fa;">
    <h2>📋 Methodology</h2>
    <ul>
      <li><strong>Location:</strong> India (Mumbai/Bangalore) via residential proxy</li>
      <li><strong>Date:</strong> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</li>
      <li><strong>Queries:</strong> 100 pet product questions commonly asked by consumers</li>
      <li><strong>Surfaces:</strong> OpenAI API, ChatGPT Web, Gemini API, Google AI Overviews</li>
    </ul>
  </div>

  <footer style="text-align: center; padding: 40px; color: #666;">
    <p>Report generated by Bentham Web Layer Analysis</p>
  </footer>
</body>
</html>`;
}

main().catch(console.error);
