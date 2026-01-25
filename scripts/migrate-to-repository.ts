#!/usr/bin/env npx tsx
/**
 * Migrate Bentham Studies to Repository Structure
 *
 * This script organizes existing study files, scripts, and results into
 * the proper repository structure with tenant isolation.
 *
 * Usage:
 *   npx tsx scripts/migrate-to-repository.ts              # Dry run
 *   npx tsx scripts/migrate-to-repository.ts --execute    # Actually migrate
 *   npx tsx scripts/migrate-to-repository.ts --tenant glu # Migrate specific tenant
 */

import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// CONFIGURATION
// =============================================================================

interface TenantConfig {
  id: string;
  name: string;
  patterns: RegExp[];  // Patterns to identify tenant files
  scripts: string[];   // Scripts belonging to this tenant
  studies: string[];   // Study result patterns
}

const TENANTS: TenantConfig[] = [
  {
    id: 'glu',
    name: 'GLU Brand Analysis',
    patterns: [
      /huft/i,
      /heads.?up.?for.?tails/i,
      /pet.?food/i,
      /blue.?buffalo/i,
      /ranjan/i,
    ],
    scripts: [
      'analyze-google-visibility.ts',
      'analyze-huft-web-layers.ts',
      'analyze-chatgpt-web-layers.ts',
      'analyze-study-costs.ts',
      'analyze-ai-overview-results.ts',
      'correlation-analysis.ts',
      'audit-jsonld-correlation.ts',
      'compare-chatgpt-web-vs-api.ts',
      'generate-detailed-comparison.ts',
      'generate-verbatim-comparison-report.ts',
      'generate-rated-comparison-report.ts',
      'generate-web-layer-report.ts',
      'add-cost-tab.ts',
      'add-influence-tab.ts',
      'export-google-analysis-xlsx.ts',
      'run-ranjan-comparison-study.ts',
      'run-ranjan-india-suffix-study.ts',
    ],
    studies: [
      'huft-*',
      'google-visibility-*',
      'ranjan-*',
      'blue-buffalo-*',
      'pet-food-*',
    ],
  },
  {
    id: 'kyanos',
    name: 'Kyanos Electoral Analysis',
    patterns: [
      /kyanos/i,
      /todd.?achilles/i,
      /boise/i,
      /city.?of.?boise/i,
      /candidate/i,
      /voter/i,
      /electoral/i,
    ],
    scripts: [
      'run-kyanos-study.ts',
      'complete-boise-study.ts',
      'consolidate-boise-results.ts',
      'generate-boise-government-report.ts',
      'generate-comparison-report.ts',
      'analyze-results.ts',
    ],
    studies: [
      'city-of-boise-*',
      'todd-achilles-*',
      'kyanos-*',
    ],
  },
];

// Scripts that stay in Bentham core (execution infrastructure)
const CORE_SCRIPTS = [
  'run-api-studies.ts',
  'run-google-visibility-study.ts',
  'run-huft-study.ts',
  'run-huft-100-india-study.ts',
  'run-pet-food-100-study.ts',
  'run-study-auto.ts',
  'run-study-via-pipeline.ts',
  'run-chatgpt-india-study.ts',
  'run-gemini-india-study.ts',
  'run-gemini-api-study.ts',
  'run-three-way-study.ts',
  'run-rufus-study.ts',
  'run-meta-human.ts',
  'run-search-human.ts',
  'run-chatgpt-human.ts',
  'run-google-us-study.ts',
  'run-google-india-v2.ts',
  'run-google-india-bangalore.ts',
  'complete-india-study.ts',
  'retry-failed-queries.ts',
  'retry-failed.ts',
  'rerun-google-ai-overview.ts',
  'capture-session.ts',
  'run-surface-incremental.ts',
  'test-all-surfaces.ts',
  'test-all-surfaces-parallel.ts',
  'test-single-api.ts',
  'test-all-cdp.ts',
  'test-ai-overview.ts',
  'test-google-ai-overview.ts',
  'test-india-proxy-stealth.ts',
  'debug-chatgpt.ts',
  'debug-web-surface.ts',
  'query-via-cdp.ts',
  'serpapi-google-search.ts',
  'serpapi-google-ai-overview.ts',
  'serpapi-bing-search.ts',
  'check-perplexity-inputs.ts',
  'inspect-surfaces.ts',
  'inspect-copilot.ts',
  'inspect-grok-metaai.ts',
  'find-rufus.ts',
  'migrate-to-repository.ts',
  'check-docs.sh',
  'check-charter-compliance.sh',
];

// =============================================================================
// MIGRATION LOGIC
// =============================================================================

interface MigrationAction {
  type: 'move' | 'copy' | 'create' | 'skip';
  source?: string;
  destination: string;
  reason: string;
  tenant?: string;
}

interface MigrationPlan {
  actions: MigrationAction[];
  warnings: string[];
  stats: {
    scriptsToMove: number;
    studiesToOrganize: number;
    manifestsToCreate: number;
    dirsToCreate: number;
  };
}

