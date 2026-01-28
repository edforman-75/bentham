#!/usr/bin/env npx tsx
/**
 * Deckers Brands US Visibility Study - OpenAI API Surface
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';

const OUTPUT_DIR = 'repository/results/glu/deckers-us-visibility';
const OUTPUT_FILE = `${OUTPUT_DIR}/openai-api-results.json`;

// Deckers brands (5) + Competitors (23) + Retailers (6) = 34 total
const BRANDS_TO_TRACK = [
  // Client brands (Deckers portfolio)
  'UGG', 'HOKA', 'Teva', 'Sanuk', 'Koolaburra',

  // Premium Performance competitors
  'Nike', 'Adidas', 'New Balance', 'Brooks', 'ASICS', 'Saucony', 'On Running',

  // Outdoor/Hiking competitors
  'Merrell', 'Salomon', 'Keen', 'Columbia', 'The North Face',

  // Casual/Lifestyle competitors
  'Birkenstock', 'Crocs', 'Allbirds', 'Vans', 'Converse',

  // Comfort/Boot competitors
  'Timberland', 'Dr. Martens', 'Clarks', 'Sorel',

  // Retailers
  'Zappos', 'DSW', 'Foot Locker', 'Amazon', 'Nordstrom', "Dick's Sporting Goods",
];

const QUERIES = [
  // Category 1: Running/Athletic Shoes (15)
  "best running shoes 2026",
  "most comfortable running shoes",
  "best cushioned running shoes",
  "best marathon running shoes",
  "best trail running shoes",
  "best running shoes for beginners",
  "best running shoes for flat feet",
  "best lightweight running shoes",
  "best stability running shoes",
  "top rated athletic shoes",
  "best daily trainer running shoes",
  "best running shoes for wide feet",
  "best running shoes for plantar fasciitis",
  "most durable running shoes",
  "best carbon plate running shoes",

  // Category 2: Outdoor/Hiking (12)
  "best hiking shoes",
  "best hiking sandals",
  "best waterproof hiking boots",
  "best trail shoes for hiking",
  "best outdoor sandals",
  "most comfortable hiking sandals",
  "best water shoes for hiking",
  "best lightweight hiking boots",
  "best approach shoes",
  "best sandals for walking trails",
  "best adventure sandals",
  "best all terrain shoes",

  // Category 3: Boots & Winter (12)
  "best winter boots",
  "best snow boots",
  "most comfortable boots for walking",
  "best warm boots for cold weather",
  "best sheepskin boots",
  "best waterproof boots",
  "best fashion boots",
  "best slip on boots",
  "best ankle boots for women",
  "coziest winter boots",
  "best boots for snow and ice",
  "best insulated boots",

  // Category 4: Casual/Lifestyle (12)
  "most comfortable everyday shoes",
  "best casual sneakers",
  "best slip on shoes",
  "best shoes for standing all day",
  "most comfortable slippers",
  "best house shoes",
  "best comfortable sandals",
  "best walking shoes for travel",
  "best sustainable shoes",
  "best shoes for plantar fasciitis",
  "most comfortable shoes 2026",
  "best orthopedic casual shoes",

  // Category 5: Brand Comparisons (15)
  "HOKA vs Brooks running shoes",
  "HOKA vs Nike running shoes",
  "HOKA vs On Running",
  "UGG vs Bearpaw boots",
  "UGG vs Koolaburra",
  "Teva vs Chaco sandals",
  "Teva vs Keen sandals",
  "HOKA vs New Balance running shoes",
  "UGG vs EMU boots",
  "HOKA vs ASICS",
  "Teva vs Merrell hiking sandals",
  "UGG vs Sorel winter boots",
  "HOKA vs Saucony",
  "best HOKA alternatives",
  "UGG alternatives that are cheaper",

  // Category 6: By Activity/Use Case (12)
  "best shoes for nurses",
  "best shoes for teachers",
  "best shoes for walking on concrete",
  "best shoes for travel",
  "best shoes for long flights",
  "best recovery shoes after running",
  "best post-workout slides",
  "best shoes for warehouse work",
  "best shoes for theme parks",
  "best shoes for back pain",
  "best summer sandals",
  "best beach shoes",

  // Category 7: Slippers & Comfort (10)
  "best slippers for men",
  "best slippers for women",
  "best indoor outdoor slippers",
  "most comfortable house slippers",
  "best memory foam slippers",
  "best sheepskin slippers",
  "best slippers with arch support",
  "best warm slippers",
  "luxury slippers brands",
  "best orthopedic slippers",

  // Category 8: Shopping/Quality (12)
  "what running shoe brands are best",
  "most comfortable shoe brands",
  "best shoe brands for quality",
  "shoe brands with best arch support",
  "shoe brands that last longest",
  "best shoe brands for foot health",
  "luxury shoe brands worth the money",
  "what shoe brand do podiatrists recommend",
  "best direct-to-consumer shoe brands",
  "most innovative shoe brands",
  "best sustainable shoe brands",
  "shoe brands with best customer service",
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
    console.error('OPENAI_API_KEY not set');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(70));
  console.log('  DECKERS BRANDS US VISIBILITY STUDY - OpenAI GPT-4o API');
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

      if (error?.includes('quota') || error?.includes('exceeded')) {
        console.log('\n[FAIL] Quota exceeded - stopping');
        break;
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
        responseTimeMs: responseTime,
        brandMentions,
      });
    }

    if ((i + 1) % 10 === 0) {
      console.log(`  [SAVE] Progress saved (${i + 1}/${QUERIES.length})`);
    }

    // Rate limiting
    await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
  }

  // Save results
  const output = {
    studyName: 'Deckers Brands US Visibility Study - OpenAI GPT-4o API',
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

  // Show Deckers brands specifically
  console.log('\n--- Deckers Brands ---');
  const deckersBrands = ['UGG', 'HOKA', 'Teva', 'Sanuk', 'Koolaburra'];
  for (const brand of deckersBrands) {
    const count = brandCounts[brand] || 0;
    console.log(`  - ${brand}: ${count} queries (${((count / successCount) * 100).toFixed(1)}%)`);
  }

  console.log('\n--- Top Competitors ---');
  const sorted = Object.entries(brandCounts)
    .filter(([b]) => !deckersBrands.includes(b))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  for (const [brand, count] of sorted) {
    console.log(`  - ${brand}: ${count} queries`);
  }
}

main().catch(console.error);
