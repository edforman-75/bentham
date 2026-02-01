#!/usr/bin/env npx tsx
/**
 * Run ChatGPT queries for Miss Chase India study
 */

import * as fs from 'fs';
import * as path from 'path';
import { queryChatGPT } from '../src/collectors/chatgpt-collector.js';

const MANIFEST_PATH = '/Users/edf/bentham/tenant-repos/glu/manifests/miss-chase-india.manifest.json';
const OUTPUT_DIR = '/Users/edf/bentham/tenant-repos/glu/study-results/miss-chase-india-2026-1769727599061';

interface ManifestQuery {
  text: string;
  category: string;
  intent?: string;
}

interface Manifest {
  id: string;
  name: string;
  brands: Array<{ name: string; category: string }>;
  queries: ManifestQuery[];
}

interface BrandMention {
  brand: string;
  count: number;
  isClient: boolean;
}

interface SurfaceResult {
  queryIndex: number;
  queryText: string;
  category: string;
  surface: string;
  status: 'complete' | 'failed';
  responseText: string;
  citations: Array<{
    position: number;
    title: string;
    url: string;
    domain: string;
  }>;
  brandMentions: BrandMention[];
  responseTimeMs: number;
  error?: string;
  hasAiResponse?: boolean;
}

// Load manifest
const manifest: Manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));

const PRIMARY_BRAND = manifest.brands.find(b => b.category === 'primary')?.name || '';
const ALL_BRANDS = manifest.brands.map(b => b.name);
const RETAILERS = ['Amazon', 'Myntra', 'AJIO', 'Flipkart', 'Nykaa', 'Tata CLiQ'];
const BRANDS_TO_TRACK = [...ALL_BRANDS, ...RETAILERS];

function extractBrandMentions(text: string): BrandMention[] {
  const mentions: BrandMention[] = [];
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
      mentions.push({
        brand,
        count,
        isClient: brand.toLowerCase() === PRIMARY_BRAND.toLowerCase(),
      });
    }
  }

  return mentions.sort((a, b) => b.count - a.count);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  CHATGPT QUERIES FOR MISS CHASE INDIA');
  console.log('='.repeat(70));
  console.log(`\n  Queries: ${manifest.queries.length}`);
  console.log(`  Output: ${OUTPUT_DIR}/chatgpt-results.json`);

  const results: SurfaceResult[] = [];
  const outputPath = path.join(OUTPUT_DIR, 'chatgpt-results.json');

  // Resume from existing results if any
  let startIndex = 0;
  if (fs.existsSync(outputPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      if (existing.results) {
        results.push(...existing.results);
        startIndex = results.length;
        console.log(`\n  Resuming from query ${startIndex + 1}...`);
      }
    } catch { /* start fresh */ }
  }

  for (let i = startIndex; i < manifest.queries.length; i++) {
    const query = manifest.queries[i];
    const startTime = Date.now();

    process.stdout.write(`  [${i + 1}/${manifest.queries.length}] "${query.text.slice(0, 40)}..."  `);

    try {
      const result = await queryChatGPT(query.text, {
        headless: true,
        timeout: 90000,
      });

      const timeMs = Date.now() - startTime;

      if (!result.success) {
        throw new Error(result.error || 'Unknown error');
      }

      if (!result.session_valid) {
        console.log('\n⚠️  Session expired, stopping');
        break;
      }

      const brandMentions = extractBrandMentions(result.response_text);
      const hasContent = result.response_text.length > 20;

      if (hasContent) {
        const topBrands = brandMentions.slice(0, 2).map(b => b.brand).join(', ');
        console.log(`✓ (${(timeMs / 1000).toFixed(1)}s) [${result.citations.length} citations] [${topBrands || 'no brands'}]`);
      } else {
        console.log(`✗ No response`);
      }

      results.push({
        queryIndex: i + 1,
        queryText: query.text,
        category: query.category,
        surface: 'chatgpt',
        status: hasContent ? 'complete' : 'failed',
        responseText: result.response_text,
        citations: result.citations.map(c => ({
          position: c.position,
          title: c.title,
          url: c.url,
          domain: c.domain,
        })),
        brandMentions,
        responseTimeMs: timeMs,
        hasAiResponse: true,
      });

    } catch (error) {
      console.log(`✗ Error: ${error}`);
      results.push({
        queryIndex: i + 1,
        queryText: query.text,
        category: query.category,
        surface: 'chatgpt',
        status: 'failed',
        responseText: '',
        citations: [],
        brandMentions: [],
        responseTimeMs: Date.now() - startTime,
        error: String(error),
      });
    }

    // Save progress every 5 queries
    if ((i + 1) % 5 === 0 || i === manifest.queries.length - 1) {
      const successful = results.filter(r => r.status === 'complete');
      const brandCounts: Record<string, { count: number; isClient: boolean }> = {};

      for (const r of results) {
        if (r.status === 'complete' && r.brandMentions) {
          for (const m of r.brandMentions) {
            if (!brandCounts[m.brand]) {
              brandCounts[m.brand] = { count: 0, isClient: m.isClient };
            }
            brandCounts[m.brand].count++;
          }
        }
      }

      const output = {
        timestamp: new Date().toISOString(),
        studyName: `${manifest.name} - ChatGPT`,
        manifest: {
          id: manifest.id,
          name: manifest.name,
          queryCount: manifest.queries.length,
          primaryBrand: PRIMARY_BRAND,
        },
        surface: 'chatgpt',
        location: 'India (Mumbai)',
        summary: {
          total: manifest.queries.length,
          successful: successful.length,
          failed: results.length - successful.length,
          avgResponseTime: successful.length > 0
            ? Math.round(successful.reduce((sum, r) => sum + r.responseTimeMs, 0) / successful.length)
            : 0,
        },
        brandVisibility: Object.fromEntries(
          Object.entries(brandCounts)
            .sort((a, b) => b[1].count - a[1].count)
            .map(([brand, data]) => [
              brand,
              {
                queriesAppearing: data.count,
                percentOfQueries: successful.length > 0
                  ? ((data.count / successful.length) * 100).toFixed(1) + '%'
                  : '0%',
                isClient: data.isClient,
              },
            ])
        ),
        results,
      };

      fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    }

    await delay(5000); // ChatGPT needs longer delays
  }

  console.log(`\n✓ ChatGPT complete: ${results.filter(r => r.status === 'complete').length}/${manifest.queries.length} successful`);
  console.log(`  Results saved to: ${outputPath}`);
}

main().catch(console.error);
