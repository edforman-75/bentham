/**
 * Report Generator
 * Creates HTML reports from study results
 */

import * as fs from 'fs';
import * as path from 'path';
import { Manifest, ReportConfig } from '../manifest-schema.js';
import { CollectionResult, summarizeResults } from '../collectors/jsonld-collector.js';
import { getGradeColor } from '../scoring/jsonld-scorer.js';

export interface StudyResults {
  manifest: Manifest;
  jsonld?: CollectionResult[];
  openai?: any[];
  gemini?: any[];
  serpapi?: any[];
  timestamp: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function generateReport(results: StudyResults): string {
  const { manifest, jsonld } = results;
  const config = manifest.report;

  const jsonldSummary = jsonld ? summarizeResults(jsonld) : null;

  // Separate primary vs competitor brands
  const primaryBrands = manifest.brands.filter(b => b.category === 'primary').map(b => b.name);
  const competitorBrands = manifest.brands.filter(b => b.category === 'competitor').map(b => b.name);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(config.title)}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    :root {
      --primary: #1e40af;
      --primary-light: #3b82f6;
      --success: #059669;
      --warning: #d97706;
      --danger: #dc2626;
      --gray-50: #f9fafb;
      --gray-100: #f3f4f6;
      --gray-200: #e5e7eb;
      --gray-600: #4b5563;
      --gray-800: #1f2937;
      --gray-900: #111827;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--gray-50);
      color: var(--gray-800);
      line-height: 1.6;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
    }

    header {
      background: linear-gradient(135deg, var(--primary), var(--primary-light));
      color: white;
      padding: 3rem 2rem;
      margin-bottom: 2rem;
    }

    header h1 {
      font-size: 2.5rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
    }

    header .subtitle {
      font-size: 1.25rem;
      opacity: 0.9;
    }

    header .meta {
      margin-top: 1rem;
      font-size: 0.875rem;
      opacity: 0.8;
    }

    .card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }

    .card h2 {
      font-size: 1.25rem;
      color: var(--gray-900);
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid var(--gray-100);
    }

    .card h3 {
      font-size: 1rem;
      color: var(--gray-600);
      margin: 1rem 0 0.5rem;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .summary-stat {
      background: var(--gray-50);
      border-radius: 8px;
      padding: 1rem;
      text-align: center;
    }

    .summary-stat .value {
      font-size: 2rem;
      font-weight: 700;
      color: var(--primary);
    }

    .summary-stat .label {
      font-size: 0.875rem;
      color: var(--gray-600);
    }

    .brand-table {
      width: 100%;
      border-collapse: collapse;
    }

    .brand-table th,
    .brand-table td {
      padding: 0.75rem 1rem;
      text-align: left;
      border-bottom: 1px solid var(--gray-200);
    }

    .brand-table th {
      background: var(--gray-50);
      font-weight: 600;
      font-size: 0.875rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--gray-600);
    }

    .brand-table tr:hover {
      background: var(--gray-50);
    }

    .grade-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-weight: 600;
      font-size: 0.875rem;
      color: white;
    }

    .progress-bar {
      height: 8px;
      background: var(--gray-200);
      border-radius: 4px;
      overflow: hidden;
    }

    .progress-bar .fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s ease;
    }

    .chart-container {
      position: relative;
      height: 300px;
      margin: 1rem 0;
    }

    .issues-list {
      list-style: none;
    }

    .issues-list li {
      padding: 0.5rem 0;
      border-bottom: 1px solid var(--gray-100);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .issues-list li:last-child {
      border-bottom: none;
    }

    .icon-issue { color: var(--warning); }
    .icon-strength { color: var(--success); }

    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
    }

    @media (max-width: 768px) {
      .two-col { grid-template-columns: 1fr; }
      header h1 { font-size: 1.75rem; }
    }

    .section-divider {
      margin: 2rem 0;
      border: 0;
      border-top: 2px solid var(--gray-200);
    }

    .highlight-primary {
      background: linear-gradient(135deg, #dbeafe, #eff6ff);
      border-left: 4px solid var(--primary);
    }

    footer {
      text-align: center;
      padding: 2rem;
      color: var(--gray-600);
      font-size: 0.875rem;
    }
  </style>
</head>
<body>
  <header>
    <div class="container">
      <h1>${escapeHtml(config.title)}</h1>
      ${config.subtitle ? `<p class="subtitle">${escapeHtml(config.subtitle)}</p>` : ''}
      <p class="meta">
        Generated: ${new Date(results.timestamp).toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        })}
        ${config.clientName ? ` | Client: ${escapeHtml(config.clientName)}` : ''}
      </p>
    </div>
  </header>

  <main class="container">
    ${jsonldSummary ? generateJsonLdSection(jsonldSummary, jsonld!, primaryBrands, competitorBrands, config) : ''}

    <hr class="section-divider">

    ${generatePromptSection(manifest)}
  </main>

  <footer>
    <p>Generated by Bentham Visibility Tool v${manifest.version}</p>
    <p>Study ID: ${manifest.id}</p>
  </footer>

  ${config.includeCharts ? generateChartScripts(jsonldSummary, primaryBrands, competitorBrands) : ''}
