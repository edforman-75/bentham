#!/usr/bin/env npx tsx
/**
 * India Visibility Study Runner
 *
 * Runs a comprehensive visibility study from India IP across all AI surfaces:
 * - Google Search (with AI Overviews) via SerpApi - India location
 * - Amazon India Search via Oxylabs
 * - Perplexity via API (with India context)
 * - ChatGPT via browser session
 * - Bing Search via SerpApi - India location
 *
 * Usage:
 *   npx tsx scripts/run-india-visibility-study.ts <manifest-path>
 *   npx tsx scripts/run-india-visibility-study.ts manifests/miss-chase-india.manifest.json
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

// Import collectors - these files are in the same relative location as run-visibility-study.ts
import {
  searchGoogle,
  searchBing,
} from '../../../packages/visibility-tool/src/collectors/serpapi-collector.js';

import {
  scrapeAmazonSearch,
  scrapeGoogleSearch,
} from '../../../packages/visibility-tool/src/collectors/oxylabs-collector.js';

import {
  queryPerplexity,
} from '../../../packages/visibility-tool/src/collectors/citation-collector.js';

import {
  queryChatGPT,
  hasValidSession,
} from '../../../packages/visibility-tool/src/collectors/chatgpt-collector.js';

import { chromium, type BrowserContext } from 'playwright';

// Oxylabs Residential Proxy for India IP
const OXYLABS_USERNAME = process.env.OXYLABS_USERNAME;
const OXYLABS_PASSWORD = process.env.OXYLABS_PASSWORD;
const INDIA_PROXY_CONFIG = (OXYLABS_USERNAME && OXYLABS_PASSWORD) ? {
  server: 'http://pr.oxylabs.io:7777',
  username: `customer-${OXYLABS_USERNAME}-cc-IN-city-mumbai`,
  password: OXYLABS_PASSWORD,
} : null;

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
  location: string;
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
  console.error('Usage: npx tsx scripts/run-india-visibility-study.ts <manifest-path>');
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

// Generate unique study ID with timestamp
const STUDY_ID = `${manifest.id}-${Date.now()}`;
const OUTPUT_DIR = `study-results/${STUDY_ID}`;

// Extract brands to track
const PRIMARY_BRAND = manifest.brands.find(b => b.category === 'primary')?.name || '';
const ALL_BRANDS = manifest.brands.map(b => b.name);
const COMPETITOR_BRANDS = manifest.brands.filter(b => b.category === 'competitor').map(b => b.name);

// Add common Indian retailers to track
const RETAILERS = ['Amazon', 'Myntra', 'AJIO', 'Flipkart', 'Nykaa', 'Tata CLiQ'];
const BRANDS_TO_TRACK = [...ALL_BRANDS, ...RETAILERS];

// India location config
const INDIA_LOCATION = {
  serpapi: {
    location: 'Mumbai, Maharashtra, India',
    gl: 'in',
    hl: 'en',
    google_domain: 'google.co.in',
  },
  oxylabs: {
    domain: 'in',
    geo_location: '400001', // Mumbai PIN code
  },
};

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

/**
 * Verify we have India IP via proxy
 */
