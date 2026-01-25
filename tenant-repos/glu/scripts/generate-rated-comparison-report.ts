#!/usr/bin/env npx tsx
/**
 * Generate rated HTML comparison report for Todd Achilles study
 * 6 surfaces with 2 rows x 3 columns layout, collapsible answers, and quality ratings
 */

import * as fs from 'fs';

const results = JSON.parse(fs.readFileSync('/Users/edf/bentham/studies/todd-achilles-complete-results.json', 'utf-8'));

// Source of Truth (SSOT) from campaign website + Ballotpedia
const SSOT = {
  name: 'Todd Achilles',
  party: 'Independent (formerly Democratic)',
  runningFor: 'U.S. Senate, Idaho, 2026',
  opponent: 'Jim Risch (Republican incumbent)',

  education: [
    'B.A. Economics & International Relations - Claremont McKenna College',
    'MBA Marketing & Finance - University of Washington',
    'MA International Studies - University of Washington',
    'MPA - UC Berkeley'
  ],

  military: 'U.S. Army 1992-1995, tank commander and armor officer',

  career: [
    'Executive Director of Product Management - T-Mobile',
    'President - HTC',
    'Vice President/General Manager - HP',
    'CEO - Evoca',
    'Founder - Veterans for Idaho Voters',
    'Public policy instructor',
    'Veterans advocate'
  ],

  political: 'Idaho House of Representatives District 16B (Feb 2024 - June 2025), won 2024 election with 59.8%',

  background: 'Grew up on family farm in Oregon/Idaho',

  keyPositions: [
    'Stop corruption in Congress',
    'Reduce national debt',
    'Protect public lands',
    'End forever wars',
    'Support families over corporations',
    'Tax fairness',
    'Housing affordability',
    'Defend Second Amendment',
    'Term limits',
    'Border security'
  ],

  endorsements2024: [
    'Everytown for Gun Safety/Moms Demand Action',
    'Idaho Farm Bureau Federation',
    'Planned Parenthood Alliance Advocates - Idaho'
  ]
};

// Key facts to check for accuracy
const accuracyChecks: Record<string, string[]> = {
  'Who is Todd Achilles?': ['Idaho', 'State Representative', 'Senate', 'independent', 'Army', 'veteran'],
  'What party is Todd Achilles in?': ['independent', 'Democrat', 'Democratic', 'left', 'changed'],
  'What is Todd Achilles running for?': ['Senate', 'U.S. Senate', 'Idaho', '2026', 'Risch'],
  'Is Todd Achilles qualified for this position?': ['Army', 'military', 'legislature', 'education', 'MBA', 'MPA', 'executive'],
  'What experience does Todd Achilles have?': ['Army', 'T-Mobile', 'HP', 'HTC', 'Evoca', 'legislature', 'Idaho House'],
  "What is Todd Achilles's background?": ['farm', 'Army', 'Claremont', 'Berkeley', 'Washington', 'tech'],
  "What are Todd Achilles's positions on the issues?": ['corruption', 'debt', 'public lands', 'tax', 'housing', 'Second Amendment'],
  "What are Todd Achilles's priorities?": ['corruption', 'debt', 'public lands', 'middle class', 'veterans'],
  'Why should I vote for Todd Achilles?': ['independent', 'reform', 'veteran', 'experience'],
  'Who has endorsed Todd Achilles?': ['Everytown', 'Farm Bureau', 'Planned Parenthood', 'Term Limits'],
  'What would Todd Achilles do about the economy?': ['debt', 'tax', 'middle class', 'loopholes', 'workers'],
  "What is Todd Achilles's position on healthcare?": ['access', 'rural', 'Medicaid', 'hospitals'],
  'Where does Todd Achilles stand on immigration?': ['border', 'federal', 'secure'],
  'Is Todd Achilles honest?': ['integrity', 'transparent', 'veteran', 'service'],
  'Can I trust Todd Achilles?': ['experience', 'veteran', 'service', 'independent']
};

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