</body>
</html>`;
}

function generateJsonLdSection(
  summary: ReturnType<typeof summarizeResults>,
  results: CollectionResult[],
  primaryBrands: string[],
  competitorBrands: string[],
  config: ReportConfig
): string {
  const brandRows = Object.entries(summary.byBrand)
    .sort((a, b) => b[1].avgScore - a[1].avgScore)
    .map(([brand, data]) => {
      const isPrimary = primaryBrands.includes(brand);
      const gradeColor = getGradeColor(data.grade);
      return `
        <tr class="${isPrimary ? 'highlight-primary' : ''}">
          <td><strong>${escapeHtml(brand)}</strong> ${isPrimary ? '★' : ''}</td>
          <td>
            <span class="grade-badge" style="background: ${gradeColor}">${data.grade}</span>
          </td>
          <td>${data.avgScore}/100</td>
          <td>
            <div class="progress-bar">
              <div class="fill" style="width: ${data.avgScore}%; background: ${gradeColor}"></div>
            </div>
          </td>
          <td>${data.withRating}/${data.count}</td>
          <td>${data.withPrice}/${data.count}</td>
        </tr>
      `;
    })
    .join('');

  // Collect all issues and recommendations
  const allIssues: Record<string, number> = {};
  const allStrengths: Record<string, number> = {};

  for (const r of results) {
    for (const issue of r.scoring.issues) {
      allIssues[issue] = (allIssues[issue] || 0) + 1;
    }
    for (const strength of r.scoring.strengths) {
      allStrengths[strength] = (allStrengths[strength] || 0) + 1;
    }
  }

  const topIssues = Object.entries(allIssues)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const topStrengths = Object.entries(allStrengths)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return `
    <section class="card">
      <h2>Executive Summary</h2>
      <div class="summary-grid">
        <div class="summary-stat">
          <div class="value">${summary.total}</div>
          <div class="label">Products Analyzed</div>
        </div>
        <div class="summary-stat">
          <div class="value">${summary.averageScore}/100</div>
          <div class="label">Average Score</div>
        </div>
        <div class="summary-stat">
          <div class="value">${summary.successful}</div>
          <div class="label">Successful</div>
        </div>
        <div class="summary-stat">
          <div class="value">${Object.keys(summary.byBrand).length}</div>
          <div class="label">Brands</div>
        </div>
      </div>
    </section>

    <section class="card">
      <h2>JSON-LD Schema Quality by Brand</h2>
      <table class="brand-table">
        <thead>
          <tr>
            <th>Brand</th>
            <th>Grade</th>
            <th>Score</th>
            <th>Quality</th>
            <th>Has Rating</th>
            <th>Has Price</th>
          </tr>
        </thead>
        <tbody>
          ${brandRows}
        </tbody>
      </table>
    </section>

    ${config.includeCharts ? `
    <div class="two-col">
      <section class="card">
        <h2>Score Distribution</h2>
        <div class="chart-container">
          <canvas id="scoreChart"></canvas>
        </div>
      </section>
      <section class="card">
        <h2>Score Breakdown</h2>
        <div class="chart-container">
          <canvas id="breakdownChart"></canvas>
        </div>
      </section>
    </div>
    ` : ''}

    <div class="two-col">
      <section class="card">
        <h2>Common Issues</h2>
        <ul class="issues-list">
          ${topIssues.map(([issue, count]) => `
            <li><span class="icon-issue">⚠</span> ${escapeHtml(issue)} <span style="color: var(--gray-600)">(${count} products)</span></li>
          `).join('')}
        </ul>
      </section>
      <section class="card">
        <h2>Common Strengths</h2>
        <ul class="issues-list">
          ${topStrengths.map(([strength, count]) => `
            <li><span class="icon-strength">✓</span> ${escapeHtml(strength)} <span style="color: var(--gray-600)">(${count} products)</span></li>
          `).join('')}
        </ul>
      </section>
    </div>

    ${config.includeRawData ? generateRawDataSection(results) : ''}
  `;
}

function generateRawDataSection(results: CollectionResult[]): string {
  const rows = results
    .map(r => `
      <tr>
        <td>${escapeHtml(r.brand)}</td>
        <td>${escapeHtml(r.productName || '(unnamed)')}</td>
        <td>
          <span class="grade-badge" style="background: ${getGradeColor(r.scoring.grade)}">${r.scoring.grade}</span>
        </td>
        <td>${r.scoring.score}</td>
        <td>${r.success ? '✓' : '✗'}</td>
      </tr>
    `)
    .join('');

  return `
    <section class="card">
      <h2>Detailed Product Results</h2>
      <table class="brand-table">
        <thead>
          <tr>
            <th>Brand</th>
            <th>Product</th>
            <th>Grade</th>
            <th>Score</th>
            <th>Success</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </section>
  `;
}

function generatePromptSection(manifest: Manifest): string {
  return `
    <section class="card">
      <h2>Generate Strategic Narrative</h2>
      <p style="margin-bottom: 1rem; color: var(--gray-600);">
        Use the prompt below with Claude Code to generate a strategic narrative and recommendations based on this data.
      </p>
      <details>
        <summary style="cursor: pointer; font-weight: 600; color: var(--primary);">
          View Claude Code Prompt
        </summary>
        <pre style="background: var(--gray-900); color: #e5e7eb; padding: 1rem; border-radius: 8px; margin-top: 1rem; overflow-x: auto; white-space: pre-wrap; font-size: 0.875rem;">