function identifyTenant(filename: string, content?: string): string | null {
  for (const tenant of TENANTS) {
    // Check if script is explicitly listed
    if (tenant.scripts.includes(path.basename(filename))) {
      return tenant.id;
    }

    // Check filename patterns
    for (const pattern of tenant.patterns) {
      if (pattern.test(filename)) {
        return tenant.id;
      }
    }

    // Check content if provided
    if (content) {
      for (const pattern of tenant.patterns) {
        if (pattern.test(content)) {
          return tenant.id;
        }
      }
    }
  }

  return null;
}

function isCoreScript(filename: string): boolean {
  return CORE_SCRIPTS.includes(path.basename(filename));
}

function planScriptMigration(scriptsDir: string): MigrationAction[] {
  const actions: MigrationAction[] = [];

  if (!fs.existsSync(scriptsDir)) {
    return actions;
  }

  const files = fs.readdirSync(scriptsDir);

  for (const file of files) {
    const fullPath = path.join(scriptsDir, file);
    const stat = fs.statSync(fullPath);

    if (!stat.isFile()) continue;
    if (!file.endsWith('.ts') && !file.endsWith('.js') && !file.endsWith('.sh')) continue;

    if (isCoreScript(file)) {
      actions.push({
        type: 'skip',
        destination: fullPath,
        reason: 'Core execution script - stays in Bentham',
      });
      continue;
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    const tenant = identifyTenant(file, content);

    if (tenant) {
      const tenantDir = `tenant-repos/${tenant}/scripts`;
      actions.push({
        type: 'move',
        source: fullPath,
        destination: path.join(tenantDir, file),
        reason: `Analysis/reporting script for ${tenant}`,
        tenant,
      });
    } else {
      actions.push({
        type: 'skip',
        destination: fullPath,
        reason: 'Could not identify tenant - review manually',
      });
    }
  }

  return actions;
}

function planStudyMigration(studiesDir: string): MigrationAction[] {
  const actions: MigrationAction[] = [];

  if (!fs.existsSync(studiesDir)) {
    return actions;
  }

  function processDir(dir: string, relativePath: string = '') {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        processDir(fullPath, path.join(relativePath, file));
        continue;
      }

      const relativeFilePath = path.join(relativePath, file);

      // Determine file type
      const isReport = file.endsWith('.html') || file.endsWith('.md') ||
                       (file.endsWith('.json') && (file.includes('analysis') || file.includes('report')));
      const isWorkbook = file.endsWith('.xlsx') || file.endsWith('.csv');
      const isRawResult = file.endsWith('.json') && (file.includes('-results') || file.includes('-intermediate'));

      // Identify tenant
      const content = file.endsWith('.json') ? fs.readFileSync(fullPath, 'utf-8').slice(0, 2000) : '';
      const tenant = identifyTenant(file, content);

      if (isRawResult) {
        // Raw results stay in Bentham but organized by tenant
        if (tenant) {
          actions.push({
            type: 'move',
            source: fullPath,
            destination: `repository/results/${tenant}/${relativeFilePath}`,
            reason: 'Raw study result - organize by tenant',
            tenant,
          });
        } else {
          actions.push({
            type: 'skip',
            destination: fullPath,
            reason: 'Raw result - tenant unknown',
          });
        }
      } else if (isReport || isWorkbook) {
        // Reports and workbooks go to tenant repos
        if (tenant) {
          const subdir = isWorkbook ? 'workbooks' : 'reports';
          actions.push({
            type: 'move',
            source: fullPath,
            destination: `tenant-repos/${tenant}/${subdir}/${file}`,
            reason: `${isWorkbook ? 'Workbook' : 'Report'} for ${tenant}`,
            tenant,
          });
        } else {
          actions.push({
            type: 'skip',
            destination: fullPath,
            reason: 'Report/workbook - tenant unknown',
          });
        }
      }
    }
  }

  processDir(studiesDir);
  return actions;
}

function createManifestActions(): MigrationAction[] {
  const actions: MigrationAction[] = [];

  // Create manifest for each identified study pattern
  const studies = [
    { id: 'huft-india-visibility', name: 'HUFT India Visibility Study', tenant: 'glu' },
    { id: 'google-visibility', name: 'Google Visibility Study', tenant: 'glu' },
    { id: 'ranjan-comparison', name: 'Ranjan OpenAI Comparison', tenant: 'glu' },
    { id: 'city-of-boise', name: 'City of Boise Visibility', tenant: 'kyanos' },
    { id: 'todd-achilles', name: 'Todd Achilles Electoral Study', tenant: 'kyanos' },
  ];

  for (const study of studies) {
    actions.push({
      type: 'create',
      destination: `repository/manifests/${study.tenant}/${study.id}/manifest.yaml`,
      reason: `Create manifest for ${study.name}`,
      tenant: study.tenant,
    });
  }

  return actions;
}

