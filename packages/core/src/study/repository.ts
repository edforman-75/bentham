/**
 * Study Repository System
 *
 * Manages study manifests, execution metadata, and results with proper
 * tenant isolation and audit trails.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * IP verification information captured during study execution
 */
export interface IPVerificationRecord {
  ip: string;
  country: string;
  city: string;
  region: string;
  org: string;
  timezone: string;
  coordinates?: string;
  asn?: string;
  isProxy?: boolean;
  verifiedAt: string;
  lookupDurationMs: number;
  expectedLocation: string;
  verified: boolean;
  mismatchWarning?: string;
}

/**
 * Study completion information
 */
export interface StudyCompletionInfo {
  status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted' | 'partial';
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  totalCells: number;
  completedCells: number;
  failedCells: number;
  successRate: number;
  checkpointPath?: string;
  resumedFrom?: string;
  abortReason?: string;
}

/**
 * Study execution metadata - captures the full context of a study run
 */
export interface StudyExecutionMetadata {
  // Identification
  runId: string;
  studyId: string;
  manifestPath: string;
  tenantId: string;

  // Job information
  job: {
    name: string;
    description?: string;
    createdBy: string;
    createdAt: string;
    tags?: string[];
    clientRef?: string;  // Client reference (e.g., "HUFT India Study")
  };

  // IP/Location information
  ipVerification: IPVerificationRecord;

  // Completion information
  completion: StudyCompletionInfo;

  // Execution environment
  environment: {
    nodeVersion: string;
    platform: string;
    benthamVersion: string;
    hostname?: string;
    timezone: string;
  };

  // Cost tracking
  costs?: {
    totalUsd: number;
    byProvider: Record<string, number>;
    byOperation: Record<string, number>;
  };

  // Warnings and errors
  warnings?: Array<{
    code: string;
    message: string;
    severity: 'low' | 'medium' | 'high';
    queryIndex?: number;
    timestamp: string;
  }>;

  // Recovery information
  recovery?: {
    sessionRecoveries: number;
    proxyRotations: number;
    retriedQueries: number;
    lastCheckpointAt?: string;
  };
}

/**
 * Study manifest - declarative study definition
 */
export interface StudyManifest {
  version: string;
  id: string;
  name: string;
  description?: string;

  // Tenant ownership
  tenant: {
    id: string;
    name: string;
  };

  // Query configuration
  queries: {
    source: 'inline' | 'file' | 'api';
    items?: string[];
    file?: string;
    apiEndpoint?: string;
    transformations?: Array<{
      type: 'suffix' | 'prefix' | 'template';
      value: string;
      condition?: string;
    }>;
  };

  // Surface configuration
  surfaces: Array<{
    id: string;
    enabled: boolean;
    priority?: number;
    config?: Record<string, unknown>;
  }>;

  // Location configuration
  locations: Array<{
    id: string;
    enabled: boolean;
    proxyRequired: boolean;
    proxyProvider?: string;
  }>;

  // Execution configuration
  execution: {
    concurrency: number;
    retryConfig: {
      maxRetries: number;
      backoffStrategy: 'fixed' | 'linear' | 'exponential';
      initialDelayMs: number;
      maxDelayMs: number;
    };
    checkpointEnabled: boolean;
    checkpointIntervalQueries: number;
    timeouts: {
      queryMs: number;
      surfaceMs: number;
      totalMs?: number;
    };
  };

  // Output configuration
  output: {
    format: 'json' | 'jsonl';
    directory: string;
    filePattern: string;
    includeRawResponses: boolean;
    includeTimings: boolean;
  };

  // Quality gates
  qualityGates?: {
    minSuccessRate: number;
    maxFailureStreak: number;
    requiredSurfaces?: string[];
  };
}

/**
 * Study result summary for repository indexing
 */
export interface StudyResultSummary {
  runId: string;
  studyId: string;
  tenantId: string;
  manifestPath: string;

  // Execution info
  startedAt: string;
  completedAt?: string;
  status: StudyCompletionInfo['status'];

  // IP info
  ip: string;
  location: string;
  ipVerified: boolean;

  // Results summary
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  successRate: number;

