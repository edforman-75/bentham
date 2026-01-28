#!/usr/bin/env npx tsx
/**
 * Run HUFT 100-Prompt Study - Gemini API
 *
 * Queries Gemini API for the same 100 pet product prompts.
 * Compares against Gemini Web to show web layer augmentations.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY environment variable is not set');
  console.error('   Add it to your .env file: GEMINI_API_KEY=your-key-here');
  process.exit(1);
}

// Resume from query index (0-based). Set to 0 to start fresh.
const RESUME_FROM_QUERY = 0;

// Load study manifest
const manifest = JSON.parse(readFileSync('studies/huft-100-prompt-india-study.json', 'utf-8'));
const QUERIES = manifest.queries.map((q: { text: string }) => q.text);

interface QueryResult {
  query: string;
  queryIndex: number;
  surface: string;
  success: boolean;
  response?: string;
  error?: string;
  timestamp: string;
  responseTimeMs: number;
}

async function queryGeminiAPI(query: string, queryIndex: number): Promise<QueryResult> {
  const startTime = Date.now();

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: query }]
          }],
          generationConfig: {
            maxOutputTokens: 2000,
          }
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return {
        query,
        queryIndex,
        surface: 'gemini-api',
        success: false,
        error: `API error: ${response.status} - ${error}`,
        timestamp: new Date().toISOString(),
        responseTimeMs: Date.now() - startTime,
      };
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      return {
        query,
        queryIndex,
        surface: 'gemini-api',
        success: false,
        error: 'No content in response',
        timestamp: new Date().toISOString(),
        responseTimeMs: Date.now() - startTime,
      };
    }

    return {
      query,
      queryIndex,
      surface: 'gemini-api',
      success: true,
      response: content,
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      query,
      queryIndex,
      surface: 'gemini-api',
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
    };
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('  HUFT 100-Prompt Study - Gemini API');
  console.log('  Foundation model baseline for Google comparison');
  console.log('='.repeat(70));
  console.log(`\nTotal queries: ${QUERIES.length}`);
  if (RESUME_FROM_QUERY > 0) {
    console.log(`Resuming from query: ${RESUME_FROM_QUERY + 1}`);
  }
  console.log('');

  // Load previous results if resuming
  let results: QueryResult[] = [];
  if (RESUME_FROM_QUERY > 0) {
    try {
      const intermediatePath = `studies/huft-gemini-api-intermediate-${RESUME_FROM_QUERY}.json`;
      if (existsSync(intermediatePath)) {
        const previousData = JSON.parse(readFileSync(intermediatePath, 'utf-8'));
        results = previousData.results || [];
        console.log(`📂 Loaded ${results.length} previous results\n`);
      }
    } catch (e) {
      console.log(`⚠️  Could not load previous results, starting fresh\n`);
    }
  }

  const startTime = Date.now();

  for (let i = RESUME_FROM_QUERY; i < QUERIES.length; i++) {
    const query = QUERIES[i];
    const progress = `[${i + 1}/${QUERIES.length}]`;

    process.stdout.write(`${progress} "${query.slice(0, 50)}..." `);

    const result = await queryGeminiAPI(query, i);
    results.push(result);

    if (result.success) {
      console.log(`✅ (${result.responseTimeMs}ms)`);
    } else {
      console.log(`❌ ${result.error?.slice(0, 50)}`);

      // Check for rate limiting
      if (result.error?.includes('429') || result.error?.includes('quota')) {
        console.log('\n⚠️  Rate limited - waiting 60 seconds...');
        await new Promise(r => setTimeout(r, 60000));
      }
    }

    // Save intermediate results every 10 queries
    if ((i + 1) % 10 === 0) {
      const intermediatePath = `studies/huft-gemini-api-intermediate-${i + 1}.json`;
      writeFileSync(intermediatePath, JSON.stringify({ results, lastQuery: i }, null, 2));
      console.log(`  💾 Saved checkpoint to ${intermediatePath}`);
    }

    // Small delay between API calls
    if (i < QUERIES.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  const totalTime = Date.now() - startTime;

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('  RESULTS SUMMARY');
  console.log('='.repeat(70));

  const successCount = results.filter(r => r.success).length;
  console.log(`\nGemini API: ${successCount}/${results.length} successful`);
  console.log(`Total time: ${Math.round(totalTime / 1000 / 60)} minutes`);

  // Save final results
  const outputPath = 'studies/huft-gemini-api-results.json';
  writeFileSync(outputPath, JSON.stringify({
    studyId: `huft-gemini-api-${Date.now()}`,
    studyName: `${manifest.name} - Gemini API`,
    timestamp: new Date().toISOString(),
    totalTimeMs: totalTime,
    summary: {
      totalJobs: results.length,
      successful: successCount,
      failed: results.length - successCount,
    },
    results,
  }, null, 2));

  console.log(`\n✅ Results saved to: ${outputPath}`);
}

main().catch(console.error);
