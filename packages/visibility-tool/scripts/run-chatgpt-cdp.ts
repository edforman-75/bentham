#!/usr/bin/env npx tsx
/**
 * Run ChatGPT queries via Chrome DevTools Protocol
 * Connects to existing Chrome instance with remote debugging
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
  console.log('  CHATGPT QUERIES VIA CDP');
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
  console.log(`\n  Queries: ${manifest.queries.length}`);
  console.log(`  Output: ${OUTPUT_DIR}/chatgpt-results.json\n`);

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
        console.log(`  Resuming from query ${startIndex + 1}...\n`);
      }
    } catch { /* start fresh */ }
  }

  for (let i = startIndex; i < manifest.queries.length; i++) {
    const query = manifest.queries[i];
    const startTime = Date.now();

    process.stdout.write(`  [${i + 1}/${manifest.queries.length}] "${query.text.slice(0, 40)}..."  `);

    try {
      // Navigate to new chat for each query - use domcontentloaded instead of networkidle to avoid hangs
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
        // Try to find by role
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

      // Submit - try Enter key or click send button
      await page.keyboard.press('Enter');

      // Wait for response to start
      await delay(5000);

      // Wait for response to complete - check both stop button AND response text stability
      let lastLength = 0;
      let stableCount = 0;
      let stopButtonGone = false;

      for (let j = 0; j < 60; j++) { // Max 60 seconds (reduced from 90)
        await delay(1000);

        // Check if still generating - with 3s timeout
        const stopButton = await withTimeout(page.$('button[aria-label="Stop generating"]'), 3000, null);
        if (!stopButton) {
          stopButtonGone = true;
        }

        // Get current response length - with 5s timeout
        const responseElements = await withTimeout(page.$$('[data-message-author-role="assistant"]'), 3000, []);
        let currentLength = 0;
        if (responseElements.length > 0) {
          const lastResponse = responseElements[responseElements.length - 1];
          const text = await withTimeout(lastResponse.innerText(), 3000, '');
          currentLength = text.length;
        }

        // Debug output every 10 seconds
        if (j > 0 && j % 10 === 0) {
          process.stdout.write(`[${j}s: ${currentLength}c] `);
        }

        // Only count as stable if stop button is gone AND text length hasn't changed
        if (stopButtonGone && currentLength === lastLength && currentLength > 0) {
          stableCount++;
          if (stableCount >= 5) break; // Response stable for 5 seconds
        } else {
          stableCount = 0;
        }

        lastLength = currentLength;
      }

      // Extra delay after response complete to ensure all content rendered
      await delay(2000);

      // Extract response text
      const responseElements = await page.$$('[data-message-author-role="assistant"]');
      let responseText = '';
      if (responseElements.length > 0) {
        const lastResponse = responseElements[responseElements.length - 1];
        responseText = await lastResponse.innerText();
      }

      // Extract citations if any
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
      } else {
        console.log(`✗ Short/no response (${responseText.length} chars)`);
      }

      results.push({
        queryIndex: i + 1,
        queryText: query.text,
        category: query.category,
        surface: 'chatgpt',
        status: hasContent ? 'complete' : 'failed',
        responseText,
        citations,
        brandMentions,
        responseTimeMs: timeMs,
        hasAiResponse: true,
      });

    } catch (error) {
      const timeMs = Date.now() - startTime;
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
        responseTimeMs: timeMs,
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

    await delay(3000); // Delay between queries
  }

  console.log(`\n✓ ChatGPT complete: ${results.filter(r => r.status === 'complete').length}/${manifest.queries.length} successful`);
  console.log(`  Results saved to: ${outputPath}`);

  // Don't close browser - user's Chrome session
}

main().catch(console.error);
