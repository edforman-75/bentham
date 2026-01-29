/**
 * Import Glu Study Results to Neon Database
 *
 * This script imports all study results from repository/results/glu/ into
 * the glu-analytics Neon database for analysis and reporting.
 *
 * Usage:
 *   npx tsx tenant-repos/glu/scripts/import-to-neon.ts
 *
 * Environment:
 *   DATABASE_URL - Neon connection string (or uses default)
 */

import { neon } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

// Database connection
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const sql = neon(DATABASE_URL);

// Results directory
const RESULTS_DIR = path.join(
  process.cwd(),
  'repository/results/glu'
);

interface StandardJob {
  id: string;
  queryIndex: number;
  queryText: string;
  surfaceId: string;
  locationId: string;
  status: string;
  attempts: number;
  responseText: string;
  responseTimeMs: number;
}

interface StandardStudyResult {
  studyId: string;
  tenantId?: string;
  studyName: string;
  status?: string;
  summary?: {
    totalJobs: number;
    completedJobs?: number;
    failedJobs?: number;
    successful?: number;
    failed?: number;
  };
  timing?: {
    createdAt: string;
    startedAt: string;
    completedAt: string;
    durationMs: number;
  };
  bySurface?: Record<string, unknown>;
  jobs?: StandardJob[];
}

interface WebLayerResult {
  query: string;
  queryIndex: number;
  surface?: string;
  success: boolean;
  response: string | null;
  timestamp?: string;
  responseTimeMs: number;
  aiOverview?: string;
  organicResults?: unknown[];
  error?: string;
  brandMentions?: unknown[];
}

interface WebLayerStudyResult {
  studyId?: string;
  studyName: string;
  surface?: string; // Top-level surface for single-surface studies
  location?: string | {
    id: string;
    name: string;
    country: string;
    region: string;
    city: string;
    proxyType: string;
  };
  timestamp?: string;
  startTime?: string;
  totalTimeMs?: number;
  totalQueries?: number;
  successfulQueries?: number;
  summary?: {
    totalJobs: number;
    successful: number;
    failed: number;
    aiOverviewsFound?: number;
  };
  bySurface?: Record<string, unknown>;
  results?: WebLayerResult[];
  analysis?: unknown;
}

type StudyResult = StandardStudyResult | WebLayerStudyResult;

// Query cache to avoid duplicate lookups
const queryCache = new Map<string, number>();

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

function ensureUUID(id: string | undefined): string {
  if (!id) return randomUUID();
  if (isValidUUID(id)) return id;
  // Generate deterministic UUID from non-UUID string
  // Use a simple hash-based approach for consistency
  const hash = id.split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0);
  // Create a v4-like UUID with the hash embedded
  const uuid = randomUUID();
  return uuid.substring(0, 24) + Math.abs(hash).toString(16).padStart(12, '0').substring(0, 12);
}

function normalizeLocationId(location: WebLayerStudyResult['location']): string {
  if (!location) return 'us-default';
  if (typeof location === 'string') {
    // Convert string like "United States" to an ID
    return location.toLowerCase().replace(/\s+/g, '-');
  }
  return location.id || 'unknown';
}

async function getOrCreateQuery(queryText: string): Promise<number> {
  if (!queryText) {
    throw new Error('Query text is required');
  }

  // Check cache first
  if (queryCache.has(queryText)) {
    return queryCache.get(queryText)!;
  }

  // Try to insert, or get existing
  const result = await sql`
    INSERT INTO queries (query_text)
    VALUES (${queryText})
    ON CONFLICT (query_text) DO UPDATE SET query_text = EXCLUDED.query_text
    RETURNING id
  `;

  const queryId = result[0].id;
  queryCache.set(queryText, queryId);
  return queryId;
}

