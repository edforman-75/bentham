/**
 * Import Kyanos Study Results to Neon Database
 *
 * This script imports all study results from repository/results/kyanos/ into
 * the kyanos-analytics Neon database for analysis and reporting.
 *
 * Usage:
 *   npx tsx tenant-repos/kyanos/scripts/import-to-neon.ts
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
const RESULTS_DIR = path.join(process.cwd(), 'repository/results/kyanos');

// Query cache to avoid duplicate lookups
const queryCache = new Map<string, number>();
const candidateCache = new Map<string, number>();

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

function ensureUUID(id: string | undefined): string {
  if (!id) return randomUUID();
  if (isValidUUID(id)) return id;
  const hash = id.split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0);
  const uuid = randomUUID();
  return uuid.substring(0, 24) + Math.abs(hash).toString(16).padStart(12, '0').substring(0, 12);
}

interface OrganicResult {
  position?: number;
  title?: string;
  url?: string;
  link?: string;
  snippet?: string;
}

interface CityOfBoiseResult {
  queryIndex: number;
  queryText: string;
  category?: string;
  surfaceId: string;
  status: string;
  organicResults?: OrganicResult[];
  responseTimeMs?: number;
  error?: string;
  response?: string;
  aiOverview?: string;
}

interface CityOfBoiseStudy {
  studyName: string;
  lastUpdate?: string;
  timestamp?: string;
  results: CityOfBoiseResult[];
}

interface BatchStudyResult {
  queryIndex: number;
  originalQuery: string;
  submittedQuery?: string;
  response?: string;
  aiOverview?: string;
  organicResults?: OrganicResult[];
  responseTimeMs?: number;
  success?: boolean;
  error?: string;
}

interface BatchStudy {
  run?: {
    runId: string;
    parentRunId?: string;
    batchSequence?: number;
    batchTotal?: number;
    initiatedAt?: string;
    trigger?: string;
  };
  study?: string;
  studyName: string;
  surface?: string;
  location?: string;
  timestamp?: string;
  timing?: {
    startTime: string;
    endTime: string;
    durationMs: number;
  };
  ipVerification?: {
    ipInfo?: {
      ip: string;
      country: string;
      city?: string;
      region?: string;
    };
    verified?: boolean;
  };
  results: BatchStudyResult[];
}

interface BatchRunStudy {
  batchRunId: string;
  schemaVersion?: string;
  timing?: {
    startTime: string;
    endTime: string;
    durationMs: number;
  };
  summary?: {
    studiesRequested: number;
    studiesCompleted: number;
    studiesFailed: number;
    totalQueries: number;
    successfulQueries: number;
    failedQueries: number;
  };
  studies: BatchStudy[];
}

interface CandidateInfo {
  name: string;
  race?: string;
  state?: string;
  electionDate?: string;
}

interface CandidateResponse {
  query: string;
  category?: string;
  response: string;
  responseTimeMs?: number;
}

interface CandidateStudy {
  studyId?: string;
  studyName: string;
  candidate?: CandidateInfo;
  timestamp?: string;
  summary?: {
    totalJobs: number;
    completedJobs?: number;
    failedJobs?: number;
  };
  bySurface?: Record<string, {
    total: number;
    complete: number;
    failed: number;
    responses?: CandidateResponse[];
  }>;
}

async function getOrCreateQuery(queryText: string, category?: string): Promise<number> {
  if (!queryText) {
    throw new Error('Query text is required');
  }

  const cacheKey = queryText;
  if (queryCache.has(cacheKey)) {
    return queryCache.get(cacheKey)!;
  }

  const result = await sql`
    INSERT INTO queries (query_text, category)
    VALUES (${queryText}, ${category || null})
    ON CONFLICT (query_text) DO UPDATE SET
      category = COALESCE(EXCLUDED.category, queries.category)
    RETURNING id
  `;

  const queryId = result[0].id;
  queryCache.set(cacheKey, queryId);
  return queryId;
}

async function getOrCreateCandidate(candidate: CandidateInfo): Promise<number> {
  if (!candidate.name) {
    throw new Error('Candidate name is required');
  }

  if (candidateCache.has(candidate.name)) {
    return candidateCache.get(candidate.name)!;
  }

  const result = await sql`
    INSERT INTO candidates (name, race, state, election_date)
    VALUES (${candidate.name}, ${candidate.race || null}, ${candidate.state || null}, ${candidate.electionDate || null})
    ON CONFLICT (name) DO UPDATE SET
      race = COALESCE(EXCLUDED.race, candidates.race),
      state = COALESCE(EXCLUDED.state, candidates.state),
      election_date = COALESCE(EXCLUDED.election_date, candidates.election_date)
    RETURNING id
  `;

  const candidateId = result[0].id;
  candidateCache.set(candidate.name, candidateId);
  return candidateId;
}

async function insertLocation(locationId: string, ipInfo?: { country?: string; city?: string; region?: string }): Promise<void> {
  if (!locationId) return;

  await sql`
    INSERT INTO locations (id, name, country, region, city)
    VALUES (${locationId}, ${locationId}, ${ipInfo?.country || null}, ${ipInfo?.region || null}, ${ipInfo?.city || null})
    ON CONFLICT (id) DO NOTHING
  `;
}

async function importCityOfBoiseStudy(
  data: CityOfBoiseStudy,
  sourceFile: string
): Promise<{ studyId: string; executionCount: number }> {
  const studyId = ensureUUID(undefined);
  const createdAt = data.lastUpdate || data.timestamp || null;

  const successCount = data.results.filter(r => r.status === 'complete' || r.status === 'success').length;
  const failedCount = data.results.length - successCount;

  await sql`
    INSERT INTO studies (id, study_name, status, created_at, total_jobs, completed_jobs, failed_jobs, source_file)
    VALUES (
      ${studyId}::uuid,
      ${data.studyName},
      'complete',
      ${createdAt}::timestamptz,
      ${data.results.length},
      ${successCount},
      ${failedCount},
      ${sourceFile}
    )
    ON CONFLICT (id) DO UPDATE SET imported_at = NOW()
  `;

  let executionCount = 0;

  for (const result of data.results) {
    if (!result.queryText) continue;

    const queryId = await getOrCreateQuery(result.queryText, result.category);

    await sql`
      INSERT INTO executions (study_id, query_id, query_index, surface_id, status, success, response_time_ms, response_text, ai_overview, organic_results, error)
      VALUES (
        ${studyId}::uuid,
        ${queryId},
        ${result.queryIndex},
        ${result.surfaceId || 'unknown'},
        ${result.status},
        ${result.status === 'complete' || result.status === 'success'},
        ${result.responseTimeMs || null},
        ${result.response || null},
        ${result.aiOverview || null},
        ${result.organicResults ? JSON.stringify(result.organicResults) : null}::jsonb,
        ${result.error || null}
      )
    `;
    executionCount++;
  }

  return { studyId, executionCount };
}

async function importBatchRunStudy(
  data: BatchRunStudy,
  sourceFile: string
): Promise<{ studyId: string; executionCount: number }> {
  let totalExecutions = 0;
  const batchRunId = ensureUUID(data.batchRunId);

  for (const study of data.studies) {
    const studyId = ensureUUID(study.run?.runId);
    const locationId = study.location || 'us-national';

    await insertLocation(locationId, study.ipVerification?.ipInfo);

    const successCount = study.results.filter(r => r.success !== false && !r.error).length;
    const failedCount = study.results.length - successCount;

    await sql`
      INSERT INTO studies (id, batch_run_id, study_name, status, created_at, started_at, completed_at, duration_ms, total_jobs, completed_jobs, failed_jobs, source_file)
      VALUES (
        ${studyId}::uuid,
        ${batchRunId}::uuid,
        ${study.studyName},
        'complete',
        ${study.timestamp || study.timing?.startTime || null}::timestamptz,
        ${study.timing?.startTime || null}::timestamptz,
        ${study.timing?.endTime || null}::timestamptz,
        ${study.timing?.durationMs || null},
        ${study.results.length},
        ${successCount},
        ${failedCount},
        ${sourceFile}
      )
      ON CONFLICT (id) DO UPDATE SET imported_at = NOW()
    `;

    for (const result of study.results) {
      const queryText = result.originalQuery || result.submittedQuery;
      if (!queryText) continue;

      const queryId = await getOrCreateQuery(queryText);

      await sql`
        INSERT INTO executions (study_id, query_id, query_index, surface_id, location_id, status, success, response_time_ms, response_text, ai_overview, organic_results, error)
        VALUES (
          ${studyId}::uuid,
          ${queryId},
          ${result.queryIndex},
          ${study.surface || 'google-search'},
          ${locationId},
          ${result.error ? 'failed' : 'complete'},
          ${result.success !== false && !result.error},
          ${result.responseTimeMs || null},
          ${result.response || null},
          ${result.aiOverview || null},
          ${result.organicResults ? JSON.stringify(result.organicResults) : null}::jsonb,
          ${result.error || null}
        )
      `;
      totalExecutions++;
    }
  }

  return { studyId: batchRunId, executionCount: totalExecutions };
}

async function importCandidateStudy(
  data: CandidateStudy,
  sourceFile: string
): Promise<{ studyId: string; executionCount: number }> {
  const studyId = ensureUUID(data.studyId);
  let candidateId: number | null = null;

  if (data.candidate) {
    candidateId = await getOrCreateCandidate(data.candidate);
  }

  await sql`
    INSERT INTO studies (id, study_name, status, created_at, total_jobs, completed_jobs, failed_jobs, source_file, raw_summary)
    VALUES (
      ${studyId}::uuid,
      ${data.studyName},
      'complete',
      ${data.timestamp || null}::timestamptz,
      ${data.summary?.totalJobs || 0},
      ${data.summary?.completedJobs || 0},
      ${data.summary?.failedJobs || 0},
      ${sourceFile},
      ${JSON.stringify(data.summary || {})}::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET imported_at = NOW()
  `;

  let executionCount = 0;

  if (data.bySurface) {
    for (const [surfaceId, surfaceData] of Object.entries(data.bySurface)) {
      if (!surfaceData.responses) continue;

      for (let i = 0; i < surfaceData.responses.length; i++) {
        const resp = surfaceData.responses[i];
        if (!resp.query) continue;

        const queryId = await getOrCreateQuery(resp.query, resp.category);

        await sql`
          INSERT INTO executions (study_id, query_id, candidate_id, query_index, surface_id, status, success, response_time_ms, response_text)
          VALUES (
            ${studyId}::uuid,
            ${queryId},
            ${candidateId},
            ${i},
            ${surfaceId},
            'complete',
            true,
            ${resp.responseTimeMs || null},
            ${resp.response || null}
          )
        `;
        executionCount++;
      }
    }
  }

  return { studyId, executionCount };
}

function isCityOfBoiseStudy(data: unknown): data is CityOfBoiseStudy {
  return (
    typeof data === 'object' &&
    data !== null &&
    'studyName' in data &&
    'results' in data &&
    Array.isArray((data as CityOfBoiseStudy).results) &&
    (data as CityOfBoiseStudy).results.length > 0 &&
    'queryText' in (data as CityOfBoiseStudy).results[0]
  );
}

function isBatchRunStudy(data: unknown): data is BatchRunStudy {
  return (
    typeof data === 'object' &&
    data !== null &&
    'batchRunId' in data &&
    'studies' in data &&
    Array.isArray((data as BatchRunStudy).studies)
  );
}

function isCandidateStudy(data: unknown): data is CandidateStudy {
  return (
    typeof data === 'object' &&
    data !== null &&
    'studyName' in data &&
    'bySurface' in data &&
    typeof (data as CandidateStudy).bySurface === 'object'
  );
}

async function importFile(filePath: string): Promise<{ success: boolean; studyId?: string; executionCount?: number; error?: string }> {
  const fileName = path.basename(filePath);

  // Skip intermediate files
  if (fileName.includes('intermediate')) {
    return { success: true, executionCount: 0 };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);

    // Skip files without study data
    if (!data.studyName && !data.batchRunId && !data.studyId) {
      console.log(`  Skipping ${fileName} - not a study result file`);
      return { success: true, executionCount: 0 };
    }

    let result: { studyId: string; executionCount: number };

    if (isBatchRunStudy(data)) {
      result = await importBatchRunStudy(data, fileName);
    } else if (isCandidateStudy(data)) {
      result = await importCandidateStudy(data, fileName);
    } else if (isCityOfBoiseStudy(data)) {
      result = await importCityOfBoiseStudy(data, fileName);
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

  if (!fs.existsSync(dir)) {
    return files;
  }

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
  console.log('Kyanos Study Results Import');
  console.log('============================\n');
  console.log(`Results directory: ${RESULTS_DIR}`);
  console.log(`Database: kyanos-analytics (Neon)\n`);

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

  console.log('\n============================');
  console.log(`Import complete!`);
  console.log(`  Studies: ${totalStudies}`);
  console.log(`  Executions: ${totalExecutions}`);
  console.log(`  Errors: ${errors}`);

  // Show summary from database
  console.log('\nDatabase summary:');
  const studyCount = await sql`SELECT COUNT(*) as count FROM studies`;
  const executionCount = await sql`SELECT COUNT(*) as count FROM executions`;
  const queryCount = await sql`SELECT COUNT(*) as count FROM queries`;
  const candidateCount = await sql`SELECT COUNT(*) as count FROM candidates`;

  console.log(`  Studies: ${studyCount[0].count}`);
  console.log(`  Executions: ${executionCount[0].count}`);
  console.log(`  Unique queries: ${queryCount[0].count}`);
  console.log(`  Candidates: ${candidateCount[0].count}`);
}

main().catch(console.error);
