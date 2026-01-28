/**
 * Bentham Visibility Tool API Server
 * REST API for running visibility studies programmatically
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { validateManifest, createManifestTemplate, Manifest } from './manifest-schema.js';
import { generateReport, saveResults, StudyResults } from './report/generator.js';
import {
  createJob,
  executeJob,
  Job,
  JobResult,
  saveJobState,
} from './executor/index.js';

const fastify = Fastify({ logger: true });

// In-memory job tracking
const jobs: Map<string, {
  status: 'pending' | 'running' | 'completed' | 'failed' | 'deadline-exceeded';
  manifest: Manifest;
  job?: Job;
  results?: StudyResults;
  error?: string;
  progress: number;
  startedAt: string;
  completedAt?: string;
}> = new Map();

async function startServer(port: number = 3000): Promise<void> {
  await fastify.register(cors, { origin: true });

  // Health check
  fastify.get('/health', async () => ({ status: 'ok', version: '1.0.0' }));

  // Get manifest template
  fastify.get('/api/manifest/template', async () => createManifestTemplate());

  // Validate manifest
  fastify.post('/api/manifest/validate', async (request, reply) => {
    try {
      const manifest = validateManifest(request.body);
      return {
        valid: true,
        manifest: {
          id: manifest.id,
          name: manifest.name,
          brands: manifest.brands.length,
          queries: manifest.queries.length,
          tests: manifest.tests.length,
        },
      };
    } catch (error) {
      reply.code(400);
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Validation failed',
      };
    }
  });

  // Submit study job
  fastify.post('/api/study/submit', async (request, reply) => {
    try {
      const manifest = validateManifest(request.body);
      const job = createJob(manifest);

      jobs.set(job.id, {
        status: 'pending',
        manifest,
        job,
        progress: 0,
        startedAt: new Date().toISOString(),
      });

      // Start job async
      runStudyJob(job.id, manifest);

      reply.code(202);
      return {
        jobId: job.id,
        status: 'pending',
        message: 'Study submitted successfully',
        statusUrl: `/api/study/${job.id}/status`,
        tests: job.tests.length,
        deadline: manifest.job?.deadline,
      };
    } catch (error) {
      reply.code(400);
      return {
        error: error instanceof Error ? error.message : 'Invalid manifest',
      };
    }
  });

  // Get job status
  fastify.get('/api/study/:jobId/status', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const jobEntry = jobs.get(jobId);

    if (!jobEntry) {
      reply.code(404);
      return { error: 'Job not found' };
    }

    const testStatus = jobEntry.job?.tests.map(t => ({
      id: t.id,
      surface: t.test.surface,
      country: t.test.country,
      status: t.status,
      completionPercentage: t.completionPercentage,
      completionTarget: t.test.completionTarget,
      meetsTarget: t.meetsTarget,
    }));

    return {
      jobId,
      status: jobEntry.status,
      progress: jobEntry.progress,
      startedAt: jobEntry.startedAt,
      completedAt: jobEntry.completedAt,
      error: jobEntry.error,
      overallCompletion: jobEntry.job?.overallCompletion,
      meetsAllTargets: jobEntry.job?.meetsAllTargets,
      tests: testStatus,
    };
  });

  // Get job results
  fastify.get('/api/study/:jobId/results', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const jobEntry = jobs.get(jobId);

    if (!jobEntry) {
      reply.code(404);
      return { error: 'Job not found' };
    }

    if (jobEntry.status !== 'completed' && jobEntry.status !== 'failed') {
      reply.code(400);
      return { error: `Job is ${jobEntry.status}`, status: jobEntry.status };
    }

    return {
      job: jobEntry.job,
      results: jobEntry.results,
    };
  });

  // Get job report (HTML)
  fastify.get('/api/study/:jobId/report', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const jobEntry = jobs.get(jobId);

    if (!jobEntry) {
      reply.code(404);
      return { error: 'Job not found' };
    }

    if (!jobEntry.results) {
      reply.code(400);
      return { error: `Job is ${jobEntry.status}, no results available` };
    }

    const html = generateReport(jobEntry.results);
    reply.type('text/html');
    return html;
  });

  // List all jobs
  fastify.get('/api/study/jobs', async () => {
    const jobList = Array.from(jobs.entries()).map(([id, entry]) => ({
      jobId: id,
      name: entry.manifest.name,
      status: entry.status,
      progress: entry.progress,
      startedAt: entry.startedAt,
      completedAt: entry.completedAt,
      testsTotal: entry.job?.tests.length || 0,
      testsCompleted: entry.job?.tests.filter(t => t.status === 'completed').length || 0,
      overallCompletion: entry.job?.overallCompletion,
      meetsAllTargets: entry.job?.meetsAllTargets,
    }));

    return { jobs: jobList };
  });

  // Start server
  try {
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
    console.log(`║  BENTHAM VISIBILITY TOOL API SERVER                          ║`);
    console.log(`║  Running on http://localhost:${port}                            ║`);
    console.log(`╚══════════════════════════════════════════════════════════════╝\n`);
    console.log('Endpoints:');
    console.log('  GET  /health                      - Health check');
    console.log('  GET  /api/manifest/template       - Get manifest template');
    console.log('  POST /api/manifest/validate       - Validate manifest');
    console.log('  POST /api/study/submit            - Submit study job');
    console.log('  GET  /api/study/:jobId/status     - Get job status');
    console.log('  GET  /api/study/:jobId/results    - Get job results (JSON)');
    console.log('  GET  /api/study/:jobId/report     - Get job report (HTML)');
    console.log('  GET  /api/study/jobs              - List all jobs\n');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

async function runStudyJob(jobId: string, manifest: Manifest): Promise<void> {
  const jobEntry = jobs.get(jobId)!;
  jobEntry.status = 'running';

  try {
    const job = jobEntry.job!;

    const result = await executeJob(
      job,
      manifest,
      manifest.outputDir,
      (testId, completed, total) => {
        // Update progress based on overall completion
        const totalItems = job.tests.reduce((sum, t) => sum + t.totalItems, 0);
        const completedItems = job.tests.reduce((sum, t) => sum + t.completedItems, 0);
        jobEntry.progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
      }
    );

    // Convert to StudyResults
    const studyResults: StudyResults = {
      manifest,
      timestamp: result.job.completedAt || new Date().toISOString(),
      jsonld: result.jsonldResults,
    };

    // Save to disk if outputDir specified
    if (manifest.outputDir && !manifest.outputDir.startsWith('http')) {
      saveResults(studyResults, manifest.outputDir);
      saveJobState(result.job, manifest.outputDir);
    }

    jobEntry.results = studyResults;
    jobEntry.job = result.job;
    jobEntry.status = result.job.status;
    jobEntry.completedAt = new Date().toISOString();
    jobEntry.progress = 100;

  } catch (error) {
    jobEntry.status = 'failed';
    jobEntry.error = error instanceof Error ? error.message : String(error);
    jobEntry.completedAt = new Date().toISOString();
  }
}

// CLI entry point for API server
if (process.argv[1]?.endsWith('api.ts') || process.argv[1]?.endsWith('api.js')) {
  const port = parseInt(process.env.PORT || '3000', 10);
  startServer(port);
}

export { startServer };
