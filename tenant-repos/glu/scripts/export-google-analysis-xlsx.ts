#!/usr/bin/env npx tsx
/**
 * Export Google Visibility Analysis to Excel
 *
 * Creates an Excel file with multiple sheets similar to huft-analysis.xlsx:
 * - Study Configuration
 * - Summary
 * - Verbatims
 * - Source Influence
 * - Source Summary
 * - Cost Analysis
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';

const STUDIES_DIR = 'studies/google';
const OUTPUT_FILE = 'studies/google/google-visibility-analysis.xlsx';

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
  ipVerification?: {
    ipInfo?: {
      ip: string;
      country: string;
      city: string;
      region: string;
      org: string;
    };
    verified: boolean;
  };
  results: StudyResult[];
}

function findHUFTMentions(text: string): { found: boolean; count: number } {
  if (!text) return { found: false, count: 0 };
  const patterns = [
    /heads\s*up\s*for\s*tails/gi,
    /huft/gi,
    /headsupfortails/gi,
  ];
  let count = 0;
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return { found: count > 0, count };
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

async function main() {
  console.log('Creating Google Visibility Analysis Excel...\n');

  // Load all study files
  const studyFiles = fs.readdirSync(STUDIES_DIR)
    .filter(f => f.match(/^g\d{2}-.*\.json$/) && !f.includes('intermediate') && !f.includes('pre-recovery') && !f.includes('analysis'))
    .sort();

  const studies: StudyData[] = [];
  for (const file of studyFiles) {
    const data = JSON.parse(fs.readFileSync(path.join(STUDIES_DIR, file), 'utf-8'));
    studies.push(data);
  }

  console.log(`Loaded ${studies.length} studies`);

  // Create workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Bentham Research';
  workbook.created = new Date();

  // ========== Sheet 1: Study Configuration ==========
  const configSheet = workbook.addWorksheet('Study Configuration');
  configSheet.columns = [
    { header: 'Study ID', key: 'studyId', width: 10 },
    { header: 'Study Name', key: 'studyName', width: 50 },
    { header: 'Surface', key: 'surface', width: 20 },
    { header: 'Location', key: 'location', width: 15 },
    { header: 'Prompt Suffix', key: 'promptSuffix', width: 15 },
    { header: 'AI Overview', key: 'aiOverview', width: 12 },
    { header: 'IP Address', key: 'ipAddress', width: 18 },
    { header: 'IP Country', key: 'ipCountry', width: 12 },
    { header: 'IP City', key: 'ipCity', width: 20 },
    { header: 'IP Verified', key: 'ipVerified', width: 12 },
    { header: 'Timestamp', key: 'timestamp', width: 22 },
  ];

  for (const study of studies) {
    configSheet.addRow({
      studyId: study.study.toUpperCase(),
      studyName: study.studyName,
      surface: study.surface,
      location: study.location,
      promptSuffix: study.promptSuffix || 'None',
      aiOverview: study.captureAiOverview ? 'Yes' : 'No',
      ipAddress: study.ipVerification?.ipInfo?.ip || 'N/A',
      ipCountry: study.ipVerification?.ipInfo?.country || 'N/A',
      ipCity: study.ipVerification?.ipInfo?.city || 'N/A',
      ipVerified: study.ipVerification?.verified ? 'Yes' : 'No',
      timestamp: study.timestamp,
    });
  }

  // Style header
  configSheet.getRow(1).font = { bold: true };
  configSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

  // ========== Sheet 2: Summary ==========
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Surface', key: 'surface', width: 25 },
    { header: 'Location', key: 'location', width: 15 },
    { header: 'Prompt Suffix', key: 'promptSuffix', width: 15 },
    { header: 'Total Queries', key: 'totalQueries', width: 15 },
    { header: 'HUFT Mentions', key: 'huftMentions', width: 15 },
    { header: 'HUFT %', key: 'huftPercent', width: 12 },
    { header: 'In AI Overview', key: 'inAiOverview', width: 15 },
    { header: 'AI Overview %', key: 'aiOverviewPercent', width: 15 },
    { header: 'In Organic Top 3', key: 'inTop3', width: 18 },
    { header: 'Top 3 %', key: 'top3Percent', width: 12 },
    { header: 'In Organic Top 10', key: 'inTop10', width: 18 },
    { header: 'Top 10 %', key: 'top10Percent', width: 12 },
  ];

  for (const study of studies) {
    let huftMentions = 0;
    let inAiOverview = 0;
    let inTop3 = 0;
    let inTop10 = 0;

    for (const result of study.results) {
      const aiMention = findHUFTMentions(result.aiOverview || '');
      const responseMention = findHUFTMentions(result.response || '');
      const organicPos = getOrganicPosition(result.organicResults);

      if (aiMention.found || responseMention.found || organicPos !== null) {
        huftMentions++;
      }
      if (aiMention.found) inAiOverview++;
      if (organicPos !== null && organicPos <= 3) inTop3++;
      if (organicPos !== null && organicPos <= 10) inTop10++;
    }

    const total = study.results.length;
    summarySheet.addRow({
      surface: study.surface,
      location: study.location,
      promptSuffix: study.promptSuffix || 'None',
      totalQueries: total,
      huftMentions,
      huftPercent: `${((huftMentions / total) * 100).toFixed(1)}%`,
      inAiOverview,
      aiOverviewPercent: `${((inAiOverview / total) * 100).toFixed(1)}%`,
      inTop3,
      top3Percent: `${((inTop3 / total) * 100).toFixed(1)}%`,
      inTop10,
      top10Percent: `${((inTop10 / total) * 100).toFixed(1)}%`,
    });
  }

  summarySheet.getRow(1).font = { bold: true };
  summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

  // ========== Sheet 3: Verbatims ==========
  const verbatimsSheet = workbook.addWorksheet('Verbatims');
  verbatimsSheet.columns = [
    { header: 'Study', key: 'study', width: 8 },
    { header: 'Query #', key: 'queryNum', width: 10 },
    { header: 'Query', key: 'query', width: 60 },
    { header: 'HUFT Found', key: 'huftFound', width: 12 },
    { header: 'In AI Overview', key: 'inAiOverview', width: 15 },
    { header: 'Organic Position', key: 'organicPos', width: 18 },
    { header: 'AI Overview Text', key: 'aiOverviewText', width: 80 },
    { header: 'Top 3 Organic Results', key: 'organicResults', width: 80 },
  ];

  for (const study of studies) {
    for (const result of study.results) {
      const aiMention = findHUFTMentions(result.aiOverview || '');
      const organicPos = getOrganicPosition(result.organicResults);
      const huftFound = aiMention.found || organicPos !== null;

      const top3Organic = (result.organicResults || [])
        .slice(0, 3)
        .map(r => `${r.position}. ${r.title}`)
        .join('\n');

      verbatimsSheet.addRow({
        study: study.study.toUpperCase(),
        queryNum: result.queryIndex + 1,
        query: result.originalQuery,
        huftFound: huftFound ? 'Yes' : 'No',
        inAiOverview: aiMention.found ? 'Yes' : 'No',
        organicPos: organicPos !== null ? `#${organicPos}` : 'Not Found',
        aiOverviewText: result.aiOverview || 'N/A',
        organicResults: top3Organic || 'N/A',
      });
    }
  }

  verbatimsSheet.getRow(1).font = { bold: true };
  verbatimsSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

  // Enable text wrap for long columns
  verbatimsSheet.getColumn('aiOverviewText').alignment = { wrapText: true };
  verbatimsSheet.getColumn('organicResults').alignment = { wrapText: true };

  // ========== Sheet 4: AI Overview Analysis ==========
  const aiOverviewSheet = workbook.addWorksheet('AI Overview Analysis');
  aiOverviewSheet.columns = [
    { header: 'Study', key: 'study', width: 8 },
    { header: 'Location', key: 'location', width: 12 },
    { header: 'Query', key: 'query', width: 50 },
    { header: 'Has AI Overview', key: 'hasAiOverview', width: 15 },
    { header: 'HUFT in AI Overview', key: 'huftInAio', width: 18 },
    { header: 'Brands Mentioned', key: 'brandsMentioned', width: 50 },
    { header: 'AI Overview Length', key: 'length', width: 18 },
  ];

  const commonBrands = ['Royal Canin', 'Pedigree', 'Drools', 'Purina', 'Orijen', 'Acana', 'Farmina', 'Whiskas', 'Me-O', 'Sheba'];

  for (const study of studies) {
    if (!study.captureAiOverview) continue;

    for (const result of study.results) {
      const hasAio = !!result.aiOverview && result.aiOverview.length > 10;
      const aioText = (result.aiOverview || '').toLowerCase();
      const huftInAio = findHUFTMentions(result.aiOverview || '').found;

      const brandsFound = commonBrands.filter(brand =>
        aioText.includes(brand.toLowerCase())
      );

      aiOverviewSheet.addRow({
        study: study.study.toUpperCase(),
        location: study.location,
        query: result.originalQuery,
        hasAiOverview: hasAio ? 'Yes' : 'No',
        huftInAio: huftInAio ? 'Yes' : 'No',
        brandsMentioned: brandsFound.join(', ') || 'None detected',
        length: result.aiOverview?.length || 0,
      });
    }
  }

  aiOverviewSheet.getRow(1).font = { bold: true };
  aiOverviewSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

  // ========== Sheet 5: Cost Analysis ==========
  const costSheet = workbook.addWorksheet('Cost Analysis');
  costSheet.columns = [
    { header: 'Surface', key: 'surface', width: 30 },
    { header: 'Cost per 1000 Queries', key: 'costPer1000', width: 22 },
    { header: 'Queries Run', key: 'queriesRun', width: 15 },
    { header: 'Estimated Cost', key: 'estimatedCost', width: 18 },
    { header: 'Notes', key: 'notes', width: 50 },
  ];

  // SerpAPI costs ~$50/5000 searches = $10/1000
  // Gemini API costs ~$0.15/1M input tokens
  const costData = [
    { surface: 'Google Search via SerpAPI', costPer1000: '$10.00', queriesRun: 160, estimatedCost: '$1.60', notes: 'Includes AI Overview capture, no CAPTCHA issues' },
    { surface: 'Gemini API', costPer1000: '$0.15', queriesRun: 80, estimatedCost: '$0.01', notes: 'Direct API access, no browser needed' },
  ];

  for (const row of costData) {
    costSheet.addRow(row);
  }

  // Add totals
  costSheet.addRow({});
  costSheet.addRow({
    surface: 'TOTAL',
    queriesRun: 240,
    estimatedCost: '$1.61',
    notes: 'Full 12-study, 240-query analysis',
  });

  costSheet.getRow(1).font = { bold: true };
  costSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

  // Save workbook
  await workbook.xlsx.writeFile(OUTPUT_FILE);
  console.log(`\nExcel file saved to: ${OUTPUT_FILE}`);
}

main().catch(console.error);
