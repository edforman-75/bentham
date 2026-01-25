#!/usr/bin/env npx tsx
/**
 * Generate Verbatim Comparison Report
 *
 * Creates an HTML report where clicking on a question shows
 * the verbatim responses side-by-side across all surfaces.
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

const GOOGLE_STUDIES_DIR = 'studies/google';
const OPENAI_STUDIES_DIR = 'studies';

interface StudyResult {
  queryIndex: number;
  originalQuery: string;
  submittedQuery: string;
  response: string;
  aiOverview?: string;
  organicResults?: Array<{
    position: number;
    title: string;
    url: string;
    snippet: string;
  }>;
  sources?: Array<{
    index: number;
    title: string;
    url: string;
  }>;
  timestamp: string;
  durationMs: number;
  success: boolean;
}

interface StudyData {
  study: string;
  studyName: string;
  surface: string;
  location: string;
  promptSuffix: string | null;
  captureAiOverview: boolean;
  timestamp: string;
  results: StudyResult[];
}

interface QueryComparison {
  queryIndex: number;
  query: string;
  surfaces: {
    [surfaceKey: string]: {
      studyId: string;
      studyName: string;
      surface: string;
      location: string;
      promptSuffix: string | null;
      aiOverview?: string;
      organicResults?: any[];
      response: string;
      huftFound: boolean;
      huftInAiOverview: boolean;
      organicPosition: number | null;
    };
  };
}

function findHUFTMentions(text: string): boolean {
  if (!text) return false;
  const lowerText = text.toLowerCase();
  return lowerText.includes('huft') ||
         lowerText.includes('heads up for tails') ||
         lowerText.includes('headsupfortails');
}

function getOrganicPosition(organicResults: any[] | undefined): number | null {
  if (!organicResults) return null;
  for (const result of organicResults) {
    const textToSearch = `${result.title} ${result.snippet} ${result.url}`.toLowerCase();
    if (textToSearch.includes('huft') ||
        textToSearch.includes('heads up for tails') ||
        textToSearch.includes('headsupfortails')) {
      return result.position;
    }
  }
  return null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function highlightHUFT(text: string): string {
  if (!text) return '';
  return escapeHtml(text)
    .replace(/(huft|heads\s*up\s*for\s*tails|headsupfortails)/gi,
             '<mark class="huft-highlight">$1</mark>');
}

async function generateGoogleReport() {
  console.log('Generating Google Verbatim Comparison Report...\n');

  // Load all study files
  const studyFiles = fs.readdirSync(GOOGLE_STUDIES_DIR)
    .filter(f => f.match(/^g\d{2}-.*\.json$/) && !f.includes('intermediate') && !f.includes('pre-recovery') && !f.includes('analysis'))
    .sort();

  const studies: StudyData[] = [];
  for (const file of studyFiles) {
    const data = JSON.parse(fs.readFileSync(path.join(GOOGLE_STUDIES_DIR, file), 'utf-8'));
    studies.push(data);
  }

  console.log(`Loaded ${studies.length} Google studies`);

  // Build query comparisons (20 queries)
  const queries: string[] = [
    "Which are the best budget dog food brands online?",
    "Can you suggest the best treat brands for dogs online?",
    "Which are the best dog food brands with high reviews?",
    "Which are the best dog food brands recommended by vets?",
    "Can you list a popular pet food brand with good meat content?",
    "Which brands offer gluten-free dog treats my dog will enjoy?",
    "Can you suggest the best dog biscuit brands for dogs with sensitive stomachs?",
    "Which are the top healthy vegetarian dog biscuit brands available online?",
    "What are the best-tasting treat brands for dogs under ₹1000?",
    "Which brands offer low-calorie chicken dog treats?",
    "Which are the best dog treat brands for medium-sized dogs?",
    "Can you suggest some good Heads Up For Tails dog food options?",
    "Which brands offer the highest-rated gluten-free chicken dog biscuits?",
    "Can you suggest trusted brands that make healthy dog treats for puppies online?",
    "Which are the most recommended brands for crunchy dog biscuits for adult dogs?",
    "Which brand makes the most comfortable dog beds for small dogs in India?",
    "What's a trusted brand that offers interactive dog toys for large dogs?",
    "Which company has the best chew toys for small dogs that last long?",
    "Can you suggest a reliable brand that sells dog harnesses for puppies?",
    "What's one of the top Indian brands for wet cat food?"
  ];

  const comparisons: QueryComparison[] = queries.map((query, idx) => ({
    queryIndex: idx,
    query,
    surfaces: {}
  }));

  // Populate comparisons from each study
  for (const study of studies) {
    const surfaceKey = `${study.study}-${study.surface}-${study.location}-${study.promptSuffix || 'original'}`;

    for (const result of study.results) {
      const comparison = comparisons[result.queryIndex];
      if (!comparison) continue;

      const huftInAiOverview = findHUFTMentions(result.aiOverview || '');
      const organicPos = getOrganicPosition(result.organicResults);
      const huftFound = huftInAiOverview || organicPos !== null || findHUFTMentions(result.response);

      comparison.surfaces[surfaceKey] = {
        studyId: study.study.toUpperCase(),
        studyName: study.studyName,
        surface: study.surface,
        location: study.location,
        promptSuffix: study.promptSuffix,
        aiOverview: result.aiOverview,
        organicResults: result.organicResults,
        response: result.response,
        huftFound,
        huftInAiOverview,
        organicPosition: organicPos
      };
    }
  }

  // Generate HTML
  const html = generateHtml(comparisons, 'Google', studies);

  const outputPath = path.join(GOOGLE_STUDIES_DIR, 'google-verbatim-comparison.html');
  fs.writeFileSync(outputPath, html);
  console.log(`\nGoogle report saved to: ${outputPath}`);

  return outputPath;
}

function generateHtml(comparisons: QueryComparison[], platform: string, studies: StudyData[]): string {
  // Group studies by surface type for column headers
  const surfaceGroups = new Map<string, StudyData[]>();
  for (const study of studies) {
    const key = `${study.surface}-${study.location}-${study.promptSuffix || 'original'}`;
    if (!surfaceGroups.has(key)) {
      surfaceGroups.set(key, []);
    }
    surfaceGroups.get(key)!.push(study);
  }

  const surfaceKeys = Array.from(surfaceGroups.keys()).sort();

  return `<!DOCTYPE html>
<html>
<head>
  <title>${platform} Verbatim Comparison - HUFT Visibility Study</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0; padding: 0; background: #f5f5f5;
      line-height: 1.5;
    }
    .header {
      background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #0d1117 100%);
      color: white;
      padding: 20px 30px;
      border-bottom: 3px solid ${platform === 'Google' ? '#4285f4' : '#10a37f'};
    }
    .header h1 { margin: 0 0 5px 0; font-size: 24px; }
    .header p { margin: 0; opacity: 0.8; font-size: 14px; }

    .container { max-width: 1800px; margin: 0 auto; padding: 20px; }

    .query-card {
      background: white;
      border-radius: 12px;
      margin-bottom: 15px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .query-header {
      padding: 15px 20px;
      background: #f8f9fa;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #eee;
    }
    .query-header:hover { background: #f0f0f0; }
    .query-title {
      font-weight: 600;
      font-size: 15px;
      flex: 1;
    }
    .query-badges {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .badge {
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge-huft { background: #fce4ec; color: #c2185b; }
    .badge-ai { background: #e3f2fd; color: #1565c0; }
    .badge-organic { background: #e8f5e9; color: #2e7d32; }
    .badge-count { background: #f3e5f5; color: #7b1fa2; }

    .query-body {
      display: none;
      padding: 0;
    }
    .query-body.show { display: block; }

    .comparison-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 1px;
      background: #ddd;
    }
    .surface-column {
      background: white;
      min-height: 200px;
    }
    .surface-header {
      padding: 12px 15px;
      background: #f0f4f8;
      border-bottom: 2px solid #ddd;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      position: sticky;
      top: 0;
    }
    .surface-header.india { background: #fff3e0; border-color: #ff9800; }
    .surface-header.us { background: #e3f2fd; border-color: #1976d2; }
    .surface-header.ai-overview { background: #e8f5e9; border-color: #4caf50; }
    .surface-header.gemini { background: #f3e5f5; border-color: #7b1fa2; }

    .surface-content {
      padding: 15px;
      font-size: 13px;
      max-height: 400px;
      overflow-y: auto;
    }

    .ai-overview-section {
      background: #f0fdf4;
      border-left: 3px solid #22c55e;
      padding: 10px;
      margin-bottom: 15px;
      border-radius: 0 8px 8px 0;
    }
    .ai-overview-section h4 {
      margin: 0 0 8px 0;
      font-size: 12px;
      color: #166534;
      text-transform: uppercase;
    }

    .organic-section h4 {
      margin: 15px 0 8px 0;
      font-size: 12px;
      color: #1e40af;
      text-transform: uppercase;
    }
    .organic-result {
      padding: 8px;
      margin: 5px 0;
      background: #f8fafc;
      border-radius: 6px;
      font-size: 12px;
    }
    .organic-result.has-huft {
      background: #fef2f2;
      border-left: 3px solid #ef4444;
    }
    .organic-position {
      font-weight: 700;
      color: #1e40af;
      margin-right: 8px;
    }
    .organic-title { font-weight: 500; }
    .organic-url {
      font-size: 11px;
      color: #059669;
      word-break: break-all;
    }
    .organic-snippet {
      font-size: 11px;
      color: #666;
      margin-top: 4px;
    }

    .huft-highlight {
      background: #fef08a;
      padding: 1px 4px;
      border-radius: 3px;
      font-weight: 600;
    }

    .no-data {
      color: #999;
      font-style: italic;
      padding: 20px;
      text-align: center;
    }

    .gemini-response {
      white-space: pre-wrap;
      font-size: 12px;
      line-height: 1.6;
    }

    .summary-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin-bottom: 25px;
    }
    .stat-card {
      background: white;
      padding: 20px;
      border-radius: 10px;
      text-align: center;
      box-shadow: 0 2px 6px rgba(0,0,0,0.08);
    }
    .stat-value { font-size: 28px; font-weight: 700; color: #1a1a2e; }
    .stat-label { font-size: 12px; color: #666; margin-top: 5px; }

    .expand-icon {
      font-size: 18px;
      color: #999;
      transition: transform 0.2s;
    }
    .query-card.expanded .expand-icon {
      transform: rotate(180deg);
    }

    .filter-bar {
      background: white;
      padding: 15px 20px;
      margin-bottom: 20px;
      border-radius: 10px;
      display: flex;
      gap: 15px;
      align-items: center;
      flex-wrap: wrap;
    }
    .filter-bar label { font-weight: 500; font-size: 14px; }
    .filter-bar select, .filter-bar input {
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${platform} Verbatim Comparison Report</h1>
    <p>Click on any question to view verbatim responses across all ${studies.length} surfaces</p>
  </div>

  <div class="container">
    <div class="summary-stats">
      <div class="stat-card">
        <div class="stat-value">${comparisons.length}</div>
        <div class="stat-label">Total Queries</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${studies.length}</div>
        <div class="stat-label">Surfaces Tested</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${comparisons.length * studies.length}</div>
        <div class="stat-label">Total Responses</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${countHuftMentions(comparisons)}</div>
        <div class="stat-label">HUFT Mentions</div>
      </div>
    </div>

    <div class="filter-bar">
      <label>Filter:</label>
      <select id="huft-filter" onchange="filterQueries()">
        <option value="all">All Queries</option>
        <option value="huft">HUFT Found</option>
        <option value="no-huft">No HUFT</option>
      </select>
      <input type="text" id="search-box" placeholder="Search queries..." oninput="filterQueries()">
      <button onclick="expandAll()">Expand All</button>
      <button onclick="collapseAll()">Collapse All</button>
    </div>

    ${comparisons.map((c, idx) => generateQueryCard(c, idx, studies)).join('\n')}
  </div>

  <script>
    function toggleQuery(idx) {
      const card = document.getElementById('query-' + idx);
      const body = card.querySelector('.query-body');
      card.classList.toggle('expanded');
      body.classList.toggle('show');
    }

    function expandAll() {
      document.querySelectorAll('.query-card').forEach(card => {
        card.classList.add('expanded');
        card.querySelector('.query-body').classList.add('show');
      });
    }

    function collapseAll() {
      document.querySelectorAll('.query-card').forEach(card => {
        card.classList.remove('expanded');
        card.querySelector('.query-body').classList.remove('show');
      });
    }

    function filterQueries() {
      const huftFilter = document.getElementById('huft-filter').value;
      const searchTerm = document.getElementById('search-box').value.toLowerCase();

      document.querySelectorAll('.query-card').forEach(card => {
        const hasHuft = card.dataset.huft === 'true';
        const query = card.dataset.query.toLowerCase();

        let show = true;
        if (huftFilter === 'huft' && !hasHuft) show = false;
        if (huftFilter === 'no-huft' && hasHuft) show = false;
        if (searchTerm && !query.includes(searchTerm)) show = false;

        card.style.display = show ? 'block' : 'none';
      });
    }
  </script>
</body>
</html>`;
}

function countHuftMentions(comparisons: QueryComparison[]): number {
  let count = 0;
  for (const c of comparisons) {
    for (const s of Object.values(c.surfaces)) {
      if (s.huftFound) count++;
    }
  }
  return count;
}

function generateQueryCard(comparison: QueryComparison, idx: number, studies: StudyData[]): string {
  const surfaceValues = Object.values(comparison.surfaces);
  const huftCount = surfaceValues.filter(s => s.huftFound).length;
  const aiOverviewCount = surfaceValues.filter(s => s.huftInAiOverview).length;
  const hasHuft = huftCount > 0;

  return `
    <div class="query-card" id="query-${idx}" data-huft="${hasHuft}" data-query="${escapeHtml(comparison.query)}">
      <div class="query-header" onclick="toggleQuery(${idx})">
        <div class="query-title">Q${idx + 1}: ${escapeHtml(comparison.query)}</div>
        <div class="query-badges">
          ${hasHuft ? `<span class="badge badge-huft">HUFT: ${huftCount}/${surfaceValues.length}</span>` : ''}
          ${aiOverviewCount > 0 ? `<span class="badge badge-ai">AI Overview: ${aiOverviewCount}</span>` : ''}
          <span class="expand-icon">▼</span>
        </div>
      </div>
      <div class="query-body">
        <div class="comparison-grid">
          ${studies.map(study => {
            const surfaceKey = `${study.study}-${study.surface}-${study.location}-${study.promptSuffix || 'original'}`;
            const data = comparison.surfaces[surfaceKey];
            return generateSurfaceColumn(study, data);
          }).join('')}
        </div>
      </div>
    </div>
  `;
}

function generateSurfaceColumn(study: StudyData, data: any): string {
  const locationClass = study.location === 'in-mum' ? 'india' : 'us';
  const surfaceClass = study.surface === 'google-ai-api' ? 'gemini' :
                       study.captureAiOverview ? 'ai-overview' : '';

  const headerLabel = `${study.study.toUpperCase()}: ${study.location === 'in-mum' ? 'India' : 'US'}${study.promptSuffix ? ' + suffix' : ''}`;

  if (!data) {
    return `
      <div class="surface-column">
        <div class="surface-header ${locationClass} ${surfaceClass}">${headerLabel}</div>
        <div class="no-data">No data available</div>
      </div>
    `;
  }

  let content = '';

  // AI Overview section
  if (data.aiOverview) {
    content += `
      <div class="ai-overview-section">
        <h4>AI Overview ${data.huftInAiOverview ? '✓ HUFT' : ''}</h4>
        <div>${highlightHUFT(data.aiOverview)}</div>
      </div>
    `;
  }

  // Organic results section
  if (data.organicResults && data.organicResults.length > 0) {
    content += `<div class="organic-section"><h4>Organic Results ${data.organicPosition ? `(HUFT at #${data.organicPosition})` : ''}</h4>`;
    for (const result of data.organicResults.slice(0, 5)) {
      const hasHuft = findHUFTMentions(`${result.title} ${result.snippet} ${result.url}`);
      content += `
        <div class="organic-result ${hasHuft ? 'has-huft' : ''}">
          <span class="organic-position">#${result.position}</span>
          <span class="organic-title">${highlightHUFT(result.title)}</span>
          <div class="organic-url">${escapeHtml(result.url)}</div>
          ${result.snippet ? `<div class="organic-snippet">${highlightHUFT(result.snippet)}</div>` : ''}
        </div>
      `;
    }
    content += '</div>';
  }

  // Gemini API response
  if (study.surface === 'google-ai-api') {
    content += `
      <div class="gemini-response">${highlightHUFT(data.response)}</div>
    `;
  }

  if (!content) {
    content = '<div class="no-data">No content captured</div>';
  }

  return `
    <div class="surface-column">
      <div class="surface-header ${locationClass} ${surfaceClass}">${headerLabel}</div>
      <div class="surface-content">${content}</div>
    </div>
  `;
}

async function generateOpenAIReport() {
  console.log('\nGenerating OpenAI Verbatim Comparison Report...\n');

  // Define the 12 OpenAI studies
  const studyFiles = [
    { file: 'study1-india-ip-original.json', surface: 'ChatGPT Web', location: 'India', suffix: false },
    { file: 'study2-india-ip-indiasuffix.json', surface: 'ChatGPT Web', location: 'India', suffix: true },
    { file: 'study3-us-ip-indiasuffix.json', surface: 'ChatGPT Web', location: 'US', suffix: true },
    { file: 'study4-chat-api-us-india-suffix.json', surface: 'Chat API', location: 'US', suffix: true },
    { file: 'study5-chat-api-india-proxy-india-suffix.json', surface: 'Chat API', location: 'India', suffix: true },
    { file: 'study6-websearch-api-us-india-suffix.json', surface: 'Web Search API', location: 'US', suffix: true },
    { file: 'study7-websearch-api-india-proxy-india-suffix.json', surface: 'Web Search API', location: 'India', suffix: true },
    { file: 'study8-chat-api-us-original.json', surface: 'Chat API', location: 'US', suffix: false },
    { file: 'study9-websearch-api-us-original.json', surface: 'Web Search API', location: 'US', suffix: false },
    { file: 'study10-chat-api-india-original.json', surface: 'Chat API', location: 'India', suffix: false },
    { file: 'study11-websearch-api-india-original.json', surface: 'Web Search API', location: 'India', suffix: false },
    { file: 'study12-chatgpt-web-us-original.json', surface: 'ChatGPT Web', location: 'US', suffix: false },
  ];

  interface OpenAIStudy {
    study: string;
    studyName: string;
    surface: string;
    location: string;
    promptSuffix: string | null;
    captureAiOverview: boolean;
    results: StudyResult[];
  }

  const studies: OpenAIStudy[] = [];

  for (const sf of studyFiles) {
    const filePath = path.join(OPENAI_STUDIES_DIR, sf.file);
    if (!fs.existsSync(filePath)) {
      console.log(`  Skipping missing file: ${sf.file}`);
      continue;
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    studies.push({
      study: data.studyId || sf.file.replace('.json', ''),
      studyName: data.studyName || `${sf.surface} - ${sf.location}${sf.suffix ? ' + suffix' : ''}`,
      surface: sf.surface,
      location: sf.location === 'India' ? 'in-mum' : 'us-national',
      promptSuffix: sf.suffix ? ' in India' : null,
      captureAiOverview: false,
      results: data.results || []
    });
  }

  console.log(`Loaded ${studies.length} OpenAI studies`);

  // Build query comparisons (20 queries)
  const queries: string[] = [
    "Which are the best budget dog food brands online?",
    "Can you suggest the best treat brands for dogs online?",
    "Which are the best dog food brands with high reviews?",
    "Which are the best dog food brands recommended by vets?",
    "Can you list a popular pet food brand with good meat content?",
    "Which brands offer gluten-free dog treats my dog will enjoy?",
    "Can you suggest the best dog biscuit brands for dogs with sensitive stomachs?",
    "Which are the top healthy vegetarian dog biscuit brands available online?",
    "What are the best-tasting treat brands for dogs under ₹1000?",
    "Which brands offer low-calorie chicken dog treats?",
    "Which are the best dog treat brands for medium-sized dogs?",
    "Can you suggest some good Heads Up For Tails dog food options?",
    "Which brands offer the highest-rated gluten-free chicken dog biscuits?",
    "Can you suggest trusted brands that make healthy dog treats for puppies online?",
    "Which are the most recommended brands for crunchy dog biscuits for adult dogs?",
    "Which brand makes the most comfortable dog beds for small dogs in India?",
    "What's a trusted brand that offers interactive dog toys for large dogs?",
    "Which company has the best chew toys for small dogs that last long?",
    "Can you suggest a reliable brand that sells dog harnesses for puppies?",
    "What's one of the top Indian brands for wet cat food?"
  ];

  const comparisons: QueryComparison[] = queries.map((query, idx) => ({
    queryIndex: idx,
    query,
    surfaces: {}
  }));

  // Populate comparisons from each study
  for (const study of studies) {
    const surfaceKey = `${study.study}-${study.surface}-${study.location}-${study.promptSuffix || 'original'}`;

    for (const result of study.results) {
      const comparison = comparisons[result.queryIndex];
      if (!comparison) continue;

      const huftFound = findHUFTMentions(result.response);

      comparison.surfaces[surfaceKey] = {
        studyId: study.study,
        studyName: study.studyName,
        surface: study.surface,
        location: study.location,
        promptSuffix: study.promptSuffix,
        response: result.response,
        huftFound,
        huftInAiOverview: false,
        organicPosition: null
      };
    }
  }

  // Generate HTML with OpenAI-specific styling
  const html = generateOpenAIHtml(comparisons, studies);

  const outputPath = path.join(OPENAI_STUDIES_DIR, 'openai-verbatim-comparison.html');
  fs.writeFileSync(outputPath, html);
  console.log(`OpenAI report saved to: ${outputPath}`);

  return outputPath;
}

function generateOpenAIHtml(comparisons: QueryComparison[], studies: any[]): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>OpenAI Verbatim Comparison - HUFT Visibility Study</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0; padding: 0; background: #f5f5f5;
      line-height: 1.5;
    }
    .header {
      background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #0d1117 100%);
      color: white;
      padding: 20px 30px;
      border-bottom: 3px solid #10a37f;
    }
    .header h1 { margin: 0 0 5px 0; font-size: 24px; }
    .header p { margin: 0; opacity: 0.8; font-size: 14px; }

    .container { max-width: 1800px; margin: 0 auto; padding: 20px; }

    .query-card {
      background: white;
      border-radius: 12px;
      margin-bottom: 15px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .query-header {
      padding: 15px 20px;
      background: #f8f9fa;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #eee;
    }
    .query-header:hover { background: #f0f0f0; }
    .query-title { font-weight: 600; font-size: 15px; flex: 1; }
    .query-badges { display: flex; gap: 8px; flex-wrap: wrap; }
    .badge { padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }
    .badge-huft { background: #fce4ec; color: #c2185b; }
    .badge-web { background: #e8f5e9; color: #2e7d32; }
    .badge-api { background: #e3f2fd; color: #1565c0; }

    .query-body { display: none; padding: 0; }
    .query-body.show { display: block; }

    .comparison-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1px;
      background: #ddd;
    }
    .surface-column {
      background: white;
      min-height: 200px;
    }
    .surface-header {
      padding: 12px 15px;
      background: #f0f4f8;
      border-bottom: 2px solid #ddd;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .surface-header.chatgpt-web { background: #e8f5e9; border-color: #10a37f; }
    .surface-header.chat-api { background: #e3f2fd; border-color: #1976d2; }
    .surface-header.websearch-api { background: #fff3e0; border-color: #ff9800; }
    .surface-header.india { border-left: 4px solid #ff9800; }
    .surface-header.us { border-left: 4px solid #1976d2; }

    .surface-content {
      padding: 15px;
      font-size: 13px;
      max-height: 500px;
      overflow-y: auto;
      white-space: pre-wrap;
      line-height: 1.6;
    }

    .huft-highlight {
      background: #fef08a;
      padding: 1px 4px;
      border-radius: 3px;
      font-weight: 600;
    }

    .no-data {
      color: #999;
      font-style: italic;
      padding: 20px;
      text-align: center;
    }

    .summary-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin-bottom: 25px;
    }
    .stat-card {
      background: white;
      padding: 20px;
      border-radius: 10px;
      text-align: center;
      box-shadow: 0 2px 6px rgba(0,0,0,0.08);
    }
    .stat-value { font-size: 28px; font-weight: 700; color: #1a1a2e; }
    .stat-label { font-size: 12px; color: #666; margin-top: 5px; }

    .expand-icon { font-size: 18px; color: #999; transition: transform 0.2s; }
    .query-card.expanded .expand-icon { transform: rotate(180deg); }

    .filter-bar {
      background: white;
      padding: 15px 20px;
      margin-bottom: 20px;
      border-radius: 10px;
      display: flex;
      gap: 15px;
      align-items: center;
      flex-wrap: wrap;
    }
    .filter-bar label { font-weight: 500; font-size: 14px; }
    .filter-bar select, .filter-bar input {
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>OpenAI Verbatim Comparison Report</h1>
    <p>Click on any question to view verbatim responses across all ${studies.length} surfaces (ChatGPT Web, Chat API, Web Search API)</p>
  </div>

  <div class="container">
    <div class="summary-stats">
      <div class="stat-card">
        <div class="stat-value">${comparisons.length}</div>
        <div class="stat-label">Total Queries</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${studies.length}</div>
        <div class="stat-label">Surfaces Tested</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${comparisons.length * studies.length}</div>
        <div class="stat-label">Total Responses</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${countHuftMentions(comparisons)}</div>
        <div class="stat-label">HUFT Mentions</div>
      </div>
    </div>

    <div class="filter-bar">
      <label>Filter:</label>
      <select id="huft-filter" onchange="filterQueries()">
        <option value="all">All Queries</option>
        <option value="huft">HUFT Found</option>
        <option value="no-huft">No HUFT</option>
      </select>
      <input type="text" id="search-box" placeholder="Search queries..." oninput="filterQueries()">
      <button onclick="expandAll()">Expand All</button>
      <button onclick="collapseAll()">Collapse All</button>
    </div>

    ${comparisons.map((c, idx) => generateOpenAIQueryCard(c, idx, studies)).join('\n')}
  </div>

  <script>
    function toggleQuery(idx) {
      const card = document.getElementById('query-' + idx);
      const body = card.querySelector('.query-body');
      card.classList.toggle('expanded');
      body.classList.toggle('show');
    }

    function expandAll() {
      document.querySelectorAll('.query-card').forEach(card => {
        card.classList.add('expanded');
        card.querySelector('.query-body').classList.add('show');
      });
    }

    function collapseAll() {
      document.querySelectorAll('.query-card').forEach(card => {
        card.classList.remove('expanded');
        card.querySelector('.query-body').classList.remove('show');
      });
    }

    function filterQueries() {
      const huftFilter = document.getElementById('huft-filter').value;
      const searchTerm = document.getElementById('search-box').value.toLowerCase();

      document.querySelectorAll('.query-card').forEach(card => {
        const hasHuft = card.dataset.huft === 'true';
        const query = card.dataset.query.toLowerCase();

        let show = true;
        if (huftFilter === 'huft' && !hasHuft) show = false;
        if (huftFilter === 'no-huft' && hasHuft) show = false;
        if (searchTerm && !query.includes(searchTerm)) show = false;

        card.style.display = show ? 'block' : 'none';
      });
    }
  </script>
</body>
</html>`;
}

function generateOpenAIQueryCard(comparison: QueryComparison, idx: number, studies: any[]): string {
  const surfaceValues = Object.values(comparison.surfaces);
  const huftCount = surfaceValues.filter(s => s.huftFound).length;
  const hasHuft = huftCount > 0;

  // Group by surface type for display
  const webCount = surfaceValues.filter(s => s.surface === 'ChatGPT Web' && s.huftFound).length;
  const apiCount = surfaceValues.filter(s => s.surface !== 'ChatGPT Web' && s.huftFound).length;

  return `
    <div class="query-card" id="query-${idx}" data-huft="${hasHuft}" data-query="${escapeHtml(comparison.query)}">
      <div class="query-header" onclick="toggleQuery(${idx})">
        <div class="query-title">Q${idx + 1}: ${escapeHtml(comparison.query)}</div>
        <div class="query-badges">
          ${hasHuft ? `<span class="badge badge-huft">HUFT: ${huftCount}/${surfaceValues.length}</span>` : ''}
          ${webCount > 0 ? `<span class="badge badge-web">Web: ${webCount}</span>` : ''}
          ${apiCount > 0 ? `<span class="badge badge-api">API: ${apiCount}</span>` : ''}
          <span class="expand-icon">▼</span>
        </div>
      </div>
      <div class="query-body">
        <div class="comparison-grid">
          ${studies.map(study => {
            const surfaceKey = `${study.study}-${study.surface}-${study.location}-${study.promptSuffix || 'original'}`;
            const data = comparison.surfaces[surfaceKey];
            return generateOpenAISurfaceColumn(study, data);
          }).join('')}
        </div>
      </div>
    </div>
  `;
}

function generateOpenAISurfaceColumn(study: any, data: any): string {
  const surfaceClass = study.surface === 'ChatGPT Web' ? 'chatgpt-web' :
                       study.surface === 'Chat API' ? 'chat-api' : 'websearch-api';
  const locationClass = study.location === 'in-mum' ? 'india' : 'us';

  const headerLabel = `${study.surface} | ${study.location === 'in-mum' ? 'India' : 'US'}${study.promptSuffix ? ' + suffix' : ''}`;

  if (!data) {
    return `
      <div class="surface-column">
        <div class="surface-header ${surfaceClass} ${locationClass}">${headerLabel}</div>
        <div class="no-data">No data available</div>
      </div>
    `;
  }

  return `
    <div class="surface-column">
      <div class="surface-header ${surfaceClass} ${locationClass}">${headerLabel} ${data.huftFound ? '✓ HUFT' : ''}</div>
      <div class="surface-content">${highlightHUFT(data.response)}</div>
    </div>
  `;
}

async function main() {
  const googlePath = await generateGoogleReport();
  const openaiPath = await generateOpenAIReport();

  // Open the reports
  const { exec } = await import('child_process');
  exec(`open "${googlePath}"`);
  exec(`open "${openaiPath}"`);

  console.log('\nDone! Both reports generated.');
}

main().catch(console.error);
