#!/usr/bin/env node
/**
 * Bentham Visibility Tool CLI
 * Run AI visibility studies from the command line
 */

import * as fs from 'fs';
import * as path from 'path';
import { validateManifest, createManifestTemplate, Manifest } from './manifest-schema.js';
import { summarizeResults } from './collectors/jsonld-collector.js';
import { generateReport, saveReport, saveResults, StudyResults } from './report/generator.js';
import {
  createJob,
  executeJob,
  formatJobSummary,
  formatTestSummary,
  Job,
  JobResult,
  loadJobState,
  saveJobState,
} from './executor/index.js';

const HELP = `
╔══════════════════════════════════════════════════════════════╗
║            BENTHAM VISIBILITY TOOL                           ║
║            AI Visibility Assessment for Brands               ║
╚══════════════════════════════════════════════════════════════╝

USAGE:
  visibility-tool <command> [options]

COMMANDS:
  run <manifest.json>     Run a visibility study from manifest
  init [output.json]      Create a new manifest template
  validate <manifest.json> Validate a manifest file
  report <results-dir>    Generate report from existing results
  status <results-dir>    Show job status from existing results

OPTIONS:
  --help, -h              Show this help message
  --version, -v           Show version
  --output, -o <dir>      Override output directory
  --tests <list>          Comma-separated test indices to run
  --dry-run               Validate and show plan without running

EXAMPLES:
  # Create a new manifest
  visibility-tool init my-study.json

  # Run a study
  visibility-tool run my-study.json

  # Run only specific tests
  visibility-tool run my-study.json --tests 0,1,2

  # Generate report from existing results
  visibility-tool report ./results/my-study

  # Check job status
  visibility-tool status ./results/my-study

MANIFEST FORMAT:
  See documentation at: https://github.com/bentham/visibility-tool

`;

interface CliOptions {
  command: string;
  args: string[];
  output?: string;
  tests?: number[];
  dryRun: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    command: '',
    args: [],
    dryRun: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      console.log(HELP);
      process.exit(0);
    }

    if (arg === '--version' || arg === '-v') {
      console.log('visibility-tool v1.0.0');
      process.exit(0);
    }

    if (arg === '--output' || arg === '-o') {
      options.output = args[++i];
    } else if (arg === '--tests') {
      options.tests = args[++i].split(',').map(n => parseInt(n, 10));
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (!options.command) {
      options.command = arg;
    } else {
      options.args.push(arg);
    }

    i++;
  }

  return options;
}

function printJobPlan(manifest: Manifest): void {
  console.log('\nJOB PLAN:');
  console.log('─'.repeat(50));

  // Brands
  const primaryBrands = manifest.brands.filter(b => b.category === 'primary');
  const competitorBrands = manifest.brands.filter(b => b.category === 'competitor');
  console.log(`\nBrands: ${manifest.brands.length} total`);
  console.log(`  Primary: ${primaryBrands.map(b => b.name).join(', ') || 'none'}`);
  console.log(`  Competitors: ${competitorBrands.map(b => b.name).join(', ') || 'none'}`);

  // URLs
  const brandUrls = manifest.brands.reduce((sum, b) => sum + (b.productUrls?.length || 0), 0);
  const amazonUrls = manifest.brands.reduce((sum, b) => sum + (b.amazonProductUrls?.length || 0), 0);
  console.log(`\nProduct URLs:`);
  console.log(`  Brand Site: ${brandUrls}`);
  console.log(`  Amazon: ${amazonUrls}`);

  // Queries
  console.log(`\nQueries: ${manifest.queries.length}`);

  // Tests
  console.log(`\nTests: ${manifest.tests.length}`);
  manifest.tests.forEach((test, i) => {
    const location = test.country ? ` (${test.country}${test.city ? `/${test.city}` : ''})` : '';
    console.log(`  [${i}] ${test.surface}${location} - target: ${test.completionTarget}%`);
  });

  // Deadline
  if (manifest.job?.deadline) {
    const deadline = new Date(manifest.job.deadline);
    console.log(`\nDeadline: ${deadline.toLocaleDateString()}`);
  }

  console.log('─'.repeat(50));
}

