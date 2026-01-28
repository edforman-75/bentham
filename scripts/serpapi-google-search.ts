#!/usr/bin/env npx tsx
/**
 * Google Search via SerpAPI
 * Extracts organic search results - faster and more reliable than browser automation
 */

import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const SERPAPI_KEY = process.env.SERPAPI_KEY;
const MANIFEST_PATH = 'studies/city-of-boise-visibility.json';
const OUTPUT_PATH = 'studies/city-of-boise-google-search-results.json';

if (!SERPAPI_KEY) {
  console.error('SERPAPI_KEY not found in environment');
  process.exit(1);
}

interface QueryResult {
  queryIndex: number;
  queryText: string;
  category: string;
  surfaceId: string;
  status: 'complete' | 'failed';
  responseText?: string;
  organicResults?: Array<{ title: string; link: string; snippet: string }>;
  responseTimeMs: number;
  error?: string;
  timestamp: string;
}

interface SerpAPIResponse {
  organic_results?: Array<{
    title: string;
    link: string;
    snippet?: string;
  }>;
}

async function searchWithSerpAPI(query: string): Promise<Array<{ title: string; link: string; snippet: string }>> {
  const params = new URLSearchParams({
    q: query,
    api_key: SERPAPI_KEY!,
    engine: 'google',
    gl: 'us',
    hl: 'en',
    google_domain: 'google.com',
  });

  const response = await fetch(`https://serpapi.com/search?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`SerpAPI error: ${response.status} ${response.statusText}`);
  }

  const data: SerpAPIResponse = await response.json();

  return (data.organic_results || []).slice(0, 10).map(r => ({
    title: r.title || '',
    link: r.link || '',
    snippet: r.snippet || '',
  }));
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('='.repeat(70));
  console.log('  GOOGLE SEARCH VIA SERPAPI');
  console.log('='.repeat(70));
  console.log();

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  console.log(`Loaded ${manifest.queries.length} queries\n`);

  // Load existing results
  let results: QueryResult[] = [];
  if (fs.existsSync(OUTPUT_PATH)) {
    try {
      const existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
      results = existing.results || [];
      console.log(`Resuming: ${results.length} queries already done\n`);
    } catch {
      console.log('Starting fresh\n');
    }
  }

  const completed = new Set(results.map(r => r.queryIndex));
  const missing: number[] = [];
  for (let i = 1; i <= manifest.queries.length; i++) {
    if (!completed.has(i)) missing.push(i);
  }

  console.log(`Missing: ${missing.length}\n`);
  if (missing.length === 0) {
    console.log('All done!');
    return;
  }

  console.log('-'.repeat(70));

  let successCount = results.filter(r => r.status === 'complete').length;
  let failCount = results.filter(r => r.status === 'failed').length;

  for (const queryNum of missing) {
    const query = manifest.queries[queryNum - 1];

    process.stdout.write(`  [${queryNum}/${manifest.queries.length}] "${query.text.slice(0, 40)}..."  `);

    const startTime = Date.now();

    try {
      const organic = await searchWithSerpAPI(query.text);
      const timeMs = Date.now() - startTime;

      if (organic.length > 0) {
        successCount++;
        console.log(`✓ ${organic.length} results (${(timeMs / 1000).toFixed(1)}s)`);

        // Format as text for responseText
        const responseText = organic.map((r, i) =>
          `${i + 1}. ${r.title}\n   ${r.link}\n   ${r.snippet}`
        ).join('\n\n');

        results.push({
          queryIndex: queryNum,
          queryText: query.text,
          category: query.category,
          surfaceId: 'google-search',
          status: 'complete',
          responseText,
          organicResults: organic,
          responseTimeMs: timeMs,
          timestamp: new Date().toISOString(),
        });
      } else {
        failCount++;
        console.log(`✗ No results`);
        results.push({
          queryIndex: queryNum,
          queryText: query.text,
          category: query.category,
          surfaceId: 'google-search',
          status: 'failed',
          responseTimeMs: timeMs,
          error: 'No results',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      failCount++;
      console.log(`✗ Error: ${error}`);
      results.push({
        queryIndex: queryNum,
        queryText: query.text,
        category: query.category,
        surfaceId: 'google-search',
        status: 'failed',
        responseTimeMs: Date.now() - startTime,
        error: String(error),
        timestamp: new Date().toISOString(),
      });
    }

    // Save progress
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify({
      studyName: 'City of Boise AI Visibility Study',
      lastUpdate: new Date().toISOString(),
      results,
    }, null, 2));

    // Rate limit - 1.5s between requests
    await delay(1500);
  }

  console.log('\n' + '='.repeat(70));
  console.log('  COMPLETE');
  console.log('='.repeat(70));
  console.log(`\n  Success: ${successCount}  |  Failed: ${failCount}`);
  console.log(`  Results saved to: ${OUTPUT_PATH}\n`);
}

main().catch(console.error);
