#!/usr/bin/env npx tsx
/**
 * Natural Balance US Visibility Study - API Surfaces
 * Runs Gemini API and Google AI Overview (SerpAPI) in parallel
 */

import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';

const OUTPUT_DIR = 'repository/results/glu/natural-balance-us-visibility';

const BRANDS_TO_TRACK = [
  'Natural Balance',
  'Blue Buffalo', 'Wellness', 'Merrick', 'Orijen', 'Acana',
  'Canidae', 'Nutro', 'Taste of the Wild', 'Fromm', 'Nulo',
  'Purina', 'Pedigree', 'Iams', "Hill's", 'Royal Canin', 'Rachael Ray',
  'Chewy', 'Petco', 'PetSmart', 'Amazon', 'Walmart', 'Target',
];

const QUERIES = [
  "What is the best dog food brand?",
  "best dry dog food 2026",
  "top rated dog food brands",
  "healthiest dog food options",
  "best dog food recommended by veterinarians",
  "premium dog food brands worth the money",
  "best natural dog food brands",
  "high quality dog food brands",
  "best dog food for the money",
  "what dog food do vets recommend most",
  "best affordable dog food that's still healthy",
  "dog food brands with best ingredients",
  "best American made dog food",
  "safest dog food brands 2026",
  "best dog food without fillers",
  "highest protein dog food brands",
  "best holistic dog food",
  "dog food brands that have never been recalled",
  "best organic dog food brands",
  "most nutritious dog food available",
  "best dog food for golden retrievers",
  "best dog food for german shepherds",
  "best dog food for labrador retrievers",
  "best dog food for french bulldogs",
  "best dog food for pitbulls",
  "best dog food for small breeds",
  "best dog food for large breed dogs",
  "best dog food for chihuahuas",
  "best dog food for huskies",
  "best dog food for beagles",
  "best dog food for poodles",
  "best dog food for bulldogs",
  "best dog food for dachshunds",
  "best dog food for rottweilers",
  "best dog food for boxers",
  "best dog food for allergies",
  "best dog food for sensitive stomach",
  "best dog food for dogs with skin issues",
  "best dog food for weight loss",
  "best dog food for joint health",
  "best limited ingredient dog food",
  "best grain free dog food",
  "best dog food for dogs with diabetes",
  "best dog food for dogs with kidney disease",
  "best hypoallergenic dog food",
  "best dog food for digestive issues",
  "best dog food for itchy skin",
  "best dog food for dogs with food sensitivities",
  "best dog food for heart health",
  "best single protein dog food",
  "best puppy food for large breeds",
  "best puppy food for small breeds",
  "best senior dog food",
  "best dog food for adult dogs",
  "when to switch from puppy food to adult food",
  "best puppy food 2026",
  "best food for senior dogs with sensitive stomachs",
  "best high calorie dog food for underweight dogs",
  "best dog food for active dogs",
  "best dog food for working dogs",
  "Blue Buffalo vs Purina Pro Plan",
  "Orijen vs Acana dog food",
  "Wellness vs Blue Buffalo",
  "Natural Balance vs Blue Buffalo",
  "Merrick vs Wellness dog food",
  "Royal Canin vs Hill's Science Diet",
  "Taste of the Wild vs Merrick",
  "Natural Balance vs Wellness",
  "Purina vs Iams dog food",
  "Canidae vs Orijen",
  "Natural Balance limited ingredient vs other LID brands",
  "is Blue Buffalo better than Natural Balance",
  "Nutro vs Natural Balance",
  "best limited ingredient dog food brands compared",
  "premium dog food brand comparison",
  "best dog treats for training",
  "healthiest dog treats",
  "best dental chews for dogs",
  "best natural dog treats",
  "best dog treats for sensitive stomachs",
  "best low calorie dog treats",
  "best grain free dog treats",
  "best dog treats for puppies",
  "best long lasting dog chews",
  "best single ingredient dog treats",
  "best cat food brands",
  "best wet cat food",
  "best dry cat food",
  "best cat food for indoor cats",
  "best cat food for sensitive stomach",
  "best grain free cat food",
  "best senior cat food",
  "best kitten food",
  "best limited ingredient cat food",
  "best natural cat food brands",
  "what ingredients to avoid in dog food",
  "is grain free dog food bad for dogs",
  "best protein sources for dog food",
  "how to read dog food labels",
  "what makes a dog food high quality",
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

async function callGemini(query: string): Promise<{ response: string; error?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { response: '', error: 'GEMINI_API_KEY not set' };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: query }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
        }),
      }
    );

    if (!response.ok) {
      return { response: '', error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return { response: text };
  } catch (error) {
    return { response: '', error: error instanceof Error ? error.message : String(error) };
  }
}

