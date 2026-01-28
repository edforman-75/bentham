#!/usr/bin/env npx tsx
/**
 * TASC Performance Visibility Study - SerpAPI Surfaces
 * Runs Google AI Overview, Google Organic, and Bing Search via SerpAPI
 */

import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const SERPAPI_KEY = process.env.SERPAPI_KEY;
const OUTPUT_DIR = 'packages/visibility-tool/results/tasc-visibility-study';
const MANIFEST_PATH = process.argv[2] || '/Users/edf/Downloads/tasc-visibility-study.json';

if (!SERPAPI_KEY) {
  console.error('❌ SERPAPI_KEY not found in environment');
  process.exit(1);
}

// Load manifest
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
const QUERIES = manifest.queries.map((q: { text: string; category: string }) => ({
  text: q.text,
  category: q.category,
}));

// Brands to track
const BRANDS_TO_TRACK = [
  'TASC', 'TASC Performance',
  'Lululemon', 'Vuori', 'Cotopaxi',
  'Rhone', 'Nike', 'Under Armour', 'Free Fly', 'Cariloha',
  'Ibex', 'Allbirds', 'BAM', 'Boody', 'Bamtech',
  'Everlane', 'Patagonia', 'Girlfriend Collective',
  'Amazon', 'Nordstrom', 'REI',
];

function extractBrandMentions(text: string): { brand: string; count: number }[] {
  const mentions: { brand: string; count: number }[] = [];
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
      mentions.push({ brand, count });
    }
  }

  return mentions.sort((a, b) => b.count - a.count);
}

interface SerpAPIResponse {
  search_metadata?: { status: string };
  ai_overview?: {
    text?: string;
    text_blocks?: Array<{ type: string; text?: string; snippet?: string }>;
  };
  answer_box?: {
    snippet?: string;
    answer?: string;
    contents?: { parts?: Array<{ text?: string }> };
  };
  knowledge_graph?: { description?: string };
  organic_results?: Array<{ title: string; link: string; snippet?: string; position?: number }>;
}

async function searchGoogle(query: string): Promise<{ aiOverview: string; organic: any[] }> {
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
    throw new Error(`SerpAPI error: ${response.status}`);
  }

  const data: SerpAPIResponse = await response.json();

  // Extract AI Overview
  let aiOverview = '';
  if (data.ai_overview?.text) {
    aiOverview = data.ai_overview.text;
  } else if (data.ai_overview?.text_blocks) {
    aiOverview = data.ai_overview.text_blocks
      .filter(block => block.text || block.snippet)
      .map(block => block.text || block.snippet)
      .join('\n');
  } else if (data.answer_box?.snippet || data.answer_box?.answer) {
    aiOverview = data.answer_box.snippet || data.answer_box.answer || '';
  } else if (data.knowledge_graph?.description) {
    aiOverview = data.knowledge_graph.description;
  }

  // Extract organic results
  const organic = (data.organic_results || []).slice(0, 10).map(r => ({
    position: r.position,
    title: r.title || '',
    link: r.link || '',
    snippet: r.snippet || '',
  }));

  return { aiOverview, organic };
}