  // Surfaces used
  surfaces: string[];
  locations: string[];

  // Output paths
  resultFiles: string[];
  reportFiles?: string[];
  checkpointFile?: string;

  // Cost
  totalCostUsd?: number;
}

/**
 * Repository directory structure
 */
export interface RepositoryStructure {
  root: string;
  manifests: string;
  results: string;
  checkpoints: string;
  reports: string;
  index: string;
}

/**
 * Create the standard repository directory structure
 */
export function createRepositoryStructure(rootDir: string): RepositoryStructure {
  const structure: RepositoryStructure = {
    root: rootDir,
    manifests: path.join(rootDir, 'manifests'),
    results: path.join(rootDir, 'results'),
    checkpoints: path.join(rootDir, 'checkpoints'),
    reports: path.join(rootDir, 'reports'),
    index: path.join(rootDir, 'index'),
  };

  // Create directories
  for (const dir of Object.values(structure)) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  return structure;
}

/**
 * Create tenant-specific directory structure
 */
export function createTenantStructure(
  repoStructure: RepositoryStructure,
  tenantId: string
): {
  manifests: string;
  results: string;
  checkpoints: string;
  reports: string;
} {
  const tenantDirs = {
    manifests: path.join(repoStructure.manifests, tenantId),
    results: path.join(repoStructure.results, tenantId),
    checkpoints: path.join(repoStructure.checkpoints, tenantId),
    reports: path.join(repoStructure.reports, tenantId),
  };

  for (const dir of Object.values(tenantDirs)) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  return tenantDirs;
}

/**
 * Study repository manager
 */
export class StudyRepository {
  private structure: RepositoryStructure;
  private indexPath: string;

  constructor(rootDir: string) {
    this.structure = createRepositoryStructure(rootDir);
    this.indexPath = path.join(this.structure.index, 'studies.json');
    this.ensureIndex();
  }

  private ensureIndex(): void {
    if (!fs.existsSync(this.indexPath)) {
      fs.writeFileSync(this.indexPath, JSON.stringify({
        version: '1.0',
        studies: [],
        lastUpdated: new Date().toISOString(),
      }, null, 2));
    }
  }