async function runStudy(manifest: Manifest, options: CliOptions): Promise<void> {
  const outputDir = options.output || manifest.outputDir;

  console.log('\n' + '═'.repeat(60));
  console.log(`  VISIBILITY STUDY: ${manifest.name}`);
  console.log('═'.repeat(60));
  console.log(`  ID: ${manifest.id}`);
  console.log(`  Output: ${outputDir}`);

  // Show deadline if set
  if (manifest.job?.deadline) {
    const deadline = new Date(manifest.job.deadline);
    const now = new Date();
    const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    console.log(`  Deadline: ${deadline.toLocaleDateString()} (${daysLeft} days)`);
  }

  console.log('═'.repeat(60));

  // Show plan
  printJobPlan(manifest);

  if (options.dryRun) {
    console.log('\n[DRY RUN] Would execute the above plan.');
    return;
  }

  // Filter tests if specified
  let testsToRun = manifest.tests;
  if (options.tests && options.tests.length > 0) {
    testsToRun = options.tests
      .filter(i => i >= 0 && i < manifest.tests.length)
      .map(i => manifest.tests[i]);
    console.log(`\nRunning ${testsToRun.length} of ${manifest.tests.length} tests`);
  }

  // Create modified manifest with filtered tests
  const runManifest = { ...manifest, tests: testsToRun };

  // Create and execute job
  const job = createJob(runManifest);
  console.log(`\nJob ID: ${job.id}`);
  console.log('─'.repeat(50));

  const result = await executeJob(
    job,
    runManifest,
    outputDir,
    (testId, completed, total, item) => {
      const test = job.tests.find(t => t.id === testId);
      if (test) {
        const status = (item as { success?: boolean }).success ? '✓' : '✗';
        const name = (item as { productName?: string; url?: string }).productName ||
                     (item as { url?: string }).url?.split('/').pop() || 'unknown';
        console.log(`  [${completed}/${total}] ${status} ${name}`);
      }
    }
  );

  // Print test summaries
  console.log('\n' + '─'.repeat(50));
  console.log('TEST RESULTS:');
  for (const test of result.job.tests) {
    console.log(`  ${formatTestSummary(test)}`);
    if (test.errors.length > 0 && test.errors.length <= 3) {
      test.errors.forEach(e => console.log(`    ⚠ ${e}`));
    } else if (test.errors.length > 3) {
      console.log(`    ⚠ ${test.errors.length} errors (see job-state.json)`);
    }
  }

  // Convert to StudyResults for report generation
  const studyResults: StudyResults = {
    manifest: runManifest,
    timestamp: result.job.completedAt || new Date().toISOString(),
    jsonld: result.jsonldResults,
  };

  // Save results
  console.log('\n💾 Saving results...');
  saveResults(studyResults, outputDir);
  saveJobState(result.job, outputDir);

  // Generate report
  console.log('📄 Generating report...');
  const reportHtml = generateReport(studyResults);
  const reportPath = path.join(outputDir, 'report.html');
  saveReport(reportHtml, reportPath);

  // Final summary
  console.log('\n' + '═'.repeat(60));
  console.log(`  JOB ${result.job.status.toUpperCase()}`);
  console.log('═'.repeat(60));
  console.log(`  Overall Completion: ${result.job.overallCompletion}%`);
  console.log(`  Meets All Targets: ${result.job.meetsAllTargets ? 'Yes ✓' : 'No ✗'}`);
  console.log(`  Results: ${outputDir}`);
  console.log(`  Report:  ${reportPath}`);
  console.log('═'.repeat(60) + '\n');
}

