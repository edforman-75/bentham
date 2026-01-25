#!/usr/bin/env npx tsx
/**
 * Compare ChatGPT Web responses vs OpenAI API responses
 * Analyzes differences and hypothesizes their sources
 */

import * as fs from 'fs';
import OpenAI from 'openai';

const studyResults = JSON.parse(fs.readFileSync('/Users/edf/bentham/studies/todd-achilles-complete-results.json', 'utf-8'));

const queries = [
  'Who is Todd Achilles?',
  'What party is Todd Achilles in?',
  'What is Todd Achilles running for?',
  'Is Todd Achilles qualified for this position?',
  'What experience does Todd Achilles have?',
  "What is Todd Achilles's background?",
  "What are Todd Achilles's positions on the issues?",
  "What are Todd Achilles's priorities?",
  'Why should I vote for Todd Achilles?',
  'Who has endorsed Todd Achilles?',
  'What would Todd Achilles do about the economy?',
  "What is Todd Achilles's position on healthcare?",
  'Where does Todd Achilles stand on immigration?',
  'Is Todd Achilles honest?',
  'Can I trust Todd Achilles?',
];

// Extract ChatGPT web responses from study
const webResponses = new Map<string, string>();
for (const job of studyResults.jobs) {
  if (job.surfaceId === 'chatgpt-web' && job.responseText) {
    webResponses.set(job.queryText, job.responseText);
  }
}

interface ComparisonResult {
  query: string;
  webResponse: string;
  apiResponse: string;
  analysis: {
    webHasCitations: boolean;
    webHasFormatting: boolean;
    webHasBrowsingIndicators: boolean;
    apiHasDisclaimer: boolean;
    webLength: number;
    apiLength: number;
    lengthDiff: number;
    keyDifferences: string[];
    likelySources: string[];
  };
}

// Indicators of web browsing being used
const browsingIndicators = [
  'Wikipedia',
  'according to',
  'sources indicate',
  '.com',
  '.org',
  'website',
  'reported',
  'article',
  'news',
];

// Indicators of formatting added by web interface
const formattingIndicators = [
  '🗳️',
  '📍',
  '✅',
  '❌',
  '•',
  '**',
  '##',
  '\n\n',
];

function analyzeResponse(text: string): {
  hasCitations: boolean;
  hasFormatting: boolean;
  hasBrowsingIndicators: boolean;
  hasDisclaimer: boolean;
  formattingTypes: string[];
  browsingTypes: string[];
} {
  const textLower = text.toLowerCase();

  const hasCitations = /\[\d+\]|\[source\]|wikipedia|\.com|\.org/i.test(text);
  const hasFormatting = formattingIndicators.some(f => text.includes(f));
  const hasBrowsingIndicators = browsingIndicators.some(b => textLower.includes(b.toLowerCase()));
  const hasDisclaimer = /i don't have|cannot verify|as of my|knowledge cutoff|i'm not sure/i.test(text);

  const formattingTypes = formattingIndicators.filter(f => text.includes(f));
  const browsingTypes = browsingIndicators.filter(b => textLower.includes(b.toLowerCase()));

  return { hasCitations, hasFormatting, hasBrowsingIndicators, hasDisclaimer, formattingTypes, browsingTypes };
}