async function searchBing(query: string): Promise<{ organic: any[] }> {
  const params = new URLSearchParams({
    q: query,
    api_key: SERPAPI_KEY!,
    engine: 'bing',
    cc: 'US',
  });

  const response = await fetch(`https://serpapi.com/search?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`SerpAPI Bing error: ${response.status}`);
  }

  const data = await response.json();

  const organic = (data.organic_results || []).slice(0, 10).map((r: any) => ({
    position: r.position,
    title: r.title || '',
    link: r.link || '',
    snippet: r.snippet || '',
  }));

  return { organic };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runSurface(surfaceName: string, searchFn: (query: string) => Promise<any>) {
  const outputFile = `${OUTPUT_DIR}/${surfaceName}-results.json`;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  TASC VISIBILITY STUDY - ${surfaceName.toUpperCase()}`);
  console.log('='.repeat(70));

  // Load existing results if any
  let results: any[] = [];
  let startIndex = 0;

  if (fs.existsSync(outputFile)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
      results = existing.results || [];
      startIndex = results.length;
      console.log(`\n📂 Resuming from query ${startIndex + 1}...`);
    } catch {
      console.log('\nStarting fresh');
    }
  }

  let successCount = results.filter(r => r.status === 'complete').length;
  const brandCounts: Record<string, number> = {};

  // Initialize brand counts from existing results
  for (const r of results) {
    if (r.status === 'complete' && r.brandMentions) {
      for (const m of r.brandMentions) {
        brandCounts[m.brand] = (brandCounts[m.brand] || 0) + 1;
      }
    }
  }

  console.log('-'.repeat(70));

  for (let i = startIndex; i < QUERIES.length; i++) {
    const query = QUERIES[i];
    const startTime = Date.now();

    process.stdout.write(`  [${i + 1}/${QUERIES.length}] "${query.text.slice(0, 40)}..."  `);

    try {
      const result = await searchFn(query.text);
      const timeMs = Date.now() - startTime;

      // Combine all text for brand mention extraction
      let allText = '';
      if (result.aiOverview) allText += result.aiOverview + ' ';
      if (result.organic) {
        for (const r of result.organic) {
          allText += (r.title || '') + ' ' + (r.snippet || '') + ' ';
        }
      }

      const brandMentions = extractBrandMentions(allText);
      for (const m of brandMentions) {
        brandCounts[m.brand] = (brandCounts[m.brand] || 0) + 1;
      }

      const hasContent = result.aiOverview?.length > 20 || result.organic?.length > 0;

      if (hasContent) {
        successCount++;
        const topBrands = brandMentions.slice(0, 2).map(b => b.brand).join(', ');
        console.log(`✓ (${(timeMs / 1000).toFixed(1)}s) [${topBrands || 'no brands'}]`);
      } else {
        console.log(`✗ No results`);
      }

      results.push({
        queryIndex: i + 1,
        queryText: query.text,
        category: query.category,
        surfaceId: surfaceName,
        status: hasContent ? 'complete' : 'failed',
        responseText: result.aiOverview || '',
        organicResults: result.organic || [],
        brandMentions,
        responseTimeMs: timeMs,
      });

    } catch (error) {
      console.log(`✗ Error: ${error}`);
      results.push({
        queryIndex: i + 1,
        queryText: query.text,
        category: query.category,
        surfaceId: surfaceName,
        status: 'failed',
        responseTimeMs: Date.now() - startTime,
        error: String(error),
      });
    }

    // Save progress every 10 queries
    if ((i + 1) % 10 === 0 || i === QUERIES.length - 1) {
      const output = {
        timestamp: new Date().toISOString(),
        studyName: `TASC Performance Visibility Study - ${surfaceName}`,
        surface: surfaceName,
        summary: {
          total: QUERIES.length,
          successful: successCount,
          failed: results.length - successCount,
        },
        analysis: {
          brandVisibility: Object.fromEntries(
            Object.entries(brandCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([brand, count]) => [
                brand,
                {
                  queriesAppearing: count,
                  percentOfQueries: successCount > 0 ? ((count / successCount) * 100).toFixed(1) + '%' : '0%',
                },
              ])
          ),
        },
        results,
      };
      fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
    }

    // Rate limit
    await delay(1500);
  }

  console.log('\n' + '='.repeat(70));
  console.log(`  ${surfaceName.toUpperCase()} COMPLETE`);
  console.log('='.repeat(70));
  console.log(`\n  Total: ${QUERIES.length}`);
  console.log(`  Successful: ${successCount}`);
  console.log(`  Results saved to: ${outputFile}`);

  console.log('\n  Top brands:');
  const sorted = Object.entries(brandCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [brand, count] of sorted) {
    const isClient = brand.toLowerCase().includes('tasc');
    console.log(`    - ${brand}: ${count}${isClient ? ' ← CLIENT' : ''}`);
  }

  return { successCount, results };
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log(`\nLoaded ${QUERIES.length} queries from manifest\n`);

  // Run Google AI Overview + Organic
  await runSurface('google-ai-overview', async (query) => {
    const result = await searchGoogle(query);
    return result;
  });

  // Run Google Organic (same search, different output focus)
  await runSurface('google-organic', async (query) => {
    const result = await searchGoogle(query);
    return { organic: result.organic };
  });

  // Run Bing Search
  await runSurface('bing-search', searchBing);

  console.log('\n\n' + '='.repeat(70));
  console.log('  ALL SERPAPI SURFACES COMPLETE');
  console.log('='.repeat(70) + '\n');
}

main().catch(console.error);
