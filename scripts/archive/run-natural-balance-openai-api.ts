#!/usr/bin/env npx tsx
/**
 * Natural Balance US Visibility Study - OpenAI API Surface
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';

const OUTPUT_DIR = 'repository/results/glu/natural-balance-us-visibility';
const OUTPUT_FILE = `${OUTPUT_DIR}/openai-api-results.json`;

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

async function callOpenAI(query: string, apiKey: string): Promise<{ response: string; error?: string }> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: query }],
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { response: '', error: errorData.error?.message || `HTTP ${response.status}` };
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    return { response: text };
  } catch (error) {
    return { response: '', error: error instanceof Error ? error.message : String(error) };
  }
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY not set');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(70));
  console.log('  NATURAL BALANCE US VISIBILITY STUDY - OpenAI GPT-4o API');
  console.log('='.repeat(70));

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const results: any[] = [];
  let successCount = 0;
  const brandCounts: Record<string, number> = {};

  for (let i = 0; i < QUERIES.length; i++) {
    const query = QUERIES[i];
    const startTime = Date.now();

    process.stdout.write(`[${i + 1}/${QUERIES.length}] "${query.slice(0, 45)}..." `);

    const { response, error } = await callOpenAI(query, apiKey);
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

      // If quota exceeded, stop
      if (error?.includes('quota') || error?.includes('exceeded')) {
        console.log('\n❌ Quota exceeded - stopping');
        break;
      }
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
    await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
  }

  // Save results
  const output = {
    studyName: 'Natural Balance US Visibility Study - OpenAI GPT-4o API',
    surface: 'openai-api',
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

  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  console.log('\n' + '='.repeat(70));
  console.log('  COMPLETE');
  console.log('='.repeat(70));
  console.log(`\nSuccess: ${successCount}/${QUERIES.length}`);
  console.log(`Saved to: ${OUTPUT_FILE}`);

  console.log('\nTop brands:');
  const sorted = Object.entries(brandCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [brand, count] of sorted) {
    const isClient = brand === 'Natural Balance';
    console.log(`  - ${brand}: ${count} queries${isClient ? ' ← CLIENT' : ''}`);
  }
}

main().catch(console.error);
