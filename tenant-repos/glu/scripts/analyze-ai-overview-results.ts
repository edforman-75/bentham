#!/usr/bin/env npx tsx
/**
 * Analyze Google AI Overview Results
 *
 * Distinguishes between actual AI Overviews and incorrectly captured
 * "People also ask" content.
 */

import * as fs from 'fs';

const RESULTS_PATH = 'studies/city-of-boise-google-ai-overview-results.json';

interface QueryResult {
  queryIndex: number;
  queryText: string;
  category: string;
  surfaceId: string;
  status: 'complete' | 'failed';
  responseText?: string;
  aiOverview?: string;
  organicResults?: Array<{ title: string; link: string; snippet: string }>;
  responseTimeMs: number;
  error?: string;
}

function isRealAIOverview(text: string | undefined): boolean {
  if (!text || text.length < 50) return false;

  // If it contains multiple question marks, it's likely "People also ask"
  const questionCount = (text.match(/\?/g) || []).length;
  if (questionCount >= 2) return false;

  // If it starts with a question word followed by ?, it's PAA
  if (/^(What|How|Who|Where|When|Why|Is|Are|Can|Does|Do)\s+.*\?/.test(text)) {
    return false;
  }

  // Real AI Overviews typically start with a complete sentence
  // and contain periods (declarative statements)
  const periodCount = (text.match(/\./g) || []).length;
  if (periodCount === 0 && questionCount > 0) return false;

  return true;
}

function main() {
  const data = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf-8'));
  const results: QueryResult[] = data.results;

  console.log('='.repeat(70));
  console.log('  GOOGLE AI OVERVIEW ANALYSIS');
  console.log('='.repeat(70));
  console.log();

  const realAIOverviews: QueryResult[] = [];
  const fakeAIOverviews: QueryResult[] = []; // PAA captured incorrectly
  const noAIOverview: QueryResult[] = [];

  for (const result of results) {
    if (result.status === 'complete') {
      const text = result.responseText || result.aiOverview || '';
      if (isRealAIOverview(text)) {
        realAIOverviews.push(result);
      } else {
        fakeAIOverviews.push(result);
      }
    } else {
      noAIOverview.push(result);
    }
  }

  console.log('Summary:');
  console.log(`  Total queries: ${results.length}`);
  console.log(`  Real AI Overviews: ${realAIOverviews.length} (${((realAIOverviews.length / results.length) * 100).toFixed(1)}%)`);
  console.log(`  Incorrectly captured (PAA): ${fakeAIOverviews.length}`);
  console.log(`  No AI Overview: ${noAIOverview.length}`);
  console.log();

  console.log('-'.repeat(70));
  console.log('  REAL AI OVERVIEWS:');
  console.log('-'.repeat(70));

  for (const result of realAIOverviews) {
    console.log(`\n[${result.queryIndex}] ${result.queryText}`);
    console.log(`    Category: ${result.category}`);
    const preview = (result.responseText || '').slice(0, 150).replace(/\n/g, ' ');
    console.log(`    Preview: ${preview}...`);
  }

  console.log('\n' + '-'.repeat(70));
  console.log('  INCORRECTLY CAPTURED (People Also Ask):');
  console.log('-'.repeat(70));

  for (const result of fakeAIOverviews) {
    console.log(`\n[${result.queryIndex}] ${result.queryText}`);
    const preview = (result.responseText || '').slice(0, 100).replace(/\n/g, ' | ');
    console.log(`    Captured: ${preview}...`);
  }

  // By category
  console.log('\n' + '='.repeat(70));
  console.log('  BY CATEGORY:');
  console.log('='.repeat(70));

  const categories = [...new Set(results.map(r => r.category))];
  for (const cat of categories) {
    const catResults = results.filter(r => r.category === cat);
    const catReal = realAIOverviews.filter(r => r.category === cat);
    const rate = catResults.length > 0 ? ((catReal.length / catResults.length) * 100).toFixed(1) : '0';
    console.log(`  ${cat}: ${catReal.length}/${catResults.length} (${rate}%)`);
  }

  // Save corrected results
  const correctedResults = results.map(r => {
    if (r.status === 'complete') {
      const text = r.responseText || r.aiOverview || '';
      if (!isRealAIOverview(text)) {
        return {
          ...r,
          status: 'failed' as const,
          error: 'Incorrectly captured PAA content',
          _originalResponseText: r.responseText,
        };
      }
    }
    return r;
  });

  const correctedOutput = {
    ...data,
    timestamp: new Date().toISOString(),
    studyName: 'City of Boise - Google AI Overview (Corrected)',
    summary: {
      total: results.length,
      successful: realAIOverviews.length,
      failed: results.length - realAIOverviews.length,
    },
    results: correctedResults,
  };

  const correctedPath = 'studies/city-of-boise-google-ai-overview-corrected.json';
  fs.writeFileSync(correctedPath, JSON.stringify(correctedOutput, null, 2));
  console.log(`\nCorrected results saved to: ${correctedPath}`);
}

main();