function identifyKeyDifferences(web: string, api: string): string[] {
  const differences: string[] = [];

  const webAnalysis = analyzeResponse(web);
  const apiAnalysis = analyzeResponse(api);

  // Check for browsing vs knowledge cutoff
  if (webAnalysis.hasBrowsingIndicators && !apiAnalysis.hasBrowsingIndicators) {
    differences.push('Web used real-time browsing; API relied on training data');
  }

  if (apiAnalysis.hasDisclaimer && !webAnalysis.hasDisclaimer) {
    differences.push('API included knowledge cutoff disclaimer; Web did not');
  }

  // Check for citations
  if (webAnalysis.hasCitations && !apiAnalysis.hasCitations) {
    differences.push('Web included source citations; API did not');
  }

  // Check for formatting
  if (webAnalysis.formattingTypes.length > apiAnalysis.formattingTypes.length) {
    differences.push(`Web had richer formatting (${webAnalysis.formattingTypes.join(', ')})`);
  }

  // Check for length differences
  const lengthRatio = web.length / api.length;
  if (lengthRatio > 1.5) {
    differences.push(`Web response ${(lengthRatio).toFixed(1)}x longer than API`);
  } else if (lengthRatio < 0.67) {
    differences.push(`API response ${(1/lengthRatio).toFixed(1)}x longer than Web`);
  }

  // Check for factual differences
  const webMentionsIdaho = /idaho/i.test(web);
  const apiMentionsIdaho = /idaho/i.test(api);
  if (webMentionsIdaho !== apiMentionsIdaho) {
    differences.push(webMentionsIdaho
      ? 'Web correctly identified Idaho context; API missed it'
      : 'API mentioned Idaho; Web did not');
  }

  // Check for wrong person identification
  const webMentionsTelemedicine = /telemedicine|telehealth|digital health/i.test(web);
  const apiMentionsTelemedicine = /telemedicine|telehealth|digital health/i.test(api);
  if (webMentionsTelemedicine || apiMentionsTelemedicine) {
    differences.push('Confused with different Todd Achilles (digital health executive)');
  }

  // Check for political content
  const webMentionsSenate = /senate|senator|congress/i.test(web);
  const apiMentionsSenate = /senate|senator|congress/i.test(api);
  if (webMentionsSenate && !apiMentionsSenate) {
    differences.push('Web identified Senate race; API did not');
  }

  return differences;
}

function identifyLikelySources(web: string, api: string, differences: string[]): string[] {
  const sources: string[] = [];

  if (differences.some(d => d.includes('browsing'))) {
    sources.push('ChatGPT Web Search Tool - Real-time web results integrated into response');
  }

  if (/wikipedia/i.test(web)) {
    sources.push('Wikipedia - Cited directly in web response');
  }

  if (/idahocapitalsun|boiseguardian|idahonews/i.test(web)) {
    sources.push('Idaho local news sources via web search');
  }

  if (differences.some(d => d.includes('formatting'))) {
    sources.push('ChatGPT Web UI formatting layer - Adds emojis, markdown, structured layout');
  }

  if (differences.some(d => d.includes('disclaimer'))) {
    sources.push('API system prompt includes knowledge cutoff awareness; Web search bypasses this');
  }

  if (differences.some(d => d.includes('wrong person') || d.includes('Confused'))) {
    sources.push('Model training data contains multiple "Todd Achilles" - disambiguation failed');
  }

  if (web.length > api.length * 1.3) {
    sources.push('Web response augmented with search results, citations, and follow-up suggestions');
  }

  return sources;
}

async function main() {
  const openai = new OpenAI();

  console.log('='.repeat(70));
  console.log('  ChatGPT Web vs OpenAI API Comparison');
  console.log('='.repeat(70));
  console.log('\nQuerying OpenAI API for comparison...\n');

  const comparisons: ComparisonResult[] = [];

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    const webResponse = webResponses.get(query) || '';

    console.log(`[${i + 1}/${queries.length}] "${query.slice(0, 40)}..."`);

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: query }],
        max_tokens: 2000,
      });

      const apiResponse = completion.choices[0]?.message?.content || '';

      const webAnalysis = analyzeResponse(webResponse);
      const apiAnalysis = analyzeResponse(apiResponse);
      const keyDifferences = identifyKeyDifferences(webResponse, apiResponse);
      const likelySources = identifyLikelySources(webResponse, apiResponse, keyDifferences);

      comparisons.push({
        query,
        webResponse,
        apiResponse,
        analysis: {
          webHasCitations: webAnalysis.hasCitations,
          webHasFormatting: webAnalysis.hasFormatting,
          webHasBrowsingIndicators: webAnalysis.hasBrowsingIndicators,
          apiHasDisclaimer: apiAnalysis.hasDisclaimer,
          webLength: webResponse.length,
          apiLength: apiResponse.length,
          lengthDiff: webResponse.length - apiResponse.length,
          keyDifferences,
          likelySources,
        },
      });

      console.log(`  ✅ Web: ${webResponse.length} chars, API: ${apiResponse.length} chars`);

      // Rate limit
      await new Promise(r => setTimeout(r, 500));

    } catch (error) {
      console.log(`  ❌ Error: ${error}`);
    }
  }

  // Save raw comparison data
  fs.writeFileSync(
    '/Users/edf/bentham/studies/chatgpt-web-vs-api-comparison.json',
    JSON.stringify(comparisons, null, 2)
  );

  // Generate HTML report
  generateReport(comparisons);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

