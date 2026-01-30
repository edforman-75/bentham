/**
 * Job Executor - Manages execution of visibility study jobs
 *
 * A Manifest creates a Job, which is composed of one or more Tests.
 * Each Test has its own completion target and status tracking.
 */

import { Manifest, Test, Brand, Query } from '../manifest-schema.js';
import { collectFromUrls, CollectionResult } from '../collectors/jsonld-collector.js';
import { discoverBrandSiteProducts, discoverAmazonProducts, DiscoveredProduct } from '../collectors/url-discovery.js';
import { queryChatGPTBatch, hasValidSession, ChatGPTResult, getOxylabsProxy } from '../collectors/chatgpt-collector.js';
import { searchGoogle, searchBing, SerpApiResult } from '../collectors/serpapi-collector.js';
import { queryPerplexitySurface, AISurfaceResult } from '../collectors/ai-surfaces-collector.js';
import { chromium, Browser, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

// Test status
export type TestStatus = 'pending' | 'running' | 'completed' | 'failed' | 'deadline-exceeded';

// Individual test execution state
export interface TestExecution {
  id: string;
  test: Test;
  status: TestStatus;
  startedAt?: string;
  completedAt?: string;
  totalItems: number;      // Total queries/URLs to process
  completedItems: number;  // Successfully completed
  failedItems: number;     // Failed items
  completionPercentage: number;
  meetsTarget: boolean;    // Does completion % meet the target?
  results: unknown[];      // Test-specific results
  errors: string[];        // Error messages
}

// Job state
export interface Job {
  id: string;
  manifestId: string;
  manifestName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'deadline-exceeded';
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  deadline?: string;
  tests: TestExecution[];
  overallCompletion: number;
  meetsAllTargets: boolean;
}

// Job result for reporting
export interface JobResult {
  job: Job;
  manifest: Manifest;
  jsonldResults?: CollectionResult[];
  amazonPdpResults?: CollectionResult[];
  aiSurfaceResults?: Record<string, unknown[]>;
}

// Progress callback
export type ProgressCallback = (
  testId: string,
  completed: number,
  total: number,
  item: unknown
) => void;

/**
 * Create a Job from a Manifest
 */
export function createJob(manifest: Manifest): Job {
  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const tests: TestExecution[] = manifest.tests.map((test, index) => {
    const testId = `${jobId}-test-${index}`;

    // Calculate total items for this test
    let totalItems = 0;
    if (test.surface === 'jsonld-pdp') {
      // Count brand site product URLs
      totalItems = manifest.brands.reduce((sum, b) => sum + (b.productUrls?.length || 0), 0);
    } else if (test.surface === 'amazon-pdp') {
      // Count Amazon product URLs
      totalItems = manifest.brands.reduce((sum, b) => sum + (b.amazonProductUrls?.length || 0), 0);
    } else {
      // AI surface tests run all queries
      totalItems = manifest.queries.length;
    }

    return {
      id: testId,
      test,
      status: 'pending' as TestStatus,
      totalItems,
      completedItems: 0,
      failedItems: 0,
      completionPercentage: 0,
      meetsTarget: false,
      results: [],
      errors: [],
    };
  });

  return {
    id: jobId,
    manifestId: manifest.id,
    manifestName: manifest.name,
    status: 'pending',
    createdAt: new Date().toISOString(),
    deadline: manifest.job?.deadline,
    tests,
    overallCompletion: 0,
    meetsAllTargets: false,
  };
}

/**
 * Check if deadline has been exceeded
 */
export function isDeadlineExceeded(job: Job): boolean {
  if (!job.deadline) return false;
  return new Date() > new Date(job.deadline);
}

/**
 * Update test completion metrics
 */
function updateTestMetrics(test: TestExecution): void {
  const total = test.totalItems;
  if (total === 0) {
    test.completionPercentage = 100;
    test.meetsTarget = true;
    return;
  }

  test.completionPercentage = Math.round((test.completedItems / total) * 100);
  test.meetsTarget = test.completionPercentage >= test.test.completionTarget;
}

/**
 * Update job-level metrics
 */
function updateJobMetrics(job: Job): void {
  const totalItems = job.tests.reduce((sum, t) => sum + t.totalItems, 0);
  const completedItems = job.tests.reduce((sum, t) => sum + t.completedItems, 0);

  job.overallCompletion = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 100;
  job.meetsAllTargets = job.tests.every(t => t.meetsTarget);
}

/**
 * Execute a single test
 */
async function executeTest(
  test: TestExecution,
  manifest: Manifest,
  outputDir: string,
  onProgress?: ProgressCallback
): Promise<void> {
  test.status = 'running';
  test.startedAt = new Date().toISOString();

  try {
    if (test.test.surface === 'jsonld-pdp') {
      // Execute brand site PDP analysis
      const urls: Array<{ url: string; brand: string }> = [];

      // Check if any brands need auto-discovery
      const brandsNeedingDiscovery = manifest.brands.filter(
        b => b.productScope === 'all' && b.brandSiteUrl
      );

      if (brandsNeedingDiscovery.length > 0) {
        console.log(`Auto-discovering products for ${brandsNeedingDiscovery.length} brand(s)...`);

        // Launch browser for discovery
        const browser = await chromium.launch({
          headless: false,
          args: ['--disable-blink-features=AutomationControlled'],
        });
        const context = await browser.newContext({
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          viewport: { width: 1440, height: 900 },
        });
        const page = await context.newPage();

        for (const brand of brandsNeedingDiscovery) {
          console.log(`  Discovering products from ${brand.name}: ${brand.brandSiteUrl}`);
          const discovered = await discoverBrandSiteProducts(page, brand.brandSiteUrl, {
            maxProducts: 20,
          });
          for (const product of discovered) {
            urls.push({ url: product.url, brand: brand.name });
          }
        }

        await browser.close();
      }

      // Add manually specified URLs
      for (const brand of manifest.brands) {
        if (brand.productUrls) {
          for (const url of brand.productUrls) {
            urls.push({ url, brand: brand.name });
          }
        }
      }

      if (urls.length > 0) {
        // Update total items now that we know the count
        test.totalItems = urls.length;

        const results = await collectFromUrls(
          urls,
          {
            stealthMode: manifest.options?.stealthMode ?? true,
            delayBetweenRequests: manifest.options?.delayBetweenRequests ?? 2000,
            screenshotDir: manifest.options?.screenshotEnabled
              ? path.join(outputDir, 'screenshots', 'brand-pdp')
              : undefined,
          },
          (completed, total, result) => {
            if (result.success) {
              test.completedItems++;
            } else {
              test.failedItems++;
              test.errors.push(`${result.url}: ${result.error || 'Unknown error'}`);
            }
            updateTestMetrics(test);
            onProgress?.(test.id, completed, total, result);
          }
        );

        test.results = results;
      }
    } else if (test.test.surface === 'amazon-pdp') {
      // Execute Amazon PDP analysis
      const urls: Array<{ url: string; brand: string }> = [];

      // Check if any brands need auto-discovery from Amazon
      const brandsNeedingAmazonDiscovery = manifest.brands.filter(
        b => b.productScope === 'all' && b.amazonStoreUrl
      );

      if (brandsNeedingAmazonDiscovery.length > 0) {
        console.log(`Auto-discovering Amazon products for ${brandsNeedingAmazonDiscovery.length} brand(s)...`);

        // Launch browser for discovery
        const browser = await chromium.launch({
          headless: false,
          args: ['--disable-blink-features=AutomationControlled'],
        });
        const context = await browser.newContext({
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          viewport: { width: 1440, height: 900 },
        });
        const page = await context.newPage();

        for (const brand of brandsNeedingAmazonDiscovery) {
          console.log(`  Discovering Amazon products from ${brand.name}: ${brand.amazonStoreUrl}`);
          const discovered = await discoverAmazonProducts(page, brand.amazonStoreUrl!, {
            maxProducts: 20,
          });
          for (const product of discovered) {
            urls.push({ url: product.url, brand: brand.name });
          }
        }

        await browser.close();
      }

      // Add manually specified URLs
      for (const brand of manifest.brands) {
        if (brand.amazonProductUrls) {
          for (const url of brand.amazonProductUrls) {
            urls.push({ url, brand: brand.name });
          }
        }
      }

      if (urls.length > 0) {
        // Update total items now that we know the count
        test.totalItems = urls.length;

        const results = await collectFromUrls(
          urls,
          {
            stealthMode: manifest.options?.stealthMode ?? true,
            delayBetweenRequests: manifest.options?.delayBetweenRequests ?? 2000,
            screenshotDir: manifest.options?.screenshotEnabled
              ? path.join(outputDir, 'screenshots', 'amazon-pdp')
              : undefined,
          },
          (completed, total, result) => {
            if (result.success) {
              test.completedItems++;
            } else {
              test.failedItems++;
              test.errors.push(`${result.url}: ${result.error || 'Unknown error'}`);
            }
            updateTestMetrics(test);
            onProgress?.(test.id, completed, total, result);
          }
        );

        test.results = results;
      }
    } else {
      // AI surface test - route to appropriate collector
      const queries = manifest.queries.map(q => q.text);
      const surface = test.test.surface;

      if (surface === 'chatgpt-web') {
        // ChatGPT via Playwright with session
        if (!hasValidSession()) {
          console.log(`  [${surface}] No valid ChatGPT session found. Run: npx tsx scripts/chatgpt-login.ts`);
          test.errors.push('No valid ChatGPT session. Run chatgpt-login.ts first.');
          test.failedItems = test.totalItems;
        } else {
          // Check if we have Oxylabs proxy for geo-targeting
          const country = test.test.country;
          const hasProxy = country && getOxylabsProxy(country);
          console.log(`  [${surface}] Running ${queries.length} queries via ChatGPT${hasProxy ? ` (via ${country} proxy)` : ''}...`);

          const results = await queryChatGPTBatch(queries, {
            headless: true,
            country: country, // Pass country for Oxylabs geo-targeting
            delay: manifest.options?.delayBetweenRequests ?? 5000,
            onProgress: (completed, total, result) => {
              if (result.success) {
                test.completedItems++;
              } else {
                test.failedItems++;
                test.errors.push(`Query "${result.query}": ${result.error || 'Unknown error'}`);
              }
              updateTestMetrics(test);
              onProgress?.(test.id, completed, total, result);
            },
          });
          test.results = results;
        }
      } else if (surface === 'perplexity') {
        // Perplexity via Oxylabs
        console.log(`  [${surface}] Running ${queries.length} queries via Perplexity...`);
        const results: AISurfaceResult[] = [];
        for (let i = 0; i < queries.length; i++) {
          const result = await queryPerplexitySurface(queries[i], {
            geo_location: test.test.country,
          });
          results.push(result);
          if (result.success) {
            test.completedItems++;
          } else {
            test.failedItems++;
            test.errors.push(`Query "${queries[i]}": ${result.error || 'Unknown error'}`);
          }
          updateTestMetrics(test);
          onProgress?.(test.id, i + 1, queries.length, result);
          // Rate limiting
          if (i < queries.length - 1) {
            await new Promise(r => setTimeout(r, manifest.options?.delayBetweenRequests ?? 2000));
          }
        }
        test.results = results;
      } else if (surface === 'google-organic' || surface === 'google-ai-overview') {
        // Google via SerpApi
        console.log(`  [${surface}] Running ${queries.length} queries via Google...`);
        const results: SerpApiResult[] = [];
        for (let i = 0; i < queries.length; i++) {
          const result = await searchGoogle(queries[i], {
            country: test.test.country,
            location: test.test.city,
          });
          results.push(result);
          if (result.success) {
            test.completedItems++;
          } else {
            test.failedItems++;
            test.errors.push(`Query "${queries[i]}": ${result.error || 'Unknown error'}`);
          }
          updateTestMetrics(test);
          onProgress?.(test.id, i + 1, queries.length, result);
          // Rate limiting
          if (i < queries.length - 1) {
            await new Promise(r => setTimeout(r, manifest.options?.delayBetweenRequests ?? 1000));
          }
        }
        test.results = results;
      } else if (surface === 'bing-search') {
        // Bing via SerpApi
        console.log(`  [${surface}] Running ${queries.length} queries via Bing...`);
        const results: SerpApiResult[] = [];
        for (let i = 0; i < queries.length; i++) {
          const result = await searchBing(queries[i], {
            country: test.test.country,
          });
          results.push(result);
          if (result.success) {
            test.completedItems++;
          } else {
            test.failedItems++;
            test.errors.push(`Query "${queries[i]}": ${result.error || 'Unknown error'}`);
          }
          updateTestMetrics(test);
          onProgress?.(test.id, i + 1, queries.length, result);
          // Rate limiting
          if (i < queries.length - 1) {
            await new Promise(r => setTimeout(r, manifest.options?.delayBetweenRequests ?? 1000));
          }
        }
        test.results = results;
      } else {
        // Unsupported surface
        console.log(`  [${surface}] Surface not yet implemented`);
        test.failedItems = test.totalItems;
        test.errors.push(`Surface ${surface} not yet implemented`);
      }
    }

    updateTestMetrics(test);
    test.status = test.meetsTarget ? 'completed' : 'failed';
  } catch (error) {
    test.status = 'failed';
    test.errors.push(error instanceof Error ? error.message : String(error));
  }

  test.completedAt = new Date().toISOString();
}

/**
 * Execute all tests in a job
 */
export async function executeJob(
  job: Job,
  manifest: Manifest,
  outputDir: string,
  onProgress?: ProgressCallback
): Promise<JobResult> {
  job.status = 'running';
  job.startedAt = new Date().toISOString();

  // Create output directory
  fs.mkdirSync(outputDir, { recursive: true });

  // Check deadline before starting
  if (isDeadlineExceeded(job)) {
    job.status = 'deadline-exceeded';
    job.completedAt = new Date().toISOString();
    return { job, manifest };
  }

  // Execute tests sequentially (can be parallelized if manifest.options.parallelSurfaces)
  for (const test of job.tests) {
    // Check deadline before each test
    if (isDeadlineExceeded(job)) {
      test.status = 'deadline-exceeded';
      test.errors.push('Deadline exceeded before test could start');
      continue;
    }

    await executeTest(test, manifest, outputDir, onProgress);
    updateJobMetrics(job);

    // Save intermediate state
    saveJobState(job, outputDir);
  }

  // Final status
  if (isDeadlineExceeded(job)) {
    job.status = 'deadline-exceeded';
  } else if (job.meetsAllTargets) {
    job.status = 'completed';
  } else {
    job.status = 'failed';
  }

  job.completedAt = new Date().toISOString();

  // Collect results
  const result: JobResult = {
    job,
    manifest,
  };

  // Extract typed results
  const jsonldTest = job.tests.find(t => t.test.surface === 'jsonld-pdp');
  if (jsonldTest && jsonldTest.results.length > 0) {
    result.jsonldResults = jsonldTest.results as CollectionResult[];
  }

  const amazonPdpTest = job.tests.find(t => t.test.surface === 'amazon-pdp');
  if (amazonPdpTest && amazonPdpTest.results.length > 0) {
    result.amazonPdpResults = amazonPdpTest.results as CollectionResult[];
  }

  return result;
}

/**
 * Save job state to disk
 */
export function saveJobState(job: Job, outputDir: string): void {
  const statePath = path.join(outputDir, 'job-state.json');
  fs.writeFileSync(statePath, JSON.stringify(job, null, 2));
}

/**
 * Load job state from disk
 */
export function loadJobState(outputDir: string): Job | null {
  const statePath = path.join(outputDir, 'job-state.json');
  if (fs.existsSync(statePath)) {
    return JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  }
  return null;
}

/**
 * Generate test summary for console output
 */
export function formatTestSummary(test: TestExecution): string {
  const statusIcon = {
    pending: '⏳',
    running: '🔄',
    completed: '✅',
    failed: '❌',
    'deadline-exceeded': '⏰',
  }[test.status];

  const targetIcon = test.meetsTarget ? '✓' : '✗';

  return `${statusIcon} ${test.test.surface}${test.test.country ? ` (${test.test.country})` : ''}: ${test.completionPercentage}% [${targetIcon} target: ${test.test.completionTarget}%] (${test.completedItems}/${test.totalItems})`;
}

/**
 * Generate job summary for console output
 */
export function formatJobSummary(job: Job): string {
  const lines = [
    `Job: ${job.id}`,
    `Status: ${job.status}`,
    `Overall Completion: ${job.overallCompletion}%`,
    `Meets All Targets: ${job.meetsAllTargets ? 'Yes' : 'No'}`,
    '',
    'Tests:',
    ...job.tests.map(t => `  ${formatTestSummary(t)}`),
  ];

  if (job.deadline) {
    const deadlineDate = new Date(job.deadline);
    const isOverdue = new Date() > deadlineDate;
    lines.splice(2, 0, `Deadline: ${deadlineDate.toLocaleDateString()} ${isOverdue ? '(OVERDUE)' : ''}`);
  }

  return lines.join('\n');
}