function generateMigrationPlan(): MigrationPlan {
  const scriptsDir = path.join(process.cwd(), 'scripts');
  const studiesDir = path.join(process.cwd(), 'studies');

  const scriptActions = planScriptMigration(scriptsDir);
  const studyActions = planStudyMigration(studiesDir);
  const manifestActions = createManifestActions();

  const allActions = [...scriptActions, ...studyActions, ...manifestActions];

  const warnings: string[] = [];
  const skipped = allActions.filter(a => a.type === 'skip');
  if (skipped.length > 0) {
    warnings.push(`${skipped.length} files will be skipped - review manually`);
  }

  return {
    actions: allActions,
    warnings,
    stats: {
      scriptsToMove: scriptActions.filter(a => a.type === 'move').length,
      studiesToOrganize: studyActions.filter(a => a.type === 'move').length,
      manifestsToCreate: manifestActions.length,
      dirsToCreate: new Set(allActions.filter(a => a.type === 'move' || a.type === 'create')
        .map(a => path.dirname(a.destination))).size,
    },
  };
}

function executeMigration(plan: MigrationPlan, dryRun: boolean = true): void {
  console.log('\n' + '='.repeat(70));
  console.log(dryRun ? '  MIGRATION PLAN (DRY RUN)' : '  EXECUTING MIGRATION');
  console.log('='.repeat(70) + '\n');

  console.log('Statistics:');
  console.log(`  Scripts to move:      ${plan.stats.scriptsToMove}`);
  console.log(`  Studies to organize:  ${plan.stats.studiesToOrganize}`);
  console.log(`  Manifests to create:  ${plan.stats.manifestsToCreate}`);
  console.log(`  Directories to create: ${plan.stats.dirsToCreate}`);

  if (plan.warnings.length > 0) {
    console.log('\nWarnings:');
    for (const warning of plan.warnings) {
      console.log(`  ⚠️  ${warning}`);
    }
  }

  console.log('\n' + '-'.repeat(70));
  console.log('Actions:\n');

  // Group by tenant
  const byTenant: Record<string, MigrationAction[]> = { core: [] };
  for (const tenant of TENANTS) {
    byTenant[tenant.id] = [];
  }

  for (const action of plan.actions) {
    const key = action.tenant || 'core';
    byTenant[key].push(action);
  }

  for (const [tenant, actions] of Object.entries(byTenant)) {
    if (actions.length === 0) continue;

    console.log(`\n📁 ${tenant.toUpperCase()}`);
    console.log('-'.repeat(40));

    for (const action of actions) {
      const icon = action.type === 'move' ? '→' :
                   action.type === 'create' ? '+' :
                   action.type === 'skip' ? '○' : '?';

      if (action.type === 'skip') {
        console.log(`  ${icon} ${path.basename(action.destination)}`);
        console.log(`    ${action.reason}`);
      } else if (action.type === 'move') {
        console.log(`  ${icon} ${path.basename(action.source || '')}`);
        console.log(`    → ${action.destination}`);
      } else if (action.type === 'create') {
        console.log(`  ${icon} ${action.destination}`);
        console.log(`    ${action.reason}`);
      }
    }
  }

  if (!dryRun) {
    console.log('\n' + '-'.repeat(70));
    console.log('Executing...\n');

    // Create directories first
    const dirs = new Set(
      plan.actions
        .filter(a => a.type === 'move' || a.type === 'create')
        .map(a => path.dirname(a.destination))
    );

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`  📁 Created: ${dir}`);
      }
    }

    // Execute actions
    for (const action of plan.actions) {
      if (action.type === 'move' && action.source) {
        fs.copyFileSync(action.source, action.destination);
        console.log(`  ✓ Moved: ${path.basename(action.source)}`);
        // Note: We copy instead of move to preserve originals until verified
      } else if (action.type === 'create') {
        // Create placeholder manifest
        const manifestContent = `# Placeholder manifest
# TODO: Fill in with actual study configuration
id: ${path.basename(path.dirname(action.destination))}
version: "1.0"
`;
        fs.writeFileSync(action.destination, manifestContent);
        console.log(`  ✓ Created: ${action.destination}`);
      }
    }

    console.log('\n✓ Migration complete!');
    console.log('  Note: Original files preserved. Review and delete after verification.');
  } else {
    console.log('\n' + '-'.repeat(70));
    console.log('This was a dry run. To execute, run with --execute flag.');
  }
}

// =============================================================================
// MAIN
// =============================================================================

function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const tenantFilter = args.find(a => a.startsWith('--tenant='))?.split('=')[1];

  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║           BENTHAM STUDY REPOSITORY MIGRATION                       ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');

  const plan = generateMigrationPlan();

  // Filter by tenant if specified
  if (tenantFilter) {
    plan.actions = plan.actions.filter(a => !a.tenant || a.tenant === tenantFilter);
    console.log(`\nFiltering to tenant: ${tenantFilter}`);
  }

  executeMigration(plan, !execute);
}

main();
