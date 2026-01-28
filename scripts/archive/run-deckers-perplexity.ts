#!/usr/bin/env npx tsx
/**
 * Deckers Brands - Perplexity AI Visibility Study
 * Fast run with minimal delays
 */

import { readFileSync, writeFileSync } from 'fs';

const QUERIES_FILE = 'repository/results/glu/deckers-us-visibility/queries.json';
const RESULTS_FILE = 'repository/results/glu/deckers-us-visibility/perplexity-results.json';

const ALL_BRANDS = [
  'UGG', 'HOKA', 'Teva', 'Sanuk', 'Koolaburra',
  'Nike', 'Adidas', 'New Balance', 'Brooks', 'ASICS', 'Saucony', 'On Running',
  'Merrell', 'Salomon', 'Keen', 'Columbia', 'The North Face',
  'Birkenstock', 'Crocs', 'Allbirds', 'Vans', 'Converse',
  'Timberland', 'Dr. Martens', 'Clarks', 'Sorel',
  'Skechers', 'Reebok', 'Puma', 'Under Armour', 'Chaco', 'Bearpaw', 'EMU'
];

const DECKERS_BRANDS = ['UGG', 'HOKA', 'Teva', 'Sanuk', 'Koolaburra'];

function extractBrandMentions(text: string): { brand: string; count: number }[] {
  const mentions: { brand: string; count: number }[] = [];
  for (const brand of ALL_BRANDS) {
    const regex = new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = text.match(regex);
    if (matches && matches.length > 0) {
      mentions.push({ brand, count: matches.length });
    }
  }
  return mentions.sort((a, b) => b.count - a.count);
}

function loadQueries(): { query: string; category: string }[] {
  const data = JSON.parse(readFileSync(QUERIES_FILE, 'utf-8'));
  const queries: { query: string; category: string }[] = [];
  for (const category of data.categories) {
    for (const query of category.queries) {
      queries.push({ query, category: category.name });
    }
  }
  return queries;
}

async function queryPerplexity(query: string): Promise<string> {
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'sonar',
      messages: [
        {
          role: 'user',
          content: query
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function main() {
  console.log('\n======================================================================');
  console.log('  DECKERS BRANDS - PERPLEXITY AI VISIBILITY STUDY');
  console.log('======================================================================\n');

  if (!process.env.PERPLEXITY_API_KEY) {
    console.error('[ERROR] PERPLEXITY_API_KEY not set');
    process.exit(1);
  }

  const allQueries = loadQueries();
  console.log(`Loaded ${allQueries.length} queries\n`);

  const results: any[] = [];
  let successCount = 0;

  for (let i = 0; i < allQueries.length; i++) {
    const { query, category } = allQueries[i];
    process.stdout.write(`[${i + 1}/${allQueries.length}] "${query.substring(0, 40)}..." `);

    try {
      const startTime = Date.now();
      const response = await queryPerplexity(query);
      const responseTimeMs = Date.now() - startTime;

      const brandMentions = extractBrandMentions(response);
      const deckersCount = brandMentions
        .filter(m => DECKERS_BRANDS.includes(m.brand))
        .reduce((sum, m) => sum + m.count, 0);

      results.push({
        query,
        category,
        success: true,
        response,
        responseTimeMs,
        brandMentions,
        deckersCount
      });

      successCount++;
      const topBrands = brandMentions.slice(0, 3).map(b => b.brand).join(', ') || 'none';
      console.log(`[OK] ${Math.round(responseTimeMs/1000)}s [${topBrands}]`);

    } catch (e: any) {
      console.log(`[FAIL] ${e.message}`);
      results.push({
        query,
        category,
        success: false,
        error: e.message
      });
    }

    // Minimal delay to avoid rate limits
    await new Promise(r => setTimeout(r, 200));
  }

  // Calculate summary
  const brandVisibility: Record<string, number> = {};
  for (const result of results.filter(r => r.success)) {
    for (const mention of result.brandMentions || []) {
      brandVisibility[mention.brand] = (brandVisibility[mention.brand] || 0) + mention.count;
    }
  }

  const deckersVisibility: Record<string, number> = {};
  for (const brand of DECKERS_BRANDS) {
    deckersVisibility[brand] = brandVisibility[brand] || 0;
  }

  const topCompetitors = Object.fromEntries(
    Object.entries(brandVisibility)
      .filter(([brand]) => !DECKERS_BRANDS.includes(brand))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
  );

  const finalResults = {
    studyName: 'Deckers Brands - Perplexity AI Visibility Study',
    surface: 'perplexity',
    timestamp: new Date().toISOString(),
    totalQueries: allQueries.length,
    successfulQueries: successCount,
    deckersVisibility,
    topCompetitors,
    results
  };

  writeFileSync(RESULTS_FILE, JSON.stringify(finalResults, null, 2));

  // Print summary
  console.log('\n======================================================================');
  console.log('  PERPLEXITY RESULTS SUMMARY');
  console.log('======================================================================\n');

  console.log(`Total: ${allQueries.length}, Successful: ${successCount}\n`);

  console.log('DECKERS BRANDS:');
  for (const [brand, count] of Object.entries(deckersVisibility).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${brand}: ${count}`);
  }

  console.log('\nTOP COMPETITORS:');
  for (const [brand, count] of Object.entries(topCompetitors).slice(0, 10)) {
    console.log(`  ${brand}: ${count}`);
  }

  console.log(`\n[OK] Results saved to ${RESULTS_FILE}\n`);
}

main().catch(console.error);
