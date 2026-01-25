#!/usr/bin/env npx tsx
/**
 * Generate Detailed API vs Web Comparison Reports
 *
 * Creates side-by-side comparisons for each query showing:
 * - API response vs Web response
 * - Sources/citations identified in web responses
 * - Weighted analysis of source influence
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
  timestamp: string;
  responseTimeMs: number;
}

interface SourceAnalysis {
  source: string;
  type: 'citation' | 'brand' | 'website' | 'knowledge';
  mentions: number;
  examples: string[];
}

// Extract citations/sources from text
function extractSources(text: string): { citations: string[]; websites: string[]; brands: string[] } {
  const citations: string[] = [];
  const websites: string[] = [];
  const brands: string[] = [];

  // Website patterns
  const urlPattern = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})(?:\/[^\s)]*)?/g;
  let match;
  while ((match = urlPattern.exec(text)) !== null) {
    const domain = match[1].toLowerCase();
    if (!websites.includes(domain)) {
      websites.push(domain);
    }
  }

  // Citation patterns (common in AI Overviews)
  const citationPatterns = [
    /according to ([^,\.]+)/gi,
    /source: ([^,\.]+)/gi,
    /from ([a-zA-Z]+ (?:website|blog|article|guide|review))/gi,
    /\[([^\]]+)\]/g,
    /— ([^—\n]+)/g,
  ];

  for (const pattern of citationPatterns) {
    while ((match = pattern.exec(text)) !== null) {
      const citation = match[1].trim();
      if (citation.length > 2 && citation.length < 100 && !citations.includes(citation)) {
        citations.push(citation);
      }
    }
  }

  // Known brands
  const brandList = [
    'Pedigree', 'Royal Canin', 'Drools', 'Farmina', 'Orijen', 'Acana',
    'Hills', "Hill's", 'Purina', 'Whiskas', 'Iams', 'Eukanuba',
    'Blue Buffalo', 'Wellness', 'Taste of the Wild', 'Canidae',
    'Heads Up For Tails', 'HUFT', 'Kennel Kitchen', 'Fresh For Paws',
    'Dogsee', 'Chip Chops', 'Goofy Tails', 'Wiggles', 'Supertails',
    'Greenies', 'Dentastix', 'Milk-Bone', "Zuke's",
    'Amazon', 'Chewy', 'Petco', 'PetSmart', 'Zigly',
  ];

  const lowerText = text.toLowerCase();
  for (const brand of brandList) {
    if (lowerText.includes(brand.toLowerCase()) && !brands.includes(brand)) {
      brands.push(brand);
    }
  }

  return { citations, websites, brands };
}

// Analyze what's different between API and Web
function analyzeDifferences(apiText: string, webText: string): {
  addedContent: string[];
  addedSources: string[];
  addedBrands: string[];
  formatChanges: string[];
  lengthChange: number;
} {
  const apiSources = extractSources(apiText);
  const webSources = extractSources(webText);

  const addedSources = [
    ...webSources.websites.filter(w => !apiSources.websites.includes(w)),
    ...webSources.citations.filter(c => !apiSources.citations.includes(c)),
  ];

  const addedBrands = webSources.brands.filter(b => !apiSources.brands.includes(b));

  const formatChanges: string[] = [];
  if (/[\u{1F300}-\u{1F9FF}]/u.test(webText) && !/[\u{1F300}-\u{1F9FF}]/u.test(apiText)) {
    formatChanges.push('Emojis added');
  }
  if ((webText.match(/^[\s]*[-•*]/gm) || []).length > (apiText.match(/^[\s]*[-•*]/gm) || []).length) {
    formatChanges.push('More bullet points');
  }
  if ((webText.match(/^\d+\./gm) || []).length > (apiText.match(/^\d+\./gm) || []).length) {
    formatChanges.push('Numbered lists added');
  }
  if (webText.includes('http') && !apiText.includes('http')) {
    formatChanges.push('Links added');
  }

  // Find sentences in web that aren't in API
  const addedContent: string[] = [];
  const webSentences = webText.split(/[.!?]+/).map(s => s.trim().toLowerCase()).filter(s => s.length > 20);
  const apiLower = apiText.toLowerCase();
  for (const sentence of webSentences.slice(0, 10)) {
    // Check if this sentence's key phrases are missing from API
    const words = sentence.split(' ').filter(w => w.length > 4);
    const keyPhrase = words.slice(0, 4).join(' ');
    if (keyPhrase && !apiLower.includes(keyPhrase)) {
      addedContent.push(sentence.slice(0, 100) + '...');
      if (addedContent.length >= 3) break;
    }
  }

  return {
    addedContent,
    addedSources,
    addedBrands,
    formatChanges,
    lengthChange: Math.round((webText.length - apiText.length) / apiText.length * 100),
  };
}

// Calculate source weights
function calculateSourceWeights(allResults: { api: QueryResult; web: QueryResult; diff: ReturnType<typeof analyzeDifferences> }[]): {
  apiKnowledge: number;
  webSources: number;
  topSources: { source: string; weight: number }[];
} {
  const sourceCount = new Map<string, number>();
  let totalWebAdditions = 0;
  let totalApiContent = 0;

  for (const result of allResults) {
    if (!result.api.response || !result.web.response) continue;

    totalApiContent += result.api.response.length;

    for (const source of result.diff.addedSources) {
      sourceCount.set(source, (sourceCount.get(source) || 0) + 1);
      totalWebAdditions++;
    }
    for (const brand of result.diff.addedBrands) {
      sourceCount.set(brand, (sourceCount.get(brand) || 0) + 1);
      totalWebAdditions++;
    }
  }

  const totalWebContent = allResults.reduce((sum, r) => sum + (r.web.response?.length || 0), 0);
  const apiKnowledge = Math.round(totalApiContent / totalWebContent * 100);
  const webSources = 100 - apiKnowledge;

  const topSources = [...sourceCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([source, count]) => ({
      source,
      weight: Math.round(count / allResults.length * 100),
    }));

  return { apiKnowledge, webSources, topSources };
}

function generateComparisonHTML(
  title: string,
  subtitle: string,
  apiName: string,
  webName: string,
  comparisons: { api: QueryResult; web: QueryResult; diff: ReturnType<typeof analyzeDifferences> }[],
  weights: ReturnType<typeof calculateSourceWeights>
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .header {
      background: linear-gradient(135deg, ${title.includes('Google') ? '#ea4335' : '#10a37f'} 0%, ${title.includes('Google') ? '#fbbc04' : '#1a7f64'} 100%);
      color: white;
      padding: 40px;
      border-radius: 12px;
      margin-bottom: 30px;
    }
    .header h1 { margin: 0 0 10px 0; }
    .header p { margin: 0; opacity: 0.9; }
    .card {
      background: white;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .card h2 { margin-top: 0; color: #333; }
    .weights-bar {
      display: flex;
      height: 40px;
      border-radius: 8px;
      overflow: hidden;
      margin: 20px 0;
    }
    .weight-api {
      background: linear-gradient(90deg, #667eea, #764ba2);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
    }
    .weight-web {
      background: linear-gradient(90deg, #f59e0b, #ef4444);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
    }
    .source-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 16px 0;
    }
    .source-tag {
      background: #f0f0f0;
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 0.85em;
    }
    .source-tag .weight {
      background: #667eea;
      color: white;
      padding: 2px 6px;
      border-radius: 10px;
      margin-left: 6px;
      font-size: 0.8em;
    }
    .comparison {
      border: 1px solid #e5e5e5;
      border-radius: 12px;
      margin: 20px 0;
      overflow: hidden;
    }
    .comparison-header {
      background: #f8f9fa;
      padding: 16px 20px;
      border-bottom: 1px solid #e5e5e5;
    }
    .comparison-header h3 { margin: 0; color: #333; font-size: 1em; }
    .comparison-header .query { color: #667eea; font-weight: 500; }
    .comparison-body {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    .response-col {
      padding: 20px;
      border-right: 1px solid #e5e5e5;
      max-height: 400px;
      overflow-y: auto;
    }
    .response-col:last-child { border-right: none; }
    .response-col h4 {
      margin: 0 0 12px 0;
      color: #666;
      font-size: 0.85em;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .response-text {
      font-size: 0.9em;
      white-space: pre-wrap;
      background: #fafafa;
      padding: 12px;
      border-radius: 8px;
      max-height: 300px;
      overflow-y: auto;
    }
    .diff-section {
      background: #fffbeb;
      padding: 16px 20px;
      border-top: 1px solid #e5e5e5;
    }
    .diff-section h4 { margin: 0 0 8px 0; color: #92400e; font-size: 0.9em; }
    .diff-item {
      display: inline-block;
      background: #fef3c7;
      padding: 2px 8px;
      border-radius: 4px;
      margin: 2px;
      font-size: 0.85em;
    }
    .diff-item.source { background: #dbeafe; color: #1e40af; }
    .diff-item.brand { background: #dcfce7; color: #166534; }
    .diff-item.format { background: #f3e8ff; color: #7c3aed; }
    .length-change {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.85em;
      font-weight: 500;
    }
    .length-change.positive { background: #dcfce7; color: #166534; }
    .length-change.negative { background: #fee2e2; color: #991b1b; }
    .nav-link {
      display: inline-block;
      padding: 8px 16px;
      background: #667eea;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      margin-right: 8px;
    }
    .nav-link:hover { background: #5a67d8; }
    .toc {
      background: #f8f9fa;
      padding: 16px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .toc a {
      display: inline-block;
      padding: 4px 8px;
      margin: 2px;
      background: white;
      border-radius: 4px;
      text-decoration: none;
      color: #667eea;
      font-size: 0.85em;
    }
    .toc a:hover { background: #667eea; color: white; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${title}</h1>
    <p>${subtitle}</p>
  </div>

  <div style="margin-bottom: 20px;">
    <a href="index.html" class="nav-link">← Back to Index</a>
    <a href="huft-web-layer-augmentation-report.html" class="nav-link">Main Report</a>
  </div>

  <div class="card">
    <h2>📊 Source Weight Analysis</h2>
    <p>How much of the web response comes from the foundation model vs external sources?</p>

    <div class="weights-bar">
      <div class="weight-api" style="width: ${weights.apiKnowledge}%">
        ${apiName}: ${weights.apiKnowledge}%
      </div>
      <div class="weight-web" style="width: ${weights.webSources}%">
        Web Sources: ${weights.webSources}%
      </div>
    </div>

    <h3>Top External Sources (by frequency)</h3>
    <div class="source-list">
      ${weights.topSources.map(s => `
        <span class="source-tag">${s.source}<span class="weight">${s.weight}%</span></span>
      `).join('')}
    </div>
  </div>

  <div class="card">
    <h2>📑 Query Comparisons (${comparisons.length} queries)</h2>
    <p>Jump to query:</p>
    <div class="toc">
      ${comparisons.map((c, i) => `<a href="#q${i}">${i + 1}</a>`).join('')}
    </div>
  </div>

  ${comparisons.map((comp, i) => `
    <div class="comparison" id="q${i}">
      <div class="comparison-header">
        <h3>Query ${i + 1} of ${comparisons.length}</h3>
        <div class="query">"${comp.api.query}"</div>
      </div>
      <div class="comparison-body">
        <div class="response-col">
          <h4>🔷 ${apiName}</h4>
          <div class="response-text">${escapeHtml(comp.api.response?.slice(0, 1500) || 'No response') + (comp.api.response && comp.api.response.length > 1500 ? '...' : '')}</div>
        </div>
        <div class="response-col">
          <h4>🌐 ${webName}</h4>
          <div class="response-text">${escapeHtml((comp.web.aiOverview || comp.web.response)?.slice(0, 1500) || 'No response') + ((comp.web.aiOverview || comp.web.response) && (comp.web.aiOverview || comp.web.response)!.length > 1500 ? '...' : '')}</div>
        </div>
      </div>
      <div class="diff-section">
        <h4>🔍 What the Web Layer Added:</h4>
        <div>
          <span class="length-change ${comp.diff.lengthChange >= 0 ? 'positive' : 'negative'}">
            Length: ${comp.diff.lengthChange >= 0 ? '+' : ''}${comp.diff.lengthChange}%
          </span>
          ${comp.diff.formatChanges.map(f => `<span class="diff-item format">${f}</span>`).join('')}
          ${comp.diff.addedBrands.map(b => `<span class="diff-item brand">+ ${b}</span>`).join('')}
          ${comp.diff.addedSources.slice(0, 5).map(s => `<span class="diff-item source">📄 ${s}</span>`).join('')}
        </div>
        ${comp.diff.addedContent.length > 0 ? `
          <div style="margin-top: 12px; font-size: 0.85em; color: #666;">
            <strong>New content:</strong> ${comp.diff.addedContent.slice(0, 2).map(c => `"${c}"`).join(', ')}
          </div>
        ` : ''}
      </div>
    </div>
  `).join('')}

  <footer style="text-align: center; padding: 40px; color: #666;">
    <a href="index.html" class="nav-link">← Back to Index</a>
  </footer>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

async function main() {
  console.log('Loading study results...\n');

  // Load all results
  const mainStudy = JSON.parse(readFileSync('studies/huft-100-india-study-results.json', 'utf-8'));
  const geminiApi = JSON.parse(readFileSync('studies/huft-gemini-api-results.json', 'utf-8'));
  const googleBangalore = JSON.parse(readFileSync('studies/huft-google-india-bangalore-results.json', 'utf-8'));

  // Separate results by surface
  const openaiApi: QueryResult[] = mainStudy.results.filter((r: QueryResult) => r.surface === 'openai-api');
  const chatgptWeb: QueryResult[] = mainStudy.results.filter((r: QueryResult) => r.surface === 'chatgpt-web');
  const googleResults: QueryResult[] = googleBangalore.results;
  const geminiApiResults: QueryResult[] = geminiApi.results;

  // Build OpenAI comparisons
  console.log('Building OpenAI API vs ChatGPT Web comparisons...');
  const openaiComparisons: { api: QueryResult; web: QueryResult; diff: ReturnType<typeof analyzeDifferences> }[] = [];

  for (const apiResult of openaiApi) {
    const webResult = chatgptWeb.find(w => w.queryIndex === apiResult.queryIndex);
    if (apiResult.success && webResult?.success && apiResult.response && webResult.response) {
      const diff = analyzeDifferences(apiResult.response, webResult.response);
      openaiComparisons.push({ api: apiResult, web: webResult, diff });
    }
  }

  const openaiWeights = calculateSourceWeights(openaiComparisons);

  // Build Google comparisons
  console.log('Building Gemini API vs Google AI Overview comparisons...');
  const googleComparisons: { api: QueryResult; web: QueryResult; diff: ReturnType<typeof analyzeDifferences> }[] = [];

  for (const apiResult of geminiApiResults) {
    const webResult = googleResults.find(w => w.queryIndex === apiResult.queryIndex);
    if (apiResult.success && webResult?.success && apiResult.response && (webResult.aiOverview || webResult.response)) {
      const webText = webResult.aiOverview || webResult.response || '';
      const diff = analyzeDifferences(apiResult.response, webText);
      googleComparisons.push({ api: apiResult, web: webResult, diff });
    }
  }

  const googleWeights = calculateSourceWeights(googleComparisons);

  // Generate OpenAI comparison page
  console.log('Generating OpenAI comparison page...');
  const openaiHtml = generateComparisonHTML(
    '🔵 OpenAI: API vs ChatGPT Web',
    'Side-by-side comparison of foundation model vs web surface responses',
    'OpenAI API (GPT-4o)',
    'ChatGPT Web',
    openaiComparisons,
    openaiWeights
  );
  writeFileSync('studies/openai-detailed-comparison.html', openaiHtml);
  console.log('✅ Saved: studies/openai-detailed-comparison.html');

  // Generate Google comparison page
  console.log('Generating Google comparison page...');
  const googleHtml = generateComparisonHTML(
    '🔴 Google: Gemini API vs AI Overviews',
    'Side-by-side comparison of foundation model vs web surface responses',
    'Gemini API',
    'Google AI Overview',
    googleComparisons,
    googleWeights
  );
  writeFileSync('studies/google-detailed-comparison.html', googleHtml);
  console.log('✅ Saved: studies/google-detailed-comparison.html');

  // Generate summary JSON
  const summaryData = {
    generatedAt: new Date().toISOString(),
    openai: {
      comparisons: openaiComparisons.length,
      sourceWeights: openaiWeights,
      avgLengthChange: Math.round(openaiComparisons.reduce((s, c) => s + c.diff.lengthChange, 0) / openaiComparisons.length),
    },
    google: {
      comparisons: googleComparisons.length,
      sourceWeights: googleWeights,
      avgLengthChange: Math.round(googleComparisons.reduce((s, c) => s + c.diff.lengthChange, 0) / googleComparisons.length),
    },
  };
  writeFileSync('studies/source-weights-summary.json', JSON.stringify(summaryData, null, 2));
  console.log('✅ Saved: studies/source-weights-summary.json');

  // Update index page
  console.log('Updating index page...');
  updateIndexPage();

  console.log('\nDone! Open studies/index.html to see all reports.');
}

function updateIndexPage() {
  const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HUFT Web Layer Study - Index</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 20px;
      background: #f5f5f5;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px;
      border-radius: 12px;
      margin-bottom: 30px;
      text-align: center;
    }
    .header h1 { margin: 0 0 10px 0; font-size: 2em; }
    .header p { margin: 0; opacity: 0.9; }
    .section {
      background: white;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .section h2 {
      margin-top: 0;
      color: #667eea;
      font-size: 1.3em;
      border-bottom: 2px solid #eee;
      padding-bottom: 10px;
    }
    .file-list { list-style: none; padding: 0; margin: 0; }
    .file-list li {
      padding: 12px 16px;
      border-bottom: 1px solid #eee;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .file-list li:last-child { border-bottom: none; }
    .file-list a {
      color: #667eea;
      text-decoration: none;
      font-weight: 500;
    }
    .file-list a:hover { text-decoration: underline; }
    .file-icon {
      width: 32px;
      height: 32px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: bold;
      color: white;
    }
    .icon-html { background: #e44d26; }
    .icon-md { background: #083fa1; }
    .icon-json { background: #f7df1e; color: #333; }
    .icon-openai { background: #10a37f; }
    .icon-google { background: #ea4335; }
    .file-meta {
      font-size: 0.85em;
      color: #888;
      margin-left: auto;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.75em;
      font-weight: 600;
      margin-left: 8px;
    }
    .badge-primary { background: #667eea; color: white; }
    .badge-new { background: #22c55e; color: white; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🐕 HUFT Web Layer Study</h1>
    <p>Pet Products AI Visibility Analysis - India</p>
    <p style="margin-top: 10px; font-size: 0.9em;">January 18, 2026</p>
  </div>

  <div class="section">
    <h2>📑 Main Reports <span class="badge badge-primary">START HERE</span></h2>
    <ul class="file-list">
      <li>
        <div class="file-icon icon-html">HTML</div>
        <a href="huft-web-layer-augmentation-report.html">Web Layer Augmentation Summary</a>
        <span class="file-meta">Overview & insights</span>
      </li>
      <li>
        <div class="file-icon icon-md">MD</div>
        <a href="huft-web-layer-augmentation-report.md">Summary Report (Markdown)</a>
        <span class="file-meta">For MacDown / email</span>
      </li>
    </ul>
  </div>

  <div class="section">
    <h2>🔵 OpenAI: API vs ChatGPT Web <span class="badge badge-new">NEW</span></h2>
    <ul class="file-list">
      <li>
        <div class="file-icon icon-openai">⚡</div>
        <a href="openai-detailed-comparison.html">Detailed Query-by-Query Comparison</a>
        <span class="file-meta">98 queries with source analysis</span>
      </li>
      <li>
        <div class="file-icon icon-json">JSON</div>
        <a href="huft-100-india-study-results.json">Raw Results Data</a>
        <span class="file-meta">API + Web responses</span>
      </li>
    </ul>
  </div>

  <div class="section">
    <h2>🔴 Google: Gemini API vs AI Overviews <span class="badge badge-new">NEW</span></h2>
    <ul class="file-list">
      <li>
        <div class="file-icon icon-google">⚡</div>
        <a href="google-detailed-comparison.html">Detailed Query-by-Query Comparison</a>
        <span class="file-meta">97 queries with source analysis</span>
      </li>
      <li>
        <div class="file-icon icon-json">JSON</div>
        <a href="huft-gemini-api-results.json">Gemini API Results</a>
        <span class="file-meta">100 responses</span>
      </li>
      <li>
        <div class="file-icon icon-json">JSON</div>
        <a href="huft-google-india-bangalore-results.json">Google AI Overviews</a>
        <span class="file-meta">97 AI Overviews</span>
      </li>
    </ul>
  </div>

  <div class="section">
    <h2>📊 Source Weight Analysis <span class="badge badge-new">NEW</span></h2>
    <ul class="file-list">
      <li>
        <div class="file-icon icon-json">JSON</div>
        <a href="source-weights-summary.json">Source Weights Summary</a>
        <span class="file-meta">API vs Web source breakdown</span>
      </li>
    </ul>
  </div>

  <div class="section">
    <h2>📋 Study Configuration</h2>
    <ul class="file-list">
      <li>
        <div class="file-icon icon-json">JSON</div>
        <a href="huft-100-prompt-india-study.json">Study Manifest (100 Prompts)</a>
        <span class="file-meta">Query list</span>
      </li>
    </ul>
  </div>

  <div class="section" style="background: #f8f9fa;">
    <h2>ℹ️ About This Study</h2>
    <p><strong>Purpose:</strong> Understand how AI foundation models are augmented through web surfaces to help brands optimize visibility.</p>
    <p><strong>Key Question:</strong> What sources beyond the foundation model influence web responses?</p>
    <p><strong>Comparisons:</strong></p>
    <ul>
      <li>OpenAI API (GPT-4o) → ChatGPT Web</li>
      <li>Gemini API → Google AI Overviews</li>
    </ul>
    <p><strong>Location:</strong> India (Bangalore) via residential proxy</p>
    <p><strong>Queries:</strong> 100 pet product questions</p>
  </div>

  <footer style="text-align: center; padding: 30px; color: #888; font-size: 0.9em;">
    Generated by Bentham Web Layer Analysis
  </footer>
</body>
</html>`;

  writeFileSync('studies/index.html', indexHtml);
}

main().catch(console.error);