async function callSerpApi(query: string): Promise<{ response: string; error?: string }> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) return { response: '', error: 'SERPAPI_API_KEY not set' };

  try {
    const params = new URLSearchParams({
      q: query,
      api_key: apiKey,
      engine: 'google',
      location: 'United States',
      google_domain: 'google.com',
      gl: 'us',
      hl: 'en',
    });

    const response = await fetch(`https://serpapi.com/search?${params}`);
    if (!response.ok) {
      return { response: '', error: `HTTP ${response.status}` };
    }

    const data = await response.json();

    // Extract AI Overview if present
    const aiOverview = data.ai_overview;
    if (aiOverview) {
      let text = '';
      if (aiOverview.text_blocks) {
        text = aiOverview.text_blocks.map((b: any) => b.snippet || b.text || '').join(' ');
      }
      if (aiOverview.list_blocks) {
        for (const block of aiOverview.list_blocks) {
          if (block.list_items) {
            text += ' ' + block.list_items.map((i: any) => i.snippet || i.title || '').join(' ');
          }
        }
      }
      return { response: text.trim() };
    }

    return { response: '', error: 'No AI Overview' };
  } catch (error) {
    return { response: '', error: error instanceof Error ? error.message : String(error) };
  }
}

async function runSurface(
  surfaceName: string,
  surfaceId: string,
  callFn: (q: string) => Promise<{ response: string; error?: string }>
) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${surfaceName}`);
  console.log('='.repeat(70));

  const results: any[] = [];
  let successCount = 0;
  const brandCounts: Record<string, number> = {};

  for (let i = 0; i < QUERIES.length; i++) {
    const query = QUERIES[i];
    const startTime = Date.now();

    process.stdout.write(`[${i + 1}/${QUERIES.length}] "${query.slice(0, 45)}..." `);

    const { response, error } = await callFn(query);
    const responseTime = Date.now() - startTime;

    if (error || !response) {
      console.log(`❌ ${error || 'Empty response'}`);
      results.push({
        queryIndex: i,
        query,
        success: false,
        response: null,
        responseTimeMs: responseTime,
        brandMentions: [],
        error,
      });
    } else {
      const brandMentions = extractBrandMentions(response);
      successCount++;

      for (const m of brandMentions) {
        brandCounts[m.brand] = (brandCounts[m.brand] || 0) + 1;
      }

      const topBrands = brandMentions.slice(0, 3).map(b => b.brand).join(', ');
      console.log(`✅ (${Math.round(responseTime / 1000)}s) [${topBrands || 'no brands'}]`);

      results.push({
        queryIndex: i,
        query,
        success: true,
        response,
        responseTimeMs: responseTime,
        brandMentions,
      });
    }

    if ((i + 1) % 10 === 0) {
      console.log(`  💾 Progress saved (${i + 1}/${QUERIES.length})`);
    }

    // Rate limiting
    await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
  }

  // Save results
  const outputFile = `${OUTPUT_DIR}/${surfaceId}-results.json`;
  const output = {
    studyName: `Natural Balance US Visibility Study - ${surfaceName}`,
    surface: surfaceId,
    location: 'United States',
    startTime: new Date().toISOString(),
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
              percentOfQueries: ((count / successCount) * 100).toFixed(1) + '%',
            },
          ])
      ),
    },
  };

  writeFileSync(outputFile, JSON.stringify(output, null, 2));
  console.log(`\n✅ ${surfaceName}: ${successCount}/${QUERIES.length} successful`);
  console.log(`   Saved to: ${outputFile}`);

  return { surfaceId, successCount, brandCounts };
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  NATURAL BALANCE US VISIBILITY STUDY - API Surfaces');
  console.log('='.repeat(70));

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Check API keys
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasSerpApi = !!process.env.SERPAPI_API_KEY;

  console.log(`\nAPI Keys:`);
  console.log(`  GEMINI_API_KEY: ${hasGemini ? '✅' : '❌ Missing'}`);
  console.log(`  SERPAPI_API_KEY: ${hasSerpApi ? '✅' : '❌ Missing'}`);

  const surfacesToRun: { name: string; id: string; fn: typeof callGemini }[] = [];

  if (hasGemini) {
    surfacesToRun.push({ name: 'Google Gemini API', id: 'gemini-api', fn: callGemini });
  }
  if (hasSerpApi) {
    surfacesToRun.push({ name: 'Google AI Overview (SerpAPI)', id: 'google-ai-overview', fn: callSerpApi });
  }

  if (surfacesToRun.length === 0) {
    console.error('\n❌ No API keys available');
    process.exit(1);
  }

  const allResults = [];

  for (const surface of surfacesToRun) {
    const result = await runSurface(surface.name, surface.id, surface.fn);
    allResults.push(result);
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));

  for (const r of allResults) {
    console.log(`\n${r.surfaceId}:`);
    console.log(`  Success: ${r.successCount}/${QUERIES.length}`);
    console.log(`  Top brands:`);
    const sorted = Object.entries(r.brandCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    for (const [brand, count] of sorted) {
      const isClient = brand === 'Natural Balance';
      console.log(`    - ${brand}: ${count} queries${isClient ? ' ← CLIENT' : ''}`);
    }
  }

  console.log(`\n✅ All API surfaces complete!`);
}

main().catch(console.error);
