#!/usr/bin/env npx tsx
/**
 * Consolidate City of Boise Study Results
 *
 * Merges all existing result files into a single consolidated file
 * and identifies what's still missing.
 */

import * as fs from 'fs';

const MANIFEST_PATH = 'studies/city-of-boise-visibility.json';
const RETRY_RESULTS_PATH = 'studies/city-of-boise-visibility-retry-results.json';
const AI_OVERVIEW_PATH = 'studies/city-of-boise-google-ai-overview-corrected.json';
const OUTPUT_PATH = 'studies/city-of-boise-consolidated-results.json';

interface QueryResult {
  queryIndex: number;
  queryText: string;
  category: string;
  surfaceId: string;
  status: 'complete' | 'failed';
  responseText?: string;
  responseTimeMs?: number;
  error?: string;
}

interface Manifest {
  queries: { text: string; category: string }[];
  surfaces: { id: string; weight: number }[];
}

function main() {
  console.log('='.repeat(70));
  console.log('  CONSOLIDATING CITY OF BOISE STUDY RESULTS');
  console.log('='.repeat(70));
  console.log();

  // Load manifest
  const manifest: Manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  const totalQueries = manifest.queries.length;
  const surfaces = manifest.surfaces.map(s => s.id);

  console.log(`Manifest: ${totalQueries} queries × ${surfaces.length} surfaces = ${totalQueries * surfaces.length} cells\n`);

  // Collect all results
  const allResults: QueryResult[] = [];
  const completed = new Map<string, QueryResult>();

  // Load retry results
  if (fs.existsSync(RETRY_RESULTS_PATH)) {
    const retryData = JSON.parse(fs.readFileSync(RETRY_RESULTS_PATH, 'utf-8'));
    console.log(`Retry results: ${retryData.results.length} entries`);

    for (const r of retryData.results) {
      const key = `${r.surfaceId}:${r.queryIndex}`;
      if (!completed.has(key)) {
        completed.set(key, r);
      }
    }
  }

  // Load AI Overview results (corrected)
  if (fs.existsSync(AI_OVERVIEW_PATH)) {
    const aiData = JSON.parse(fs.readFileSync(AI_OVERVIEW_PATH, 'utf-8'));
    console.log(`AI Overview results: ${aiData.results.length} entries`);

    for (const r of aiData.results) {
      const key = `google-ai-overview:${r.queryIndex}`;
      // AI Overview takes precedence (it's the corrected version)
      completed.set(key, {
        ...r,
        surfaceId: 'google-ai-overview',
      });
    }
  }

  console.log(`\nTotal unique results: ${completed.size}\n`);

  // Analyze by surface
  console.log('-'.repeat(70));
  console.log('  COVERAGE BY SURFACE');
  console.log('-'.repeat(70));

  const missing: Record<string, number[]> = {};

  for (const surface of surfaces) {
    const surfaceResults = Array.from(completed.values()).filter(r => r.surfaceId === surface);
    const completeCount = surfaceResults.filter(r => r.status === 'complete').length;
    const failedCount = surfaceResults.filter(r => r.status === 'failed').length;
    const missingCount = totalQueries - surfaceResults.length;

    // Find missing query indices
    const presentIndices = new Set(surfaceResults.map(r => r.queryIndex));
    missing[surface] = [];
    for (let i = 1; i <= totalQueries; i++) {
      if (!presentIndices.has(i)) {
        missing[surface].push(i);
      }
    }

    const bar = '█'.repeat(Math.floor((surfaceResults.length / totalQueries) * 30)) +
                '░'.repeat(30 - Math.floor((surfaceResults.length / totalQueries) * 30));

    console.log(`\n  ${surface}:`);
    console.log(`    ${bar} ${surfaceResults.length}/${totalQueries}`);
    console.log(`    Complete: ${completeCount}, Failed: ${failedCount}, Missing: ${missingCount}`);
  }

  // Calculate Boise mention rates for complete results
  console.log('\n' + '-'.repeat(70));
  console.log('  BOISE MENTION RATES (for complete responses)');
  console.log('-'.repeat(70));

  for (const surface of surfaces) {
    const surfaceResults = Array.from(completed.values())
      .filter(r => r.surfaceId === surface && r.status === 'complete');

    if (surfaceResults.length === 0) {
      console.log(`\n  ${surface}: No complete results`);
      continue;
    }

    const mentions = surfaceResults.filter(r =>
      (r.responseText || '').toLowerCase().includes('boise')
    ).length;

    const rate = ((mentions / surfaceResults.length) * 100).toFixed(1);
    console.log(`\n  ${surface}: ${mentions}/${surfaceResults.length} mention Boise (${rate}%)`);
  }

  // Save consolidated results
  const consolidated = {
    studyName: 'City of Boise AI Visibility Study - Consolidated',
    timestamp: new Date().toISOString(),
    manifest: {
      totalQueries,
      surfaces: surfaces.length,
      expectedCells: totalQueries * surfaces.length,
    },
    coverage: {
      totalResults: completed.size,
      bySurface: Object.fromEntries(
        surfaces.map(s => [s, {
          have: Array.from(completed.values()).filter(r => r.surfaceId === s).length,
          complete: Array.from(completed.values()).filter(r => r.surfaceId === s && r.status === 'complete').length,
          failed: Array.from(completed.values()).filter(r => r.surfaceId === s && r.status === 'failed').length,
          missing: missing[s]?.length || 0,
          missingIndices: missing[s] || [],
        }])
      ),
    },
    results: Array.from(completed.values()),
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(consolidated, null, 2));
  console.log(`\n\nConsolidated results saved to: ${OUTPUT_PATH}`);

  // Summary of what's needed
  console.log('\n' + '='.repeat(70));
  console.log('  WHAT\'S STILL NEEDED');
  console.log('='.repeat(70));

  let totalMissing = 0;
  for (const surface of surfaces) {
    const count = missing[surface]?.length || 0;
    totalMissing += count;
    if (count > 0) {
      console.log(`\n  ${surface}: ${count} queries missing`);
      if (count <= 10) {
        console.log(`    Indices: ${missing[surface].join(', ')}`);
      } else {
        console.log(`    First 10: ${missing[surface].slice(0, 10).join(', ')}...`);
      }
    }
  }

  console.log(`\n  TOTAL MISSING: ${totalMissing} of ${totalQueries * surfaces.length} cells`);
  console.log(`  COMPLETION: ${(((totalQueries * surfaces.length - totalMissing) / (totalQueries * surfaces.length)) * 100).toFixed(1)}%\n`);
}

main();