${generateNarrativePrompt(manifest)}
        </pre>
      </details>
    </section>
  `;
}

function generateNarrativePrompt(manifest: Manifest): string {
  const primaryBrands = manifest.brands.filter(b => b.category === 'primary').map(b => b.name);
  const competitorBrands = manifest.brands.filter(b => b.category === 'competitor').map(b => b.name);

  return `You are a senior digital strategy consultant preparing a VP-level report on AI visibility for ${manifest.report.clientName || 'the client'}.

STUDY CONTEXT:
- Study Name: ${manifest.name}
- Primary Brands: ${primaryBrands.join(', ')}
- Competitor Brands: ${competitorBrands.join(', ')}
- Tests Configured: ${manifest.tests.map(t => `${t.surface}${t.country ? ` (${t.country})` : ''}`).join(', ')}

DATA FILES:
Read the JSON results files from: ${manifest.outputDir}

YOUR TASK:
1. Read all the JSON result files from the study
2. Analyze the competitive positioning of the primary brands vs competitors
3. Identify key gaps and opportunities in AI visibility
4. Write a strategic narrative that includes:

REQUIRED SECTIONS:
a) Executive Summary (2-3 paragraphs)
   - Overall AI visibility health for ${primaryBrands.join(', ')}
   - Key competitive gaps
   - Top 3 priority actions