function showStatus(resultsDir: string): void {
  const job = loadJobState(resultsDir);

  if (!job) {
    console.error(`No job state found in ${resultsDir}`);
    process.exit(1);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  JOB STATUS');
  console.log('═'.repeat(60));
  console.log(formatJobSummary(job));
  console.log('═'.repeat(60) + '\n');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (!options.command) {
    console.log(HELP);
    process.exit(1);
  }

  switch (options.command) {
    case 'init': {
      const outputFile = options.args[0] || 'visibility-study.json';
      const template = createManifestTemplate();
      fs.writeFileSync(outputFile, JSON.stringify(template, null, 2));
      console.log(`✓ Created manifest template: ${outputFile}`);
      console.log('  Edit this file to configure your study, then run:');
      console.log(`  visibility-tool run ${outputFile}`);
      break;
    }

    case 'validate': {
      const manifestFile = options.args[0];
      if (!manifestFile) {
        console.error('Error: Manifest file required');
        process.exit(1);
      }

      try {
        const data = JSON.parse(fs.readFileSync(manifestFile, 'utf-8'));
        const manifest = validateManifest(data);
        console.log('✓ Manifest is valid');
        console.log(`  Name: ${manifest.name}`);
        console.log(`  Brands: ${manifest.brands.length}`);
        console.log(`  Queries: ${manifest.queries.length}`);
        console.log(`  Tests: ${manifest.tests.length}`);

        // Show test details
        if (manifest.tests.length > 0) {
          console.log('\n  Tests configured:');
          manifest.tests.forEach((test, i) => {
            const loc = test.country ? ` (${test.country})` : '';
            console.log(`    [${i}] ${test.surface}${loc} - ${test.completionTarget}% target`);
          });
        }

        // Show deadline
        if (manifest.job?.deadline) {
          console.log(`\n  Deadline: ${new Date(manifest.job.deadline).toLocaleDateString()}`);
        }
      } catch (error) {
        console.error('✗ Manifest validation failed:');
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
      }
      break;
    }

    case 'run': {
      const manifestFile = options.args[0];
      if (!manifestFile) {
        console.error('Error: Manifest file required');
        console.error('Usage: visibility-tool run <manifest.json>');
        process.exit(1);
      }

      try {
        const data = JSON.parse(fs.readFileSync(manifestFile, 'utf-8'));
        const manifest = validateManifest(data);
        await runStudy(manifest, options);
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
      break;
    }

    case 'status': {
      const resultsDir = options.args[0];
      if (!resultsDir) {
        console.error('Error: Results directory required');
        process.exit(1);
      }

      showStatus(resultsDir);
      break;
    }

    case 'report': {
      const resultsDir = options.args[0];
      if (!resultsDir) {
        console.error('Error: Results directory required');
        process.exit(1);
      }

      try {
        const manifestPath = path.join(resultsDir, 'manifest.json');
        const jsonldPath = path.join(resultsDir, 'jsonld-results.json');
        const jobStatePath = path.join(resultsDir, 'job-state.json');

        if (!fs.existsSync(manifestPath)) {
          console.error(`Error: manifest.json not found in ${resultsDir}`);
          process.exit(1);
        }

        const manifest = validateManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf-8')));
        const jsonld = fs.existsSync(jsonldPath)
          ? JSON.parse(fs.readFileSync(jsonldPath, 'utf-8'))
          : undefined;
        const jobState = fs.existsSync(jobStatePath)
          ? JSON.parse(fs.readFileSync(jobStatePath, 'utf-8'))
          : undefined;

        const results: StudyResults = {
          manifest,
          jsonld,
          timestamp: jobState?.completedAt || new Date().toISOString(),
        };

        const reportHtml = generateReport(results);
        const reportPath = path.join(resultsDir, 'report.html');
        saveReport(reportHtml, reportPath);

        console.log(`✓ Report generated: ${reportPath}`);
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
      break;
    }

    default:
      console.error(`Unknown command: ${options.command}`);
      console.log('Run "visibility-tool --help" for usage');
      process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
