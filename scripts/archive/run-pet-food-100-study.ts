#!/usr/bin/env npx tsx
/**
 * Pet Food AI Overview Study - 100 Queries
 *
 * Runs 100 pet food queries through SerpAPI to capture AI Overviews
 * for the JSON-LD correlation study.
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

const SERPAPI_KEY = process.env.SERPAPI_KEY;
const QUERIES_FILE = 'studies/google/pet-food-100-queries.json';
const OUTPUT_FILE = 'studies/google/pet-food-100-study-results.json';
const INTERMEDIATE_DIR = 'studies/google';

interface QueryResult {
  queryIndex: number;
  query: string;
  timestamp: string;
  success: boolean;
  hasAiOverview: boolean;
  aiOverviewText: string | null;
  aiOverviewSources: Array<{
    index: number;
    title: string;
    url: string;
  }>;
  organicResults: Array<{
    position: number;
    title: string;
    url: string;
    snippet: string;
  }>;
  error?: string;
}

interface StudyResults {
  studyName: string;
  startTime: string;
  endTime?: string;
  totalQueries: number;
  completedQueries: number;
  queriesWithAiOverview: number;
  results: QueryResult[];
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runQuery(query: string, index: number): Promise<QueryResult> {
  const timestamp = new Date().toISOString();

  try {
    // SerpAPI request for India
    const params = new URLSearchParams({
      api_key: SERPAPI_KEY!,
      engine: 'google',
      q: query,
      location: 'Mumbai, Maharashtra, India',
      google_domain: 'google.co.in',
      gl: 'in',
      hl: 'en',
      num: '20'
    });

    const response = await fetch(`https://serpapi.com/search.json?${params}`);
    const data = await response.json();

    if (data.error) {
      return {
        queryIndex: index,
        query,
        timestamp,
        success: false,
        hasAiOverview: false,
        aiOverviewText: null,
        aiOverviewSources: [],
        organicResults: [],
        error: data.error
      };
    }

    // Extract AI Overview
    let aiOverviewText: string | null = null;
    let aiOverviewSources: Array<{ index: number; title: string; url: string }> = [];

    if (data.ai_overview) {
      // Extract text from text_blocks
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

      // Extract sources/references
      if (data.ai_overview.references) {
        aiOverviewSources = data.ai_overview.references.map((ref: any, i: number) => ({
          index: i + 1,
          title: ref.title || '',
          url: ref.link || ref.url || ''
        }));
      } else if (data.ai_overview.sources) {
        aiOverviewSources = data.ai_overview.sources.map((src: any, i: number) => ({
          index: i + 1,
          title: src.title || '',
          url: src.link || src.url || ''
        }));
      }

      // If no text but has serpapi_link, try to fetch it
      if (!aiOverviewText && data.ai_overview.serpapi_link && data.ai_overview.page_token) {
        try {
          const aiResponse = await fetch(data.ai_overview.serpapi_link);
          const aiData = await aiResponse.json();

          if (aiData.ai_overview?.text_blocks) {
            const textParts: string[] = [];
            for (const block of aiData.ai_overview.text_blocks) {
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
          }

          if (aiData.ai_overview?.references) {
            aiOverviewSources = aiData.ai_overview.references.map((ref: any, i: number) => ({
              index: i + 1,
              title: ref.title || '',
              url: ref.link || ref.url || ''
            }));
          }
        } catch (e) {
          console.log(`    Failed to fetch AI Overview details: ${e}`);
        }
      }
    }

    // Extract organic results
    const organicResults = (data.organic_results || []).slice(0, 20).map((r: any) => ({
      position: r.position,
      title: r.title || '',
      url: r.link || '',
      snippet: r.snippet || ''
    }));

    return {
      queryIndex: index,
      query,
      timestamp,
      success: true,
      hasAiOverview: !!aiOverviewText && aiOverviewText.length > 10,
      aiOverviewText,
      aiOverviewSources,
      organicResults
    };

  } catch (error) {
    return {
      queryIndex: index,
      query,
      timestamp,
      success: false,
      hasAiOverview: false,
      aiOverviewText: null,
      aiOverviewSources: [],
      organicResults: [],
      error: String(error)
    };
  }
}

async function main() {
  if (!SERPAPI_KEY) {
    console.error('SERPAPI_KEY not set in environment');
    process.exit(1);
  }

  // Load queries
  const queriesData = JSON.parse(fs.readFileSync(QUERIES_FILE, 'utf-8'));
  const queries: string[] = queriesData.queries;

  console.log(`\n=== Pet Food AI Overview Study ===`);
  console.log(`Total queries: ${queries.length}`);
  console.log(`Start time: ${new Date().toISOString()}\n`);

  const studyResults: StudyResults = {
    studyName: 'Pet Food AI Overview Study - 100 Queries',
    startTime: new Date().toISOString(),
    totalQueries: queries.length,
    completedQueries: 0,
    queriesWithAiOverview: 0,
    results: []
  };

  // Check for existing intermediate results
  const intermediateFile = path.join(INTERMEDIATE_DIR, 'pet-food-100-intermediate.json');
  let startIndex = 0;

  if (fs.existsSync(intermediateFile)) {
    const existing = JSON.parse(fs.readFileSync(intermediateFile, 'utf-8'));
    studyResults.results = existing.results;
    startIndex = existing.results.length;
    studyResults.completedQueries = startIndex;
    studyResults.queriesWithAiOverview = existing.results.filter((r: QueryResult) => r.hasAiOverview).length;
    console.log(`Resuming from query ${startIndex + 1}...\n`);
  }

  // Run queries
  for (let i = startIndex; i < queries.length; i++) {
    const query = queries[i];
    console.log(`[${i + 1}/${queries.length}] "${query}"`);

    const result = await runQuery(query, i);
    studyResults.results.push(result);
    studyResults.completedQueries++;

    if (result.success) {
      if (result.hasAiOverview) {
        studyResults.queriesWithAiOverview++;
        console.log(`    ✓ AI Overview: Yes (${result.aiOverviewSources.length} sources)`);
      } else {
        console.log(`    ✓ AI Overview: No`);
      }
      console.log(`    Organic results: ${result.organicResults.length}`);
    } else {
      console.log(`    ✗ Error: ${result.error}`);
    }

    // Save intermediate results every 10 queries
    if ((i + 1) % 10 === 0) {
      fs.writeFileSync(intermediateFile, JSON.stringify(studyResults, null, 2));
      console.log(`\n--- Saved intermediate results (${i + 1}/${queries.length}) ---\n`);
    }

    // Rate limiting - 1 request per second to be safe
    if (i < queries.length - 1) {
      await sleep(1200);
    }
  }

  // Final save
  studyResults.endTime = new Date().toISOString();
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(studyResults, null, 2));

  // Summary
  console.log(`\n=== Study Complete ===`);
  console.log(`Total queries: ${studyResults.totalQueries}`);
  console.log(`Completed: ${studyResults.completedQueries}`);
  console.log(`With AI Overview: ${studyResults.queriesWithAiOverview} (${((studyResults.queriesWithAiOverview / studyResults.completedQueries) * 100).toFixed(1)}%)`);
  console.log(`\nResults saved to: ${OUTPUT_FILE}`);

  // Clean up intermediate file
  if (fs.existsSync(intermediateFile)) {
    fs.unlinkSync(intermediateFile);
  }
}

main().catch(console.error);