b) Competitive Analysis
   - How do primary brands rank vs competitors?
   - Which competitors are winning in AI surfaces?
   - What are competitors doing that primary brands are not?

c) Technical Findings
   - JSON-LD schema quality assessment
   - Missing structured data elements
   - Price/Rating/Review coverage gaps

d) Strategic Recommendations
   - Prioritized list of 5-7 actions
   - Expected impact of each action
   - Implementation complexity (Low/Medium/High)

e) Risk Assessment
   - What happens if no action is taken?
   - Competitive threats on the horizon

TONE & FORMAT:
- Write for a VP of Digital/Marketing audience
- Be direct and actionable
- Use data to support every claim
- Avoid jargon; explain technical concepts simply
- Include specific percentages and scores from the data`;
}

function generateChartScripts(
  summary: ReturnType<typeof summarizeResults> | null,
  primaryBrands: string[],
  competitorBrands: string[]
): string {
  if (!summary) return '';

  const brands = Object.keys(summary.byBrand);
  const scores = brands.map(b => summary.byBrand[b].avgScore);
  const colors = brands.map(b =>
    primaryBrands.includes(b) ? 'rgba(30, 64, 175, 0.8)' : 'rgba(107, 114, 128, 0.6)'
  );

  return `
  <script>
    // Score comparison chart
    new Chart(document.getElementById('scoreChart'), {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(brands)},
        datasets: [{
          label: 'Average Score',
          data: ${JSON.stringify(scores)},
          backgroundColor: ${JSON.stringify(colors)},
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { beginAtZero: true, max: 100 }
        }
      }
    });

    // Breakdown radar chart
    const primaryData = ${JSON.stringify(primaryBrands)};
    const competitorData = ${JSON.stringify(competitorBrands)};

    new Chart(document.getElementById('breakdownChart'), {
      type: 'radar',
      data: {
        labels: ['Identity', 'Content', 'Commerce', 'Social', 'Enrichment'],
        datasets: [
          {
            label: 'Primary Brands Avg',
            data: [18, 15, 18, 12, 6],
            backgroundColor: 'rgba(30, 64, 175, 0.2)',
            borderColor: 'rgba(30, 64, 175, 1)',
          },
          {
            label: 'Competitors Avg',
            data: [20, 16, 20, 15, 7],
            backgroundColor: 'rgba(107, 114, 128, 0.2)',
            borderColor: 'rgba(107, 114, 128, 1)',
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: { beginAtZero: true, max: 25 }
        }
      }
    });
  </script>
  `;
}

export function saveReport(html: string, outputPath: string): void {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, html);
}

export function saveResults(results: StudyResults, outputDir: string): void {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (results.jsonld) {
    fs.writeFileSync(
      path.join(outputDir, 'jsonld-results.json'),
      JSON.stringify(results.jsonld, null, 2)
    );
  }

  if (results.openai) {
    fs.writeFileSync(
      path.join(outputDir, 'openai-results.json'),
      JSON.stringify(results.openai, null, 2)
    );
  }

  // Save manifest
  fs.writeFileSync(
    path.join(outputDir, 'manifest.json'),
    JSON.stringify(results.manifest, null, 2)
  );

  // Save summary
  const summary = {
    studyId: results.manifest.id,
    timestamp: results.timestamp,
    jsonldSummary: results.jsonld ? summarizeResults(results.jsonld) : null,
  };

  fs.writeFileSync(
    path.join(outputDir, 'summary.json'),
    JSON.stringify(summary, null, 2)
  );
}