async function insertLocation(location: WebLayerStudyResult['location']): Promise<void> {
  if (!location) return;
  if (typeof location === 'string') {
    const id = location.toLowerCase().replace(/\s+/g, '-');
    await sql`
      INSERT INTO locations (id, name)
      VALUES (${id}, ${location})
      ON CONFLICT (id) DO NOTHING
    `;
    return;
  }

  if (!location.id) return;

  await sql`
    INSERT INTO locations (id, name, country, region, city, proxy_type)
    VALUES (${location.id}, ${location.name}, ${location.country}, ${location.region}, ${location.city}, ${location.proxyType})
    ON CONFLICT (id) DO NOTHING
  `;
}

async function importStandardStudy(
  data: StandardStudyResult,
  sourceFile: string
): Promise<{ studyId: string; executionCount: number }> {
  const studyId = ensureUUID(data.studyId);
  const tenantId = data.tenantId || 'glu-tenant-001';

  // Insert study
  await sql`
    INSERT INTO studies (id, tenant_id, study_name, status, created_at, started_at, completed_at, duration_ms, total_jobs, completed_jobs, failed_jobs, source_file, raw_summary)
    VALUES (
      ${studyId}::uuid,
      ${tenantId},
      ${data.studyName},
      ${data.status || 'complete'},
      ${data.timing?.createdAt || null}::timestamptz,
      ${data.timing?.startedAt || null}::timestamptz,
      ${data.timing?.completedAt || null}::timestamptz,
      ${data.timing?.durationMs || null},
      ${data.summary?.totalJobs || data.jobs?.length || 0},
      ${data.summary?.completedJobs || data.summary?.successful || 0},
      ${data.summary?.failedJobs || data.summary?.failed || 0},
      ${sourceFile},
      ${JSON.stringify(data.summary || {})}::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      imported_at = NOW()
  `;

  let executionCount = 0;

  // Insert jobs
  if (data.jobs) {
    for (const job of data.jobs) {
      // Skip jobs without query text
      if (!job.queryText) continue;

      const queryId = await getOrCreateQuery(job.queryText);
      const jobId = ensureUUID(job.id);

      await sql`
        INSERT INTO executions (id, study_id, query_id, query_index, surface_id, location_id, status, success, attempts, response_time_ms, response_text, raw_job)
        VALUES (
          ${jobId}::uuid,
          ${studyId}::uuid,
          ${queryId},
          ${job.queryIndex},
          ${job.surfaceId || 'unknown'},
          ${job.locationId || 'us-west'},
          ${job.status},
          ${job.status === 'complete'},
          ${job.attempts},
          ${job.responseTimeMs},
          ${job.responseText},
          ${JSON.stringify(job)}::jsonb
        )
        ON CONFLICT (id) DO NOTHING
      `;
      executionCount++;
    }
  }

  return { studyId, executionCount };
}

async function importWebLayerStudy(
  data: WebLayerStudyResult,
  sourceFile: string
): Promise<{ studyId: string; executionCount: number }> {
  const studyId = ensureUUID(data.studyId);
  const tenantId = 'glu-tenant-001';
  const locationId = normalizeLocationId(data.location);
  const topLevelSurface = data.surface; // For single-surface studies

  // Insert location if present
  if (data.location) {
    await insertLocation(data.location);
  }

  // Determine counts - handle both summary formats
  const totalJobs = data.summary?.totalJobs || data.totalQueries || data.results?.length || 0;
  const successfulJobs = data.summary?.successful || data.successfulQueries || 0;
  const failedJobs = data.summary?.failed || (totalJobs - successfulJobs);
  const createdAt = data.timestamp || data.startTime || null;

  // Insert study
  await sql`
    INSERT INTO studies (id, tenant_id, study_name, status, created_at, duration_ms, total_jobs, completed_jobs, failed_jobs, source_file, raw_summary)
    VALUES (
      ${studyId}::uuid,
      ${tenantId},
      ${data.studyName},
      'complete',
      ${createdAt}::timestamptz,
      ${data.totalTimeMs || null},
      ${totalJobs},
      ${successfulJobs},
      ${failedJobs},
      ${sourceFile},
      ${JSON.stringify(data.summary || { totalQueries: data.totalQueries, successfulQueries: data.successfulQueries })}::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      imported_at = NOW()
  `;

  let executionCount = 0;

  // Insert results
  if (data.results) {
    for (const result of data.results) {
      // Skip results without query text
      if (!result.query) continue;

      const queryId = await getOrCreateQuery(result.query);
      // Use per-result surface, or fall back to top-level surface
      const surfaceId = result.surface || topLevelSurface || 'unknown';

      await sql`
        INSERT INTO executions (study_id, query_id, query_index, surface_id, location_id, status, success, response_time_ms, executed_at, response_text, ai_overview, organic_results)
        VALUES (
          ${studyId}::uuid,
          ${queryId},
          ${result.queryIndex},
          ${surfaceId},
          ${locationId},
          ${result.success ? 'complete' : 'failed'},
          ${result.success},
          ${result.responseTimeMs},
          ${result.timestamp || null}::timestamptz,
          ${result.response || result.error || null},
          ${result.aiOverview || null},
          ${result.organicResults ? JSON.stringify(result.organicResults) : null}::jsonb
        )
      `;
      executionCount++;
    }
  }

  return { studyId, executionCount };
}