async function verifyIndiaIP(): Promise<{ success: boolean; location?: string; ip?: string }> {
  if (!INDIA_PROXY_CONFIG) {
    return { success: false, location: 'No proxy configured' };
  }

  try {
    const browser = await chromium.launch({
      headless: true,
      proxy: INDIA_PROXY_CONFIG,
    });
    const context = await browser.newContext({
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
    });
    const page = await context.newPage();
    await page.goto('https://ipinfo.io/json', { timeout: 30000 });
    const ipInfo = await page.evaluate(() => JSON.parse(document.body.innerText));
    await browser.close();

    const isIndia = ipInfo.country === 'IN';
    return {
      success: isIndia,
      location: `${ipInfo.city}, ${ipInfo.region}, ${ipInfo.country}`,
      ip: ipInfo.ip,
    };
  } catch (error) {
    return { success: false, location: `Error: ${error}` };
  }
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
    location: 'India (Mumbai)',
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

async function runGoogleSearchIndia(): Promise<void> {
  const surface = 'google-search';
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${surface.toUpperCase()} (via SerpApi - INDIA)`);
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
        location: INDIA_LOCATION.serpapi.location,
        gl: INDIA_LOCATION.serpapi.gl,
        hl: INDIA_LOCATION.serpapi.hl,
        google_domain: INDIA_LOCATION.serpapi.google_domain,
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

async function runBingSearchIndia(): Promise<void> {
  const surface = 'bing-search';
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${surface.toUpperCase()} (via SerpApi - INDIA)`);
  console.log('='.repeat(70));

  const SERPAPI_KEY = process.env.SERPAPI_KEY || process.env.SERPAPI_API_KEY;
  if (!SERPAPI_KEY) {
    console.log('⚠️  SERPAPI_KEY not set, skipping');
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
      const result = await searchBing(query.text, {
        location: 'India',
        credentials: { api_key: SERPAPI_KEY },
      });

      const timeMs = Date.now() - startTime;

      // Combine text for brand extraction
      let allText = '';
      for (const r of result.organic_results || []) {
        allText += ` ${r.title} ${r.snippet}`;
      }

      const brandMentions = extractBrandMentions(allText);
      const hasContent = (result.organic_results?.length || 0) > 0;

      if (hasContent) {
        const topBrands = brandMentions.slice(0, 2).map(b => b.brand).join(', ');
        console.log(`✓ (${(timeMs / 1000).toFixed(1)}s) [${result.organic_results?.length || 0} results] [${topBrands || 'no brands'}]`);
      } else {
        console.log(`✗ No results`);
      }

      results.push({
        queryIndex: i + 1,
        queryText: query.text,
        category: query.category,
        surface,
        status: hasContent ? 'complete' : 'failed',
        responseText: '',
        citations: [],
        organicResults: result.organic_results?.map(r => ({
          position: r.position,
          title: r.title,
          url: r.link,
          snippet: r.snippet,
        })),
        brandMentions,
        responseTimeMs: timeMs,
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

async function runAmazonIndiaSearch(): Promise<void> {
  const surface = 'amazon-india';
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
        domain: INDIA_LOCATION.oxylabs.domain,
        geo_location: INDIA_LOCATION.oxylabs.geo_location,
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
          snippet: `₹${r.price} | ${r.reviews_count || 0} reviews | ${r.rating || 0} stars`,
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

async function runChatGPTWithIndiaProxy(): Promise<void> {
  const surface = 'chatgpt';
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${surface.toUpperCase()} (via Browser Session - INDIA IP)`);
  console.log('='.repeat(70));

  if (!INDIA_PROXY_CONFIG) {
    console.log('⚠️  No India proxy configured. Set TWOCAPTCHA_API_KEY for India IP.');
    console.log('    Falling back to non-proxy ChatGPT...');
  }

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
  console.log('  INDIA VISIBILITY STUDY RUNNER');
  console.log('═'.repeat(70));
  console.log(`\n  Study: ${manifest.name}`);
  console.log(`  Study ID: ${STUDY_ID}`);
  console.log(`  Location: India (Mumbai)`);
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
  console.log(`    - Google Search (India): ${serpApiKey ? '✓' : '✗ (need SERPAPI_KEY)'}`);
  console.log(`    - Bing Search (India): ${serpApiKey ? '✓' : '✗ (need SERPAPI_KEY)'}`);
  console.log(`    - Amazon India: ${process.env.OXYLABS_USERNAME ? '✓' : '✗ (need OXYLABS_USERNAME/PASSWORD)'}`);
  console.log(`    - Perplexity: ${process.env.PERPLEXITY_API_KEY ? '✓' : '✗ (need PERPLEXITY_API_KEY)'}`);
  console.log(`    - ChatGPT (India Proxy): ${INDIA_PROXY_CONFIG ? '✓' : '✗ (need OXYLABS credentials)'}`);
  console.log(`    - ChatGPT Session: ${hasValidSession() ? '✓' : '✗ (run chatgpt-login.ts first)'}`);

  // Verify India IP if proxy is configured
  if (INDIA_PROXY_CONFIG) {
    console.log('\n  Verifying India IP via Oxylabs residential proxy...');
    const ipCheck = await verifyIndiaIP();
    if (ipCheck.success) {
      console.log(`    ✓ Connected from India: ${ipCheck.location} (${ipCheck.ip})`);
    } else {
      console.log(`    ✗ India IP verification failed: ${ipCheck.location}`);
      console.log('    Continuing with SerpAPI/Oxylabs location targeting...');
    }
  } else {
    console.log('\n  ⚠️  No India proxy configured for browser sessions.');
    console.log('     Using SerpAPI and Oxylabs built-in geo-targeting for India.');
  }

  const startTime = Date.now();

  // Run all surfaces
  await runGoogleSearchIndia();
  await runBingSearchIndia();
  await runAmazonIndiaSearch();
  await runPerplexity();
  await runChatGPTWithIndiaProxy();

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
