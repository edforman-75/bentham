#!/usr/bin/env npx tsx
/**
 * Run Study via Bentham Pipeline
 *
 * Simulates how GLU (or any client) would submit a study through the
 * Bentham system. Wires together:
 * - Orchestrator (study lifecycle management)
 * - Executor (job execution)
 * - Surface Adapters (query execution on surfaces)
 *
 * Usage: npx tsx scripts/run-study-via-pipeline.ts studies/huft-visibility-study.json
 */

import { chromium } from 'playwright';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types (simplified from @bentham/core and @bentham/orchestrator)
// ============================================================================

interface Manifest {
  version: string;
  name: string;
  description?: string;
  queries: { text: string; category?: string; tags?: string[] }[];
  surfaces: { id: string; required?: boolean; options?: Record<string, unknown> }[];
  locations: { id: string; name?: string; country?: string; region?: string }[];
  completionCriteria: {
    requiredSurfaces: { surfaceIds: string[]; coverageThreshold: number };
    maxRetriesPerCell: number;
  };
  qualityGates: {
    minResponseLength?: number;
    requireActualContent: boolean;
  };
  evidenceLevel: 'full' | 'metadata' | 'none';
  legalHold: boolean;
  deadline: string;
  retentionDays?: number;
  sessionIsolation: 'shared' | 'dedicated_per_study';
}

interface Job {
  id: string;
  queryText: string;
  queryIndex: number;
  surfaceId: string;
  locationId: string;
  status: 'pending' | 'executing' | 'complete' | 'failed';
  attempts: number;
  maxAttempts: number;
  result?: { responseText: string; responseTimeMs: number };
  error?: string;
}

interface Study {
  id: string;
  tenantId: string;
  manifest: Manifest;
  status: 'manifest_received' | 'validating' | 'queued' | 'executing' | 'complete' | 'failed';
  jobs: Job[];
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

interface QueryResult {
  success: boolean;
  responseText?: string;
  responseTimeMs: number;
  error?: string;
}

// ============================================================================
// Surface Adapters
// ============================================================================

const CHATGPT_SELECTORS = {
  input: ['#prompt-textarea', '[contenteditable="true"]'],
  submit: ['button[data-testid="send-button"]', 'button[data-testid="composer-send-button"]'],
  response: ['[data-message-author-role="assistant"] .markdown', '[data-message-author-role="assistant"]'],
};

async function queryChatGPTWeb(query: string): Promise<QueryResult> {
  const startTime = Date.now();

  try {
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const context = browser.contexts()[0];
    const page = context.pages().find(p => /chatgpt\.com/.test(p.url()));

    if (!page) {
      await browser.close();
      return { success: false, responseTimeMs: Date.now() - startTime, error: 'No ChatGPT tab found' };
    }

    await page.bringToFront();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    // Count initial responses
    let initialCount = 0;
    for (const sel of CHATGPT_SELECTORS.response) {
      initialCount = await page.locator(sel).count();
      if (initialCount > 0) break;
    }

    // Find and fill input
    let inputFound = false;
    for (const sel of CHATGPT_SELECTORS.input) {
      try {
        if (await page.isVisible(sel)) {
          await page.click(sel);
          await page.keyboard.press('Meta+a');
          try {
            await page.fill(sel, query);
          } catch {
            await page.keyboard.press('Backspace');
            await page.keyboard.type(query);
          }
          inputFound = true;
          break;
        }
      } catch { continue; }
    }

    if (!inputFound) {
      await browser.close();
      return { success: false, responseTimeMs: Date.now() - startTime, error: 'Input field not found' };
    }

    await page.waitForTimeout(300);

    // Submit
    let submitted = false;
    for (const sel of CHATGPT_SELECTORS.submit) {
      try {
        if (await page.isVisible(sel)) {
          await page.click(sel);
          submitted = true;
          break;
        }
      } catch { continue; }
    }
    if (!submitted) {
      await page.keyboard.press('Enter');
    }

    // Wait for response
    await page.waitForTimeout(3000);

    let response = '';
    const maxWait = 60000;
    const waitStart = Date.now();

    for (const sel of CHATGPT_SELECTORS.response) {
      while (Date.now() - waitStart < maxWait) {
        const currentCount = await page.locator(sel).count();
        if (currentCount > initialCount || initialCount === 0) {
          await page.waitForTimeout(5000);
          break;
        }
        await page.waitForTimeout(1000);
      }

      response = await page.evaluate((s) => {
        const els = document.querySelectorAll(s);
        for (let i = els.length - 1; i >= 0; i--) {
          const text = (els[i] as HTMLElement).innerText?.trim() || '';
          if (text && text.length > 20) return text;
        }
        return '';
      }, sel);

      if (response && response.length > 20) break;
    }

    await browser.close();

    if (!response) {
      return { success: false, responseTimeMs: Date.now() - startTime, error: 'No response found' };
    }

    return { success: true, responseText: response, responseTimeMs: Date.now() - startTime };
  } catch (error) {
    return {
      success: false,
      responseTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function queryOpenAIAPI(query: string): Promise<QueryResult> {
  const startTime = Date.now();
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return { success: false, responseTimeMs: 0, error: 'OPENAI_API_KEY not set' };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [{ role: 'user', content: query }],
        max_tokens: 1000,
      }),
    });

