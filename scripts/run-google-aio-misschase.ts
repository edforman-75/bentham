#!/usr/bin/env npx tsx
/**
 * Run Google AI Overview for Miss Chase study
 *
 * SerpApi returns AI Overviews in two steps:
 * 1. Initial search returns ai_overview.page_token
 * 2. Second call to google_ai_overview engine gets actual content
 */
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';

const MANIFEST_PATH = './tenant-repos/glu/manifests/miss-chase-india.manifest.json';
const OUTPUT_DIR = './tenant-repos/glu/study-results/miss-chase-india-2026-1769729316121';
const SERPAPI_URL = 'https://serpapi.com/search.json';

interface AIOverviewTextBlock {
  type: 'paragraph' | 'list';
  snippet?: string;
  list?: Array<{ snippet: string; snippet_links?: Array<{ text: string; link: string }> }>;
  snippet_links?: Array<{ text: string; link: string }>;
}

interface AIOverviewReference {
  title: string;
  link: string;
  snippet: string;
  source: string;
  index: number;
}

interface QueryResult {
  query: string;
  success: boolean;
  has_ai_overview: boolean;
  ai_overview_text?: string;
  ai_overview_references?: AIOverviewReference[];
  organic_results?: Array<{
    position: number;
    url: string;
    title: string;
    snippet: string;
    source: string;
  }>;
  miss_chase_in_aio_text?: boolean;
  miss_chase_in_aio_references?: boolean;
  miss_chase_organic_position?: number;
  error?: string;
  timestamp: string;
}

/**
 * Make SerpApi request
 */
