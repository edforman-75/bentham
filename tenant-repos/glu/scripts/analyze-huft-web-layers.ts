#!/usr/bin/env npx tsx
/**
 * HUFT Web Layer Analysis
 *
 * Analyzes the differences between OpenAI API responses and ChatGPT Web responses
 * to understand what augmentations the web layer adds.
 */

import { readFileSync, writeFileSync } from 'fs';

interface Job {
  id: string;
  queryIndex: number;
  queryText: string;
  surfaceId: string;
  locationId: string;
  status: string;
  attempts: number;
  responseText: string;
  responseTimeMs: number;
}

interface StudyResults {
  studyId: string;
  studyName: string;
  jobs: Job[];
}

interface QueryPair {
  queryText: string;
  queryIndex: number;
  openaiApi: Job;
  chatgptWeb: Job;
}

interface LayerAnalysis {
  queryText: string;
  queryIndex: number;

  // Response characteristics
  openaiLength: number;
  webLength: number;
  lengthRatio: number;

  // Web layer augmentations
  hasEmojis: boolean;
  emojiCount: number;
  emojisFound: string[];

  hasShoppingResults: boolean;
  shoppingProducts: string[];
  pricesFound: string[];

  hasCitations: boolean;
  citationsFound: string[];

  hasFollowUpPrompt: boolean;
  followUpText: string | null;

  hasBrowsingIndicators: boolean;
  browsingIndicators: string[];

  hasStructuredHeaders: boolean;
  headersFound: string[];

  // Content differences
  openaiOnlyBrands: string[];
  webOnlyBrands: string[];
  sharedBrands: string[];

  // Response timing
  openaiResponseTimeMs: number;
  webResponseTimeMs: number;
  timingRatio: number;
}

// Common pet food brands to detect
const PET_FOOD_BRANDS = [
  'Blue Buffalo', 'Purina', 'Royal Canin', 'Hill\'s', 'Wellness',
  'Nutro', 'Merrick', 'Taste of the Wild', 'Canidae', 'Orijen',
  'Acana', 'Natural Balance', 'Zignature', 'Instinct', 'Stella & Chewy',
  'Fromm', 'NutriSource', 'Solid Gold', 'Nulo', 'Ziwi Peak',
  'Rachael Ray', 'Victor', 'Weruva', 'JustFoodForDogs', 'Zesty Paws',
  'Native Pet', 'Greenies', 'VetIQ', 'PetHonesty', 'NaturVet',
  'FurroLandia', 'Dr. Lyon', 'Petcurean', 'Pure Balance', 'Bully Max'
];

function extractEmojis(text: string): string[] {
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
  return [...new Set(text.match(emojiRegex) || [])];
}

function extractPrices(text: string): string[] {
  const priceRegex = /\$\d+\.?\d*/g;
  return [...new Set(text.match(priceRegex) || [])];
}