    const responseTimeMs = Date.now() - startTime;

    if (!response.ok) {
      const error = await response.text();
      return { success: false, responseTimeMs, error: `API error: ${response.status} - ${error}` };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    return { success: true, responseText: content, responseTimeMs };
  } catch (error) {
    return {
      success: false,
      responseTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Surface adapter registry
const surfaceAdapters: Record<string, (query: string) => Promise<QueryResult>> = {
  'openai-api': queryOpenAIAPI,
  'chatgpt-web': queryChatGPTWeb,
};

// ============================================================================
// Orchestrator (simplified)
// ============================================================================

function buildJobsFromManifest(manifest: Manifest): Job[] {
  const jobs: Job[] = [];

  for (let queryIndex = 0; queryIndex < manifest.queries.length; queryIndex++) {
    const query = manifest.queries[queryIndex];
    for (const surface of manifest.surfaces) {
      for (const location of manifest.locations) {
        jobs.push({
          id: randomUUID(),
          queryText: query.text,
          queryIndex,
          surfaceId: surface.id,
          locationId: location.id,
          status: 'pending',
          attempts: 0,
          maxAttempts: manifest.completionCriteria.maxRetriesPerCell,
        });
      }
    }
  }

  return jobs;
}

function createStudy(tenantId: string, manifest: Manifest): Study {
  return {
    id: randomUUID(),
    tenantId,
    manifest,
    status: 'manifest_received',
    jobs: buildJobsFromManifest(manifest),
    createdAt: new Date(),
  };
}

// ============================================================================
// Executor (simplified)
// ============================================================================

async function executeJob(job: Job, qualityGates: Manifest['qualityGates']): Promise<void> {
  const adapter = surfaceAdapters[job.surfaceId];
  if (!adapter) {
    job.status = 'failed';
    job.error = `No adapter for surface: ${job.surfaceId}`;
    return;
  }

  job.status = 'executing';
  job.attempts++;

  const result = await adapter(job.queryText);

  if (!result.success) {
    if (job.attempts >= job.maxAttempts) {
      job.status = 'failed';
      job.error = result.error;
    } else {
      job.status = 'pending'; // Will retry
    }
    return;
  }

  // Quality gates
  if (qualityGates.requireActualContent && !result.responseText) {
    job.status = 'failed';
    job.error = 'Quality gate failed: no content';
    return;
  }

  if (qualityGates.minResponseLength && result.responseText &&
      result.responseText.length < qualityGates.minResponseLength) {
    job.status = 'failed';
    job.error = `Quality gate failed: response too short (${result.responseText.length} < ${qualityGates.minResponseLength})`;
    return;
  }

  job.status = 'complete';
  job.result = {
    responseText: result.responseText!,
    responseTimeMs: result.responseTimeMs,
  };
}

// ============================================================================
// Study Runner
// ============================================================================

async function runStudy(study: Study): Promise<void> {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  Study: ${study.manifest.name}`);
  console.log(`  Study ID: ${study.id}`);
  console.log(`  Tenant: ${study.tenantId}`);
  console.log(`${'='.repeat(70)}\n`);

  // Transition: manifest_received -> validating -> queued -> executing
  console.log('🔄 Transitioning: manifest_received -> validating');
  study.status = 'validating';

  console.log('🔄 Transitioning: validating -> queued');
  study.status = 'queued';

  console.log('🔄 Transitioning: queued -> executing');
  study.status = 'executing';
  study.startedAt = new Date();

  const totalJobs = study.jobs.length;
  let completedJobs = 0;
  let failedJobs = 0;

  console.log(`\n📋 Total jobs: ${totalJobs}`);
  console.log(`   Queries: ${study.manifest.queries.length}`);
  console.log(`   Surfaces: ${study.manifest.surfaces.map(s => s.id).join(', ')}`);
  console.log(`   Locations: ${study.manifest.locations.map(l => l.id).join(', ')}\n`);

  // Execute jobs
  for (let i = 0; i < study.jobs.length; i++) {
    const job = study.jobs[i];
    const progress = `[${i + 1}/${totalJobs}]`;

    console.log(`${progress} Executing job...`);
    console.log(`       Query: "${job.queryText.slice(0, 50)}..."`);
    console.log(`       Surface: ${job.surfaceId}`);
    console.log(`       Location: ${job.locationId}`);

    await executeJob(job, study.manifest.qualityGates);

    if (job.status === 'complete') {
      completedJobs++;
      console.log(`       ✅ Complete (${job.result?.responseTimeMs}ms)`);
      console.log(`       Response: ${job.result?.responseText?.slice(0, 100)}...`);
    } else if (job.status === 'failed') {
      failedJobs++;
      console.log(`       ❌ Failed: ${job.error}`);
    }

    // Progress update
    const pct = ((completedJobs + failedJobs) / totalJobs * 100).toFixed(1);
    console.log(`       Progress: ${pct}% (${completedJobs} complete, ${failedJobs} failed)\n`);

    // Delay between jobs to avoid rate limiting
    if (i < study.jobs.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Check completion criteria
  const requiredSurfaces = study.manifest.completionCriteria.requiredSurfaces;
  let meetsRequirements = true;

  for (const surfaceId of requiredSurfaces.surfaceIds) {
    const surfaceJobs = study.jobs.filter(j => j.surfaceId === surfaceId);
    const surfaceComplete = surfaceJobs.filter(j => j.status === 'complete').length;
    const completionRate = surfaceJobs.length > 0 ? surfaceComplete / surfaceJobs.length : 0;

    console.log(`   Surface ${surfaceId}: ${(completionRate * 100).toFixed(1)}% complete (threshold: ${requiredSurfaces.coverageThreshold * 100}%)`);

    if (completionRate < requiredSurfaces.coverageThreshold) {
      meetsRequirements = false;
    }
  }

  // Final transition
  if (meetsRequirements) {
    study.status = 'complete';
    console.log('\n🔄 Transitioning: executing -> complete');
  } else {
    study.status = 'failed';
    console.log('\n🔄 Transitioning: executing -> failed');
  }

  study.completedAt = new Date();
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const manifestPath = process.argv[2];

  if (!manifestPath) {
    console.error('Usage: npx tsx scripts/run-study-via-pipeline.ts <manifest.json>');
    process.exit(1);
  }

  // Load manifest
  const absolutePath = path.resolve(manifestPath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`Manifest not found: ${absolutePath}`);
    process.exit(1);
  }

  const manifest: Manifest = JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));

  console.log('\n' + '='.repeat(70));
  console.log('  BENTHAM STUDY PIPELINE');
  console.log('  Simulating GLU Study Submission');
  console.log('='.repeat(70));

  // Create study (as orchestrator would)
  console.log('\n📥 Receiving study submission from GLU...');
  const tenantId = 'glu-tenant-001';
  const study = createStudy(tenantId, manifest);
  console.log(`   Created study: ${study.id}`);

  // Run study (orchestrator + executor)
  await runStudy(study);

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('  STUDY RESULTS');
  console.log('='.repeat(70));

  const results = {
    studyId: study.id,
    tenantId: study.tenantId,
    studyName: study.manifest.name,
    status: study.status,
    summary: {
      totalJobs: study.jobs.length,
      completedJobs: study.jobs.filter(j => j.status === 'complete').length,
      failedJobs: study.jobs.filter(j => j.status === 'failed').length,
      pendingJobs: study.jobs.filter(j => j.status === 'pending').length,
    },
    bySurface: {} as Record<string, { total: number; complete: number; failed: number }>,
    timing: {
      createdAt: study.createdAt.toISOString(),
      startedAt: study.startedAt?.toISOString(),
      completedAt: study.completedAt?.toISOString(),
      durationMs: study.completedAt && study.startedAt
        ? study.completedAt.getTime() - study.startedAt.getTime()
        : 0,
    },
    jobs: study.jobs.map(j => ({
      id: j.id,
      queryIndex: j.queryIndex,
      queryText: j.queryText,
      surfaceId: j.surfaceId,
      locationId: j.locationId,
      status: j.status,
      attempts: j.attempts,
      responseText: j.result?.responseText,
      responseTimeMs: j.result?.responseTimeMs,
      error: j.error,
    })),
  };

  // Calculate by surface
  for (const surface of study.manifest.surfaces) {
    const surfaceJobs = study.jobs.filter(j => j.surfaceId === surface.id);
    results.bySurface[surface.id] = {
      total: surfaceJobs.length,
      complete: surfaceJobs.filter(j => j.status === 'complete').length,
      failed: surfaceJobs.filter(j => j.status === 'failed').length,
    };
  }

  console.log(`\nStudy ID: ${results.studyId}`);
  console.log(`Status: ${results.status}`);
  console.log(`\nSummary:`);
  console.log(`  Total Jobs: ${results.summary.totalJobs}`);
  console.log(`  Completed: ${results.summary.completedJobs}`);
  console.log(`  Failed: ${results.summary.failedJobs}`);
  console.log(`  Duration: ${(results.timing.durationMs / 1000).toFixed(1)}s`);

  console.log(`\nBy Surface:`);
  for (const [surfaceId, stats] of Object.entries(results.bySurface)) {
    const pct = stats.total > 0 ? (stats.complete / stats.total * 100).toFixed(0) : 0;
    console.log(`  ${surfaceId}: ${stats.complete}/${stats.total} (${pct}%)`);
  }

  // Save results
  const outputPath = manifestPath.replace('.json', '-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);
}

main().catch(console.error);