async function serpApiRequest(params: Record<string, string>): Promise<unknown> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) throw new Error('SERPAPI_API_KEY not set');

  const searchParams = new URLSearchParams({ api_key: apiKey, ...params });
  const response = await fetch(`${SERPAPI_URL}?${searchParams.toString()}`);

  if (!response.ok) {
    throw new Error(`SerpApi error: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

/**
 * Fetch AI Overview content using page token
 */
async function fetchAIOverview(pageToken: string): Promise<{
  text: string;
  references: AIOverviewReference[];
} | null> {
  try {
    const data = await serpApiRequest({
      engine: 'google_ai_overview',
      page_token: pageToken,
    }) as {
      ai_overview?: {
        text_blocks?: AIOverviewTextBlock[];
        references?: AIOverviewReference[];
      };
    };

    if (!data.ai_overview) return null;

    // Extract text from text_blocks
    const textParts: string[] = [];
    for (const block of data.ai_overview.text_blocks || []) {
      if (block.type === 'paragraph' && block.snippet) {
        textParts.push(block.snippet);
      } else if (block.type === 'list' && block.list) {
        for (const item of block.list) {
          textParts.push(`- ${item.snippet}`);
        }
      }
    }

    return {
      text: textParts.join('\n'),
      references: data.ai_overview.references || [],
    };
  } catch (error) {
    console.error('    Error fetching AI Overview:', error);
    return null;
  }
}

/**
 * Check if Miss Chase is mentioned in text (case insensitive)
 */
function containsMissChase(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes('miss chase') ||
         lower.includes('misschase') ||
         lower.includes('chase haul') ||
         lower.includes('chasehaul');
}

async function main() {
  console.log('Loading manifest...');
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
  const queries: string[] = manifest.queries.map((q: { text: string }) => q.text);

  console.log(`Running ${queries.length} queries against Google (India)...`);
  console.log('Fetching AI Overviews (requires 2 API calls per query with AIO)...\n');

  const results: QueryResult[] = [];
  let aiOverviewCount = 0;
  let successCount = 0;
  let missChaseInAIOCount = 0;

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    const shortQuery = query.length > 50 ? query.slice(0, 47) + '...' : query;
    process.stdout.write(`  [${i + 1}/${queries.length}] ${shortQuery.padEnd(50)}`);

    try {
      // Step 1: Initial search
      const searchData = await serpApiRequest({
        engine: 'google',
        q: query,
        gl: 'in',
        location: 'Mumbai, India',
      }) as {
        ai_overview?: { page_token?: string };
        organic_results?: Array<{
          position: number;
          link: string;
          title: string;
          snippet: string;
          source: string;
        }>;
      };

      const timestamp = new Date().toISOString();
      const hasAIOToken = !!searchData.ai_overview?.page_token;

      // Extract organic results
      const organicResults = (searchData.organic_results || []).slice(0, 10).map(r => ({
        position: r.position,
        url: r.link,
        title: r.title,
        snippet: r.snippet || '',
        source: r.source || '',
      }));

      // Find Miss Chase position in organic results
      const missChaseOrganicPos = organicResults.find(r =>
        containsMissChase(r.url) || containsMissChase(r.title) || containsMissChase(r.source)
      )?.position;

      const result: QueryResult = {
        query,
        success: true,
        has_ai_overview: hasAIOToken,
        organic_results: organicResults,
        miss_chase_organic_position: missChaseOrganicPos,
        timestamp,
      };

      // Step 2: Fetch AI Overview content if present
      if (hasAIOToken) {
        aiOverviewCount++;
        const aioContent = await fetchAIOverview(searchData.ai_overview!.page_token!);

        if (aioContent) {
          result.ai_overview_text = aioContent.text;
          result.ai_overview_references = aioContent.references;

          // Check if Miss Chase is mentioned
          result.miss_chase_in_aio_text = containsMissChase(aioContent.text);
          result.miss_chase_in_aio_references = aioContent.references.some(
            ref => containsMissChase(ref.link) || containsMissChase(ref.title) || containsMissChase(ref.source)
          );

          if (result.miss_chase_in_aio_text || result.miss_chase_in_aio_references) {
            missChaseInAIOCount++;
            console.log(' AI Overview ✓ MISS CHASE');
          } else {
            console.log(' AI Overview');
          }
        } else {
          console.log(' AI Overview (content fetch failed)');
        }
      } else {
        console.log(' (no AIO)');
      }

      results.push(result);
      successCount++;

      // Rate limit - be conservative to avoid hitting limits
      if (i < queries.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (error) {
      console.log(` ERROR: ${error}`);
      results.push({
        query,
        success: false,
        has_ai_overview: false,
        error: String(error),
        timestamp: new Date().toISOString(),
      });
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`Completed: ${successCount}/${queries.length} successful`);
  console.log(`AI Overviews found: ${aiOverviewCount}`);
  console.log(`Miss Chase mentioned in AI Overviews: ${missChaseInAIOCount}`);
  console.log('='.repeat(70));

  // Save results
  const outputPath = `${OUTPUT_DIR}/google-ai-overview-results.json`;
  writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);

  // Analysis summary
  console.log('\n--- MISS CHASE VISIBILITY ANALYSIS ---\n');

  // AI Overview mentions
  const aioMentions = results.filter(r => r.miss_chase_in_aio_text || r.miss_chase_in_aio_references);
  if (aioMentions.length > 0) {
    console.log(`Queries where Miss Chase appears in AI Overview (${aioMentions.length}):`);
    aioMentions.forEach(r => {
      const inText = r.miss_chase_in_aio_text ? 'text' : '';
      const inRefs = r.miss_chase_in_aio_references ? 'refs' : '';
      const where = [inText, inRefs].filter(Boolean).join('+');
      console.log(`  - ${r.query} [${where}]`);
    });
  } else {
    console.log('Miss Chase NOT mentioned in any AI Overview text or references.');
  }

  // Organic ranking
  console.log('\n--- ORGANIC SEARCH RANKING ---\n');
  const organicMentions = results.filter(r => r.miss_chase_organic_position);
  if (organicMentions.length > 0) {
    console.log(`Queries where Miss Chase appears in top 10 organic (${organicMentions.length}):`);
    organicMentions.forEach(r => {
      console.log(`  - ${r.query} [position ${r.miss_chase_organic_position}]`);
    });
  }

  // Queries with AIO but no Miss Chase
  const aioNoMissChase = results.filter(r => r.has_ai_overview && !r.miss_chase_in_aio_text && !r.miss_chase_in_aio_references);
  console.log(`\nQueries with AI Overview but NO Miss Chase mention: ${aioNoMissChase.length}`);
}

main().catch(console.error);
