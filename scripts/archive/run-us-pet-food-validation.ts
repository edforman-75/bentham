#!/usr/bin/env npx tsx
/**
 * US Pet Food Validation Study - Lights Out Runner
 *
 * Runs the API-based surfaces (OpenAI API, Gemini API, Google AI Overview)
 * to validate whether India study patterns generalize to the US.
 *
 * Surfaces that can run lights-out:
 * - OpenAI API (Chat Completions)
 * - Gemini API
 * - Google AI Overview (SerpAPI)
 *
 * Surfaces requiring manual intervention:
 * - ChatGPT Web (browser automation)
 *
 * Usage:
 *   npx tsx scripts/run-us-pet-food-validation.ts [surface]
 *
 * Examples:
 *   npx tsx scripts/run-us-pet-food-validation.ts           # Run all lights-out surfaces
 *   npx tsx scripts/run-us-pet-food-validation.ts openai    # Run OpenAI API only
 *   npx tsx scripts/run-us-pet-food-validation.ts gemini    # Run Gemini API only
 *   npx tsx scripts/run-us-pet-food-validation.ts google    # Run Google AI Overview only
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Configuration
// ============================================================================

const MANIFEST_PATH = 'repository/manifests/glu/us-pet-food-validation/manifest.yaml';
const QUERIES_PATH = 'repository/manifests/glu/us-pet-food-validation/queries.yaml';
const OUTPUT_DIR = 'repository/results/glu/us-pet-food-validation';

// Brands to track (from queries.yaml)
const BRANDS_TO_TRACK = [
  // Major US Pet Food Brands
  "Blue Buffalo", "Purina", "Hill's", "Royal Canin", "Wellness",
  "Iams", "Pedigree", "Nutro", "Merrick", "Orijen", "Acana",
  "Taste of the Wild", "Canidae", "Rachael Ray", "Natural Balance",
  // Retailers
  "Chewy", "Petco", "PetSmart", "Amazon", "Walmart",
  // India brands (for comparison)
  "Heads Up For Tails", "HUFT", "Supertails", "Drools", "Farmina"
];

// ============================================================================
// Types
// ============================================================================

interface QueryResult {
  queryIndex: number;
  queryId: string;
  queryText: string;
  category: string;
  surface: string;
  timestamp: string;
  success: boolean;
  responseText: string | null;
  responseTimeMs: number;
  error?: string;
  brandMentions: Array<{ brand: string; count: number }>;
}

interface SurfaceResults {
  surfaceId: string;
  surfaceName: string;
  startTime: string;
  endTime?: string;
  totalQueries: number;
  successCount: number;
  results: QueryResult[];
  brandSummary: Record<string, number>;
}

// ============================================================================
// Utilities
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function extractBrandMentions(text: string): Array<{ brand: string; count: number }> {
  const mentions: Array<{ brand: string; count: number }> = [];
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

function loadQueries(): Array<{ id: string; text: string; category: string }> {
  // Hardcoded queries for US Pet Food Validation Study
  return [
    { id: "q01", text: "Which are the best budget dog food brands online?", category: "dog-food" },
    { id: "q02", text: "Can you suggest the best treat brands for dogs online?", category: "dog-treats" },
    { id: "q03", text: "Which are the best dog food brands with high reviews?", category: "dog-food" },
    { id: "q04", text: "Which are the best dog food brands recommended by vets?", category: "dog-food" },
    { id: "q05", text: "Can you list a popular pet food brand with good meat content?", category: "dog-food" },
    { id: "q06", text: "Which brands offer gluten-free dog treats my dog will enjoy?", category: "dog-treats" },
    { id: "q07", text: "Can you suggest the best dog biscuit brands for dogs with sensitive stomachs?", category: "dog-treats" },
    { id: "q08", text: "Which are the top healthy vegetarian dog biscuit brands available online?", category: "dog-treats" },
    { id: "q09", text: "What are the best-tasting treat brands for dogs under $20?", category: "dog-treats" },
    { id: "q10", text: "Which brands offer low-calorie chicken dog treats?", category: "dog-treats" },
    { id: "q11", text: "Which are the best dog treat brands for medium-sized dogs?", category: "dog-treats" },
    { id: "q12", text: "Blue Buffalo vs Purina which is better for dogs?", category: "comparison" },
    { id: "q13", text: "Which brands offer the highest-rated gluten-free chicken dog biscuits?", category: "dog-treats" },
    { id: "q14", text: "Can you suggest trusted brands that make healthy dog treats for puppies online?", category: "dog-treats" },
    { id: "q15", text: "Which are the most recommended brands for crunchy dog biscuits for adult dogs?", category: "dog-treats" },
    { id: "q16", text: "Which brand makes the most comfortable dog beds for small dogs?", category: "accessories" },
    { id: "q17", text: "What's a trusted brand that offers interactive dog toys for large dogs?", category: "accessories" },
    { id: "q18", text: "Which company has the best chew toys for small dogs that last long?", category: "accessories" },
    { id: "q19", text: "Can you suggest a reliable brand that sells dog harnesses for puppies?", category: "accessories" },
    { id: "q20", text: "What are the best wet cat food brands in the US?", category: "cat-food" },
  ];
}

// ============================================================================
// API Callers
// ============================================================================

async function callOpenAI(query: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: query }],
      max_tokens: 2000
    })
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message);
  }
  return data.choices[0].message.content;
}

async function callGemini(query: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: query }] }],
        generationConfig: { maxOutputTokens: 2000 }
      })
    }
  );

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message);
  }
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callSerpApi(query: string): Promise<{ text: string; sources: string[] }> {
  const params = new URLSearchParams({
    api_key: process.env.SERPAPI_KEY!,
    engine: 'google',
    q: query,
    location: 'United States',
    google_domain: 'google.com',
    gl: 'us',
    hl: 'en',
    num: '20'
  });

  const response = await fetch(`https://serpapi.com/search.json?${params}`);
  const data = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  // Extract AI Overview text
  let aiOverviewText = '';
  const sources: string[] = [];

  if (data.ai_overview) {
    if (data.ai_overview.text_blocks) {
      const textParts: string[] = [];
      for (const block of data.ai_overview.text_blocks) {
        if (block.snippet) {
          textParts.push(block.snippet);
        }
        if (block.list && Array.isArray(block.list)) {
          for (const item of block.list) {
            if (typeof item === 'string') {
              textParts.push(`- ${item}`);
            } else if (item.snippet) {
              textParts.push(`- ${item.snippet}`);
            }
          }
        }
      }
      aiOverviewText = textParts.join('\n');
    } else if (data.ai_overview.text) {
      aiOverviewText = data.ai_overview.text;
    }

    // Extract sources
    const refs = data.ai_overview.references || data.ai_overview.sources || [];
    for (const ref of refs) {
      sources.push(ref.link || ref.url || '');
    }
  }

  return { text: aiOverviewText, sources };
}

// ============================================================================
// Surface Runners
// ============================================================================

async function runSurface(
  surfaceId: string,
  surfaceName: string,
  queries: Array<{ id: string; text: string; category: string }>,
  caller: (query: string) => Promise<string | { text: string; sources: string[] }>
): Promise<SurfaceResults> {
  console.log('\n' + '═'.repeat(70));
  console.log(`  ${surfaceName.toUpperCase()}`);
  console.log('═'.repeat(70));

  const results: QueryResult[] = [];
  const startTime = new Date().toISOString();
  let successCount = 0;

  // Check for existing progress
  const progressFile = path.join(OUTPUT_DIR, `${surfaceId}-progress.json`);
  let startIndex = 0;

  if (fs.existsSync(progressFile)) {
    const existing = JSON.parse(fs.readFileSync(progressFile, 'utf-8'));
    results.push(...existing.results);
    startIndex = existing.results.length;
    successCount = existing.results.filter((r: QueryResult) => r.success).length;
    console.log(`\n📂 Resuming from query ${startIndex + 1}...\n`);
  }

  for (let i = startIndex; i < queries.length; i++) {
    const query = queries[i];
    const queryStart = Date.now();

    console.log(`[${i + 1}/${queries.length}] "${query.text.substring(0, 50)}..."`);

    try {
      const response = await caller(query.text);
      const responseText = typeof response === 'string' ? response : response.text;
      const duration = Date.now() - queryStart;

      const brandMentions = extractBrandMentions(responseText);

      results.push({
        queryIndex: i + 1,
        queryId: query.id,
        queryText: query.text,
        category: query.category,
        surface: surfaceId,
        timestamp: new Date().toISOString(),
        success: true,
        responseText,
        responseTimeMs: duration,
        brandMentions
      });

      successCount++;

      const topBrands = brandMentions.slice(0, 3).map(b => b.brand).join(', ') || 'None';
      console.log(`  ✅ (${duration}ms) Brands: ${topBrands}`);

    } catch (error) {
      results.push({
        queryIndex: i + 1,
        queryId: query.id,
        queryText: query.text,
        category: query.category,
        surface: surfaceId,
        timestamp: new Date().toISOString(),
        success: false,
        responseText: null,
        responseTimeMs: Date.now() - queryStart,
        error: String(error),
        brandMentions: []
      });

      console.log(`  ❌ Error: ${error}`);
    }

    // Save progress every 5 queries
    if ((i + 1) % 5 === 0 || i === queries.length - 1) {
      const progress = {
        surfaceId,
        surfaceName,
        startTime,
        lastUpdate: new Date().toISOString(),
        totalQueries: queries.length,
        completedQueries: results.length,
        successCount,
        results
      };
      fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
      console.log(`  💾 Progress saved (${results.length}/${queries.length})`);
    }

    // Rate limiting
    if (i < queries.length - 1) {
      const delay = randomDelay(2000, 4000);
      await sleep(delay);
    }
  }

  // Calculate brand summary
  const brandSummary: Record<string, number> = {};
  for (const result of results) {
    for (const mention of result.brandMentions) {
      brandSummary[mention.brand] = (brandSummary[mention.brand] || 0) + mention.count;
    }
  }

  // Clean up progress file
  if (fs.existsSync(progressFile)) {
    fs.unlinkSync(progressFile);
  }

  return {
    surfaceId,
    surfaceName,
    startTime,
    endTime: new Date().toISOString(),
    totalQueries: queries.length,
    successCount,
    results,
    brandSummary
  };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const targetSurface = process.argv[2]?.toLowerCase();

  console.log('\n' + '═'.repeat(70));
  console.log('  US PET FOOD VALIDATION STUDY');
  console.log('  Testing API vs Web Surface Patterns');
  console.log('═'.repeat(70));

  // Check API keys
  const missingKeys: string[] = [];
  if (!process.env.OPENAI_API_KEY && (!targetSurface || targetSurface === 'openai')) {
    missingKeys.push('OPENAI_API_KEY');
  }
  if (!process.env.GEMINI_API_KEY && (!targetSurface || targetSurface === 'gemini')) {
    missingKeys.push('GEMINI_API_KEY');
  }
  if (!process.env.SERPAPI_KEY && (!targetSurface || targetSurface === 'google')) {
    missingKeys.push('SERPAPI_KEY');
  }

  if (missingKeys.length > 0) {
    console.error(`\n❌ Missing API keys: ${missingKeys.join(', ')}`);
    console.error('Set them in .env file');
    process.exit(1);
  }

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Load queries
  const queries = loadQueries();
  console.log(`\nLoaded ${queries.length} queries`);
  console.log(`Tracking ${BRANDS_TO_TRACK.length} brands`);

  const allResults: SurfaceResults[] = [];

  // Run surfaces
  const surfacesToRun = {
    openai: {
      id: 'openai-api',
      name: 'OpenAI GPT-4o API',
      caller: callOpenAI
    },
    gemini: {
      id: 'gemini-api',
      name: 'Google Gemini API',
      caller: async (q: string) => callGemini(q)
    },
    google: {
      id: 'google-ai-overview',
      name: 'Google AI Overview (SerpAPI)',
      caller: async (q: string) => {
        const result = await callSerpApi(q);
        return result.text || '[No AI Overview]';
      }
    }
  };

  if (targetSurface && targetSurface in surfacesToRun) {
    // Run single surface
    const surface = surfacesToRun[targetSurface as keyof typeof surfacesToRun];
    const results = await runSurface(surface.id, surface.name, queries, surface.caller);
    allResults.push(results);
  } else if (!targetSurface) {
    // Run all surfaces
    for (const [key, surface] of Object.entries(surfacesToRun)) {
      try {
        const results = await runSurface(surface.id, surface.name, queries, surface.caller);
        allResults.push(results);

        // Save individual surface results
        const outputPath = path.join(OUTPUT_DIR, `${surface.id}-results.json`);
        fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
        console.log(`\n📁 Saved to ${outputPath}`);

      } catch (error) {
        console.error(`\n❌ Failed to run ${surface.name}: ${error}`);
      }
    }
  } else {
    console.error(`\n❌ Unknown surface: ${targetSurface}`);
    console.error('Valid options: openai, gemini, google');
    process.exit(1);
  }

  // Save combined results
  if (allResults.length > 0) {
    const combinedPath = path.join(OUTPUT_DIR, 'combined-results.json');
    fs.writeFileSync(combinedPath, JSON.stringify({
      studyName: 'US Pet Food Validation Study',
      timestamp: new Date().toISOString(),
      surfaces: allResults,
      comparison: generateComparison(allResults)
    }, null, 2));

    // Print summary
    console.log('\n' + '═'.repeat(70));
    console.log('  STUDY COMPLETE');
    console.log('═'.repeat(70));

    for (const result of allResults) {
      console.log(`\n${result.surfaceName}:`);
      console.log(`  Success: ${result.successCount}/${result.totalQueries}`);
      console.log(`  Top brands:`);
      const sorted = Object.entries(result.brandSummary)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);
      for (const [brand, count] of sorted) {
        console.log(`    - ${brand}: ${count} mentions`);
      }
    }

    console.log(`\n📁 Combined results: ${combinedPath}`);
  }

  console.log('\n✅ Study complete!');
  console.log('\n📝 Note: ChatGPT Web requires manual browser collection.');
  console.log('   See repository/manifests/glu/us-pet-food-validation/manifest.yaml');
}

function generateComparison(results: SurfaceResults[]): Record<string, unknown> {
  const comparison: Record<string, unknown> = {};

  // Brand mention totals by surface
  const brandTotals: Record<string, Record<string, number>> = {};
  for (const result of results) {
    brandTotals[result.surfaceId] = result.brandSummary;
  }
  comparison.brandMentionsBySurface = brandTotals;

  // Calculate deltas if we have both API and comparable surfaces
  const openai = results.find(r => r.surfaceId === 'openai-api');
  const gemini = results.find(r => r.surfaceId === 'gemini-api');
  const googleAio = results.find(r => r.surfaceId === 'google-ai-overview');

  if (gemini && googleAio) {
    const geminiVsGoogle: Record<string, number> = {};
    const allBrands = new Set([
      ...Object.keys(gemini.brandSummary),
      ...Object.keys(googleAio.brandSummary)
    ]);
    for (const brand of allBrands) {
      const geminiCount = gemini.brandSummary[brand] || 0;
      const googleCount = googleAio.brandSummary[brand] || 0;
      geminiVsGoogle[brand] = googleCount - geminiCount;
    }
    comparison.geminiApiVsGoogleAio = geminiVsGoogle;
  }

  return comparison;
}

main().catch(console.error);
