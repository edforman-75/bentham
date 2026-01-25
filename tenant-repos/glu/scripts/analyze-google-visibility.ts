#!/usr/bin/env npx tsx
/**
 * Google Visibility Study Analysis - HUFT Brand Analysis
 *
 * Analyzes HUFT (Heads Up For Tails) visibility across:
 * - Google Search with AI Overview
 * - Google Search Organic only
 * - Gemini API
 * Across India/US locations and Original/"in India" suffix prompts
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import * as path from 'path';

// Common Indian pet brands to track
const INDIAN_PET_BRANDS = [
  'Heads Up For Tails', 'HUFT', 'HeadsUpForTails',
  'Drools', 'Pedigree', 'Royal Canin', 'Purepet', 'Chappi',
  'Henlo', 'Meat Up', 'Farmina', 'Arden Grange', 'Acana',
  'Orijen', 'Hill\'s', 'Wellness', 'Supertails', 'Zigly',
  'BLEP', 'Waggies', 'Kennel Kitchen', 'FreshWoof', 'PetKonnect',
  'JustBark', 'Pawsindia', 'Wiggles', 'Bark Out Loud', 'Canine Creek'
];

interface OrganicResult {
  position: number;
  title: string;
  url: string;
  snippet: string;
}

interface QueryResult {
  queryIndex: number;
  originalQuery: string;
  submittedQuery: string;
  response: string;
  aiOverview?: string;
  organicResults?: OrganicResult[];
  sources?: { title: string; url: string }[];
  success: boolean;
  durationMs: number;
}

interface StudyData {
  study: string;
  studyName: string;
  surface: string;
  location: string;
  promptSuffix: string | null;
  captureAiOverview: boolean;
  results: QueryResult[];
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

interface BrandMention {
  brand: string;
  inAiOverview: boolean;
  inOrganicResults: boolean;
  organicPosition?: number;
  inResponse: boolean;
  context: string;
}

interface QueryAnalysis {
  queryIndex: number;
  query: string;
  studyId: string;
  surface: string;
  location: string;
  promptSuffix: string | null;
  hasAiOverview: boolean;
  aiOverviewLength: number;
  organicResultCount: number;
  huftMentions: BrandMention[];
  allBrandMentions: BrandMention[];
  huftInAiOverview: boolean;
  huftInOrganicTop3: boolean;
  huftInOrganicTop10: boolean;
  huftOrganicPosition: number | null;
  responseLength: number;
}

function findBrandMentions(text: string, organicResults?: OrganicResult[]): BrandMention[] {
  const mentions: BrandMention[] = [];
  const lowerText = text.toLowerCase();

  for (const brand of INDIAN_PET_BRANDS) {
    const lowerBrand = brand.toLowerCase();
    const inText = lowerText.includes(lowerBrand);

    // Check organic results
    let inOrganic = false;
    let organicPos: number | undefined;
    if (organicResults) {
      for (const result of organicResults) {
        const resultText = `${result.title} ${result.url} ${result.snippet}`.toLowerCase();
        if (resultText.includes(lowerBrand)) {
          inOrganic = true;
          organicPos = result.position;
          break;
        }
      }
    }

    if (inText || inOrganic) {
      mentions.push({
        brand,
        inAiOverview: false, // Will be set separately
        inOrganicResults: inOrganic,
        organicPosition: organicPos,
        inResponse: inText,
        context: inText ? extractContext(text, brand) : '',
      });
    }
  }

  return mentions;
}

function extractContext(text: string, brand: string): string {
  const lowerText = text.toLowerCase();
  const lowerBrand = brand.toLowerCase();
  const idx = lowerText.indexOf(lowerBrand);
  if (idx === -1) return '';

  const start = Math.max(0, idx - 50);
  const end = Math.min(text.length, idx + brand.length + 50);
  return '...' + text.slice(start, end).replace(/\n/g, ' ') + '...';
}

function isHuftMention(brand: string): boolean {
  const lowerBrand = brand.toLowerCase();
  return lowerBrand.includes('huft') ||
         lowerBrand.includes('heads up for tails') ||
         lowerBrand.includes('headsupfortails');
}

function analyzeQuery(result: QueryResult, study: StudyData): QueryAnalysis {
  const aiOverview = result.aiOverview || '';
  const response = result.response || '';
  const organicResults = result.organicResults || [];

  // Find all brand mentions
  const allBrands = findBrandMentions(response + ' ' + aiOverview, organicResults);

  // Check AI Overview specifically for brands
  if (aiOverview) {
    for (const mention of allBrands) {
      if (aiOverview.toLowerCase().includes(mention.brand.toLowerCase())) {
        mention.inAiOverview = true;
      }
    }
  }

  // Find HUFT mentions
  const huftMentions = allBrands.filter(m => isHuftMention(m.brand));
  const huftInAiOverview = huftMentions.some(m => m.inAiOverview);
  const huftOrganicPositions = huftMentions
    .filter(m => m.organicPosition)
    .map(m => m.organicPosition!);
  const huftOrganicPosition = huftOrganicPositions.length > 0
    ? Math.min(...huftOrganicPositions)
    : null;

  return {
    queryIndex: result.queryIndex,
    query: result.originalQuery,
    studyId: study.study,
    surface: study.surface,
    location: study.location,
    promptSuffix: study.promptSuffix,
    hasAiOverview: !!aiOverview && aiOverview.length > 0,
    aiOverviewLength: aiOverview.length,
    organicResultCount: organicResults.length,
    huftMentions,
    allBrandMentions: allBrands,
    huftInAiOverview,
    huftInOrganicTop3: huftOrganicPosition !== null && huftOrganicPosition <= 3,
    huftInOrganicTop10: huftOrganicPosition !== null && huftOrganicPosition <= 10,
    huftOrganicPosition,
    responseLength: response.length,
  };
}

function generateHtmlReport(studies: StudyData[], analyses: QueryAnalysis[]): string {
  // Aggregate statistics
  const byStudy: Record<string, QueryAnalysis[]> = {};
  for (const a of analyses) {
    if (!byStudy[a.studyId]) byStudy[a.studyId] = [];
    byStudy[a.studyId].push(a);
  }

  // Calculate HUFT visibility by dimension
  const bySurface: Record<string, QueryAnalysis[]> = {};
  const byLocation: Record<string, QueryAnalysis[]> = {};
  const byPrompt: Record<string, QueryAnalysis[]> = {};

  for (const a of analyses) {
    const surfaceKey = a.surface === 'google-search'
      ? (studies.find(s => s.study === a.studyId)?.captureAiOverview ? 'Google AI Overview' : 'Google Organic')
      : 'Gemini API';
    if (!bySurface[surfaceKey]) bySurface[surfaceKey] = [];
    bySurface[surfaceKey].push(a);

    const locKey = a.location === 'in-mum' ? 'India' : 'US';
    if (!byLocation[locKey]) byLocation[locKey] = [];
    byLocation[locKey].push(a);

    const promptKey = a.promptSuffix ? 'With "in India"' : 'Original';
    if (!byPrompt[promptKey]) byPrompt[promptKey] = [];
    byPrompt[promptKey].push(a);
  }

  const calcHuftRate = (arr: QueryAnalysis[]) => {
    const withHuft = arr.filter(a =>
      a.huftInAiOverview || a.huftInOrganicTop10 || a.huftMentions.length > 0
    ).length;
    return ((withHuft / arr.length) * 100).toFixed(1);
  };

  const calcAiOverviewHuftRate = (arr: QueryAnalysis[]) => {
    const withAiOverview = arr.filter(a => a.hasAiOverview);
    if (withAiOverview.length === 0) return 'N/A';
    const withHuft = withAiOverview.filter(a => a.huftInAiOverview).length;
    return ((withHuft / withAiOverview.length) * 100).toFixed(1);
  };

  const calcOrganicTop3Rate = (arr: QueryAnalysis[]) => {
    const withOrganic = arr.filter(a => a.organicResultCount > 0);
    if (withOrganic.length === 0) return 'N/A';
    const inTop3 = withOrganic.filter(a => a.huftInOrganicTop3).length;
    return ((inTop3 / withOrganic.length) * 100).toFixed(1);
  };

  // Find all brand visibility
  const brandCounts: Record<string, { total: number; aiOverview: number; organic: number }> = {};
  for (const a of analyses) {
    for (const m of a.allBrandMentions) {
      if (!brandCounts[m.brand]) brandCounts[m.brand] = { total: 0, aiOverview: 0, organic: 0 };
      brandCounts[m.brand].total++;
      if (m.inAiOverview) brandCounts[m.brand].aiOverview++;
      if (m.inOrganicResults) brandCounts[m.brand].organic++;
    }
  }

  const sortedBrands = Object.entries(brandCounts)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 20);

  return `<!DOCTYPE html>
<html>
<head>
  <title>Google Visibility Study - HUFT Brand Analysis | Glu</title>
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
      border-bottom: 3px solid #4285f4;
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
    .glu-logo span { color: #4285f4; }
    .glu-header-center {
      padding: 15px 25px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      flex: 1;
      background: rgba(66, 133, 244, 0.05);
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
    .report-date { font-size: 14px; color: #4285f4; font-weight: 500; }
    .container { max-width: 1400px; margin: 0 auto; padding: 30px; }
    h1 { color: #0f0f1a; margin-bottom: 5px; }
    h2 { color: #1a1a2e; border-bottom: 2px solid #4285f4; padding-bottom: 10px; margin-top: 40px; }
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
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }
    .stat-card {
      background: linear-gradient(135deg, #4285f4 0%, #34a853 100%);
      color: white;
      padding: 20px;
      border-radius: 10px;
      text-align: center;
    }
    .stat-card.google { background: linear-gradient(135deg, #4285f4 0%, #0d47a1 100%); }
    .stat-card.gemini { background: linear-gradient(135deg, #8e24aa 0%, #5e35b1 100%); }
    .stat-card.india { background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%); }
    .stat-card.us { background: linear-gradient(135deg, #1565c0 0%, #0d47a1 100%); }
    .stat-card.huft { background: linear-gradient(135deg, #e91e63 0%, #ad1457 100%); }
    .stat-value { font-size: 32px; font-weight: bold; }
    .stat-label { font-size: 12px; opacity: 0.9; margin-top: 5px; }

    .comparison-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    .comparison-table th, .comparison-table td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #eee;
    }
    .comparison-table th {
      background: #f8f9fa;
      font-weight: 600;
    }
    .comparison-table tr:hover {
      background: #f5f5f5;
    }
    .highlight { background: #e8f5e9 !important; }
    .check { color: #2e7d32; font-weight: bold; }
    .x { color: #c62828; }

    .brand-bar {
      display: flex;
      align-items: center;
      margin: 8px 0;
    }
    .brand-name {
      width: 150px;
      font-weight: 500;
    }
    .brand-bar-fill {
      height: 24px;
      background: linear-gradient(90deg, #4285f4, #34a853);
      border-radius: 4px;
      display: flex;
      align-items: center;
      padding-left: 8px;
      color: white;
      font-size: 12px;
      font-weight: 500;
    }
    .brand-bar-fill.huft {
      background: linear-gradient(90deg, #e91e63, #ad1457);
    }

    .matrix-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin: 20px 0;
    }
    .matrix-cell {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 15px;
      text-align: center;
    }
    .matrix-cell h4 {
      margin: 0 0 10px 0;
      color: #333;
    }
    .matrix-value {
      font-size: 28px;
      font-weight: bold;
      color: #4285f4;
    }
    .matrix-value.high { color: #2e7d32; }
    .matrix-value.low { color: #c62828; }
    .matrix-value.medium { color: #f57c00; }

    .insight-box {
      background: #e3f2fd;
      border-left: 4px solid #1976d2;
      padding: 15px 20px;
      margin: 20px 0;
      border-radius: 0 8px 8px 0;
    }
    .insight-box.warning {
      background: #fff3e0;
      border-left-color: #ff9800;
    }
    .insight-box.success {
      background: #e8f5e9;
      border-left-color: #4caf50;
    }
    .insight-box h4 {
      margin: 0 0 10px 0;
      color: #1565c0;
    }
    .insight-box.warning h4 { color: #e65100; }
    .insight-box.success h4 { color: #2e7d32; }

    .query-detail {
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      margin: 10px 0;
      overflow: hidden;
    }
    .query-header {
      background: #f5f5f5;
      padding: 12px 15px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
    }
    .query-header:hover {
      background: #eeeeee;
    }
    .query-body {
      padding: 15px;
      border-top: 1px solid #e0e0e0;
      display: none;
    }
    .query-body.show { display: block; }

    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
      margin: 2px;
    }
    .badge-huft { background: #fce4ec; color: #c2185b; }
    .badge-ai { background: #e3f2fd; color: #1565c0; }
    .badge-organic { background: #e8f5e9; color: #2e7d32; }
    .badge-gemini { background: #f3e5f5; color: #7b1fa2; }

    .glu-footer {
      background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%);
      color: #888;
      padding: 30px;
      margin-top: 40px;
      border-top: 3px solid #4285f4;
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
      <div class="report-title">Google Visibility Study - HUFT Brand Analysis</div>
      <div class="report-subtitle">Google Search AI Overview, Organic Results & Gemini API</div>
    </div>
    <div class="glu-header-right">
      <div class="report-date">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
    </div>
  </header>

  <div class="container">
    <div class="card">
      <h2 style="margin-top: 0; border: none; padding: 0;">Executive Summary</h2>
      <p>Analysis of ${analyses.length} queries across ${studies.length} studies examining HUFT (Heads Up For Tails) visibility on Google Search and Gemini API from India and US locations.</p>

      <div class="summary-grid">
        <div class="stat-card huft">
          <div class="stat-value">${calcHuftRate(analyses)}%</div>
          <div class="stat-label">Overall HUFT Visibility</div>
        </div>
        <div class="stat-card google">
          <div class="stat-value">${calcHuftRate(bySurface['Google AI Overview'] || [])}%</div>
          <div class="stat-label">In Google AI Overview</div>
        </div>
        <div class="stat-card gemini">
          <div class="stat-value">${calcHuftRate(bySurface['Gemini API'] || [])}%</div>
          <div class="stat-label">In Gemini API</div>
        </div>
        <div class="stat-card india">
          <div class="stat-value">${calcHuftRate(byLocation['India'] || [])}%</div>
          <div class="stat-label">India Location</div>
        </div>
        <div class="stat-card us">
          <div class="stat-value">${calcHuftRate(byLocation['US'] || [])}%</div>
          <div class="stat-label">US Location</div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2 style="margin-top: 0; border: none; padding: 0;">HUFT Visibility Matrix</h2>
      <p>Comparing HUFT appearance rates across different dimensions:</p>

      <h3>By Surface Type</h3>
      <div class="matrix-grid">
        ${Object.entries(bySurface).map(([surface, arr]) => {
          const rate = parseFloat(calcHuftRate(arr));
          const rateClass = rate >= 30 ? 'high' : rate >= 10 ? 'medium' : 'low';
          return `
        <div class="matrix-cell">
          <h4>${surface}</h4>
          <div class="matrix-value ${rateClass}">${calcHuftRate(arr)}%</div>
          <div style="font-size: 12px; color: #666;">${arr.length} queries</div>
        </div>`;
        }).join('')}
      </div>

      <h3>By Location</h3>
      <div class="matrix-grid" style="grid-template-columns: repeat(2, 1fr);">
        ${Object.entries(byLocation).map(([loc, arr]) => {
          const rate = parseFloat(calcHuftRate(arr));
          const rateClass = rate >= 30 ? 'high' : rate >= 10 ? 'medium' : 'low';
          return `
        <div class="matrix-cell">
          <h4>${loc}</h4>
          <div class="matrix-value ${rateClass}">${calcHuftRate(arr)}%</div>
          <div style="font-size: 12px; color: #666;">${arr.length} queries</div>
        </div>`;
        }).join('')}
      </div>

      <h3>By Prompt Type</h3>
      <div class="matrix-grid" style="grid-template-columns: repeat(2, 1fr);">
        ${Object.entries(byPrompt).map(([prompt, arr]) => {
          const rate = parseFloat(calcHuftRate(arr));
          const rateClass = rate >= 30 ? 'high' : rate >= 10 ? 'medium' : 'low';
          return `
        <div class="matrix-cell">
          <h4>${prompt}</h4>
          <div class="matrix-value ${rateClass}">${calcHuftRate(arr)}%</div>
          <div style="font-size: 12px; color: #666;">${arr.length} queries</div>
        </div>`;
        }).join('')}
      </div>
    </div>

    <div class="card">
      <h2 style="margin-top: 0; border: none; padding: 0;">Brand Visibility Leaderboard</h2>
      <p>Top brands appearing across all ${analyses.length} queries:</p>

      ${sortedBrands.map(([brand, counts]) => {
        const maxWidth = sortedBrands[0][1].total;
        const width = (counts.total / maxWidth) * 100;
        const isHuft = isHuftMention(brand);
        return `
      <div class="brand-bar">
        <div class="brand-name">${brand}</div>
        <div class="brand-bar-fill ${isHuft ? 'huft' : ''}" style="width: ${Math.max(width, 10)}%">
          ${counts.total} mentions (AI: ${counts.aiOverview}, Organic: ${counts.organic})
        </div>
      </div>`;
      }).join('')}
    </div>

    <div class="card">
      <h2 style="margin-top: 0; border: none; padding: 0;">Study-by-Study Results</h2>

      <table class="comparison-table">
        <thead>
          <tr>
            <th>Study</th>
            <th>Surface</th>
            <th>Location</th>
            <th>Prompt</th>
            <th>HUFT Rate</th>
            <th>AI Overview HUFT</th>
            <th>Organic Top 3</th>
          </tr>
        </thead>
        <tbody>
          ${studies.map(study => {
            const studyAnalyses = byStudy[study.study] || [];
            const huftRate = calcHuftRate(studyAnalyses);
            const aiRate = calcAiOverviewHuftRate(studyAnalyses);
            const top3Rate = calcOrganicTop3Rate(studyAnalyses);
            const isHighlight = parseFloat(huftRate) >= 20;
            return `
          <tr class="${isHighlight ? 'highlight' : ''}">
            <td><strong>${study.study.toUpperCase()}</strong></td>
            <td>${study.surface === 'google-search' ? (study.captureAiOverview ? 'AI Overview' : 'Organic') : 'Gemini'}</td>
            <td>${study.location === 'in-mum' ? 'India' : 'US'}</td>
            <td>${study.promptSuffix ? '"in India"' : 'Original'}</td>
            <td><strong>${huftRate}%</strong></td>
            <td>${aiRate}%</td>
            <td>${top3Rate}%</td>
          </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>

    <div class="card">
      <h2 style="margin-top: 0; border: none; padding: 0;">Key Insights</h2>

      ${parseFloat(calcHuftRate(byLocation['India'] || [])) > parseFloat(calcHuftRate(byLocation['US'] || [])) ? `
      <div class="insight-box success">
        <h4>India Location Advantage</h4>
        <p>HUFT visibility is higher from India (${calcHuftRate(byLocation['India'] || [])}%) compared to US (${calcHuftRate(byLocation['US'] || [])}%). This suggests geographic relevance plays a role in brand visibility.</p>
      </div>
      ` : `
      <div class="insight-box warning">
        <h4>Geographic Visibility Gap</h4>
        <p>HUFT visibility from India (${calcHuftRate(byLocation['India'] || [])}%) vs US (${calcHuftRate(byLocation['US'] || [])}%) shows the importance of location-based optimization.</p>
      </div>
      `}

      ${parseFloat(calcHuftRate(byPrompt['With "in India"'] || [])) > parseFloat(calcHuftRate(byPrompt['Original'] || [])) ? `
      <div class="insight-box success">
        <h4>"In India" Suffix Helps</h4>
        <p>Adding "in India" to queries increases HUFT visibility (${calcHuftRate(byPrompt['With "in India"'] || [])}%) compared to original queries (${calcHuftRate(byPrompt['Original'] || [])}%).</p>
      </div>
      ` : `
      <div class="insight-box">
        <h4>Prompt Suffix Impact</h4>
        <p>Original queries: ${calcHuftRate(byPrompt['Original'] || [])}% | With "in India": ${calcHuftRate(byPrompt['With "in India"'] || [])}%</p>
      </div>
      `}

      <div class="insight-box">
        <h4>Surface Comparison</h4>
        <p>
          <strong>Google AI Overview:</strong> ${calcHuftRate(bySurface['Google AI Overview'] || [])}% HUFT visibility<br>
          <strong>Google Organic:</strong> ${calcHuftRate(bySurface['Google Organic'] || [])}% HUFT visibility<br>
          <strong>Gemini API:</strong> ${calcHuftRate(bySurface['Gemini API'] || [])}% HUFT visibility
        </p>
      </div>
    </div>

    <div class="card">
      <h2 style="margin-top: 0; border: none; padding: 0;">Queries with HUFT Mentions</h2>
      <p>Queries where HUFT appeared in results:</p>

      ${analyses.filter(a => a.huftMentions.length > 0).map(a => `
      <div class="query-detail">
        <div class="query-header">
          <span>Q${a.queryIndex + 1}: ${a.query.substring(0, 60)}${a.query.length > 60 ? '...' : ''}</span>
          <span>
            <span class="badge badge-${a.surface === 'google-search' ? 'organic' : 'gemini'}">${a.studyId.toUpperCase()}</span>
            ${a.huftInAiOverview ? '<span class="badge badge-ai">AI Overview</span>' : ''}
            ${a.huftOrganicPosition ? `<span class="badge badge-organic">Organic #${a.huftOrganicPosition}</span>` : ''}
          </span>
        </div>
      </div>
      `).join('') || '<p>No HUFT mentions found in any queries.</p>'}
    </div>
  </div>

  <footer class="glu-footer">
    <p>Generated by Glu AI Visibility Analysis | ${new Date().toISOString()}</p>
    <p>Studies: ${studies.length} | Queries: ${analyses.length} | Surfaces: Google Search, Gemini API</p>
  </footer>

  <script>
    document.querySelectorAll('.query-header').forEach(header => {
      header.addEventListener('click', () => {
        const body = header.nextElementSibling;
        body.classList.toggle('show');
      });
    });
  </script>
</body>
</html>`;
}

async function main() {
  console.log('Loading Google visibility study results...\n');

  const studiesDir = '/Users/edf/bentham/studies/google';
  const studyFiles = readdirSync(studiesDir)
    .filter(f => f.match(/^g\d{2}-.*\.json$/) && !f.includes('intermediate'));

  console.log(`Found ${studyFiles.length} study files\n`);

  const studies: StudyData[] = [];
  const analyses: QueryAnalysis[] = [];

  for (const file of studyFiles) {
    const filePath = path.join(studiesDir, file);
    const data: StudyData = JSON.parse(readFileSync(filePath, 'utf-8'));
    studies.push(data);

    console.log(`${data.study.toUpperCase()}: ${data.studyName}`);
    console.log(`  Results: ${data.results.length} queries`);

    for (const result of data.results) {
      if (result.success) {
        const analysis = analyzeQuery(result, data);
        analyses.push(analysis);

        if (analysis.huftMentions.length > 0) {
          console.log(`  ✓ Q${result.queryIndex + 1}: HUFT found! (AI: ${analysis.huftInAiOverview}, Organic: ${analysis.huftOrganicPosition || 'N/A'})`);
        }
      }
    }
    console.log('');
  }

  // Summary stats
  console.log('=== HUFT VISIBILITY SUMMARY ===\n');

  const totalQueries = analyses.length;
  const withHuft = analyses.filter(a => a.huftMentions.length > 0).length;
  const huftInAiOverview = analyses.filter(a => a.huftInAiOverview).length;
  const huftInOrganicTop3 = analyses.filter(a => a.huftInOrganicTop3).length;
  const huftInOrganicTop10 = analyses.filter(a => a.huftInOrganicTop10).length;

  console.log(`Total Queries: ${totalQueries}`);
  console.log(`HUFT Mentioned: ${withHuft} (${((withHuft/totalQueries)*100).toFixed(1)}%)`);
  console.log(`HUFT in AI Overview: ${huftInAiOverview} (${((huftInAiOverview/totalQueries)*100).toFixed(1)}%)`);
  console.log(`HUFT in Organic Top 3: ${huftInOrganicTop3} (${((huftInOrganicTop3/totalQueries)*100).toFixed(1)}%)`);
  console.log(`HUFT in Organic Top 10: ${huftInOrganicTop10} (${((huftInOrganicTop10/totalQueries)*100).toFixed(1)}%)`);

  // Generate HTML report
  const reportHtml = generateHtmlReport(studies, analyses);
  const reportPath = '/Users/edf/bentham/studies/google/google-visibility-analysis.html';
  writeFileSync(reportPath, reportHtml);
  console.log(`\nHTML Report saved to: ${reportPath}`);

  // Save JSON analysis
  const jsonPath = '/Users/edf/bentham/studies/google/google-visibility-analysis.json';
  writeFileSync(jsonPath, JSON.stringify({ studies: studies.map(s => ({ study: s.study, studyName: s.studyName })), analyses }, null, 2));
  console.log(`JSON data saved to: ${jsonPath}`);
}

main().catch(console.error);
