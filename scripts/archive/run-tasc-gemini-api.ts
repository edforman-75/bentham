#!/usr/bin/env npx tsx
/**
 * TASC Performance Visibility Study - Google Gemini API
 */

import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY;
const OUTPUT_DIR = 'packages/visibility-tool/results/tasc-visibility-study';
const OUTPUT_FILE = `${OUTPUT_DIR}/gemini-api-results.json`;
const INTERMEDIATE_FILE = `${OUTPUT_DIR}/gemini-api-intermediate.json`;
const MANIFEST_PATH = process.argv[2] || '/Users/edf/Downloads/tasc-visibility-study.json';

if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY or GOOGLE_AI_KEY not found in environment');
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

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: { message?: string };
}

async function queryGemini(query: string): Promise<{ text: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: query }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data: GeminiResponse = await response.json();

  if (data.error) {
    throw new Error(data.error.message || 'Gemini API error');
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return { text };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  TASC VISIBILITY STUDY - GEMINI API');
  console.log('='.repeat(70));
  console.log(`\nLoaded ${QUERIES.length} queries\n`);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Load existing results if any
  let results: any[] = [];
  let startIndex = 0;

  if (fs.existsSync(INTERMEDIATE_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(INTERMEDIATE_FILE, 'utf-8'));
      results = existing.results || [];
      startIndex = results.length;
      console.log(`📂 Resuming from query ${startIndex + 1}...`);
    } catch {
      console.log('Starting fresh');
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

    process.stdout.write(`[${i + 1}/${QUERIES.length}] "${query.text.slice(0, 40)}..."  `);

    try {
      const result = await queryGemini(query.text);
      const timeMs = Date.now() - startTime;

      const brandMentions = extractBrandMentions(result.text);
      for (const m of brandMentions) {
        brandCounts[m.brand] = (brandCounts[m.brand] || 0) + 1;
      }

      successCount++;
      const topBrands = brandMentions.slice(0, 3).map(b => b.brand).join(', ');
      console.log(`✅ (${(timeMs / 1000).toFixed(0)}s) [${topBrands || 'no brands'}]`);

      results.push({
        queryIndex: i + 1,
        queryText: query.text,
        category: query.category,
        surfaceId: 'gemini-api',
        status: 'complete',
        responseText: result.text,
        brandMentions,
        responseTimeMs: timeMs,
      });

    } catch (error) {
      console.log(`❌ ${error}`);
      results.push({
        queryIndex: i + 1,
        queryText: query.text,
        category: query.category,
        surfaceId: 'gemini-api',
        status: 'failed',
        responseTimeMs: Date.now() - startTime,
        error: String(error),
      });
    }

    // Save progress every 10 queries
    if ((i + 1) % 10 === 0 || i === QUERIES.length - 1) {
      const output = {
        timestamp: new Date().toISOString(),
        studyName: 'TASC Performance Visibility Study - Gemini API',
        surface: 'gemini-api',
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
      fs.writeFileSync(INTERMEDIATE_FILE, JSON.stringify(output, null, 2));
      console.log(`  💾 Progress saved (${i + 1}/${QUERIES.length})`);
    }

    // Rate limit
    await delay(500);
  }

  // Final save
  const finalOutput = {
    timestamp: new Date().toISOString(),
    studyName: 'TASC Performance Visibility Study - Gemini API',
    surface: 'gemini-api',
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
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalOutput, null, 2));

  // Cleanup intermediate file
  if (fs.existsSync(INTERMEDIATE_FILE)) {
    fs.unlinkSync(INTERMEDIATE_FILE);
  }

  console.log('\n' + '='.repeat(70));
  console.log('  GEMINI API COMPLETE');
  console.log('='.repeat(70));
  console.log(`\n  Total: ${QUERIES.length}`);
  console.log(`  Successful: ${successCount}`);
  console.log(`  Results saved to: ${OUTPUT_FILE}`);

  console.log('\n  Top brands:');
  const sorted = Object.entries(brandCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [brand, count] of sorted) {
    const isClient = brand.toLowerCase().includes('tasc');
    console.log(`    - ${brand}: ${count}${isClient ? ' ← CLIENT' : ''}`);
  }
}

main().catch(console.error);