  /**
   * Load the study index
   */
  loadIndex(): { version: string; studies: StudyResultSummary[]; lastUpdated: string } {
    const content = fs.readFileSync(this.indexPath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Save the study index
   */
  private saveIndex(index: { version: string; studies: StudyResultSummary[]; lastUpdated: string }): void {
    index.lastUpdated = new Date().toISOString();
    fs.writeFileSync(this.indexPath, JSON.stringify(index, null, 2));
  }

  /**
   * Register a new study run
   */
  registerStudyRun(summary: StudyResultSummary): void {
    const index = this.loadIndex();

    // Check for duplicate
    const existing = index.studies.findIndex(s => s.runId === summary.runId);
    if (existing >= 0) {
      index.studies[existing] = summary;
    } else {
      index.studies.push(summary);
    }

    this.saveIndex(index);
  }

  /**
   * Update study run status
   */
  updateStudyStatus(runId: string, update: Partial<StudyResultSummary>): void {
    const index = this.loadIndex();
    const studyIndex = index.studies.findIndex(s => s.runId === runId);

    if (studyIndex >= 0) {
      index.studies[studyIndex] = { ...index.studies[studyIndex], ...update };
      this.saveIndex(index);
    }
  }

  /**
   * Get studies by tenant
   */
  getStudiesByTenant(tenantId: string): StudyResultSummary[] {
    const index = this.loadIndex();
    return index.studies.filter(s => s.tenantId === tenantId);
  }

  /**
   * Get studies by status
   */
  getStudiesByStatus(status: StudyCompletionInfo['status']): StudyResultSummary[] {
    const index = this.loadIndex();
    return index.studies.filter(s => s.status === status);
  }

  /**
   * Get recent studies
   */
  getRecentStudies(limit: number = 10): StudyResultSummary[] {
    const index = this.loadIndex();
    return index.studies
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, limit);
  }

  /**
   * Save study manifest
   */
  saveManifest(manifest: StudyManifest, tenantId: string): string {
    const tenantDirs = createTenantStructure(this.structure, tenantId);
    const manifestPath = path.join(tenantDirs.manifests, `${manifest.id}.yaml`);

    // Convert to YAML-like format (simplified for now)
    const yamlContent = `# Study Manifest: ${manifest.name}
# Generated: ${new Date().toISOString()}

version: "${manifest.version}"
id: "${manifest.id}"
name: "${manifest.name}"
${manifest.description ? `description: "${manifest.description}"` : ''}

tenant:
  id: "${manifest.tenant.id}"
  name: "${manifest.tenant.name}"

queries:
  source: "${manifest.queries.source}"
${manifest.queries.items ? `  items:\n${manifest.queries.items.map(q => `    - "${q}"`).join('\n')}` : ''}

surfaces:
${manifest.surfaces.map(s => `  - id: "${s.id}"\n    enabled: ${s.enabled}${s.priority ? `\n    priority: ${s.priority}` : ''}`).join('\n')}

locations:
${manifest.locations.map(l => `  - id: "${l.id}"\n    enabled: ${l.enabled}\n    proxyRequired: ${l.proxyRequired}${l.proxyProvider ? `\n    proxyProvider: "${l.proxyProvider}"` : ''}`).join('\n')}

execution:
  concurrency: ${manifest.execution.concurrency}
  retryConfig:
    maxRetries: ${manifest.execution.retryConfig.maxRetries}
    backoffStrategy: "${manifest.execution.retryConfig.backoffStrategy}"
    initialDelayMs: ${manifest.execution.retryConfig.initialDelayMs}
    maxDelayMs: ${manifest.execution.retryConfig.maxDelayMs}
  checkpointEnabled: ${manifest.execution.checkpointEnabled}
  checkpointIntervalQueries: ${manifest.execution.checkpointIntervalQueries}
  timeouts:
    queryMs: ${manifest.execution.timeouts.queryMs}
    surfaceMs: ${manifest.execution.timeouts.surfaceMs}
${manifest.execution.timeouts.totalMs ? `    totalMs: ${manifest.execution.timeouts.totalMs}` : ''}

output:
  format: "${manifest.output.format}"
  directory: "${manifest.output.directory}"
  filePattern: "${manifest.output.filePattern}"
  includeRawResponses: ${manifest.output.includeRawResponses}
  includeTimings: ${manifest.output.includeTimings}
`;

    fs.writeFileSync(manifestPath, yamlContent);
    return manifestPath;
  }

  /**
   * Save execution metadata
   */
  saveExecutionMetadata(metadata: StudyExecutionMetadata): string {
    const tenantDirs = createTenantStructure(this.structure, metadata.tenantId);
    const metadataPath = path.join(
      tenantDirs.results,
      metadata.studyId,
      `${metadata.runId}-metadata.json`
    );

    const metadataDir = path.dirname(metadataPath);
    if (!fs.existsSync(metadataDir)) {
      fs.mkdirSync(metadataDir, { recursive: true });
    }

    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    return metadataPath;
  }

  /**
   * Get repository structure
   */
  getStructure(): RepositoryStructure {
    return this.structure;
  }
}

/**
 * Create a study execution metadata object from study results
 */
export function createExecutionMetadata(
  runId: string,
  studyId: string,
  manifestPath: string,
  tenantId: string,
  job: StudyExecutionMetadata['job'],
  ipVerification: IPVerificationRecord,
  completion: StudyCompletionInfo,
  options?: {
    costs?: StudyExecutionMetadata['costs'];
    warnings?: StudyExecutionMetadata['warnings'];
    recovery?: StudyExecutionMetadata['recovery'];
  }
): StudyExecutionMetadata {
  return {
    runId,
    studyId,
    manifestPath,
    tenantId,
    job,
    ipVerification,
    completion,
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      benthamVersion: '0.1.0',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    costs: options?.costs,
    warnings: options?.warnings,
    recovery: options?.recovery,
  };
}

/**
 * Generate a unique run ID
 */
export function generateRunId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `run_${timestamp}_${random}`;
}

/**
 * Generate a unique study ID from name
 */
export function generateStudyId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const timestamp = Date.now().toString(36).slice(-4);
  return `${slug}-${timestamp}`;
}
