#!/usr/bin/env npx tsx
/**
 * TASC Performance Visibility Study - Perplexity API Surface
 */

import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';

const OUTPUT_DIR = 'packages/visibility-tool/results/tasc-visibility-study';
const OUTPUT_FILE = `${OUTPUT_DIR}/perplexity-api-results.json`;
const MANIFEST_PATH = process.argv[2] || '/Users/edf/Downloads/tasc-visibility-study.json';

// Load manifest
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
const QUERIES = manifest.queries.map((q: { text: string }) => q.text);

// Brands to track (from manifest + competitors)
const BRANDS_TO_TRACK = [
  // Primary brand
  'TASC', 'TASC Performance',

  // Competitors from manifest
  'Lululemon', 'Vuori', 'Cotopaxi',

  // Other competitors mentioned in queries
  'Rhone', 'Nike', 'Under Armour', 'Free Fly', 'Cariloha',
  'Ibex', 'Allbirds', 'BAM', 'Boody', 'Bamtech',
  'Everlane', 'Patagonia', 'Girlfriend Collective',

  // Retailers
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

async function callPerplexity(query: string, apiKey: string): Promise<{ response: string; citations?: string[]; error?: string }> {
  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{ role: 'user', content: query }],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { response: '', error: errorData.error?.message || `HTTP ${response.status}` };
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const citations = data.citations || [];
    return { response: text, citations };
  } catch (error) {
    return { response: '', error: error instanceof Error ? error.message : String(error) };
  }
}

async function main() {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.error('PERPLEXITY_API_KEY not set');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(70));
  console.log('  TASC PERFORMANCE VISIBILITY STUDY - Perplexity API (Sonar)');
  console.log('='.repeat(70));

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Load existing results if resuming
  let results: any[] = [];
  let startIndex = 0;

  if (existsSync(OUTPUT_FILE)) {
    try {
      const existing = JSON.parse(readFileSync(OUTPUT_FILE, 'utf-8'));
      results = existing.results || [];
      startIndex = results.length;
      console.log(`\nResuming from query ${startIndex + 1}...`);
    } catch {
      console.log('\nStarting fresh');
    }
  }

  let successCount = results.filter(r => r.success).length;
  const brandCounts: Record<string, number> = {};

  // Initialize brand counts from existing results
  for (const r of results) {
    if (r.success && r.brandMentions) {
      for (const m of r.brandMentions) {
        brandCounts[m.brand] = (brandCounts[m.brand] || 0) + 1;
      }
    }
  }

  for (let i = startIndex; i < QUERIES.length; i++) {
    const query = QUERIES[i];
    const startTime = Date.now();

    process.stdout.write(`[${i + 1}/${QUERIES.length}] "${query.slice(0, 45)}..." `);

    const { response, citations, error } = await callPerplexity(query, apiKey);
    const responseTime = Date.now() - startTime;

    if (error || !response) {
      console.log(`[FAIL] ${error || 'Empty response'}`);
      results.push({
        queryIndex: i,
        query,
        success: false,
        response: null,
        responseTimeMs: responseTime,
        brandMentions: [],
        error,
      });

      // If rate limited, wait and retry
      if (error?.includes('rate') || error?.includes('429')) {
        console.log('  Rate limited - waiting 30s...');
        await new Promise(r => setTimeout(r, 30000));
      }
    } else {
      const brandMentions = extractBrandMentions(response);
      successCount++;

      for (const m of brandMentions) {
        brandCounts[m.brand] = (brandCounts[m.brand] || 0) + 1;
      }

      const topBrands = brandMentions.slice(0, 3).map(b => b.brand).join(', ');
      console.log(`[OK] (${Math.round(responseTime / 1000)}s) [${topBrands || 'no brands'}]`);

      results.push({
        queryIndex: i,
        query,
        success: true,
        response,
        citations,
        responseTimeMs: responseTime,
        brandMentions,
      });
    }

    // Save progress every 10 queries
    if ((i + 1) % 10 === 0 || i === QUERIES.length - 1) {
      const output = {
        studyName: 'TASC Performance Visibility Study - Perplexity API',
        surface: 'perplexity-api',
        location: 'United States',
        timestamp: new Date().toISOString(),
        totalQueries: QUERIES.length,
        successfulQueries: successCount,
        results,
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
      };
      writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
      console.log(`  [SAVE] Progress saved (${i + 1}/${QUERIES.length})`);
    }

    // Rate limiting - Perplexity has stricter limits
    await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
  }

  console.log('\n' + '='.repeat(70));
  console.log('  COMPLETE');
  console.log('='.repeat(70));
  console.log(`\nSuccess: ${successCount}/${QUERIES.length}`);
  console.log(`Saved to: ${OUTPUT_FILE}`);

  console.log('\nTop brands:');
  const sorted = Object.entries(brandCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [brand, count] of sorted) {
    const isClient = brand.toLowerCase().includes('tasc');
    console.log(`  - ${brand}: ${count} queries${isClient ? ' <- CLIENT' : ''}`);
  }
}

main().catch(console.error);
