#!/usr/bin/env npx tsx
/**
 * Analyze ChatGPT Web responses to identify what was added by the web layer
 * vs what likely came from the base model
 */

import * as fs from 'fs';

const studyResults = JSON.parse(fs.readFileSync('/Users/edf/bentham/studies/todd-achilles-complete-results.json', 'utf-8'));

interface WebLayerAnalysis {
  query: string;
  response: string;
  responseTimeMs: number;
  layers: {
    browsing: {
      detected: boolean;
      evidence: string[];
      sourcesFound: string[];
    };
    formatting: {
      hasEmojis: boolean;
      hasMarkdown: boolean;
      hasStructuredSections: boolean;
      formatTypes: string[];
    };
    followUp: {
      hasFollowUpSuggestions: boolean;
      suggestions: string[];
    };
    systemPrompt: {
      hasPersonaIndicators: boolean;
      hasSafetyLanguage: boolean;
      indicators: string[];
    };
    baseModel: {
      likelyFromTrainingData: string[];
      possibleConfusion: string[];
      knowledgeCutoffIndicators: string[];
    };
  };
  assessment: {
    primarySource: 'browsing' | 'training_data' | 'mixed';
    confidence: number;
    explanation: string;
  };
}

// Extract ChatGPT web responses
const analyses: WebLayerAnalysis[] = [];

