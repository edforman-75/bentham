#!/usr/bin/env npx tsx
/**
 * Visibility Study Runner
 *
 * Runs a comprehensive visibility study across all AI surfaces using the new collectors:
 * - Google Search (with AI Overviews) via SerpApi
 * - Bing Search via SerpApi
 * - Bing Copilot via SerpApi
 * - Amazon Search via Oxylabs
 * - Perplexity via API
 * - ChatGPT via browser session (optional)
 *
 * Usage:
 *   npx tsx scripts/run-visibility-study.ts <manifest-path>
 *   npx tsx scripts/run-visibility-study.ts /Users/edf/Downloads/tasc-visibility-study.json
 *
 * Environment variables:
 *   SERPAPI_API_KEY - Required for Google/Bing
 *   OXYLABS_USERNAME - Required for Amazon
 *   OXYLABS_PASSWORD - Required for Amazon
 *   PERPLEXITY_API_KEY - Optional for Perplexity API
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment from root bentham directory
dotenv.config({ path: '../../.env' });

// Import collectors
import {
  searchGoogle,
  searchBing,
  searchBingCopilot,
  type SerpApiResult,
} from '../src/collectors/serpapi-collector.js';

import {
  scrapeAmazonSearch,
  type OxylabsResult,
  type AmazonSearchData,
} from '../src/collectors/oxylabs-collector.js';

import {
  queryPerplexity,
  type CitationResult,
} from '../src/collectors/citation-collector.js';

import {
  queryChatGPT,
  hasValidSession,
  type ChatGPTResult,
} from '../src/collectors/chatgpt-collector.js';

import {
  queryCopilot,
  hasValidCopilotSession,
  type CopilotResult,
} from '../src/collectors/copilot-collector.js';

// ============================================================================
// Types
// ============================================================================

interface ManifestBrand {
  name: string;
  category: 'primary' | 'competitor';
  brandSiteUrl?: string;
  amazonStoreUrl?: string;
  segment?: string;
}

interface ManifestQuery {
  text: string;
  amazonQuery?: string;
  category: string;
  intent?: string;
}

interface Manifest {
  id: string;
  name: string;
  description?: string;
  brands: ManifestBrand[];
  queries: ManifestQuery[];
}

interface BrandMention {
  brand: string;
  count: number;
  isClient: boolean;
}

interface SurfaceResult {
  queryIndex: number;
  queryText: string;
  category: string;
  surface: string;
  status: 'complete' | 'failed';
  responseText: string;
  citations: Array<{
    position: number;
    title: string;
    url: string;
    domain: string;
  }>;
  organicResults?: Array<{
    position: number;
    title: string;
    url: string;
    snippet: string;
  }>;
  brandMentions: BrandMention[];
  responseTimeMs: number;
  error?: string;
  hasAiResponse?: boolean;
}

interface StudyOutput {
  timestamp: string;
  studyName: string;
  manifest: {
    id: string;
    name: string;
    queryCount: number;
    primaryBrand: string;
    competitors: string[];
  };
  surface: string;
  summary: {
    total: number;
    successful: number;
    failed: number;
    avgResponseTime: number;
  };
  brandVisibility: Record<string, {
    queriesAppearing: number;
    percentOfQueries: string;
    isClient: boolean;
  }>;
  results: SurfaceResult[];
}

// ============================================================================
// Configuration
// ============================================================================

const MANIFEST_PATH = process.argv[2];
if (!MANIFEST_PATH) {
  console.error('Usage: npx tsx scripts/run-visibility-study.ts <manifest-path>');
  process.exit(1);
}

// Load manifest
let manifest: Manifest;
try {
  manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
} catch (error) {
  console.error(`Failed to load manifest: ${error}`);
  process.exit(1);
}

// Output directory
const OUTPUT_DIR = `packages/visibility-tool/results/${manifest.id || 'visibility-study'}`;

// Extract brands to track
const PRIMARY_BRAND = manifest.brands.find(b => b.category === 'primary')?.name || '';
const ALL_BRANDS = manifest.brands.map(b => b.name);
const COMPETITOR_BRANDS = manifest.brands.filter(b => b.category === 'competitor').map(b => b.name);

// Add common retailers to track
const RETAILERS = ['Amazon', 'Nordstrom', 'REI', 'Dick\'s Sporting Goods', 'Target', 'Walmart'];
const BRANDS_TO_TRACK = [...ALL_BRANDS, ...RETAILERS];

// ============================================================================
// Utilities
// ============================================================================

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

function saveResults(surface: string, results: SurfaceResult[]): void {
  const successful = results.filter(r => r.status === 'complete');
  const brandCounts: Record<string, { count: number; isClient: boolean }> = {};

  for (const r of results) {
    if (r.status === 'complete' && r.brandMentions) {
      for (const m of r.brandMentions) {
        if (!brandCounts[m.brand]) {
          brandCounts[m.brand] = { count: 0, isClient: m.isClient };
        }
        brandCounts[m.brand].count++;
      }
    }
  }

  const avgTime = successful.length > 0
    ? successful.reduce((sum, r) => sum + r.responseTimeMs, 0) / successful.length
    : 0;

  const output: StudyOutput = {
    timestamp: new Date().toISOString(),
    studyName: `${manifest.name} - ${surface}`,
    manifest: {
      id: manifest.id,
      name: manifest.name,
      queryCount: manifest.queries.length,
      primaryBrand: PRIMARY_BRAND,
      competitors: COMPETITOR_BRANDS,
    },
    surface,
    summary: {
      total: manifest.queries.length,
      successful: successful.length,
      failed: results.length - successful.length,
      avgResponseTime: Math.round(avgTime),
    },
    brandVisibility: Object.fromEntries(
      Object.entries(brandCounts)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([brand, data]) => [
          brand,
          {
            queriesAppearing: data.count,
            percentOfQueries: successful.length > 0
              ? ((data.count / successful.length) * 100).toFixed(1) + '%'
              : '0%',
            isClient: data.isClient,
          },
        ])
    ),
    results,
  };

  const outputPath = path.join(OUTPUT_DIR, `${surface}-results.json`);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
}

// ============================================================================
// Surface Runners
// ============================================================================

async function runGoogleSearch(): Promise<void> {
  const surface = 'google-search';
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${surface.toUpperCase()} (via SerpApi)`);
  console.log('='.repeat(70));

  const SERPAPI_KEY = process.env.SERPAPI_KEY || process.env.SERPAPI_API_KEY;
  if (!SERPAPI_KEY) {
    console.log('⚠️  SERPAPI_KEY not set, skipping');
    return;
  }

  const results: SurfaceResult[] = [];
  const outputPath = path.join(OUTPUT_DIR, `${surface}-results.json`);

  // Resume from existing results if any
  let startIndex = 0;
  if (fs.existsSync(outputPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      results.push(...(existing.results || []));
      startIndex = results.length;
      console.log(`📂 Resuming from query ${startIndex + 1}...`);
    } catch { /* start fresh */ }
  }

  for (let i = startIndex; i < manifest.queries.length; i++) {
    const query = manifest.queries[i];
    const startTime = Date.now();

    process.stdout.write(`  [${i + 1}/${manifest.queries.length}] "${query.text.slice(0, 40)}..."  `);

    try {
      const result: SerpApiResult = await searchGoogle(query.text, {
        location: 'United States',
        credentials: { api_key: SERPAPI_KEY },
      });

      const timeMs = Date.now() - startTime;

      // Combine text for brand extraction
      let allText = result.ai_response_text || '';
      for (const r of result.organic_results || []) {
        allText += ` ${r.title} ${r.snippet}`;
      }

      const brandMentions = extractBrandMentions(allText);
      const hasContent = result.ai_response_text.length > 20 || (result.organic_results?.length || 0) > 0;

      if (hasContent) {
        const topBrands = brandMentions.slice(0, 2).map(b => b.brand).join(', ');
        console.log(`✓ (${(timeMs / 1000).toFixed(1)}s) ${result.has_ai_response ? '[AI]' : ''} [${topBrands || 'no brands'}]`);
      } else {
        console.log(`✗ No results`);
      }

      results.push({
        queryIndex: i + 1,
        queryText: query.text,
        category: query.category,
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
      console.log(`✗ Error: ${error}`);
      results.push({
        queryIndex: i + 1,
        queryText: query.text,
        category: query.category,
        surface,
        status: 'failed',
        responseText: '',
        citations: [],
        brandMentions: [],
        responseTimeMs: Date.now() - startTime,
        error: String(error),
      });
    }

    // Save progress
    if ((i + 1) % 10 === 0 || i === manifest.queries.length - 1) {
      saveResults(surface, results);
    }

    await delay(1500);
  }

  console.log(`\n✓ ${surface} complete: ${results.filter(r => r.status === 'complete').length}/${manifest.queries.length} successful`);
}

async function runBingCopilot(): Promise<void> {
  const surface = 'bing-copilot';
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${surface.toUpperCase()} (via Browser Session)`);
  console.log('='.repeat(70));

  if (!hasValidCopilotSession()) {
    console.log('⚠️  No Copilot session found. Run: npx tsx scripts/copilot-login.ts');
    return;
  }

  const results: SurfaceResult[] = [];
  const outputPath = path.join(OUTPUT_DIR, `${surface}-results.json`);

  // Resume
  let startIndex = 0;
  if (fs.existsSync(outputPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      results.push(...(existing.results || []));
      startIndex = results.length;
      console.log(`📂 Resuming from query ${startIndex + 1}...`);
    } catch { /* start fresh */ }
  }

  for (let i = startIndex; i < manifest.queries.length; i++) {
    const query = manifest.queries[i];
    const startTime = Date.now();

    process.stdout.write(`  [${i + 1}/${manifest.queries.length}] "${query.text.slice(0, 40)}..."  `);

    try {
      const result: CopilotResult = await queryCopilot(query.text, {
        headless: true,
        timeout: 90000,
      });

      const timeMs = Date.now() - startTime;

      if (!result.success) {
        throw new Error(result.error || 'Unknown error');
      }

      if (!result.session_valid) {
        console.log('⚠️  Session expired, stopping Copilot queries');
        break;
      }

      const brandMentions = extractBrandMentions(result.response_text);
      const hasContent = result.response_text.length > 20;

      if (hasContent) {
        const topBrands = brandMentions.slice(0, 2).map(b => b.brand).join(', ');
        console.log(`✓ (${(timeMs / 1000).toFixed(1)}s) [${result.citations.length} citations] [${topBrands || 'no brands'}]`);
      } else {
        console.log(`✗ No response`);
      }

      results.push({
        queryIndex: i + 1,
        queryText: query.text,
        category: query.category,
        surface,
        status: hasContent ? 'complete' : 'failed',
        responseText: result.response_text,
        citations: result.citations.map(c => ({
          position: c.position,
          title: c.title,
          url: c.url,
          domain: c.domain,
        })),
        brandMentions,
        responseTimeMs: timeMs,
        hasAiResponse: true,
      });

    } catch (error) {
      console.log(`✗ Error: ${error}`);
      results.push({
        queryIndex: i + 1,
        queryText: query.text,
        category: query.category,
        surface,
        status: 'failed',
        responseText: '',
        citations: [],
        brandMentions: [],
        responseTimeMs: Date.now() - startTime,
        error: String(error),
      });
    }

    if ((i + 1) % 5 === 0 || i === manifest.queries.length - 1) {
      saveResults(surface, results);
    }

    await delay(3000); // Browser-based Copilot needs time between queries
  }

  console.log(`\n✓ ${surface} complete: ${results.filter(r => r.status === 'complete').length}/${manifest.queries.length} successful`);
}

async function runAmazonSearch(): Promise<void> {
  const surface = 'amazon-search';
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${surface.toUpperCase()} (via Oxylabs)`);
  console.log('='.repeat(70));

  if (!process.env.OXYLABS_USERNAME || !process.env.OXYLABS_PASSWORD) {
    console.log('⚠️  OXYLABS credentials not set, skipping');
    return;
  }

  const results: SurfaceResult[] = [];
  const outputPath = path.join(OUTPUT_DIR, `${surface}-results.json`);

  // Resume
  let startIndex = 0;
  if (fs.existsSync(outputPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      results.push(...(existing.results || []));
      startIndex = results.length;
      console.log(`📂 Resuming from query ${startIndex + 1}...`);
    } catch { /* start fresh */ }
  }

  for (let i = startIndex; i < manifest.queries.length; i++) {
    const query = manifest.queries[i];
    const searchQuery = query.amazonQuery || query.text;
    const startTime = Date.now();

    process.stdout.write(`  [${i + 1}/${manifest.queries.length}] "${searchQuery.slice(0, 40)}..."  `);

    try {
      const result: OxylabsResult<AmazonSearchData> = await scrapeAmazonSearch(searchQuery, {
        domain: 'com',
        geo_location: '10001', // NYC
        credentials: {
          username: process.env.OXYLABS_USERNAME!,
          password: process.env.OXYLABS_PASSWORD!,
        },
      });

      const timeMs = Date.now() - startTime;

      if (!result.success) {
        throw new Error(result.error || 'Unknown error');
      }

      const searchData = result.data;
      const organicResults = searchData?.results?.organic || [];

      // Extract text for brand mentions
      let allText = '';
      for (const r of organicResults) {
        allText += ` ${r.title}`;
      }

      const brandMentions = extractBrandMentions(allText);
      const hasContent = organicResults.length > 0;

      if (hasContent) {
        const topBrands = brandMentions.slice(0, 2).map(b => b.brand).join(', ');
        console.log(`✓ (${(timeMs / 1000).toFixed(1)}s) [${organicResults.length} products] [${topBrands || 'no brands'}]`);
      } else {
        console.log(`✗ No results`);
      }

      results.push({
        queryIndex: i + 1,
        queryText: searchQuery,
        category: query.category,
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
      console.log(`✗ Error: ${error}`);
      results.push({
        queryIndex: i + 1,
        queryText: searchQuery,
        category: query.category,
        surface,
        status: 'failed',
        responseText: '',
        citations: [],
        brandMentions: [],
        responseTimeMs: Date.now() - startTime,
        error: String(error),
      });
    }

    if ((i + 1) % 10 === 0 || i === manifest.queries.length - 1) {
      saveResults(surface, results);
    }

    await delay(1000);
  }

  console.log(`\n✓ ${surface} complete: ${results.filter(r => r.status === 'complete').length}/${manifest.queries.length} successful`);
}

async function runPerplexity(): Promise<void> {
  const surface = 'perplexity';
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${surface.toUpperCase()} (via API)`);
  console.log('='.repeat(70));

  if (!process.env.PERPLEXITY_API_KEY) {
    console.log('⚠️  PERPLEXITY_API_KEY not set, skipping');
    return;
  }

  const results: SurfaceResult[] = [];
  const outputPath = path.join(OUTPUT_DIR, `${surface}-results.json`);

  // Resume
  let startIndex = 0;
  if (fs.existsSync(outputPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      results.push(...(existing.results || []));
      startIndex = results.length;
      console.log(`📂 Resuming from query ${startIndex + 1}...`);
    } catch { /* start fresh */ }
  }

  for (let i = startIndex; i < manifest.queries.length; i++) {
    const query = manifest.queries[i];
    const startTime = Date.now();

    process.stdout.write(`  [${i + 1}/${manifest.queries.length}] "${query.text.slice(0, 40)}..."  `);

    try {
      const result: CitationResult = await queryPerplexity(query.text, {
        apiKey: process.env.PERPLEXITY_API_KEY,
      });

      const timeMs = Date.now() - startTime;

      if (!result.success) {
        throw new Error(result.error || 'Unknown error');
      }

      const brandMentions = extractBrandMentions(result.responseText);
      const hasContent = result.responseText.length > 20;

      if (hasContent) {
        const topBrands = brandMentions.slice(0, 2).map(b => b.brand).join(', ');
        console.log(`✓ (${(timeMs / 1000).toFixed(1)}s) [${result.citations.length} citations] [${topBrands || 'no brands'}]`);
      } else {
        console.log(`✗ No response`);
      }

      results.push({
        queryIndex: i + 1,
        queryText: query.text,
        category: query.category,
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
      console.log(`✗ Error: ${error}`);
      results.push({
        queryIndex: i + 1,
        queryText: query.text,
        category: query.category,
        surface,
        status: 'failed',
        responseText: '',
        citations: [],
        brandMentions: [],
        responseTimeMs: Date.now() - startTime,
        error: String(error),
      });
    }

    if ((i + 1) % 10 === 0 || i === manifest.queries.length - 1) {
      saveResults(surface, results);
    }

    await delay(1500);
  }

  console.log(`\n✓ ${surface} complete: ${results.filter(r => r.status === 'complete').length}/${manifest.queries.length} successful`);
}

async function runChatGPT(): Promise<void> {
  const surface = 'chatgpt';
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${surface.toUpperCase()} (via Browser Session)`);
  console.log('='.repeat(70));

  if (!hasValidSession()) {
    console.log('⚠️  No ChatGPT session found. Run: npx tsx scripts/chatgpt-login.ts');
    return;
  }

  const results: SurfaceResult[] = [];
  const outputPath = path.join(OUTPUT_DIR, `${surface}-results.json`);

  // Resume
  let startIndex = 0;
  if (fs.existsSync(outputPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      results.push(...(existing.results || []));
      startIndex = results.length;
      console.log(`📂 Resuming from query ${startIndex + 1}...`);
    } catch { /* start fresh */ }
  }

  for (let i = startIndex; i < manifest.queries.length; i++) {
    const query = manifest.queries[i];
    const startTime = Date.now();

    process.stdout.write(`  [${i + 1}/${manifest.queries.length}] "${query.text.slice(0, 40)}..."  `);

    try {
      const result: ChatGPTResult = await queryChatGPT(query.text, {
        headless: true,
        timeout: 90000,
      });

      const timeMs = Date.now() - startTime;

      if (!result.success) {
        throw new Error(result.error || 'Unknown error');
      }

      if (!result.session_valid) {
        console.log('⚠️  Session expired, stopping ChatGPT queries');
        break;
      }

      const brandMentions = extractBrandMentions(result.response_text);
      const hasContent = result.response_text.length > 20;

      if (hasContent) {
        const topBrands = brandMentions.slice(0, 2).map(b => b.brand).join(', ');
        console.log(`✓ (${(timeMs / 1000).toFixed(1)}s) [${result.citations.length} citations] [${topBrands || 'no brands'}]`);
      } else {
        console.log(`✗ No response`);
      }

      results.push({
        queryIndex: i + 1,
        queryText: query.text,
        category: query.category,
        surface,
        status: hasContent ? 'complete' : 'failed',
        responseText: result.response_text,
        citations: result.citations.map(c => ({
          position: c.position,
          title: c.title,
          url: c.url,
          domain: c.domain,
        })),
        brandMentions,
        responseTimeMs: timeMs,
        hasAiResponse: true,
      });

    } catch (error) {
      console.log(`✗ Error: ${error}`);
      results.push({
        queryIndex: i + 1,
        queryText: query.text,
        category: query.category,
        surface,
        status: 'failed',
        responseText: '',
        citations: [],
        brandMentions: [],
        responseTimeMs: Date.now() - startTime,
        error: String(error),
      });
    }

    if ((i + 1) % 5 === 0 || i === manifest.queries.length - 1) {
      saveResults(surface, results);
    }

    await delay(5000); // ChatGPT needs longer delays
  }

  console.log(`\n✓ ${surface} complete: ${results.filter(r => r.status === 'complete').length}/${manifest.queries.length} successful`);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('\n' + '═'.repeat(70));
  console.log('  VISIBILITY STUDY RUNNER');
  console.log('═'.repeat(70));
  console.log(`\n  Study: ${manifest.name}`);
  console.log(`  Queries: ${manifest.queries.length}`);
  console.log(`  Primary Brand: ${PRIMARY_BRAND}`);
  console.log(`  Competitors: ${COMPETITOR_BRANDS.join(', ')}`);
  console.log(`  Output: ${OUTPUT_DIR}/`);

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Save manifest copy
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  // Check available credentials
  const serpApiKey = process.env.SERPAPI_KEY || process.env.SERPAPI_API_KEY;
  console.log('\n  Available surfaces:');
  console.log(`    - Google Search: ${serpApiKey ? '✓' : '✗ (need SERPAPI_KEY)'}`);
  console.log(`    - Bing Copilot: ${hasValidCopilotSession() ? '✓' : '✗ (run copilot-login.ts first)'}`);
  console.log(`    - Amazon Search: ${process.env.OXYLABS_USERNAME ? '✓' : '✗ (need OXYLABS_USERNAME/PASSWORD)'}`);
  console.log(`    - Perplexity: ${process.env.PERPLEXITY_API_KEY ? '✓' : '✗ (need PERPLEXITY_API_KEY)'}`);
  console.log(`    - ChatGPT: ${hasValidSession() ? '✓' : '✗ (run chatgpt-login.ts first)'}`);

  const startTime = Date.now();

  // Run all surfaces
  await runGoogleSearch();
  // await runBingCopilot();  // Temporarily skipped - browser automation issues
  await runAmazonSearch();
  await runPerplexity();
  await runChatGPT();

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log('\n' + '═'.repeat(70));
  console.log('  STUDY COMPLETE');
  console.log('═'.repeat(70));
  console.log(`\n  Total time: ${totalTime} minutes`);
  console.log(`  Results saved to: ${OUTPUT_DIR}/`);
  console.log('\n  Generated files:');

  const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    console.log(`    - ${file}`);
  }

  console.log('\n');
}

main().catch(console.error);