function isWebLayerStudy(data: StudyResult): data is WebLayerStudyResult {
  return 'results' in data && Array.isArray(data.results);
}

function isStandardStudy(data: StudyResult): data is StandardStudyResult {
  return 'jobs' in data && Array.isArray(data.jobs);
}

async function importFile(filePath: string): Promise<{ success: boolean; studyId?: string; executionCount?: number; error?: string }> {
  const fileName = path.basename(filePath);

  // Skip intermediate files (checkpoints during study execution)
  if (fileName.includes('intermediate')) {
    return { success: true, executionCount: 0 };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content) as StudyResult;

    // Skip files without study data
    if (!data.studyId && !data.studyName) {
      console.log(`  Skipping ${fileName} - not a study result file`);
      return { success: true, executionCount: 0 };
    }

    let result: { studyId: string; executionCount: number };

    if (isWebLayerStudy(data)) {
      result = await importWebLayerStudy(data, fileName);
    } else if (isStandardStudy(data)) {
      result = await importStandardStudy(data, fileName);
    } else {
      console.log(`  Skipping ${fileName} - unknown format`);
      return { success: true, executionCount: 0 };
    }

    return { success: true, ...result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function findJsonFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findJsonFiles(fullPath)));
    } else if (entry.name.endsWith('.json')) {
      files.push(fullPath);
    }
  }

  return files;
}

async function main() {
  console.log('Glu Study Results Import');
  console.log('========================\n');
  console.log(`Results directory: ${RESULTS_DIR}`);
  console.log(`Database: glu-analytics (Neon)\n`);

  // Find all JSON files
  const jsonFiles = await findJsonFiles(RESULTS_DIR);
  console.log(`Found ${jsonFiles.length} JSON files\n`);

  let totalStudies = 0;
  let totalExecutions = 0;
  let errors = 0;

  for (const filePath of jsonFiles) {
    const relativePath = path.relative(RESULTS_DIR, filePath);
    process.stdout.write(`Importing ${relativePath}... `);

    const result = await importFile(filePath);

    if (result.success) {
      if (result.executionCount && result.executionCount > 0) {
        console.log(`OK (${result.executionCount} executions)`);
        totalStudies++;
        totalExecutions += result.executionCount;
      } else {
        console.log('skipped');
      }
    } else {
      console.log(`ERROR: ${result.error}`);
      errors++;
    }
  }

  console.log('\n========================');
  console.log(`Import complete!`);
  console.log(`  Studies: ${totalStudies}`);
  console.log(`  Executions: ${totalExecutions}`);
  console.log(`  Errors: ${errors}`);

  // Show summary from database
  console.log('\nDatabase summary:');
  const studyCount = await sql`SELECT COUNT(*) as count FROM studies`;
  const executionCount = await sql`SELECT COUNT(*) as count FROM executions`;
  const queryCount = await sql`SELECT COUNT(*) as count FROM queries`;

  console.log(`  Studies: ${studyCount[0].count}`);
  console.log(`  Executions: ${executionCount[0].count}`);
  console.log(`  Unique queries: ${queryCount[0].count}`);
}

main().catch(console.error);