function generateReport(comparisons: ComparisonResult[]) {
  // Calculate summary statistics
  const stats = {
    totalQueries: comparisons.length,
    webUsedBrowsing: comparisons.filter(c => c.analysis.webHasBrowsingIndicators).length,
    webHadCitations: comparisons.filter(c => c.analysis.webHasCitations).length,
    apiHadDisclaimer: comparisons.filter(c => c.analysis.apiHasDisclaimer).length,
    avgWebLength: Math.round(comparisons.reduce((s, c) => s + c.analysis.webLength, 0) / comparisons.length),
    avgApiLength: Math.round(comparisons.reduce((s, c) => s + c.analysis.apiLength, 0) / comparisons.length),
  };

  // Identify patterns
  const allDifferences = comparisons.flatMap(c => c.analysis.keyDifferences);
  const differenceCounts = new Map<string, number>();
  for (const d of allDifferences) {
    differenceCounts.set(d, (differenceCounts.get(d) || 0) + 1);
  }
  const topDifferences = [...differenceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const allSources = comparisons.flatMap(c => c.analysis.likelySources);
  const sourceCounts = new Map<string, number>();
  for (const s of allSources) {
    sourceCounts.set(s, (sourceCounts.get(s) || 0) + 1);
  }
  const topSources = [...sourceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ChatGPT Web vs API Comparison Report</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 20px;
      background: #f5f5f5;
    }
    .container { max-width: 1600px; margin: 0 auto; }
    h1 { color: #1a1a2e; border-bottom: 3px solid #10a37f; padding-bottom: 10px; }
    h2 { color: #2d3748; margin-top: 30px; }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin: 20px 0;
    }
    .stat-card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      text-align: center;
    }
    .stat-value { font-size: 36px; font-weight: bold; color: #10a37f; }
    .stat-label { color: #666; font-size: 14px; }
    .explanation-box {
      background: #e8f5e9;
      border-left: 4px solid #10a37f;
      padding: 20px;
      margin: 20px 0;
      border-radius: 0 8px 8px 0;
    }
    .explanation-box h3 { margin-top: 0; color: #1b5e20; }
    .explanation-box ul { margin: 10px 0; padding-left: 20px; }
    .explanation-box li { margin: 8px 0; }
    .findings-box {
      background: #fff3e0;
      border-left: 4px solid #ff9800;
      padding: 20px;
      margin: 20px 0;
      border-radius: 0 8px 8px 0;
    }
    .findings-box h3 { margin-top: 0; color: #e65100; }
    .comparison-card {
      background: white;
      margin: 20px 0;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .comparison-header {
      background: #2d3748;
      color: white;
      padding: 15px 20px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .comparison-header:hover { background: #3d4a5c; }
    .comparison-body { padding: 0; display: none; }
    .comparison-body.open { display: block; }
    .response-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1px;
      background: #e2e8f0;
    }
    .response-col {
      background: white;
      padding: 20px;
    }
    .response-col h4 {
      margin: 0 0 10px 0;
      padding-bottom: 10px;
      border-bottom: 2px solid;
    }
    .web-col h4 { border-color: #10a37f; color: #10a37f; }
    .api-col h4 { border-color: #6366f1; color: #6366f1; }
    .response-text {
      font-size: 13px;
      max-height: 400px;
      overflow-y: auto;
      background: #f7fafc;
      padding: 15px;
      border-radius: 6px;
      white-space: pre-wrap;
    }
    .analysis-section {
      padding: 20px;
      background: #fafafa;
      border-top: 1px solid #e2e8f0;
    }
    .analysis-section h4 { margin: 0 0 15px 0; color: #2d3748; }
    .diff-tag {
      display: inline-block;
      background: #fee2e2;
      color: #991b1b;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 12px;
      margin: 4px;
    }
    .source-tag {
      display: inline-block;
      background: #dbeafe;
      color: #1e40af;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 12px;
      margin: 4px;
    }
    .metrics {
      display: flex;
      gap: 20px;
      margin-bottom: 15px;
      font-size: 13px;
    }
    .metric { background: #f0f0f0; padding: 6px 12px; border-radius: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
    th { background: #f7fafc; font-weight: 600; }
    .count { font-weight: bold; color: #10a37f; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔍 ChatGPT Web vs OpenAI API Comparison</h1>
    <p><strong>Study:</strong> Todd Achilles Voter Impact | <strong>Model:</strong> GPT-4o | <strong>Generated:</strong> ${new Date().toLocaleString()}</p>

    <div class="summary-grid">
      <div class="stat-card">
        <div class="stat-value">${stats.totalQueries}</div>
        <div class="stat-label">Queries Compared</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.webUsedBrowsing}</div>
        <div class="stat-label">Web Used Browsing</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.webHadCitations}</div>
        <div class="stat-label">Web Had Citations</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.apiHadDisclaimer}</div>
        <div class="stat-label">API Had Disclaimers</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.avgWebLength}</div>
        <div class="stat-label">Avg Web Response (chars)</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.avgApiLength}</div>
        <div class="stat-label">Avg API Response (chars)</div>
      </div>
    </div>

    <div class="explanation-box">
      <h3>🧠 What Makes ChatGPT Web Different from the API?</h3>
      <p>ChatGPT.com adds several layers on top of the raw GPT-4o model:</p>
      <ul>
        <li><strong>Web Search Tool:</strong> ChatGPT Web can browse the internet in real-time, accessing current information that the API's training data doesn't have. This is why Web responses often include Wikipedia citations and recent news.</li>
        <li><strong>System Prompts:</strong> ChatGPT Web has extensive system instructions that shape response format, safety behavior, and persona. The API receives only your message.</li>
        <li><strong>Memory & Context:</strong> Web version may incorporate user preferences and conversation history from your account.</li>
        <li><strong>UI Formatting:</strong> The web interface adds rich formatting (emojis, markdown, expandable sections) that the API doesn't provide by default.</li>
        <li><strong>Tool Integrations:</strong> Web has access to DALL-E, Code Interpreter, and browsing - the raw API call doesn't.</li>
      </ul>
    </div>

    <div class="findings-box">
      <h3>📊 Key Findings from This Comparison</h3>
      <table>
        <thead>
          <tr><th>Difference Pattern</th><th>Occurrences</th></tr>
        </thead>
        <tbody>
          ${topDifferences.map(([diff, count]) => `<tr><td>${diff}</td><td class="count">${count}/${stats.totalQueries}</td></tr>`).join('')}
        </tbody>
      </table>

      <h4>Likely Sources of Differences:</h4>
      <table>
        <thead>
          <tr><th>Source</th><th>Occurrences</th></tr>
        </thead>
        <tbody>
          ${topSources.map(([source, count]) => `<tr><td>${source}</td><td class="count">${count}/${stats.totalQueries}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>

    <h2>📋 Query-by-Query Comparison</h2>
    <p>Click on each query to expand the full comparison.</p>
`;

  for (const comp of comparisons) {
    html += `
    <div class="comparison-card">
      <div class="comparison-header" onclick="this.nextElementSibling.classList.toggle('open')">
        <span>${escapeHtml(comp.query)}</span>
        <span>Web: ${comp.analysis.webLength} chars | API: ${comp.analysis.apiLength} chars</span>
      </div>
      <div class="comparison-body">
        <div class="response-grid">
          <div class="response-col web-col">
            <h4>🌐 ChatGPT Web Response</h4>
            <div class="metrics">
              <span class="metric">Citations: ${comp.analysis.webHasCitations ? '✅' : '❌'}</span>
              <span class="metric">Browsing: ${comp.analysis.webHasBrowsingIndicators ? '✅' : '❌'}</span>
              <span class="metric">Formatting: ${comp.analysis.webHasFormatting ? '✅' : '❌'}</span>
            </div>
            <div class="response-text">${escapeHtml(comp.webResponse.slice(0, 3000))}</div>
          </div>
          <div class="response-col api-col">
            <h4>🔌 OpenAI API Response (GPT-4o)</h4>
            <div class="metrics">
              <span class="metric">Disclaimer: ${comp.analysis.apiHasDisclaimer ? '✅' : '❌'}</span>
            </div>
            <div class="response-text">${escapeHtml(comp.apiResponse.slice(0, 3000))}</div>
          </div>
        </div>
        <div class="analysis-section">
          <h4>🔬 Analysis</h4>
          <p><strong>Key Differences:</strong></p>
          <div>${comp.analysis.keyDifferences.map(d => `<span class="diff-tag">${d}</span>`).join('')}</div>
          <p style="margin-top: 15px;"><strong>Likely Sources:</strong></p>
          <div>${comp.analysis.likelySources.map(s => `<span class="source-tag">${s}</span>`).join('')}</div>
        </div>
      </div>
    </div>
`;
  }

  html += `
    <div class="explanation-box" style="margin-top: 40px;">
      <h3>💡 Implications for Voter Information</h3>
      <ul>
        <li><strong>Web browsing is critical for current events:</strong> The API alone often doesn't know about recent political candidates, while Web can find current information.</li>
        <li><strong>Disambiguation matters:</strong> Both versions sometimes confused Todd Achilles (Idaho politician) with other people of the same name. Web search helps but doesn't always solve this.</li>
        <li><strong>Citations increase trust:</strong> Web responses with Wikipedia and news citations appear more credible than API responses that may be drawing from stale training data.</li>
        <li><strong>Format influences perception:</strong> The rich formatting of Web responses (headers, bullet points, emojis) makes information more digestible.</li>
      </ul>
    </div>

    <div style="margin-top: 40px; padding: 20px; background: #f0f0f0; border-radius: 8px; text-align: center; color: #666;">
      <p>Generated by Bentham Pipeline - ChatGPT Web vs API Analysis</p>
    </div>
  </div>
</body>
</html>`;

  const outputPath = '/Users/edf/bentham/studies/chatgpt-web-vs-api-report.html';
  fs.writeFileSync(outputPath, html);
  console.log(`\n✅ Report saved to: ${outputPath}`);

  // Print summary
  console.log('\n' + '='.repeat(70));
  console.log('  Summary');
  console.log('='.repeat(70));
  console.log(`\nWeb used browsing: ${stats.webUsedBrowsing}/${stats.totalQueries}`);
  console.log(`Web had citations: ${stats.webHadCitations}/${stats.totalQueries}`);
  console.log(`API had disclaimers: ${stats.apiHadDisclaimer}/${stats.totalQueries}`);
  console.log(`\nAvg response length: Web ${stats.avgWebLength} chars, API ${stats.avgApiLength} chars`);
  console.log(`\nTop differences:`);
  topDifferences.forEach(([diff, count]) => console.log(`  - ${diff}: ${count}x`));
}

main().catch(console.error);