for (const job of studyResults.jobs) {
  if (job.surfaceId !== 'chatgpt-web' || !job.responseText) continue;

  const text = job.responseText;
  const textLower = text.toLowerCase();

  // Analyze browsing layer
  const browsingEvidence: string[] = [];
  const sourcesFound: string[] = [];

  // Check for explicit source citations
  const wikiMatch = text.match(/Wikipedia/gi);
  if (wikiMatch) {
    browsingEvidence.push('Wikipedia cited');
    sourcesFound.push('Wikipedia');
  }

  const urlPatterns = text.match(/[a-zA-Z]+\.(com|org|gov|net|edu)/g);
  if (urlPatterns) {
    browsingEvidence.push(`URL domains found: ${[...new Set(urlPatterns)].join(', ')}`);
    sourcesFound.push(...new Set(urlPatterns));
  }

  // Check for browsing-specific language
  if (/according to (recent|latest|current)/i.test(text)) {
    browsingEvidence.push('References "recent/latest/current" information');
  }
  if (/as of (202\d|January|February|March|April|May|June|July|August|September|October|November|December)/i.test(text)) {
    browsingEvidence.push('Contains specific date references');
  }
  if (/\[\+\d+\]|\[source\]|\[citation/i.test(text)) {
    browsingEvidence.push('Contains citation markers');
  }

  // Analyze formatting layer
  const formatTypes: string[] = [];
  const emojiPattern = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
  const hasEmojis = emojiPattern.test(text);
  if (hasEmojis) formatTypes.push('emojis');

  const hasMarkdown = /\*\*[^*]+\*\*|##\s|###\s|\n- |\n• /.test(text);
  if (hasMarkdown) formatTypes.push('markdown bold/headers/lists');

  const hasStructuredSections = /\n\n[A-Z🔍📍🗳️✅❌].+\n/.test(text);
  if (hasStructuredSections) formatTypes.push('structured sections with headers');

  // Analyze follow-up suggestions
  const followUpPatterns = [
    /if you'd like/i,
    /if you want/i,
    /would you like me to/i,
    /i can also/i,
    /let me know if/i,
    /shall i/i,
  ];
  const suggestions: string[] = [];
  for (const pattern of followUpPatterns) {
    const match = text.match(pattern);
    if (match) {
      const context = text.slice(Math.max(0, text.indexOf(match[0]) - 10), text.indexOf(match[0]) + 100);
      suggestions.push(context.replace(/\n/g, ' ').trim());
    }
  }

  // Analyze system prompt indicators
  const systemIndicators: string[] = [];
  if (/i('m| am) (an ai|a language model|chatgpt|an assistant)/i.test(text)) {
    systemIndicators.push('Self-identifies as AI');
  }
  if (/i (cannot|can't|don't have|am not able to)/i.test(text)) {
    systemIndicators.push('Capability limitations mentioned');
  }
  if (/please note|important to note|keep in mind/i.test(text)) {
    systemIndicators.push('Cautionary language');
  }

  // Analyze base model content
  const likelyTrainingData: string[] = [];
  const possibleConfusion: string[] = [];
  const cutoffIndicators: string[] = [];

  // Check if confusing with other Todd Achilles
  if (/telemedicine|telehealth|digital health|ATA|American Telemedicine/i.test(text)) {
    possibleConfusion.push('Confused with Todd Achilles (digital health executive at ATA)');
    likelyTrainingData.push('Pre-2024 training data about different Todd Achilles');
  }

  // Check for Idaho political context (correct person)
  if (/idaho.*(senate|representative|legislature|house)/i.test(text)) {
    likelyTrainingData.push('Idaho political context (likely from recent browsing or late training data)');
  }

  // Check for knowledge cutoff language
  if (/as of my (last|knowledge|training)|my knowledge cutoff|i don't have (real-time|current)/i.test(text)) {
    cutoffIndicators.push('Explicit knowledge cutoff disclaimer');
  }

  // Determine primary source
  let primarySource: 'browsing' | 'training_data' | 'mixed' = 'training_data';
  let confidence = 0.5;
  let explanation = '';

  if (browsingEvidence.length >= 2 || sourcesFound.length > 0) {
    primarySource = 'browsing';
    confidence = 0.8;
    explanation = `Strong browsing indicators: ${browsingEvidence.slice(0, 2).join('; ')}`;
  } else if (possibleConfusion.length > 0) {
    primarySource = 'training_data';
    confidence = 0.9;
    explanation = `Response shows confusion with different person, suggesting reliance on training data without web verification`;
  } else if (browsingEvidence.length === 1 && likelyTrainingData.length > 0) {
    primarySource = 'mixed';
    confidence = 0.6;
    explanation = `Some browsing indicators mixed with training data patterns`;
  } else {
    explanation = `No strong browsing indicators; likely base model response`;
  }

  analyses.push({
    query: job.queryText,
    response: text,
    responseTimeMs: job.responseTimeMs,
    layers: {
      browsing: {
        detected: browsingEvidence.length > 0,
        evidence: browsingEvidence,
        sourcesFound,
      },
      formatting: {
        hasEmojis,
        hasMarkdown,
        hasStructuredSections,
        formatTypes,
      },
      followUp: {
        hasFollowUpSuggestions: suggestions.length > 0,
        suggestions,
      },
      systemPrompt: {
        hasPersonaIndicators: systemIndicators.some(i => i.includes('AI')),
        hasSafetyLanguage: systemIndicators.some(i => i.includes('Cautionary')),
        indicators: systemIndicators,
      },
      baseModel: {
        likelyFromTrainingData: likelyTrainingData,
        possibleConfusion,
        knowledgeCutoffIndicators: cutoffIndicators,
      },
    },
    assessment: {
      primarySource,
      confidence,
      explanation,
    },
  });
}

// Generate report
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

// Calculate summary stats
const stats = {
  total: analyses.length,
  browsingDetected: analyses.filter(a => a.layers.browsing.detected).length,
  hasEmojis: analyses.filter(a => a.layers.formatting.hasEmojis).length,
  hasMarkdown: analyses.filter(a => a.layers.formatting.hasMarkdown).length,
  hasFollowUp: analyses.filter(a => a.layers.followUp.hasFollowUpSuggestions).length,
  possibleConfusion: analyses.filter(a => a.layers.baseModel.possibleConfusion.length > 0).length,
  primaryBrowsing: analyses.filter(a => a.assessment.primarySource === 'browsing').length,
  primaryTraining: analyses.filter(a => a.assessment.primarySource === 'training_data').length,
  primaryMixed: analyses.filter(a => a.assessment.primarySource === 'mixed').length,
};

// Collect all unique sources
const allSources = new Set<string>();
for (const a of analyses) {
  for (const s of a.layers.browsing.sourcesFound) {
    allSources.add(s);
  }
}

let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ChatGPT Web Layer Analysis - Todd Achilles Study</title>
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
    .container { max-width: 1400px; margin: 0 auto; }
    h1 { color: #1a1a2e; border-bottom: 3px solid #10a37f; padding-bottom: 10px; }
    h2 { color: #2d3748; margin-top: 30px; }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }
    .stat-card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      text-align: center;
    }
    .stat-value { font-size: 32px; font-weight: bold; color: #10a37f; }
    .stat-label { color: #666; font-size: 13px; }
    .layer-section {
      background: white;
      padding: 25px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      margin: 25px 0;
    }
    .layer-section h3 {
      margin-top: 0;
      padding-bottom: 10px;
      border-bottom: 2px solid #e2e8f0;
    }
    .layer-icon { font-size: 24px; margin-right: 10px; }
    .layer-description { color: #555; margin: 15px 0; }
    .evidence-list { margin: 15px 0; }
    .evidence-item {
      background: #f7fafc;
      padding: 10px 15px;
      border-left: 3px solid #10a37f;
      margin: 8px 0;
      font-size: 14px;
    }
    .query-analysis {
      background: white;
      margin: 20px 0;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .query-header {
      background: #2d3748;
      color: white;
      padding: 15px 20px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .query-header:hover { background: #3d4a5c; }
    .query-body { display: none; padding: 20px; }
    .query-body.open { display: block; }
    .source-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
    }
    .source-browsing { background: #d1fae5; color: #065f46; }
    .source-training { background: #fef3c7; color: #92400e; }
    .source-mixed { background: #dbeafe; color: #1e40af; }
    .layer-badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      margin: 2px;
    }
    .badge-browsing { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
    .badge-format { background: #fef3c7; color: #b45309; border: 1px solid #fcd34d; }
    .badge-system { background: #ede9fe; color: #6d28d9; border: 1px solid #c4b5fd; }
    .badge-confusion { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }
    .response-text {
      background: #f7fafc;
      padding: 15px;
      border-radius: 6px;
      font-size: 13px;
      max-height: 300px;
      overflow-y: auto;
      margin-top: 15px;
      white-space: pre-wrap;
    }
    .assessment-box {
      background: #f0fdf4;
      border: 1px solid #86efac;
      border-radius: 8px;
      padding: 15px;
      margin-top: 15px;
    }
    .findings-table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
    }
    .findings-table th, .findings-table td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #e2e8f0;
    }
    .findings-table th { background: #f7fafc; }
    .highlight { background: #fef9c3; padding: 2px 4px; border-radius: 3px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔬 ChatGPT Web Layer Analysis</h1>
    <p><strong>Study:</strong> Todd Achilles Voter Impact | <strong>Queries Analyzed:</strong> ${stats.total} | <strong>Generated:</strong> ${new Date().toLocaleString()}</p>

    <div class="summary-grid">
      <div class="stat-card">
        <div class="stat-value">${stats.browsingDetected}</div>
        <div class="stat-label">Used Web Browsing</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.hasEmojis}</div>
        <div class="stat-label">Had Emojis</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.hasMarkdown}</div>
        <div class="stat-label">Had Markdown</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.hasFollowUp}</div>
        <div class="stat-label">Follow-up Suggestions</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color: #dc2626;">${stats.possibleConfusion}</div>
        <div class="stat-label">Wrong Person Confusion</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.primaryBrowsing}</div>
        <div class="stat-label">Primary: Browsing</div>
      </div>
    </div>

    <div class="layer-section">
      <h3><span class="layer-icon">🌐</span>Layer 1: Web Browsing Tool</h3>
      <div class="layer-description">
        <p><strong>What it is:</strong> ChatGPT Web has access to a browsing tool that can search the internet and retrieve current information. This is NOT available through the raw API.</p>
        <p><strong>How to identify it:</strong></p>
        <ul>
          <li>Explicit citations (Wikipedia, news sites, .com/.org domains)</li>
          <li>Reference to "recent" or "current" information with specific dates</li>
          <li>Citation markers like [+1] or source attributions</li>
          <li>Information that wouldn't be in training data (e.g., 2025-2026 events)</li>
        </ul>
        <p><strong>In this study:</strong> ${stats.browsingDetected}/${stats.total} responses showed browsing indicators.</p>
        <p><strong>Sources found:</strong> ${[...allSources].join(', ') || 'None detected'}</p>
      </div>
    </div>

    <div class="layer-section">
      <h3><span class="layer-icon">✨</span>Layer 2: UI Formatting</h3>
      <div class="layer-description">
        <p><strong>What it is:</strong> The ChatGPT web interface adds rich formatting that makes responses more readable. The API returns plain text by default.</p>
        <p><strong>Formatting types detected:</strong></p>
        <ul>
          <li><strong>Emojis:</strong> ${stats.hasEmojis}/${stats.total} responses (🗳️ 📍 ✅ ❌ etc.)</li>
          <li><strong>Markdown:</strong> ${stats.hasMarkdown}/${stats.total} responses (bold, headers, bullet lists)</li>
          <li><strong>Structured sections:</strong> Clear headers like "What he's known for", "Areas of expertise"</li>
        </ul>
        <p><strong>Origin:</strong> Likely from ChatGPT's system prompt which instructs it to format responses in an organized, readable way.</p>
      </div>
    </div>

    <div class="layer-section">
      <h3><span class="layer-icon">💬</span>Layer 3: Follow-up Suggestions</h3>
      <div class="layer-description">
        <p><strong>What it is:</strong> ChatGPT Web often ends responses with suggestions for follow-up questions or offers to provide more information.</p>
        <p><strong>Examples from this study:</strong></p>
        <div class="evidence-list">
          ${analyses.filter(a => a.layers.followUp.suggestions.length > 0).slice(0, 3).map(a =>
            `<div class="evidence-item">"${a.layers.followUp.suggestions[0].slice(0, 150)}..."</div>`
          ).join('')}
        </div>
        <p><strong>In this study:</strong> ${stats.hasFollowUp}/${stats.total} responses included follow-up suggestions.</p>
        <p><strong>Origin:</strong> System prompt instructs ChatGPT to be helpful and proactive in offering additional assistance.</p>
      </div>
    </div>

    <div class="layer-section" style="border-left: 4px solid #dc2626;">
      <h3><span class="layer-icon">⚠️</span>Layer 4: Base Model + Training Data Issues</h3>
      <div class="layer-description">
        <p><strong>What it is:</strong> When browsing isn't used or fails, responses come from GPT-4's training data, which has a knowledge cutoff and may contain outdated or incorrect information.</p>
        <p><strong>Critical finding in this study:</strong></p>
        <div class="evidence-item" style="border-color: #dc2626;">
          <strong>${stats.possibleConfusion}/${stats.total} responses confused Todd Achilles (Idaho politician) with a different Todd Achilles (digital health executive).</strong>
          <br><br>
          The model's training data contains information about a Todd Achilles who worked at the American Telemedicine Association. When browsing wasn't triggered, the model defaulted to this person.
        </div>
        <p><strong>This demonstrates:</strong></p>
        <ul>
          <li>The base model doesn't have reliable information about the Idaho politician</li>
          <li>Web browsing is <em>essential</em> for current political figures</li>
          <li>The same query can produce radically different results depending on whether browsing activates</li>
        </ul>
      </div>
    </div>

    <h2>📋 Query-by-Query Analysis</h2>
    <p>Click each query to see detailed layer analysis.</p>
`;

for (const analysis of analyses) {
  const sourceClass = analysis.assessment.primarySource === 'browsing' ? 'source-browsing' :
                      analysis.assessment.primarySource === 'training_data' ? 'source-training' : 'source-mixed';
  const sourceLabel = analysis.assessment.primarySource === 'browsing' ? '🌐 Browsing' :
                      analysis.assessment.primarySource === 'training_data' ? '🧠 Training Data' : '🔄 Mixed';

  html += `
    <div class="query-analysis">
      <div class="query-header" onclick="this.nextElementSibling.classList.toggle('open')">
        <span>${escapeHtml(analysis.query)}</span>
        <span class="source-badge ${sourceClass}">${sourceLabel}</span>
      </div>
      <div class="query-body">
        <p><strong>Response Time:</strong> ${(analysis.responseTimeMs / 1000).toFixed(1)}s | <strong>Length:</strong> ${analysis.response.length} chars</p>

        <h4>Layers Detected:</h4>
        <div>
          ${analysis.layers.browsing.detected ? `<span class="layer-badge badge-browsing">🌐 Browsing: ${analysis.layers.browsing.sourcesFound.join(', ') || 'indicators found'}</span>` : ''}
          ${analysis.layers.formatting.formatTypes.map(f => `<span class="layer-badge badge-format">✨ ${f}</span>`).join('')}
          ${analysis.layers.followUp.hasFollowUpSuggestions ? `<span class="layer-badge badge-format">💬 Follow-up offered</span>` : ''}
          ${analysis.layers.baseModel.possibleConfusion.length > 0 ? `<span class="layer-badge badge-confusion">⚠️ Wrong person confusion</span>` : ''}
        </div>

        ${analysis.layers.browsing.evidence.length > 0 ? `
        <h4>Browsing Evidence:</h4>
        <ul>${analysis.layers.browsing.evidence.map(e => `<li>${e}</li>`).join('')}</ul>
        ` : ''}

        ${analysis.layers.baseModel.possibleConfusion.length > 0 ? `
        <h4 style="color: #dc2626;">⚠️ Confusion Detected:</h4>
        <ul style="color: #b91c1c;">${analysis.layers.baseModel.possibleConfusion.map(c => `<li>${c}</li>`).join('')}</ul>
        ` : ''}

        <div class="assessment-box">
          <strong>Assessment:</strong> ${analysis.assessment.explanation}
          <br><strong>Confidence:</strong> ${(analysis.assessment.confidence * 100).toFixed(0)}%
        </div>

        <div class="response-text">${escapeHtml(analysis.response.slice(0, 2000))}${analysis.response.length > 2000 ? '...' : ''}</div>
      </div>
    </div>
`;
}

html += `
    <div class="layer-section" style="margin-top: 40px; background: #f0fdf4;">
      <h3><span class="layer-icon">📊</span>Summary: What ChatGPT Web Adds</h3>
      <table class="findings-table">
        <thead>
          <tr>
            <th>Layer</th>
            <th>Source</th>
            <th>Available in API?</th>
            <th>Impact on Accuracy</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Web Browsing</strong></td>
            <td>ChatGPT Web Search Tool</td>
            <td>❌ No (requires separate tool implementation)</td>
            <td class="highlight">Critical for current events - prevents wrong-person confusion</td>
          </tr>
          <tr>
            <td><strong>Rich Formatting</strong></td>
            <td>System Prompt + UI</td>
            <td>⚠️ Partial (can add via system prompt)</td>
            <td>Improves readability, no accuracy impact</td>
          </tr>
          <tr>
            <td><strong>Follow-up Suggestions</strong></td>
            <td>System Prompt</td>
            <td>⚠️ Partial (can add via system prompt)</td>
            <td>Engagement feature, no accuracy impact</td>
          </tr>
          <tr>
            <td><strong>Citations</strong></td>
            <td>Browsing Tool Integration</td>
            <td>❌ No</td>
            <td>Increases trust and verifiability</td>
          </tr>
          <tr>
            <td><strong>Knowledge Cutoff Bypass</strong></td>
            <td>Browsing Tool</td>
            <td>❌ No</td>
            <td class="highlight">Essential for 2024+ political information</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="layer-section" style="background: #fef2f2; border-left: 4px solid #dc2626;">
      <h3><span class="layer-icon">🚨</span>Key Insight: The Wrong Todd Achilles Problem</h3>
      <p>In ${stats.possibleConfusion} out of ${stats.total} queries, ChatGPT confused the Idaho politician Todd Achilles with a completely different person - a digital health executive who worked at the American Telemedicine Association.</p>
      <p><strong>Why this happened:</strong></p>
      <ul>
        <li>GPT-4's training data contains the "other" Todd Achilles prominently</li>
        <li>The Idaho politician only entered public life in 2024 (after training cutoff)</li>
        <li>When web browsing wasn't triggered, the model defaulted to training data</li>
        <li>The same question ("Who is Todd Achilles?") produced completely different answers depending on whether browsing activated</li>
      </ul>
      <p><strong>Implication for voters:</strong> Without web browsing, AI assistants may provide confidently-stated but completely incorrect information about political candidates.</p>
    </div>

    <div style="margin-top: 40px; padding: 20px; background: #f0f0f0; border-radius: 8px; text-align: center; color: #666;">
      <p>Generated by Bentham Pipeline - ChatGPT Web Layer Analysis</p>
      <p>Based on ${stats.total} queries from the Todd Achilles Voter Impact Study</p>
    </div>
  </div>
</body>
</html>`;

const outputPath = '/Users/edf/bentham/studies/chatgpt-web-layer-analysis.html';
fs.writeFileSync(outputPath, html);

// Also save JSON
fs.writeFileSync(
  '/Users/edf/bentham/studies/chatgpt-web-layer-analysis.json',
  JSON.stringify({ stats, analyses }, null, 2)
);

console.log('='.repeat(70));
console.log('  ChatGPT Web Layer Analysis');
console.log('='.repeat(70));
console.log(`\nAnalyzed ${stats.total} queries\n`);
console.log('Summary:');
console.log(`  Browsing detected: ${stats.browsingDetected}/${stats.total}`);
console.log(`  Has emojis: ${stats.hasEmojis}/${stats.total}`);
console.log(`  Has markdown: ${stats.hasMarkdown}/${stats.total}`);
console.log(`  Has follow-up suggestions: ${stats.hasFollowUp}/${stats.total}`);
console.log(`  Wrong person confusion: ${stats.possibleConfusion}/${stats.total}`);
console.log('\nPrimary source:');
console.log(`  Browsing: ${stats.primaryBrowsing}`);
console.log(`  Training data: ${stats.primaryTraining}`);
console.log(`  Mixed: ${stats.primaryMixed}`);
console.log(`\n✅ Report saved to: ${outputPath}`);
