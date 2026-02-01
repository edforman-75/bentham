#!/usr/bin/env npx tsx
/**
 * Run Amazon Rufus queries via Chrome DevTools Protocol
 * Connects to existing Chrome instance with remote debugging
 *
 * Rufus is Amazon's AI shopping assistant available on amazon.in
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
  console.log('  AMAZON RUFUS QUERIES VIA CDP');
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

  // Find or create Amazon page
  let page = pages.find(p => p.url().includes('amazon.in'));
  if (!page) {
    page = await context.newPage();
    await page.goto('https://www.amazon.in');
    await delay(3000);
  }

  console.log(`  ✓ Found Amazon page: ${page.url()}`);
  console.log(`\n  Queries: ${manifest.queries.length}`);
  console.log(`  Output: ${OUTPUT_DIR}/rufus-results.json\n`);

  const results: SurfaceResult[] = [];
  const outputPath = path.join(OUTPUT_DIR, 'rufus-results.json');

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

  console.log('  NOTE: You need to open Rufus chat on Amazon.in first!');
  console.log('  Look for the Rufus icon/button in the Amazon interface.\n');

  // Give user time to see the message
  await delay(3000);

  for (let i = startIndex; i < manifest.queries.length; i++) {
    const query = manifest.queries[i];
    const startTime = Date.now();

    process.stdout.write(`  [${i + 1}/${manifest.queries.length}] "${query.text.slice(0, 40)}..."  `);

    try {
      // Try to find Rufus input field - these selectors may vary
      const rufusSelectors = [
        'input[placeholder*="Rufus"]',
        'input[placeholder*="Ask"]',
        'textarea[placeholder*="Rufus"]',
        'textarea[placeholder*="Ask"]',
        '[data-testid="rufus-input"]',
        '#rufus-input',
        '.rufus-input',
        // Amazon's chat interface selectors
        'input[aria-label*="chat"]',
        'textarea[aria-label*="chat"]',
      ];

      let inputField = null;
      for (const selector of rufusSelectors) {
        inputField = await page.$(selector);
        if (inputField) break;
      }

      if (!inputField) {
        throw new Error('Could not find Rufus input field. Make sure Rufus is open on Amazon.in');
      }

      // Clear previous input and type new query
      await inputField.click();
      await delay(300);
      await page.keyboard.press('Control+a');
      await page.keyboard.type(query.text, { delay: 30 });
      await delay(500);

      // Submit
      await page.keyboard.press('Enter');

      // Wait for response
      await delay(5000);

      // Wait for response to stabilize
      let lastLength = 0;
      let stableCount = 0;

      for (let j = 0; j < 45; j++) { // Max 45 seconds
        await delay(1000);

        // Look for Rufus response container
        const responseSelectors = [
          '[data-testid="rufus-response"]',
          '.rufus-response',
          '#rufus-response',
          '[class*="rufus"][class*="response"]',
          '[class*="chat"][class*="response"]',
          '[class*="message"][class*="assistant"]',
        ];

        let currentLength = 0;
        for (const selector of responseSelectors) {
          const elements = await page.$$(selector);
          if (elements.length > 0) {
            const lastEl = elements[elements.length - 1];
            const text = await withTimeout(lastEl.innerText(), 3000, '');
            currentLength = Math.max(currentLength, text.length);
          }
        }

        if (j > 0 && j % 10 === 0) {
          process.stdout.write(`[${j}s: ${currentLength}c] `);
        }

        if (currentLength === lastLength && currentLength > 0) {
          stableCount++;
          if (stableCount >= 4) break;
        } else {
          stableCount = 0;
        }

        lastLength = currentLength;
      }

      await delay(1000);

      // Extract response text
      let responseText = '';
      const responseSelectors = [
        '[data-testid="rufus-response"]',
        '.rufus-response',
        '#rufus-response',
        '[class*="rufus"][class*="response"]',
        '[class*="chat"][class*="response"]',
      ];

      for (const selector of responseSelectors) {
        const elements = await page.$$(selector);
        if (elements.length > 0) {
          const lastEl = elements[elements.length - 1];
          const text = await withTimeout(lastEl.innerText(), 3000, '');
          if (text.length > responseText.length) {
            responseText = text;
          }
        }
      }

      // Extract any product links/citations
      const citations: Array<{ position: number; title: string; url: string; domain: string }> = [];
      const linkElements = await page.$$('a[href*="/dp/"], a[href*="/gp/"]');
      for (let k = 0; k < Math.min(linkElements.length, 10); k++) {
        const href = await linkElements[k].getAttribute('href');
        const text = await linkElements[k].innerText();
        if (href) {
          citations.push({
            position: k + 1,
            title: text || '',
            url: `https://www.amazon.in${href.startsWith('/') ? href : '/' + href}`,
            domain: 'amazon.in',
          });
        }
      }

      const timeMs = Date.now() - startTime;
      const brandMentions = extractBrandMentions(responseText);
      const hasContent = responseText.length > 50;

      if (hasContent) {
        const topBrands = brandMentions.slice(0, 2).map(b => b.brand).join(', ');
        console.log(`✓ (${(timeMs / 1000).toFixed(1)}s) [${citations.length} products] [${topBrands || 'no brands'}]`);
      } else {
        console.log(`✗ Short/no response (${responseText.length} chars)`);
      }

      results.push({
        queryIndex: i + 1,
        queryText: query.text,
        category: query.category,
        surface: 'rufus',
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
        surface: 'rufus',
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
        studyName: `${manifest.name} - Amazon Rufus`,
        manifest: {
          id: manifest.id,
          name: manifest.name,
          queryCount: manifest.queries.length,
          primaryBrand: PRIMARY_BRAND,
        },
        surface: 'rufus',
        location: 'India',
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

  console.log(`\n✓ Rufus complete: ${results.filter(r => r.status === 'complete').length}/${manifest.queries.length} successful`);
  console.log(`  Results saved to: ${outputPath}`);
}

main().catch(console.error);
