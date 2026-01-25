#!/usr/bin/env npx tsx
/**
 * Generate HTML comparison report for Todd Achilles study
 */

import * as fs from 'fs';

const results = JSON.parse(fs.readFileSync('/Users/edf/bentham/studies/todd-achilles-complete-results.json', 'utf-8'));

// Group jobs by query
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

const surfaces = [
  { id: 'chatgpt-web', name: 'ChatGPT', color: '#10a37f' },
  { id: 'claude-web', name: 'Claude', color: '#d4a574' },
  { id: 'bing-search', name: 'Bing', color: '#00809d' },
  { id: 'google-ai-overview', name: 'Google AI', color: '#4285f4' },
  { id: 'perplexity-web', name: 'Perplexity', color: '#20808d' },
];

const categories: Record<string, string[]> = {
  'Identity': ['Who is Todd Achilles?', 'What party is Todd Achilles in?', 'What is Todd Achilles running for?'],
  'Qualification': ['Is Todd Achilles qualified for this position?', 'What experience does Todd Achilles have?', "What is Todd Achilles's background?"],
  'Position': ["What are Todd Achilles's positions on the issues?", "What are Todd Achilles's priorities?", 'What would Todd Achilles do about the economy?', "What is Todd Achilles's position on healthcare?", 'Where does Todd Achilles stand on immigration?'],
  'Electability': ['Why should I vote for Todd Achilles?', 'Who has endorsed Todd Achilles?'],
  'Character': ['Is Todd Achilles honest?', 'Can I trust Todd Achilles?'],
};

// Build lookup map
const responseMap = new Map<string, any>();
for (const job of results.jobs) {
  const key = `${job.surfaceId}|${job.queryText}`;
  responseMap.set(key, job);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

function formatResponse(text: string | undefined): string {
  if (!text) return '<em class="no-response">No response</em>';
  // Truncate very long responses for readability
  const maxLen = 2000;
  let formatted = text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
  return escapeHtml(formatted);
}

let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Todd Achilles - AI Surface Comparison Report</title>
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
    h1 {
      color: #1a1a2e;
      border-bottom: 3px solid #4a90d9;
      padding-bottom: 10px;
    }
    h2 {
      color: #16213e;
      margin-top: 40px;
      border-left: 4px solid #4a90d9;
      padding-left: 12px;
    }
    h3 {
      color: #0f3460;
      margin-top: 30px;
      background: #e8f4f8;
      padding: 10px 15px;
      border-radius: 6px;
    }
    .summary {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 30px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin-top: 15px;
    }
    .summary-card {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 6px;
      text-align: center;
      border-left: 4px solid;
    }
    .summary-card h4 {
      margin: 0 0 5px 0;
      font-size: 14px;
      color: #666;
    }
    .summary-card .value {
      font-size: 24px;
      font-weight: bold;
    }
    .query-section {
      background: white;
      margin-bottom: 25px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .query-header {
      background: #1a1a2e;
      color: white;
      padding: 12px 20px;
      font-weight: 600;
    }
    .responses-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1px;
      background: #ddd;
    }
    .response-card {
      background: white;
      padding: 15px;
    }
    .response-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 2px solid;
    }
    .response-header .surface-name {
      font-weight: 600;
      font-size: 14px;
    }
    .response-header .response-time {
      font-size: 12px;
      color: #666;
      margin-left: auto;
    }
    .response-content {
      font-size: 13px;
      max-height: 400px;
      overflow-y: auto;
      color: #444;
    }
    .no-response {
      color: #999;
    }
    .category-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 15px 20px;
      margin: 40px 0 20px 0;
      border-radius: 8px;
      font-size: 20px;
      font-weight: 600;
    }
    .meta-info {
      color: #666;
      font-size: 14px;
      margin-bottom: 20px;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
      margin: 20px 0;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
    }
    .legend-color {
      width: 16px;
      height: 16px;
      border-radius: 3px;
    }
    @media print {
      body { background: white; }
      .query-section { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>Todd Achilles - AI Surface Comparison Report</h1>

  <div class="meta-info">
    <strong>Candidate:</strong> ${results.candidate.name} |
    <strong>Race:</strong> ${results.candidate.race}, ${results.candidate.state} |
    <strong>Election:</strong> ${results.candidate.electionDate} |
    <strong>Generated:</strong> ${new Date().toLocaleString()}
  </div>

  <div class="summary">
    <h2 style="margin-top: 0; border: none; padding: 0;">Study Summary</h2>
    <p><strong>Total Queries:</strong> ${queries.length} | <strong>Surfaces:</strong> ${surfaces.length} | <strong>Total Jobs:</strong> ${results.summary.totalJobs} | <strong>Completed:</strong> ${results.summary.completedJobs}</p>

    <div class="legend">
      ${surfaces.map(s => `<div class="legend-item"><div class="legend-color" style="background: ${s.color}"></div>${s.name}</div>`).join('')}
    </div>

    <div class="summary-grid">
      ${surfaces.map(s => {
        const data = results.bySurface[s.id];
        return `<div class="summary-card" style="border-color: ${s.color}">
          <h4>${s.name}</h4>
          <div class="value" style="color: ${s.color}">${data.complete}/${data.total}</div>
        </div>`;
      }).join('')}
    </div>
  </div>
`;

// Generate sections by category
for (const [category, categoryQueries] of Object.entries(categories)) {
  html += `<div class="category-header">${category}</div>\n`;

  for (const query of categoryQueries) {
    html += `<div class="query-section">
      <div class="query-header">${escapeHtml(query)}</div>
      <div class="responses-grid">
`;

    for (const surface of surfaces) {
      const key = `${surface.id}|${query}`;
      const job = responseMap.get(key);
      const responseTime = job?.responseTimeMs ? `${(job.responseTimeMs / 1000).toFixed(1)}s` : '';
      const responseText = job?.responseText || '';

      html += `        <div class="response-card">
          <div class="response-header" style="border-color: ${surface.color}">
            <span class="surface-name" style="color: ${surface.color}">${surface.name}</span>
            <span class="response-time">${responseTime}</span>
          </div>
          <div class="response-content">${formatResponse(responseText)}</div>
        </div>
`;
    }

    html += `      </div>
    </div>
`;
  }
}

html += `
  <div style="margin-top: 40px; padding: 20px; background: #f0f0f0; border-radius: 8px; text-align: center; color: #666;">
    <p>Generated by Bentham Pipeline - Kyanos Voter Impact Study</p>
    <p>Study ID: ${results.studyId}</p>
  </div>
</body>
</html>`;

const outputPath = '/Users/edf/bentham/studies/todd-achilles-5-surface-comparison.html';
fs.writeFileSync(outputPath, html);
console.log(`Report saved to: ${outputPath}`);
console.log(`Total size: ${(html.length / 1024).toFixed(1)} KB`);
