/**
 * bentham study - Run studies from manifests (lights-out execution)
 *
 * Usage:
 *   bentham study run manifest.yaml       # Run a study
 *   bentham study validate manifest.yaml  # Validate without running
 *   bentham study estimate manifest.yaml  # Estimate cost and duration
 *   bentham study status <job-id>         # Check status
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { LOCATIONS, type LocationId, isValidLocationId } from '@bentham/core';

interface ManifestQuery {
  text: string;
  context?: string;
  category?: string;
}

interface ManifestSurface {
  id: string;
  required?: boolean;
  options?: {
    model?: string;
  };
}

interface ManifestLocation {
  id: string;
  proxyType?: 'residential' | 'datacenter' | 'mobile';
  proxyProvider?: string;
}

interface Manifest {
  name: string;
  description?: string;
  queries: ManifestQuery[];
  surfaces: ManifestSurface[];
  locations: ManifestLocation[];
  execution?: {
    mode?: 'headless' | 'interactive';
    timeout?: string;
    concurrency?: number;
    retry?: {
      maxAttempts?: number;
      backoffMs?: number[];
    };
  };
  output?: {
    format?: string[];
    destination?: string;
  };
}

interface StudyResult {
  query: string;
  surface: string;
  location: string;
  response: string;
  timestamp: string;
  success: boolean;
  error?: string;
  metadata?: {
    ip?: string;
    responseTimeMs?: number;
  };
}

export const studyCommand = new Command('study')
  .description('Run studies from manifests');

/**
 * Validate a manifest
 */