function extractCitations(text: string): string[] {
  // Match patterns like [Chewy], [Blue Buffalo], etc.
  const citationRegex = /\[([A-Za-z][A-Za-z\s&']+)\]/g;
  const matches: string[] = [];
  let match;
  while ((match = citationRegex.exec(text)) !== null) {
    matches.push(match[1]);
  }
  return [...new Set(matches)];
}

function extractShoppingProducts(text: string): string[] {
  // Match patterns like "Product Name\n$XX.XX\n•\nStore"
  const products: string[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/\$\d+\.\d+/) && lines[i + 1]?.includes('•')) {
      // Look backwards for product name
      if (i > 0 && lines[i - 1].trim()) {
        products.push(lines[i - 1].trim());
      }
    }
  }
  return products;
}

function extractHeaders(text: string): string[] {
  // Match emoji headers like "🥇 Top Picks" or "🐶 Top Everyday"
  const headerRegex = /^[\u{1F300}-\u{1F9FF}][\u{1F300}-\u{1F9FF}]?\s+[A-Z][^\n]+/gmu;
  return text.match(headerRegex) || [];
}

function extractFollowUpPrompt(text: string): string | null {
  const patterns = [
    /If you (?:share|tell me)[^.!?\n]+[.!?]/gi,
    /(?:Would you like|I can)[^.!?\n]+[.!?]/gi,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function extractBrowsingIndicators(text: string): string[] {
  const indicators: string[] = [];

  // Check for store/retailer mentions with prices
  if (text.match(/Chewy\.com|Petco\.com|PetSmart|Walmart|Target|Amazon/i)) {
    indicators.push('Retailer links');
  }

  // Check for citation patterns
  if (text.match(/\[\w+\]/)) {
    indicators.push('Source citations');
  }

  // Check for price patterns with store names
  if (text.match(/\$\d+\.\d+\s*•\s*\w+/)) {
    indicators.push('Price + store format');
  }

  // Check for "others" indicator (multiple retailers)
  if (text.includes('+ others')) {
    indicators.push('Multi-retailer aggregation');
  }

  return indicators;
}

function findBrandsInText(text: string): string[] {
  const found: string[] = [];
  const lowerText = text.toLowerCase();
  for (const brand of PET_FOOD_BRANDS) {
    if (lowerText.includes(brand.toLowerCase())) {
      found.push(brand);
    }
  }
  return found;
}

function analyzeQueryPair(pair: QueryPair): LayerAnalysis {
  const openaiText = pair.openaiApi.responseText;
  const webText = pair.chatgptWeb.responseText;

  const openaiEmojis = extractEmojis(openaiText);
  const webEmojis = extractEmojis(webText);

  const openaiPrices = extractPrices(openaiText);
  const webPrices = extractPrices(webText);

  const webCitations = extractCitations(webText);
  const webProducts = extractShoppingProducts(webText);
  const webHeaders = extractHeaders(webText);
  const webFollowUp = extractFollowUpPrompt(webText);
  const webBrowsing = extractBrowsingIndicators(webText);

  const openaiBrands = findBrandsInText(openaiText);
  const webBrands = findBrandsInText(webText);

  const openaiOnly = openaiBrands.filter(b => !webBrands.includes(b));
  const webOnly = webBrands.filter(b => !openaiBrands.includes(b));
  const shared = openaiBrands.filter(b => webBrands.includes(b));

  return {
    queryText: pair.queryText,
    queryIndex: pair.queryIndex,

    openaiLength: openaiText.length,
    webLength: webText.length,
    lengthRatio: webText.length / openaiText.length,

    hasEmojis: webEmojis.length > 0,
    emojiCount: webEmojis.length,
    emojisFound: webEmojis,

    hasShoppingResults: webProducts.length > 0 || webPrices.length > 0,
    shoppingProducts: webProducts,
    pricesFound: webPrices,

    hasCitations: webCitations.length > 0,
    citationsFound: webCitations,

    hasFollowUpPrompt: webFollowUp !== null,
    followUpText: webFollowUp,

    hasBrowsingIndicators: webBrowsing.length > 0,
    browsingIndicators: webBrowsing,

    hasStructuredHeaders: webHeaders.length > 0,
    headersFound: webHeaders,

    openaiOnlyBrands: openaiOnly,
    webOnlyBrands: webOnly,
    sharedBrands: shared,

    openaiResponseTimeMs: pair.openaiApi.responseTimeMs,
    webResponseTimeMs: pair.chatgptWeb.responseTimeMs,
    timingRatio: pair.chatgptWeb.responseTimeMs / pair.openaiApi.responseTimeMs,
  };
}

function generateReport(analyses: LayerAnalysis[], pairs: QueryPair[]): string {
  const avgLengthRatio = analyses.reduce((sum, a) => sum + a.lengthRatio, 0) / analyses.length;
  const avgTimingRatio = analyses.reduce((sum, a) => sum + a.timingRatio, 0) / analyses.length;
  const withEmojis = analyses.filter(a => a.hasEmojis).length;
  const withShopping = analyses.filter(a => a.hasShoppingResults).length;
  const withCitations = analyses.filter(a => a.hasCitations).length;
  const withBrowsing = analyses.filter(a => a.hasBrowsingIndicators).length;
  const withFollowUp = analyses.filter(a => a.hasFollowUpPrompt).length;
  const withHeaders = analyses.filter(a => a.hasStructuredHeaders).length;

  const allWebOnlyBrands = [...new Set(analyses.flatMap(a => a.webOnlyBrands))];
  const allOpenaiOnlyBrands = [...new Set(analyses.flatMap(a => a.openaiOnlyBrands))];

  return `<!DOCTYPE html>
<html>
<head>
  <title>HUFT ChatGPT Web Layer Analysis | Glu</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0; padding: 0; background: #f5f5f5;
      line-height: 1.6;
    }
    .glu-header {
      background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #0d1117 100%);
      color: white;
      padding: 0;
      display: flex;
      justify-content: space-between;
      align-items: stretch;
      border-bottom: 3px solid #00d9ff;
    }
    .glu-header-left {
      padding: 15px 25px;
      display: flex;
      align-items: center;
    }
    .glu-logo {
      font-size: 32px;
      font-weight: 800;
      letter-spacing: -2px;
    }
    .glu-logo span { color: #00d9ff; }
    .glu-header-center {
      padding: 15px 25px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      flex: 1;
      background: rgba(0, 217, 255, 0.05);
    }
    .report-title { font-size: 18px; font-weight: 600; }
    .report-subtitle { font-size: 12px; color: #888; margin-top: 2px; }
    .glu-header-right {
      padding: 15px 25px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: flex-end;
    }
    .report-date { font-size: 14px; color: #00d9ff; font-weight: 500; }
    .container { max-width: 1400px; margin: 0 auto; padding: 30px; }
    h1 { color: #0f0f1a; margin-bottom: 5px; }
    h2 { color: #1a1a2e; border-bottom: 2px solid #00d9ff; padding-bottom: 10px; margin-top: 40px; }
    h3 { color: #333; margin-top: 25px; }

    .card {
      background: white;
      border-radius: 12px;
      padding: 25px;
      margin-bottom: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }
    .stat-card {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      border-radius: 10px;
      text-align: center;
    }
    .stat-card.green { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); }
    .stat-card.orange { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
    .stat-card.blue { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); }
    .stat-card.purple { background: linear-gradient(135deg, #6a11cb 0%, #2575fc 100%); }
    .stat-value { font-size: 32px; font-weight: bold; }
    .stat-label { font-size: 12px; opacity: 0.9; margin-top: 5px; }

    .layer-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    .layer-table th, .layer-table td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #eee;
    }
    .layer-table th {
      background: #f8f9fa;
      font-weight: 600;
    }
    .check { color: #2e7d32; font-weight: bold; }
    .x { color: #c62828; }

    .explanation-box {
      background: #e3f2fd;
      border-left: 4px solid #1976d2;
      padding: 15px 20px;
      margin: 20px 0;
      border-radius: 0 8px 8px 0;
    }
    .explanation-box h4 {
      margin: 0 0 10px 0;
      color: #1565c0;
    }

    .warning-box {
      background: #fff3e0;
      border-left: 4px solid #ff9800;
      padding: 15px 20px;
      margin: 20px 0;
      border-radius: 0 8px 8px 0;
    }

    .comparison-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin: 20px 0;
    }
    .response-panel {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 15px;
      max-height: 400px;
      overflow-y: auto;
    }
    .response-panel h4 {
      margin: 0 0 10px 0;
      padding-bottom: 10px;
      border-bottom: 1px solid #ddd;
    }
    .response-panel.api { border-top: 3px solid #1976d2; }
    .response-panel.web { border-top: 3px solid #00d9ff; }
    .response-text {
      white-space: pre-wrap;
      font-size: 13px;
      line-height: 1.5;
    }

    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
      margin: 2px;
    }
    .badge-emoji { background: #fce4ec; color: #c2185b; }
    .badge-shopping { background: #e8f5e9; color: #2e7d32; }
    .badge-citation { background: #e3f2fd; color: #1565c0; }
    .badge-browsing { background: #fff3e0; color: #e65100; }
    .badge-brand { background: #f3e5f5; color: #7b1fa2; }

    .augmentation-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 10px 0;
    }

    .emoji-display {
      font-size: 20px;
      letter-spacing: 5px;
    }

    .glu-footer {
      background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%);
      color: #888;
      padding: 30px;
      margin-top: 40px;
      border-top: 3px solid #00d9ff;
      text-align: center;
    }
  </style>
</head>
<body>
  <header class="glu-header">
    <div class="glu-header-left">
      <div class="glu-logo">gl<span>u</span></div>
    </div>
    <div class="glu-header-center">
      <div class="report-title">HUFT ChatGPT Web Layer Analysis</div>
      <div class="report-subtitle">Understanding the delta between OpenAI API and ChatGPT.com</div>
    </div>
    <div class="glu-header-right">
      <div class="report-date">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
    </div>
  </header>

  <div class="container">
    <div class="card">
      <h2 style="margin-top: 0; border: none; padding: 0;">Executive Summary</h2>
      <p>This analysis examines ${analyses.length} pet food queries sent to both the OpenAI API and ChatGPT.com to understand what augmentations the web layer adds to the base model responses.</p>

      <div class="summary-grid">
        <div class="stat-card">
          <div class="stat-value">${avgLengthRatio.toFixed(1)}x</div>
          <div class="stat-label">Avg Response Length Ratio</div>
        </div>
        <div class="stat-card green">
          <div class="stat-value">${withBrowsing}/${analyses.length}</div>
          <div class="stat-label">With Browsing/Search</div>
        </div>
        <div class="stat-card orange">
          <div class="stat-value">${withShopping}/${analyses.length}</div>
          <div class="stat-label">With Shopping Results</div>
        </div>
        <div class="stat-card blue">
          <div class="stat-value">${withEmojis}/${analyses.length}</div>
          <div class="stat-label">With Emoji Formatting</div>
        </div>
        <div class="stat-card purple">
          <div class="stat-value">${avgTimingRatio.toFixed(1)}x</div>
          <div class="stat-label">Avg Response Time Ratio</div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2 style="margin-top: 0; border: none; padding: 0;">Web Layer Augmentations Explained</h2>

      <div class="explanation-box">
        <h4>🛒 Shopping Results & Product Cards</h4>
        <p>ChatGPT.com integrates with e-commerce APIs to display real-time product information including prices, retailer names, and availability. This is NOT available via the OpenAI API.</p>
        <p><strong>Detected in:</strong> ${withShopping}/${analyses.length} queries (${Math.round(withShopping/analyses.length*100)}%)</p>
        <p><strong>Example:</strong> "Petcurean Go! Sensitivities Limited Ingredient Dry Dog Food $21.99 • Chewy.com + others"</p>
      </div>

      <div class="explanation-box">
        <h4>🔍 Browsing & Search Integration</h4>
        <p>The web interface can invoke a browsing tool to fetch current information from the internet, resulting in source citations [Like This] and up-to-date pricing/availability data.</p>
        <p><strong>Detected in:</strong> ${withBrowsing}/${analyses.length} queries (${Math.round(withBrowsing/analyses.length*100)}%)</p>
        <p><strong>Indicators:</strong> Retailer links, source citations, "multi-retailer aggregation" patterns</p>
      </div>

      <div class="explanation-box">
        <h4>📝 Structured Formatting & Emojis</h4>
        <p>Web responses use visual hierarchy with emoji headers (🥇 Top Picks, 🐶 Tips) to improve readability. This formatting preference appears to be part of the web system prompt.</p>
        <p><strong>Detected in:</strong> ${withEmojis}/${analyses.length} queries (${Math.round(withEmojis/analyses.length*100)}%)</p>
        <p><strong>Emojis found:</strong> <span class="emoji-display">${[...new Set(analyses.flatMap(a => a.emojisFound))].join(' ')}</span></p>
      </div>

      <div class="explanation-box">
        <h4>💬 Follow-up Engagement Prompts</h4>
        <p>Web responses frequently end with personalized engagement prompts asking for more context to provide tailored recommendations.</p>
        <p><strong>Detected in:</strong> ${withFollowUp}/${analyses.length} queries (${Math.round(withFollowUp/analyses.length*100)}%)</p>
        <p><strong>Example:</strong> "If you share your dog's age, size, and any dietary sensitivities, I can tailor this list..."</p>
      </div>

      <div class="warning-box">
        <h4>⚠️ Brand Visibility Implications</h4>
        <p>The browsing/shopping augmentation significantly changes which brands appear in responses. Some brands appeared <strong>only</strong> in web results (likely from real-time search), while others appeared <strong>only</strong> in API results (from training data).</p>
        <p><strong>Web-only brands:</strong> ${allWebOnlyBrands.length > 0 ? allWebOnlyBrands.join(', ') : 'None detected'}</p>
        <p><strong>API-only brands:</strong> ${allOpenaiOnlyBrands.length > 0 ? allOpenaiOnlyBrands.join(', ') : 'None detected'}</p>
      </div>
    </div>

    <div class="card">
      <h2 style="margin-top: 0; border: none; padding: 0;">Detection Summary by Query</h2>
      <table class="layer-table">
        <thead>
          <tr>
            <th>Query</th>
            <th>Length Ratio</th>
            <th>Browsing</th>
            <th>Shopping</th>
            <th>Emojis</th>
            <th>Citations</th>
            <th>Follow-up</th>
          </tr>
        </thead>
        <tbody>
          ${analyses.map(a => `
          <tr>
            <td>${a.queryText.substring(0, 50)}${a.queryText.length > 50 ? '...' : ''}</td>
            <td>${a.lengthRatio.toFixed(1)}x</td>
            <td class="${a.hasBrowsingIndicators ? 'check' : 'x'}">${a.hasBrowsingIndicators ? '✓' : '✗'}</td>
            <td class="${a.hasShoppingResults ? 'check' : 'x'}">${a.hasShoppingResults ? '✓' : '✗'}</td>
            <td class="${a.hasEmojis ? 'check' : 'x'}">${a.hasEmojis ? a.emojiCount : '✗'}</td>
            <td class="${a.hasCitations ? 'check' : 'x'}">${a.hasCitations ? a.citationsFound.length : '✗'}</td>
            <td class="${a.hasFollowUpPrompt ? 'check' : 'x'}">${a.hasFollowUpPrompt ? '✓' : '✗'}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <h2>Side-by-Side Response Comparisons</h2>

    ${pairs.map((pair, idx) => {
      const analysis = analyses[idx];
      return `
    <div class="card">
      <h3>Q${idx + 1}: "${pair.queryText}"</h3>

      <div class="augmentation-list">
        ${analysis.hasBrowsingIndicators ? `<span class="badge badge-browsing">🔍 Browsing Active</span>` : ''}
        ${analysis.hasShoppingResults ? `<span class="badge badge-shopping">🛒 Shopping Results (${analysis.pricesFound.length} prices)</span>` : ''}
        ${analysis.hasEmojis ? `<span class="badge badge-emoji">😊 ${analysis.emojiCount} Emojis</span>` : ''}
        ${analysis.hasCitations ? `<span class="badge badge-citation">📚 ${analysis.citationsFound.length} Citations</span>` : ''}
        ${analysis.hasFollowUpPrompt ? `<span class="badge badge-brand">💬 Follow-up Prompt</span>` : ''}
      </div>

      <p><strong>Length:</strong> API ${analysis.openaiLength} chars → Web ${analysis.webLength} chars (${analysis.lengthRatio.toFixed(1)}x)</p>
      <p><strong>Time:</strong> API ${analysis.openaiResponseTimeMs}ms → Web ${analysis.webResponseTimeMs}ms (${analysis.timingRatio.toFixed(1)}x slower)</p>

      ${analysis.webOnlyBrands.length > 0 ? `<p><strong>Brands only in Web response:</strong> ${analysis.webOnlyBrands.join(', ')}</p>` : ''}
      ${analysis.openaiOnlyBrands.length > 0 ? `<p><strong>Brands only in API response:</strong> ${analysis.openaiOnlyBrands.join(', ')}</p>` : ''}

      <div class="comparison-section">
        <div class="response-panel api">
          <h4>🔌 OpenAI API Response</h4>
          <div class="response-text">${escapeHtml(pair.openaiApi.responseText)}</div>
        </div>
        <div class="response-panel web">
          <h4>🌐 ChatGPT.com Response</h4>
          <div class="response-text">${escapeHtml(pair.chatgptWeb.responseText)}</div>
        </div>
      </div>
    </div>
      `;
    }).join('')}

    <div class="card">
      <h2 style="margin-top: 0; border: none; padding: 0;">Key Findings</h2>

      <h3>1. Shopping Integration is Pervasive</h3>
      <p>${withShopping}/${analyses.length} (${Math.round(withShopping/analyses.length*100)}%) of pet food queries triggered the shopping/browsing tool, displaying real-time prices and retailer links that are completely absent from API responses.</p>

      <h3>2. Response Length Significantly Higher</h3>
      <p>Web responses averaged ${avgLengthRatio.toFixed(1)}x longer than API responses, primarily due to shopping results, structured formatting, and engagement prompts.</p>

      <h3>3. Latency Trade-off</h3>
      <p>Web responses took ${avgTimingRatio.toFixed(1)}x longer on average (${Math.round(analyses.reduce((s,a) => s + a.webResponseTimeMs, 0)/analyses.length)}ms vs ${Math.round(analyses.reduce((s,a) => s + a.openaiResponseTimeMs, 0)/analyses.length)}ms), likely due to browsing tool invocation and e-commerce API calls.</p>

      <h3>4. Brand Visibility Differs</h3>
      <p>The browsing augmentation introduces brands from current search results that may not appear in the base model's training data, and vice versa. This has significant implications for brand visibility strategies.</p>

      <h3>5. Engagement Design</h3>
      <p>The web interface includes system prompt instructions to end responses with personalized follow-up questions, creating a more conversational experience.</p>
    </div>
  </div>

  <footer class="glu-footer">
    <p>Generated by Glu AI Visibility Analysis • ${new Date().toISOString()}</p>
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
    .replace(/'/g, '&#039;');
}

async function main() {
  console.log('Loading HUFT study results...');

  const resultsPath = '/Users/edf/bentham/studies/huft-visibility-study-results.json';
  const results: StudyResults = JSON.parse(readFileSync(resultsPath, 'utf-8'));

  console.log(`Study: ${results.studyName}`);
  console.log(`Total jobs: ${results.jobs.length}`);

  // Pair up API and Web responses by query
  const pairs: QueryPair[] = [];
  const queryIndices = [...new Set(results.jobs.map(j => j.queryIndex))];

  for (const idx of queryIndices) {
    const apiJob = results.jobs.find(j => j.queryIndex === idx && j.surfaceId === 'openai-api');
    const webJob = results.jobs.find(j => j.queryIndex === idx && j.surfaceId === 'chatgpt-web');

    if (apiJob && webJob) {
      pairs.push({
        queryText: apiJob.queryText,
        queryIndex: idx,
        openaiApi: apiJob,
        chatgptWeb: webJob,
      });
    }
  }

  console.log(`Found ${pairs.length} paired queries`);

  // Analyze each pair
  const analyses = pairs.map(pair => analyzeQueryPair(pair));

  // Print summary
  console.log('\n=== Web Layer Detection Summary ===');
  for (const analysis of analyses) {
    console.log(`\nQ${analysis.queryIndex + 1}: "${analysis.queryText.substring(0, 50)}..."`);
    console.log(`  Length: ${analysis.openaiLength} → ${analysis.webLength} (${analysis.lengthRatio.toFixed(1)}x)`);
    console.log(`  Browsing: ${analysis.hasBrowsingIndicators ? 'YES - ' + analysis.browsingIndicators.join(', ') : 'No'}`);
    console.log(`  Shopping: ${analysis.hasShoppingResults ? 'YES - ' + analysis.pricesFound.length + ' prices' : 'No'}`);
    console.log(`  Emojis: ${analysis.hasEmojis ? 'YES - ' + analysis.emojisFound.join(' ') : 'No'}`);
    console.log(`  Citations: ${analysis.hasCitations ? 'YES - ' + analysis.citationsFound.join(', ') : 'No'}`);
    console.log(`  Follow-up: ${analysis.hasFollowUpPrompt ? 'YES' : 'No'}`);
  }

  // Generate HTML report
  const reportHtml = generateReport(analyses, pairs);
  const reportPath = '/Users/edf/bentham/studies/huft-web-layer-analysis.html';
  writeFileSync(reportPath, reportHtml);
  console.log(`\nReport saved to: ${reportPath}`);

  // Save JSON analysis
  const jsonPath = '/Users/edf/bentham/studies/huft-web-layer-analysis.json';
  writeFileSync(jsonPath, JSON.stringify({ analyses, pairs }, null, 2));
  console.log(`JSON data saved to: ${jsonPath}`);
}

main().catch(console.error);
