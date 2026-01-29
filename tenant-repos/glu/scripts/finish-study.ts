#!/usr/bin/env npx tsx
/**
 * Finish Study - Retry failed queries across all surfaces
 *
 * Reads existing results, finds failed queries, and re-runs only those.
 *
 * Usage:
 *   npx tsx scripts/finish-study.ts <results-dir>
 *   npx tsx scripts/finish-study.ts packages/visibility-tool/results/study-1769536121535
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

import { searchGoogle, type SerpApiResult } from '../src/collectors/serpapi-collector.js';
import { scrapeAmazonSearch, type OxylabsResult, type AmazonSearchData } from '../src/collectors/oxylabs-collector.js';
import { queryPerplexity, type CitationResult } from '../src/collectors/citation-collector.js';

const RESULTS_DIR = process.argv[2];
if (!RESULTS_DIR) {
  console.error('Usage: npx tsx scripts/finish-study.ts <results-dir>');
  process.exit(1);
}

// Load manifest
const manifestPath = path.join(RESULTS_DIR, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error(`Manifest not found: ${manifestPath}`);
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

// Brands to track
const PRIMARY_BRAND = manifest.brands?.find((b: any) => b.category === 'primary')?.name || '';
const ALL_BRANDS = manifest.brands?.map((b: any) => b.name) || [];
const RETAILERS = ['Amazon', 'Nordstrom', 'REI', "Dick's Sporting Goods", 'Target', 'Walmart'];
const BRANDS_TO_TRACK = [...ALL_BRANDS, ...RETAILERS];

interface BrandMention {
  brand: string;
  count: number;
  isClient: boolean;
}

function extractBrandMentions(text: string): BrandMention[] {
  const mentions: BrandMention[] = [];
  const lowerText = text.toLowerCase();

  for (const brand of BRANDS_TO_TRACK) {
    const lowerBrand = brand.toLowerCase();
    let count = 0;
    let pos = 0;
    while ((pos = lowerText.indexOf(lowerBrand, pos)) !== -1) {
      count++;
      pos += lowerBrand.length;
    }
    if (count > 0) {
      mentions.push({
        brand,
        count,
        isClient: brand.toLowerCase() === PRIMARY_BRAND.toLowerCase(),
      });
    }
  }
  return mentions.sort((a, b) => b.count - a.count);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface FailedQuery {
  queryIndex: number;
  queryText: string;
  category: string;
  amazonQuery?: string;
}

function getFailedQueries(resultsPath: string): FailedQuery[] {
  if (!fs.existsSync(resultsPath)) {
    // All queries are "failed" (not attempted)
    return manifest.queries.map((q: any, i: number) => ({
      queryIndex: i + 1,
      queryText: q.text,
      category: q.category,
      amazonQuery: q.amazonQuery,
    }));
  }

  const data = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
  const results = data.results || [];

  const failed: FailedQuery[] = [];
  const completedIndices = new Set(
    results.filter((r: any) => r.status === 'complete').map((r: any) => r.queryIndex)
  );

  for (let i = 0; i < manifest.queries.length; i++) {
    if (!completedIndices.has(i + 1)) {
      failed.push({
        queryIndex: i + 1,
        queryText: manifest.queries[i].text,
        category: manifest.queries[i].category,
        amazonQuery: manifest.queries[i].amazonQuery,
      });
    }
  }

  return failed;
}

function updateResults(resultsPath: string, newResults: any[]): void {
  let data: any = {
    timestamp: new Date().toISOString(),
    studyName: manifest.name,
    manifest: {
      id: manifest.id,
      name: manifest.name,
      queryCount: manifest.queries.length,
      primaryBrand: PRIMARY_BRAND,
    },
    surface: '',
    summary: { total: 0, successful: 0, failed: 0 },
    brandVisibility: {},
    results: [],
  };

  if (fs.existsSync(resultsPath)) {
    data = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
  }

  // Merge new results (replace failed with new)
  const resultMap = new Map(data.results.map((r: any) => [r.queryIndex, r]));
  for (const r of newResults) {
    resultMap.set(r.queryIndex, r);
  }
  data.results = Array.from(resultMap.values()).sort((a: any, b: any) => a.queryIndex - b.queryIndex);

  // Update summary
  data.timestamp = new Date().toISOString();
  data.summary.total = manifest.queries.length;
  data.summary.successful = data.results.filter((r: any) => r.status === 'complete').length;
  data.summary.failed = data.results.filter((r: any) => r.status === 'failed').length;

  fs.writeFileSync(resultsPath, JSON.stringify(data, null, 2));
}

async function retryGoogleSearch(): Promise<void> {
  const surface = 'google-search';
  const resultsPath = path.join(RESULTS_DIR, `${surface}-results.json`);
  const failed = getFailedQueries(resultsPath);

  if (failed.length === 0) {
    console.log(`  ${surface}: All queries complete`);
    return;
  }

  const SERPAPI_KEY = process.env.SERPAPI_KEY || process.env.SERPAPI_API_KEY;
  if (!SERPAPI_KEY) {
    console.log(`  ${surface}: Missing SERPAPI_KEY (${failed.length} failed)`);
    return;
  }

  console.log(`  ${surface}: Retrying ${failed.length} failed queries...`);
  const newResults: any[] = [];

  for (const q of failed) {
    const startTime = Date.now();
    process.stdout.write(`    [${q.queryIndex}] "${q.queryText.slice(0, 35)}..."  `);

    try {
      const result: SerpApiResult = await searchGoogle(q.queryText, {
        location: 'United States',
        credentials: { api_key: SERPAPI_KEY },
      });

      const timeMs = Date.now() - startTime;
      let allText = result.ai_response_text || '';
      for (const r of result.organic_results || []) {
        allText += ` ${r.title} ${r.snippet}`;
      }

      const brandMentions = extractBrandMentions(allText);
      const hasContent = result.ai_response_text.length > 20 || (result.organic_results?.length || 0) > 0;

      if (hasContent) {
        console.log(`✓ (${(timeMs / 1000).toFixed(1)}s)`);
      } else {
        console.log(`✗ No results`);
      }

      newResults.push({
        queryIndex: q.queryIndex,
        queryText: q.queryText,
        category: q.category,
        surface,
        status: hasContent ? 'complete' : 'failed',
        responseText: result.ai_response_text,
        citations: result.citations.map(c => ({
          position: c.position,
          title: c.title,
          url: c.url,
          domain: c.domain,
        })),
        organicResults: result.organic_results?.map(r => ({
          position: r.position,
          title: r.title,
          url: r.link,
          snippet: r.snippet,
        })),
        brandMentions,
        responseTimeMs: timeMs,
        hasAiResponse: result.has_ai_response,
      });
    } catch (error) {
      console.log(`✗ Error`);
      newResults.push({
        queryIndex: q.queryIndex,
        queryText: q.queryText,
        category: q.category,
        surface,
        status: 'failed',
        responseText: '',
        citations: [],
        brandMentions: [],
        responseTimeMs: Date.now() - startTime,
        error: String(error),
      });
    }

    await delay(1500);
  }

  updateResults(resultsPath, newResults);
  const success = newResults.filter(r => r.status === 'complete').length;
  console.log(`  ${surface}: ${success}/${failed.length} retries successful`);
}

async function retryAmazonSearch(): Promise<void> {
  const surface = 'amazon-search';
  const resultsPath = path.join(RESULTS_DIR, `${surface}-results.json`);
  const failed = getFailedQueries(resultsPath);

  if (failed.length === 0) {
    console.log(`  ${surface}: All queries complete`);
    return;
  }

  if (!process.env.OXYLABS_USERNAME || !process.env.OXYLABS_PASSWORD) {
    console.log(`  ${surface}: Missing OXYLABS credentials (${failed.length} failed)`);
    return;
  }

  console.log(`  ${surface}: Retrying ${failed.length} failed queries...`);
  const newResults: any[] = [];

  for (const q of failed) {
    const searchQuery = q.amazonQuery || q.queryText;
    const startTime = Date.now();
    process.stdout.write(`    [${q.queryIndex}] "${searchQuery.slice(0, 35)}..."  `);

    try {
      const result: OxylabsResult<AmazonSearchData> = await scrapeAmazonSearch(searchQuery, {
        domain: 'com',
        geo_location: '10001',
        credentials: {
          username: process.env.OXYLABS_USERNAME!,
          password: process.env.OXYLABS_PASSWORD!,
        },
      });

      const timeMs = Date.now() - startTime;

      if (!result.success) {
        throw new Error(result.error || 'Unknown error');
      }

      const organicResults = result.data?.results?.organic || [];
      let allText = organicResults.map(r => r.title).join(' ');

      const brandMentions = extractBrandMentions(allText);
      const hasContent = organicResults.length > 0;

      if (hasContent) {
        console.log(`✓ (${(timeMs / 1000).toFixed(1)}s) [${organicResults.length} products]`);
      } else {
        console.log(`✗ No results`);
      }

      newResults.push({
        queryIndex: q.queryIndex,
        queryText: searchQuery,
        category: q.category,
        surface,
        status: hasContent ? 'complete' : 'failed',
        responseText: '',
        citations: [],
        organicResults: organicResults.slice(0, 20).map((r, idx) => ({
          position: idx + 1,
          title: r.title,
          url: r.url,
          snippet: `$${r.price} | ${r.reviews_count || 0} reviews | ${r.rating || 0} stars`,
        })),
        brandMentions,
        responseTimeMs: timeMs,
      });
    } catch (error) {
      console.log(`✗ Error`);
      newResults.push({
        queryIndex: q.queryIndex,
        queryText: searchQuery,
        category: q.category,
        surface,
        status: 'failed',
        responseText: '',
        citations: [],
        brandMentions: [],
        responseTimeMs: Date.now() - startTime,
        error: String(error),
      });
    }

    await delay(1000);
  }

  updateResults(resultsPath, newResults);
  const success = newResults.filter(r => r.status === 'complete').length;
  console.log(`  ${surface}: ${success}/${failed.length} retries successful`);
}

async function retryPerplexity(): Promise<void> {
  const surface = 'perplexity';
  const resultsPath = path.join(RESULTS_DIR, `${surface}-results.json`);
  const failed = getFailedQueries(resultsPath);

  if (failed.length === 0) {
    console.log(`  ${surface}: All queries complete`);
    return;
  }

  if (!process.env.PERPLEXITY_API_KEY) {
    console.log(`  ${surface}: Missing PERPLEXITY_API_KEY (${failed.length} failed)`);
    return;
  }

  console.log(`  ${surface}: Retrying ${failed.length} failed queries...`);
  const newResults: any[] = [];

  for (const q of failed) {
    const startTime = Date.now();
    process.stdout.write(`    [${q.queryIndex}] "${q.queryText.slice(0, 35)}..."  `);

    try {
      const result: CitationResult = await queryPerplexity(q.queryText, {
        apiKey: process.env.PERPLEXITY_API_KEY,
      });

      const timeMs = Date.now() - startTime;

      if (!result.success) {
        throw new Error(result.error || 'Unknown error');
      }

      const brandMentions = extractBrandMentions(result.responseText);
      const hasContent = result.responseText.length > 20;

      if (hasContent) {
        console.log(`✓ (${(timeMs / 1000).toFixed(1)}s) [${result.citations.length} citations]`);
      } else {
        console.log(`✗ No response`);
      }

      newResults.push({
        queryIndex: q.queryIndex,
        queryText: q.queryText,
        category: q.category,
        surface,
        status: hasContent ? 'complete' : 'failed',
        responseText: result.responseText,
        citations: result.citations.map(c => ({
          position: c.position,
          title: c.title || '',
          url: c.url,
          domain: c.domain,
        })),
        brandMentions,
        responseTimeMs: timeMs,
        hasAiResponse: true,
      });
    } catch (error) {
      console.log(`✗ Error: ${String(error).slice(0, 50)}`);
      newResults.push({
        queryIndex: q.queryIndex,
        queryText: q.queryText,
        category: q.category,
        surface,
        status: 'failed',
        responseText: '',
        citations: [],
        brandMentions: [],
        responseTimeMs: Date.now() - startTime,
        error: String(error),
      });
    }

    await delay(1500);
  }

  updateResults(resultsPath, newResults);
  const success = newResults.filter(r => r.status === 'complete').length;
  console.log(`  ${surface}: ${success}/${failed.length} retries successful`);
}

async function main() {
  console.log('\n' + '═'.repeat(70));
  console.log('  FINISH STUDY - Retry Failed Queries');
  console.log('═'.repeat(70));
  console.log(`\n  Results dir: ${RESULTS_DIR}`);
  console.log(`  Study: ${manifest.name}`);
  console.log(`  Total queries: ${manifest.queries.length}`);

  // Show current status
  console.log('\n  Current status:');
  const surfaces = ['google-search', 'amazon-search', 'perplexity', 'bing-copilot', 'chatgpt'];
  for (const surface of surfaces) {
    const resultsPath = path.join(RESULTS_DIR, `${surface}-results.json`);
    const failed = getFailedQueries(resultsPath);
    const complete = manifest.queries.length - failed.length;
    console.log(`    ${surface}: ${complete}/${manifest.queries.length} complete (${failed.length} to retry)`);
  }

  console.log('\n  Retrying API-based surfaces...\n');

  // Retry API-based surfaces (not browser-based)
  await retryGoogleSearch();
  await retryAmazonSearch();
  await retryPerplexity();

  // Final status
  console.log('\n  Final status:');
  for (const surface of surfaces) {
    const resultsPath = path.join(RESULTS_DIR, `${surface}-results.json`);
    if (fs.existsSync(resultsPath)) {
      const data = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
      const complete = data.results?.filter((r: any) => r.status === 'complete').length || 0;
      console.log(`    ${surface}: ${complete}/${manifest.queries.length} complete`);
    } else {
      console.log(`    ${surface}: No results file`);
    }
  }

  console.log('\n  Note: For browser-based surfaces (bing-copilot, chatgpt), run:');
  console.log('    npx tsx scripts/run-copilot-study.ts <manifest-path>');
  console.log('    npx tsx scripts/run-chatgpt-study.ts <manifest-path>');
  console.log('\n');
}

main().catch(console.error);