studyCommand
  .command('validate <manifest>')
  .description('Validate a manifest file')
  .action(async (manifestPath: string) => {
    const spinner = ora('Validating manifest...').start();

    try {
      const manifest = loadManifest(manifestPath);
      const errors = validateManifest(manifest);

      if (errors.length > 0) {
        spinner.fail('Manifest validation failed');
        console.log();
        for (const error of errors) {
          console.log(chalk.red(`  ✗ ${error}`));
        }
        process.exit(1);
      }

      spinner.succeed('Manifest is valid');
      console.log();
      printManifestSummary(manifest);

    } catch (error) {
      spinner.fail('Failed to load manifest');
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

/**
 * Estimate cost and duration
 */
studyCommand
  .command('estimate <manifest>')
  .description('Estimate cost and duration for a study')
  .action(async (manifestPath: string) => {
    const spinner = ora('Loading manifest...').start();

    try {
      const manifest = loadManifest(manifestPath);
      spinner.succeed('Manifest loaded');

      const cellCount = manifest.queries.length * manifest.surfaces.length * manifest.locations.length;

      console.log();
      console.log(chalk.bold('Study Estimate'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(`Name:      ${chalk.cyan(manifest.name)}`);
      console.log(`Queries:   ${manifest.queries.length}`);
      console.log(`Surfaces:  ${manifest.surfaces.length}`);
      console.log(`Locations: ${manifest.locations.length}`);
      console.log(`Total Cells: ${chalk.yellow(cellCount)}`);
      console.log();

      // Cost estimate
      const costs = estimateCosts(manifest);
      console.log(chalk.bold('Estimated Costs (per 1,000 queries)'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(`API Tokens:   $${costs.apiTokens.toFixed(2)}`);
      console.log(`Web Search:   $${costs.webSearch.toFixed(2)}`);
      console.log(`Proxy:        $${costs.proxy.toFixed(2)}`);
      console.log(`Subscription: $${costs.subscription.toFixed(2)}`);
      console.log(chalk.bold(`TOTAL:        $${costs.total.toFixed(2)}`));
      console.log();

      // Actual cost for this study
      const actualCost = (costs.total / 1000) * cellCount;
      console.log(chalk.bold(`Cost for this study (${cellCount} cells): $${actualCost.toFixed(2)}`));
      console.log();

      // Duration estimate
      const durationMinutes = Math.ceil(cellCount * 3 / 60);  // ~3 seconds per cell
      console.log(chalk.bold('Estimated Duration'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(`Sequential: ~${durationMinutes} minutes`);
      console.log(`Parallel (4 workers): ~${Math.ceil(durationMinutes / 4)} minutes`);

    } catch (error) {
      spinner.fail('Failed to estimate');
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

/**
 * Run a study
 */
studyCommand
  .command('run <manifest>')
  .description('Run a study from a manifest')
  .option('-o, --output <dir>', 'Output directory', './results')
  .option('--dry-run', 'Validate and estimate without running', false)
  .option('--headless', 'Run in headless mode (no browser windows)', false)
  .action(async (manifestPath: string, options) => {
    const spinner = ora();

    try {
      // Load and validate
      spinner.start('Loading manifest...');
      const manifest = loadManifest(manifestPath);
      const errors = validateManifest(manifest);

      if (errors.length > 0) {
        spinner.fail('Manifest validation failed');
        for (const error of errors) {
          console.log(chalk.red(`  ✗ ${error}`));
        }
        process.exit(1);
      }
      spinner.succeed('Manifest validated');

      // Print summary
      printManifestSummary(manifest);

      if (options.dryRun) {
        console.log(chalk.yellow('\n--dry-run specified, not executing study'));
        return;
      }

      // Create output directory
      const outputDir = path.resolve(options.output);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Execute study
      const cellCount = manifest.queries.length * manifest.surfaces.length * manifest.locations.length;
      console.log();
      console.log(chalk.bold(`Starting study: ${cellCount} cells`));
      console.log(chalk.gray('─'.repeat(50)));

      const results: StudyResult[] = [];
      let completed = 0;
      let failed = 0;

      for (const location of manifest.locations) {
        for (const surface of manifest.surfaces) {
          for (const query of manifest.queries) {
            completed++;
            const progress = `[${completed}/${cellCount}]`;

            spinner.start(`${progress} ${surface.id} / ${location.id}: ${query.text.slice(0, 40)}...`);

            try {
              const result = await executeQuery(query.text, surface.id, location.id, options.headless);
              results.push(result);
              spinner.succeed(`${progress} Done (${result.metadata?.responseTimeMs}ms)`);
            } catch (error) {
              failed++;
              const errorMsg = error instanceof Error ? error.message : String(error);
              results.push({
                query: query.text,
                surface: surface.id,
                location: location.id,
                response: '',
                timestamp: new Date().toISOString(),
                success: false,
                error: errorMsg,
              });
              spinner.fail(`${progress} Failed: ${errorMsg}`);
            }

            // Rate limiting
            await sleep(1000);
          }
        }
      }

      // Save results
      const outputPath = path.join(outputDir, `${manifest.name.replace(/\s+/g, '-').toLowerCase()}-results.json`);
      fs.writeFileSync(outputPath, JSON.stringify({
        manifest: manifest.name,
        timestamp: new Date().toISOString(),
        cellCount,
        completed: completed - failed,
        failed,
        results,
      }, null, 2));

      console.log();
      console.log(chalk.bold('Study Complete'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(`Completed: ${chalk.green(completed - failed)}/${cellCount}`);
      console.log(`Failed:    ${failed > 0 ? chalk.red(failed) : '0'}`);
      console.log(`Output:    ${outputPath}`);

    } catch (error) {
      spinner.fail('Study failed');
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

// Helper functions

function loadManifest(filePath: string): Manifest {
  const content = fs.readFileSync(filePath, 'utf-8');
  if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
    return yaml.parse(content);
  }
  return JSON.parse(content);
}

function validateManifest(manifest: Manifest): string[] {
  const errors: string[] = [];

  if (!manifest.name) errors.push('name is required');
  if (!manifest.queries || manifest.queries.length === 0) errors.push('at least one query required');
  if (!manifest.surfaces || manifest.surfaces.length === 0) errors.push('at least one surface required');
  if (!manifest.locations || manifest.locations.length === 0) errors.push('at least one location required');

  // Validate locations
  for (const loc of manifest.locations || []) {
    if (!isValidLocationId(loc.id)) {
      errors.push(`invalid location: ${loc.id}`);
    }
  }

  // Validate surfaces
  const validSurfaces = ['chatgpt-web', 'chat-api', 'websearch-api', 'perplexity-api', 'anthropic-api'];
  for (const surface of manifest.surfaces || []) {
    if (!validSurfaces.includes(surface.id)) {
      errors.push(`invalid surface: ${surface.id} (valid: ${validSurfaces.join(', ')})`);
    }
  }

  return errors;
}

function printManifestSummary(manifest: Manifest): void {
  const cellCount = manifest.queries.length * manifest.surfaces.length * manifest.locations.length;

  console.log(chalk.bold('Study Summary'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(`Name:       ${chalk.cyan(manifest.name)}`);
  if (manifest.description) {
    console.log(`Desc:       ${manifest.description}`);
  }
  console.log(`Queries:    ${manifest.queries.length}`);
  console.log(`Surfaces:   ${manifest.surfaces.map(s => s.id).join(', ')}`);
  console.log(`Locations:  ${manifest.locations.map(l => l.id).join(', ')}`);
  console.log(`Total Cells: ${chalk.yellow(cellCount)}`);
}

function estimateCosts(manifest: Manifest): {
  apiTokens: number;
  webSearch: number;
  proxy: number;
  subscription: number;
  total: number;
} {
  let apiTokens = 0;
  let webSearch = 0;
  let proxy = 0;
  let subscription = 0;

  for (const surface of manifest.surfaces) {
    if (surface.id === 'chat-api') {
      apiTokens += 3.50;
    } else if (surface.id === 'websearch-api') {
      apiTokens += 5.00;
      webSearch += 30.00;
    } else if (surface.id === 'chatgpt-web') {
      subscription += 20.00;
    }
  }

  for (const location of manifest.locations) {
    if (location.id.startsWith('in-')) {
      proxy += 25.00 * manifest.surfaces.length;
    }
  }

  return {
    apiTokens,
    webSearch,
    proxy,
    subscription,
    total: apiTokens + webSearch + proxy + subscription,
  };
}

async function executeQuery(
  query: string,
  surfaceId: string,
  locationId: string,
  headless: boolean
): Promise<StudyResult> {
  const startTime = Date.now();

  // For now, only support API surfaces in lights-out mode
  if (surfaceId === 'chatgpt-web') {
    throw new Error('ChatGPT Web requires browser automation - use chat-api or websearch-api for lights-out execution');
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set');
  }

  let response: string;

  if (surfaceId === 'chat-api') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: query }],
        max_tokens: 2000,
      }),
    });

    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }

    const data = await res.json() as any;
    response = data.choices[0].message.content;

  } else if (surfaceId === 'websearch-api') {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        tools: [{ type: 'web_search' }],
        input: query,
      }),
    });

    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }

    const data = await res.json() as any;
    response = '';
    for (const item of data.output || []) {
      if (item.type === 'message' && item.content) {
        for (const block of item.content) {
          if (block.type === 'output_text') {
            response += block.text;
          }
        }
      }
    }

  } else {
    throw new Error(`Surface ${surfaceId} not yet implemented for lights-out execution`);
  }

  return {
    query,
    surface: surfaceId,
    location: locationId,
    response,
    timestamp: new Date().toISOString(),
    success: true,
    metadata: {
      responseTimeMs: Date.now() - startTime,
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
