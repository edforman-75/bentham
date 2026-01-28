#!/usr/bin/env npx tsx
/**
 * Google AI Overview via SerpAPI
 *
 * Uses SerpAPI to fetch Google search results including AI Overviews.
 * Much faster, more reliable, and avoids bot detection.
 */

import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const SERPAPI_KEY = process.env.SERPAPI_KEY;
const MANIFEST_PATH = 'studies/city-of-boise-visibility.json';
const OUTPUT_PATH = 'studies/city-of-boise-google-ai-overview-results.json';

if (!SERPAPI_KEY) {
  console.error('SERPAPI_KEY not found in environment');
  process.exit(1);
}

interface QueryResult {
  queryIndex: number;
  queryText: string;
  category: string;
  surfaceId: string;
  status: 'complete' | 'failed';
  responseText?: string;
  aiOverview?: string;
  organicResults?: Array<{ title: string; link: string; snippet: string }>;
  responseTimeMs: number;
  error?: string;
}

interface SerpAPIResponse {
  search_metadata?: {
    status: string;
  };
  ai_overview?: {
    text?: string;
    text_blocks?: Array<{ type: string; text?: string; snippet?: string }>;
  };
  answer_box?: {
    snippet?: string;
    answer?: string;
    contents?: { parts?: Array<{ text?: string }> };
  };
  knowledge_graph?: {
    description?: string;
  };
  organic_results?: Array<{
    title: string;
    link: string;
    snippet?: string;
  }>;
}

async function searchWithSerpAPI(query: string): Promise<{ aiOverview: string; organic: Array<{ title: string; link: string; snippet: string }> }> {
  const params = new URLSearchParams({
    q: query,
    api_key: SERPAPI_KEY!,
    engine: 'google',
    gl: 'us',
    hl: 'en',
    // Request AI overview
    google_domain: 'google.com',
  });

  const response = await fetch(`https://serpapi.com/search?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`SerpAPI error: ${response.status} ${response.statusText}`);
  }

  const data: SerpAPIResponse = await response.json();

  // Extract AI Overview
  let aiOverview = '';

  // Try ai_overview field first
  if (data.ai_overview) {
    if (data.ai_overview.text) {
      aiOverview = data.ai_overview.text;
    } else if (data.ai_overview.text_blocks) {
      aiOverview = data.ai_overview.text_blocks
        .filter(block => block.text || block.snippet)
        .map(block => block.text || block.snippet)
        .join('\n');
    }
  }

  // Try answer_box as fallback
  if (!aiOverview && data.answer_box) {
    aiOverview = data.answer_box.snippet || data.answer_box.answer || '';
    if (!aiOverview && data.answer_box.contents?.parts) {
      aiOverview = data.answer_box.contents.parts
        .filter(p => p.text)
        .map(p => p.text)
        .join('\n');
    }
  }

  // Try knowledge graph as last fallback
  if (!aiOverview && data.knowledge_graph?.description) {
    aiOverview = data.knowledge_graph.description;
  }

  // Extract organic results
  const organic = (data.organic_results || []).slice(0, 5).map(r => ({
    title: r.title || '',
    link: r.link || '',
    snippet: r.snippet || '',
  }));

  return { aiOverview, organic };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('='.repeat(70));
  console.log('  GOOGLE AI OVERVIEW VIA SERPAPI');
  console.log('='.repeat(70));
  console.log();

  // Load manifest
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  console.log(`Loaded ${manifest.queries.length} queries\n`);

  // Load existing results if any
  let results: QueryResult[] = [];
  let successCount = 0;
  let failCount = 0;

  if (fs.existsSync(OUTPUT_PATH)) {
    try {
      const existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
      results = existing.results || [];
      successCount = results.filter(r => r.status === 'complete').length;
      failCount = results.filter(r => r.status === 'failed').length;
      console.log(`Resuming: ${results.length} queries already done\n`);
    } catch {
      console.log('Starting fresh\n');
    }
  }

  console.log('-'.repeat(70));

  for (let i = 0; i < manifest.queries.length; i++) {
    const query = manifest.queries[i];
    const queryNum = i + 1;

    // Skip if already processed
    if (results.find(r => r.queryIndex === queryNum)) {
      continue;
    }

    process.stdout.write(`  [${queryNum}/${manifest.queries.length}] "${query.text.slice(0, 40)}..."  `);

    const startTime = Date.now();

    try {
      const { aiOverview, organic } = await searchWithSerpAPI(query.text);
      const timeMs = Date.now() - startTime;

      if (aiOverview && aiOverview.length > 20) {
        successCount++;
        console.log(`✓ AI Overview (${(timeMs / 1000).toFixed(1)}s)`);
        results.push({
          queryIndex: queryNum,
          queryText: query.text,
          category: query.category,
          surfaceId: 'google-ai-overview',
          status: 'complete',
          responseText: aiOverview,
          aiOverview: aiOverview,
          organicResults: organic,
          responseTimeMs: timeMs,
        });
      } else if (organic.length > 0) {
        // No AI Overview but has organic results
        failCount++;
        console.log(`✗ No AI Overview (has organic)`);
        results.push({
          queryIndex: queryNum,
          queryText: query.text,
          category: query.category,
          surfaceId: 'google-ai-overview',
          status: 'failed',
          organicResults: organic,
          responseTimeMs: timeMs,
          error: 'No AI Overview',
        });
      } else {
        failCount++;
        console.log(`✗ No results`);
        results.push({
          queryIndex: queryNum,
          queryText: query.text,
          category: query.category,
          surfaceId: 'google-ai-overview',
          status: 'failed',
          responseTimeMs: timeMs,
          error: 'No results',
        });
      }
    } catch (error) {
      failCount++;
      console.log(`✗ Error: ${error}`);
      results.push({
        queryIndex: queryNum,
        queryText: query.text,
        category: query.category,
        surfaceId: 'google-ai-overview',
        status: 'failed',
        responseTimeMs: Date.now() - startTime,
        error: String(error),
      });
    }

    // Save progress after each query
    const output = {
      timestamp: new Date().toISOString(),
      studyName: 'City of Boise - Google AI Overview (SerpAPI)',
      surface: 'google-ai-overview',
      summary: {
        total: manifest.queries.length,
        successful: successCount,
        failed: failCount,
      },
      results,
    };
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

    // Rate limit - SerpAPI allows 100 searches/month on free tier
    // Wait 1-2 seconds between requests
    if (i < manifest.queries.length - 1) {
      await delay(1500);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('  COMPLETE');
  console.log('='.repeat(70));
  console.log(`\n  Total: ${manifest.queries.length}`);
  console.log(`  AI Overviews Found: ${successCount}`);
  console.log(`  No AI Overview: ${failCount}`);
  console.log(`  AI Overview Rate: ${((successCount / manifest.queries.length) * 100).toFixed(1)}%`);
  console.log(`\n  Results saved to: ${OUTPUT_PATH}\n`);
}

main().catch(console.error);