// 6 surfaces - Row 1: AI Assistants, Row 2: Search Engines
const surfaces = [
  // Row 1: AI Assistants
  { id: 'chatgpt-web', name: 'ChatGPT', color: '#10a37f', type: 'ai' },
  { id: 'claude-web', name: 'Claude', color: '#d4a574', type: 'ai' },
  { id: 'perplexity-web', name: 'Perplexity', color: '#20808d', type: 'ai' },
  // Row 2: Search Engines
  { id: 'google-search', name: 'Google Search', color: '#4285f4', type: 'search' },
  { id: 'google-ai-overview', name: 'Google AI', color: '#34a853', type: 'search' },
  { id: 'bing-search', name: 'Bing', color: '#00809d', type: 'search' },
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

// Rating functions
function rateClarity(text: string): number {
  if (!text || text.length < 50) return 1;

  // Check for good structure (headers, bullet points, paragraphs)
  const hasStructure = text.includes('\n\n') || text.includes('•') || text.includes(':');
  const avgSentenceLen = text.split(/[.!?]/).filter(s => s.trim()).map(s => s.trim().length);
  const avgLen = avgSentenceLen.reduce((a, b) => a + b, 0) / avgSentenceLen.length;

  let score = 3;
  if (hasStructure) score += 1;
  if (avgLen < 150) score += 0.5; // Not overly complex sentences
  if (text.length > 500 && text.length < 3000) score += 0.5; // Good length

  return Math.min(5, Math.max(1, Math.round(score)));
}

function rateAccuracy(text: string, query: string): number {
  if (!text || text.length < 50) return 1;

  const keywords = accuracyChecks[query] || [];
  const textLower = text.toLowerCase();

  let matches = 0;
  for (const kw of keywords) {
    if (textLower.includes(kw.toLowerCase())) matches++;
  }

  const ratio = keywords.length > 0 ? matches / keywords.length : 0.5;

  // Check for inaccuracies
  let penalty = 0;
  // Wrong party
  if (query.includes('party') && textLower.includes('republican') && !textLower.includes('was not')) penalty += 1;
  // Wrong office
  if (query.includes('running for') && textLower.includes('governor')) penalty += 1;

  const score = Math.round(1 + ratio * 4) - penalty;
  return Math.min(5, Math.max(1, score));
}

function rateComprehensiveness(text: string): number {
  if (!text) return 1;

  const len = text.length;
  if (len < 100) return 1;
  if (len < 300) return 2;
  if (len < 800) return 3;
  if (len < 1500) return 4;
  return 5;
}

function ratePositivity(text: string): number {
  if (!text) return 3;

  const textLower = text.toLowerCase();

  const positiveWords = ['qualified', 'experienced', 'accomplished', 'dedicated', 'committed',
    'strong', 'leadership', 'success', 'achievement', 'reform', 'improve', 'support',
    'honest', 'integrity', 'trust', 'transparent', 'veteran', 'service'];
  const negativeWords = ['controversy', 'criticism', 'failed', 'weak', 'problem', 'concern',
    'question', 'doubt', 'lack', 'limited', 'unclear', 'unknown'];

  let posCount = 0, negCount = 0;
  for (const w of positiveWords) if (textLower.includes(w)) posCount++;
  for (const w of negativeWords) if (textLower.includes(w)) negCount++;

  const net = posCount - negCount;
  if (net >= 5) return 5;
  if (net >= 3) return 4;
  if (net >= 0) return 3;
  if (net >= -2) return 2;
  return 1;
}

function calculateOverall(clarity: number, accuracy: number, comprehensiveness: number, positivity: number): number {
  // Weighted average: accuracy most important, then comprehensiveness, clarity, positivity
  return Math.round((accuracy * 0.35 + comprehensiveness * 0.25 + clarity * 0.25 + positivity * 0.15) * 10) / 10;
}

function getRatingEmoji(score: number): string {
  if (score >= 4.5) return '🟢';
  if (score >= 3.5) return '🟡';
  if (score >= 2.5) return '🟠';
  return '🔴';
}

function getRankLabel(rank: number): string {
  const labels = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
  return labels[rank - 1] || `${rank}th`;
}

let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Todd Achilles - AI Surface Comparison Report (6 Surfaces)</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.5;
      color: #333;
      margin: 0;
      padding: 20px;
      background: #f0f2f5;
    }
    .container {
      max-width: 2000px;
      margin: 0 auto;
    }
    h1 {
      color: #1a1a2e;
      border-bottom: 3px solid #4a90d9;
      padding-bottom: 10px;
      margin-bottom: 10px;
    }
    .meta-info {
      color: #666;
      font-size: 14px;
      margin-bottom: 20px;
    }
    .summary {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      margin-bottom: 30px;
    }
    .summary h2 { margin-top: 0; }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
      margin: 15px 0;
    }
    .legend-row {
      display: flex;
      gap: 20px;
      flex-basis: 100%;
    }
    .legend-row-label {
      font-weight: 600;
      color: #666;
      font-size: 12px;
      text-transform: uppercase;
      min-width: 120px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 500;
    }
    .legend-color {
      width: 20px;
      height: 20px;
      border-radius: 4px;
    }
    .rating-legend {
      display: flex;
      gap: 20px;
      margin-top: 15px;
      font-size: 13px;
      color: #666;
    }
    .category-header {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white;
      padding: 15px 25px;
      margin: 35px 0 20px 0;
      border-radius: 8px;
      font-size: 22px;
      font-weight: 600;
    }
    .query-section {
      background: white;
      margin-bottom: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .query-header {
      background: #2d3748;
      color: white;
      padding: 12px 20px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .query-header:hover { background: #3d4a5c; }
    .query-header .toggle {
      font-size: 18px;
      transition: transform 0.2s;
    }
    .query-header.collapsed .toggle { transform: rotate(-90deg); }
    .responses-container {
      overflow: hidden;
      transition: max-height 0.3s ease;
    }
    .responses-container.collapsed {
      max-height: 0 !important;
    }
    /* 2 rows x 3 columns grid */
    .responses-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1px;
      background: #e2e8f0;
    }
    .row-label {
      grid-column: span 3;
      background: #f7fafc;
      padding: 8px 15px;
      font-size: 12px;
      font-weight: 600;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid #e2e8f0;
    }
    .response-card {
      background: white;
      padding: 12px;
      min-width: 0;
    }
    .response-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 3px solid;
    }
    .surface-name {
      font-weight: 700;
      font-size: 14px;
    }
    .response-time {
      font-size: 11px;
      color: #888;
      margin-left: auto;
    }
    .ratings {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 4px;
      margin-bottom: 10px;
      font-size: 11px;
      background: #f7fafc;
      padding: 8px;
      border-radius: 6px;
    }
    .rating-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .rating-label { color: #666; }
    .rating-value { font-weight: 600; }
    .overall-rating {
      grid-column: span 2;
      border-top: 1px solid #e2e8f0;
      padding-top: 6px;
      margin-top: 4px;
      font-size: 13px;
    }
    .rank-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 700;
      margin-left: 8px;
    }
    .rank-1 { background: #ffd700; color: #000; }
    .rank-2 { background: #c0c0c0; color: #000; }
    .rank-3 { background: #cd7f32; color: #fff; }
    .rank-4 { background: #e2e8f0; color: #666; }
    .rank-5 { background: #e2e8f0; color: #666; }
    .rank-6 { background: #e2e8f0; color: #666; }
    .response-content {
      font-size: 12px;
      max-height: 300px;
      overflow-y: auto;
      color: #444;
      line-height: 1.6;
    }
    .no-response {
      color: #999;
      font-style: italic;
    }
    .ssot-box {
      background: #fffbeb;
      border: 1px solid #fcd34d;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 20px;
    }
    .ssot-box h3 {
      margin: 0 0 10px 0;
      color: #92400e;
      font-size: 14px;
    }
    .ssot-box ul {
      margin: 0;
      padding-left: 20px;
      font-size: 13px;
      color: #78350f;
    }
    .expand-all-btn {
      background: #4a90d9;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      margin-bottom: 20px;
    }
    .expand-all-btn:hover { background: #3a7bc8; }
    @media (max-width: 1200px) {
      .responses-grid { grid-template-columns: repeat(2, 1fr); }
      .row-label { grid-column: span 2; }
    }
    @media (max-width: 800px) {
      .responses-grid { grid-template-columns: 1fr; }
      .row-label { grid-column: span 1; }
    }
    @media print {
      body { background: white; }
      .query-section { break-inside: avoid; }
      .responses-container { max-height: none !important; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🗳️ Todd Achilles - AI Surface Comparison Report (6 Surfaces)</h1>

    <div class="meta-info">
      <strong>Candidate:</strong> ${results.candidate.name} |
      <strong>Race:</strong> U.S. Senate, ${results.candidate.state} |
      <strong>Election:</strong> ${results.candidate.electionDate} |
      <strong>Generated:</strong> ${new Date().toLocaleString()}
    </div>

    <div class="summary">
      <h2>Study Summary</h2>
      <p><strong>Total Queries:</strong> ${queries.length} | <strong>Surfaces:</strong> ${surfaces.length} | <strong>Total Jobs:</strong> ${results.summary.totalJobs} | <strong>Completed:</strong> ${results.summary.completedJobs}</p>

      <div class="legend">
        <div class="legend-row">
          <span class="legend-row-label">AI Assistants:</span>
          ${surfaces.filter(s => s.type === 'ai').map(s => `<div class="legend-item"><div class="legend-color" style="background: ${s.color}"></div>${s.name}</div>`).join('')}
        </div>
        <div class="legend-row">
          <span class="legend-row-label">Search Engines:</span>
          ${surfaces.filter(s => s.type === 'search').map(s => `<div class="legend-item"><div class="legend-color" style="background: ${s.color}"></div>${s.name}</div>`).join('')}
        </div>
      </div>

      <div class="rating-legend">
        <span><strong>Rating Scale:</strong></span>
        <span>🟢 Excellent (4.5-5)</span>
        <span>🟡 Good (3.5-4.4)</span>
        <span>🟠 Fair (2.5-3.4)</span>
        <span>🔴 Poor (1-2.4)</span>
      </div>
    </div>

    <div class="ssot-box">
      <h3>📋 Source of Truth (from achillesforidaho.com & Ballotpedia)</h3>
      <ul>
        <li><strong>Party:</strong> Independent (formerly Democratic)</li>
        <li><strong>Running for:</strong> U.S. Senate, Idaho, 2026 (challenging Sen. Jim Risch)</li>
        <li><strong>Education:</strong> BA Claremont McKenna, MBA & MA Univ. of Washington, MPA UC Berkeley</li>
        <li><strong>Military:</strong> U.S. Army 1992-1995, tank commander</li>
        <li><strong>Career:</strong> T-Mobile, HTC, HP, CEO of Evoca, founder Veterans for Idaho Voters</li>
        <li><strong>Political:</strong> Idaho House Rep District 16B (Feb 2024 - June 2025), won with 59.8%</li>
        <li><strong>Key positions:</strong> Stop corruption, reduce debt, protect public lands, end forever wars, tax fairness, housing affordability</li>
      </ul>
    </div>

    <button class="expand-all-btn" onclick="toggleAll()">Expand/Collapse All</button>
`;

// Track overall scores for summary
const surfaceScores: Record<string, number[]> = {};
for (const s of surfaces) surfaceScores[s.id] = [];

// Generate sections by category
for (const [category, categoryQueries] of Object.entries(categories)) {
  html += `    <div class="category-header">${category}</div>\n`;

  for (const query of categoryQueries) {
    // Calculate ratings for all surfaces for this query
    const queryRatings: { surfaceId: string; clarity: number; accuracy: number; comprehensiveness: number; positivity: number; overall: number }[] = [];

    for (const surface of surfaces) {
      const key = `${surface.id}|${query}`;
      const job = responseMap.get(key);
      const text = job?.responseText || '';

      const clarity = rateClarity(text);
      const accuracy = rateAccuracy(text, query);
      const comprehensiveness = rateComprehensiveness(text);
      const positivity = ratePositivity(text);
      const overall = calculateOverall(clarity, accuracy, comprehensiveness, positivity);

      queryRatings.push({ surfaceId: surface.id, clarity, accuracy, comprehensiveness, positivity, overall });
      surfaceScores[surface.id].push(overall);
    }

    // Sort by overall to determine ranks
    const sorted = [...queryRatings].sort((a, b) => b.overall - a.overall);
    const ranks = new Map<string, number>();
    sorted.forEach((r, i) => ranks.set(r.surfaceId, i + 1));

    html += `    <div class="query-section">
      <div class="query-header" onclick="toggleSection(this)">
        <span>${escapeHtml(query)}</span>
        <span class="toggle">▼</span>
      </div>
      <div class="responses-container">
        <div class="responses-grid">
          <div class="row-label">🤖 AI Assistants</div>
`;

    // Row 1: AI Assistants
    for (const surface of surfaces.filter(s => s.type === 'ai')) {
      const key = `${surface.id}|${query}`;
      const job = responseMap.get(key);
      const responseTime = job?.responseTimeMs ? `${(job.responseTimeMs / 1000).toFixed(1)}s` : '';
      const responseText = job?.responseText || '';

      const rating = queryRatings.find(r => r.surfaceId === surface.id)!;
      const rank = ranks.get(surface.id)!;

      html += `          <div class="response-card">
            <div class="response-header" style="border-color: ${surface.color}">
              <span class="surface-name" style="color: ${surface.color}">${surface.name}</span>
              <span class="rank-badge rank-${rank}">${getRankLabel(rank)}</span>
              <span class="response-time">${responseTime}</span>
            </div>
            <div class="ratings">
              <div class="rating-item"><span class="rating-label">Clarity</span><span class="rating-value">${getRatingEmoji(rating.clarity)} ${rating.clarity}/5</span></div>
              <div class="rating-item"><span class="rating-label">Accuracy</span><span class="rating-value">${getRatingEmoji(rating.accuracy)} ${rating.accuracy}/5</span></div>
              <div class="rating-item"><span class="rating-label">Comprehensive</span><span class="rating-value">${getRatingEmoji(rating.comprehensiveness)} ${rating.comprehensiveness}/5</span></div>
              <div class="rating-item"><span class="rating-label">Positivity</span><span class="rating-value">${getRatingEmoji(rating.positivity)} ${rating.positivity}/5</span></div>
              <div class="rating-item overall-rating"><span class="rating-label"><strong>Overall</strong></span><span class="rating-value">${getRatingEmoji(rating.overall)} <strong>${rating.overall.toFixed(1)}</strong>/5</span></div>
            </div>
            <div class="response-content">${responseText ? escapeHtml(responseText.slice(0, 1500) + (responseText.length > 1500 ? '...' : '')) : '<em class="no-response">No response</em>'}</div>
          </div>
`;
    }

    html += `          <div class="row-label">🔍 Search Engines</div>
`;

    // Row 2: Search Engines
    for (const surface of surfaces.filter(s => s.type === 'search')) {
      const key = `${surface.id}|${query}`;
      const job = responseMap.get(key);
      const responseTime = job?.responseTimeMs ? `${(job.responseTimeMs / 1000).toFixed(1)}s` : '';
      const responseText = job?.responseText || '';

      const rating = queryRatings.find(r => r.surfaceId === surface.id)!;
      const rank = ranks.get(surface.id)!;

      html += `          <div class="response-card">
            <div class="response-header" style="border-color: ${surface.color}">
              <span class="surface-name" style="color: ${surface.color}">${surface.name}</span>
              <span class="rank-badge rank-${rank}">${getRankLabel(rank)}</span>
              <span class="response-time">${responseTime}</span>
            </div>
            <div class="ratings">
              <div class="rating-item"><span class="rating-label">Clarity</span><span class="rating-value">${getRatingEmoji(rating.clarity)} ${rating.clarity}/5</span></div>
              <div class="rating-item"><span class="rating-label">Accuracy</span><span class="rating-value">${getRatingEmoji(rating.accuracy)} ${rating.accuracy}/5</span></div>
              <div class="rating-item"><span class="rating-label">Comprehensive</span><span class="rating-value">${getRatingEmoji(rating.comprehensiveness)} ${rating.comprehensiveness}/5</span></div>
              <div class="rating-item"><span class="rating-label">Positivity</span><span class="rating-value">${getRatingEmoji(rating.positivity)} ${rating.positivity}/5</span></div>
              <div class="rating-item overall-rating"><span class="rating-label"><strong>Overall</strong></span><span class="rating-value">${getRatingEmoji(rating.overall)} <strong>${rating.overall.toFixed(1)}</strong>/5</span></div>
            </div>
            <div class="response-content">${responseText ? escapeHtml(responseText.slice(0, 1500) + (responseText.length > 1500 ? '...' : '')) : '<em class="no-response">No response</em>'}</div>
          </div>
`;
    }

    html += `        </div>
      </div>
    </div>
`;
  }
}

// Calculate average scores per surface
html += `
    <div class="summary" style="margin-top: 40px;">
      <h2>📊 Overall Surface Rankings</h2>
      <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
        <thead>
          <tr style="background: #f7fafc;">
            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e2e8f0;">Rank</th>
            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e2e8f0;">Surface</th>
            <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e2e8f0;">Type</th>
            <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e2e8f0;">Avg Score</th>
            <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e2e8f0;">Rating</th>
          </tr>
        </thead>
        <tbody>
`;

const avgScores = surfaces.map(s => ({
  ...s,
  avg: surfaceScores[s.id].reduce((a, b) => a + b, 0) / surfaceScores[s.id].length
})).sort((a, b) => b.avg - a.avg);

avgScores.forEach((s, i) => {
  const typeLabel = s.type === 'ai' ? '🤖 AI' : '🔍 Search';
  html += `          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;"><span class="rank-badge rank-${i + 1}">${getRankLabel(i + 1)}</span></td>
            <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;"><strong style="color: ${s.color}">${s.name}</strong></td>
            <td style="padding: 12px; text-align: center; border-bottom: 1px solid #e2e8f0;">${typeLabel}</td>
            <td style="padding: 12px; text-align: center; border-bottom: 1px solid #e2e8f0;">${s.avg.toFixed(2)}</td>
            <td style="padding: 12px; text-align: center; border-bottom: 1px solid #e2e8f0;">${getRatingEmoji(s.avg)}</td>
          </tr>
`;
});

html += `        </tbody>
      </table>
    </div>

    <div style="margin-top: 40px; padding: 20px; background: #f0f0f0; border-radius: 8px; text-align: center; color: #666;">
      <p>Generated by Bentham Pipeline - Kyanos Voter Impact Study</p>
      <p>Study ID: ${results.studyId}</p>
      <p>Source of Truth: <a href="https://www.achillesforidaho.com">achillesforidaho.com</a> | <a href="https://ballotpedia.org/Todd_Achilles">Ballotpedia</a></p>
    </div>
  </div>

  <script>
    function toggleSection(header) {
      header.classList.toggle('collapsed');
      const container = header.nextElementSibling;
      container.classList.toggle('collapsed');
    }

    function toggleAll() {
      const headers = document.querySelectorAll('.query-header');
      const allCollapsed = Array.from(headers).every(h => h.classList.contains('collapsed'));

      headers.forEach(header => {
        const container = header.nextElementSibling;
        if (allCollapsed) {
          header.classList.remove('collapsed');
          container.classList.remove('collapsed');
        } else {
          header.classList.add('collapsed');
          container.classList.add('collapsed');
        }
      });
    }
  </script>
</body>
</html>`;

const outputPath = '/Users/edf/bentham/studies/todd-achilles-6-surface-comparison.html';
fs.writeFileSync(outputPath, html);
console.log(`Report saved to: ${outputPath}`);
console.log(`Total size: ${(html.length / 1024).toFixed(1)} KB`);

// Print summary
console.log('\n📊 Overall Surface Rankings:');
avgScores.forEach((s, i) => {
  console.log(`  ${i + 1}. ${s.name}: ${s.avg.toFixed(2)}/5`);
});
