#!/usr/bin/env npx tsx
/**
 * Retry failed ChatGPT queries via Chrome DevTools Protocol
 */

import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';

const MANIFEST_PATH = '/Users/edf/bentham/tenant-repos/glu/manifests/miss-chase-india.manifest.json';
const OUTPUT_DIR = '/Users/edf/bentham/tenant-repos/glu/study-results/miss-chase-india-2026-1769727599061';
const CDP_URL = 'http://127.0.0.1:9222';

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

// Timeout wrapper for operations that might hang
async function withTimeout<T>(promise: Promise<T>, ms: number, defaultValue: T): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => resolve(defaultValue), ms);
  });
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch {
    clearTimeout(timeoutId!);
    return defaultValue;
  }
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  RETRY FAILED CHATGPT QUERIES');
  console.log('='.repeat(70));
  console.log(`\n  Connecting to Chrome at ${CDP_URL}...`);

  // Connect to existing Chrome
  const browser = await chromium.connectOverCDP(CDP_URL);
  console.log('  ✓ Connected to Chrome');

  const contexts = browser.contexts();
  if (contexts.length === 0) {
    throw new Error('No browser contexts found');
  }

  const context = contexts[0];
  const pages = context.pages();

  // Find ChatGPT page or create one
  let page = pages.find(p => p.url().includes('chatgpt.com'));
  if (!page) {
    page = await context.newPage();
    await page.goto('https://chatgpt.com');
    await delay(3000);
  }

  console.log(`  ✓ Found ChatGPT page: ${page.url()}`);

  const outputPath = path.join(OUTPUT_DIR, 'chatgpt-results.json');

  // Load existing results
  const existingData = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
  const results: SurfaceResult[] = existingData.results;

  // Find failed query indices
  const failedIndices = results
    .filter(r => r.status === 'failed')
    .map(r => r.queryIndex);

  console.log(`\n  Failed queries to retry: ${failedIndices.length}`);
  console.log(`  Indices: ${failedIndices.join(', ')}\n`);

  let retried = 0;
  let succeeded = 0;

  for (const queryIndex of failedIndices) {
    const query = manifest.queries[queryIndex - 1]; // queryIndex is 1-based
    const startTime = Date.now();

    process.stdout.write(`  [${queryIndex}/${manifest.queries.length}] "${query.text.slice(0, 40)}..."  `);

    try {
      // Navigate to new chat for each query
      await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await delay(3000);

      // Find input field - try multiple selectors
      const inputSelectors = [
        '#prompt-textarea',
        'textarea[data-id="root"]',
        'textarea[placeholder*="Message"]',
        'div[contenteditable="true"]',
        'textarea',
      ];

      let inputField = null;
      for (const selector of inputSelectors) {
        inputField = await page.$(selector);
        if (inputField) break;
      }

      if (!inputField) {
        inputField = await page.locator('textarea').first().elementHandle();
      }

      if (!inputField) {
        throw new Error('Could not find input field');
      }

      // Type the query
      await inputField.click();
      await delay(500);
      await page.keyboard.type(query.text, { delay: 30 });
      await delay(500);

      // Submit
      await page.keyboard.press('Enter');

      // Wait for response to start
      await delay(5000);

      // Wait for response to complete
      let lastLength = 0;
      let stableCount = 0;
      let stopButtonGone = false;

      for (let j = 0; j < 60; j++) {
        await delay(1000);

        const stopButton = await withTimeout(page.$('button[aria-label="Stop generating"]'), 3000, null);
        if (!stopButton) {
          stopButtonGone = true;
        }

        const responseElements = await withTimeout(page.$$('[data-message-author-role="assistant"]'), 3000, []);
        let currentLength = 0;
        if (responseElements.length > 0) {
          const lastResponse = responseElements[responseElements.length - 1];
          const text = await withTimeout(lastResponse.innerText(), 3000, '');
          currentLength = text.length;
        }

        if (j > 0 && j % 10 === 0) {
          process.stdout.write(`[${j}s: ${currentLength}c] `);
        }

        if (stopButtonGone && currentLength === lastLength && currentLength > 0) {
          stableCount++;
          if (stableCount >= 5) break;
        } else {
          stableCount = 0;
        }

        lastLength = currentLength;
      }

      await delay(2000);

      // Extract response text
      const responseElements = await page.$$('[data-message-author-role="assistant"]');
      let responseText = '';
      if (responseElements.length > 0) {
        const lastResponse = responseElements[responseElements.length - 1];
        responseText = await lastResponse.innerText();
      }

      // Extract citations
      const citations: Array<{ position: number; title: string; url: string; domain: string }> = [];
      const linkElements = await page.$$('[data-message-author-role="assistant"] a[href^="http"]');
      for (let k = 0; k < linkElements.length; k++) {
        const href = await linkElements[k].getAttribute('href');
        const text = await linkElements[k].innerText();
        if (href) {
          try {
            const url = new URL(href);
            citations.push({
              position: k + 1,
              title: text || '',
              url: href,
              domain: url.hostname,
            });
          } catch {}
        }
      }

      const timeMs = Date.now() - startTime;
      const brandMentions = extractBrandMentions(responseText);
      const hasContent = responseText.length > 50;

      if (hasContent) {
        const topBrands = brandMentions.slice(0, 2).map(b => b.brand).join(', ');
        console.log(`✓ (${(timeMs / 1000).toFixed(1)}s) [${citations.length} citations] [${topBrands || 'no brands'}]`);
        succeeded++;
      } else {
        console.log(`✗ Short/no response (${responseText.length} chars)`);
      }

      // Update the result in place
      const resultIndex = results.findIndex(r => r.queryIndex === queryIndex);
      if (resultIndex >= 0) {
        results[resultIndex] = {
          queryIndex,
          queryText: query.text,
          category: query.category,
          surface: 'chatgpt',
          status: hasContent ? 'complete' : 'failed',
          responseText,
          citations,
          brandMentions,
          responseTimeMs: timeMs,
          hasAiResponse: true,
        };
      }

    } catch (error) {
      const timeMs = Date.now() - startTime;
      console.log(`✗ Error: ${error}`);

      // Update with error
      const resultIndex = results.findIndex(r => r.queryIndex === queryIndex);
      if (resultIndex >= 0) {
        results[resultIndex] = {
          ...results[resultIndex],
          status: 'failed',
          responseTimeMs: timeMs,
          error: String(error),
        };
      }
    }

    retried++;

    // Save progress every 5 queries
    if (retried % 5 === 0 || retried === failedIndices.length) {
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

    await delay(3000);
  }

  console.log(`\n✓ Retry complete: ${succeeded}/${failedIndices.length} recovered`);

  // Final summary
  const finalSuccessful = results.filter(r => r.status === 'complete').length;
  console.log(`  Final: ${finalSuccessful}/${manifest.queries.length} successful (${((finalSuccessful/manifest.queries.length)*100).toFixed(1)}%)`);
  console.log(`  Results saved to: ${outputPath}`);
}

main().catch(console.error);
