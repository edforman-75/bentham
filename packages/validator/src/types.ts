/**
 * Validator Types
 *
 * Types for job and study validation.
 */

import type { JobResult, QualityGates, EvidenceLevel, CompletionCriteria } from '@bentham/core';

/**
 * Validation result status
 */
export type ValidationStatus = 'passed' | 'failed' | 'warning';

/**
 * Individual validation check result
 */
export interface ValidationCheck {
  /** Check name */
  name: string;
  /** Whether check passed */
  passed: boolean;
  /** Check message */
  message: string;
  /** Check severity */
  severity: 'error' | 'warning' | 'info';
  /** Additional details */
  details?: Record<string, unknown>;
}

/**
 * Job validation result
 */
export interface JobValidationResult {
  /** Job ID */
  jobId: string;
  /** Overall status */
  status: ValidationStatus;
  /** Individual checks */
  checks: ValidationCheck[];
  /** Quality gates passed */
  qualityGatesPassed: boolean;
  /** Is actual content (not error page) */
  isActualContent: boolean;
  /** Evidence validated */
  evidenceValidated: boolean;
  /** Response length */
  responseLength: number;
  /** Validation timestamp */
  validatedAt: Date;
}

/**
 * Study validation result
 */
export interface StudyValidationResult {
  /** Study ID */
  studyId: string;
  /** Overall status */
  status: ValidationStatus;
  /** Whether study can be marked complete */
  canComplete: boolean;
  /** Individual surface results */
  surfaceResults: SurfaceValidationResult[];
  /** Completion criteria met */
  completionCriteriaMet: boolean;
  /** Missing criteria */
  missingCriteria: string[];
  /** Warnings */
  warnings: string[];
  /** Validation timestamp */
  validatedAt: Date;
}

/**
 * Surface validation result
 */
export interface SurfaceValidationResult {
  /** Surface ID */
  surfaceId: string;
  /** Whether surface is required */
  isRequired: boolean;
  /** Total jobs for this surface */
  totalJobs: number;
  /** Completed jobs */
  completedJobs: number;
  /** Failed jobs */
  failedJobs: number;
  /** Completion rate (0-1) */
  completionRate: number;
  /** Required threshold */
  requiredThreshold: number;
  /** Whether threshold is met */
  thresholdMet: boolean;
  /** Average response quality score */
  avgQualityScore?: number;
}

/**
 * Content validation options
 */
export interface ContentValidationOptions {
  /** Minimum response length */
  minResponseLength?: number;
  /** Maximum response length */
  maxResponseLength?: number;
  /** Required keywords that must appear */
  requiredKeywords?: string[];
  /** Forbidden keywords that must not appear */
  forbiddenKeywords?: string[];
  /** Check for error page patterns */
  checkErrorPatterns?: boolean;
  /** Custom content validators */
  customValidators?: ContentValidator[];
}

/**
 * Custom content validator function
 */
export type ContentValidator = (content: string) => ValidationCheck;

/**
 * Evidence validation options
 */
export interface EvidenceValidationOptions {
  /** Required evidence level */
  evidenceLevel: EvidenceLevel;
  /** Require screenshot */
  requireScreenshot?: boolean;
  /** Require HTML archive */
  requireHtmlArchive?: boolean;
  /** Require HAR file */
  requireHarFile?: boolean;
  /** Require hash */
  requireHash?: boolean;
  /** Require timestamp */
  requireTimestamp?: boolean;
}

/**
 * Validator configuration
 */
export interface ValidatorConfig {
  /** Default content validation options */
  defaultContentOptions?: ContentValidationOptions;
  /** Default evidence validation options */
  defaultEvidenceOptions?: EvidenceValidationOptions;
  /** Strict mode - fail on any warning */
  strictMode?: boolean;
  /** Common error page patterns */
  errorPagePatterns?: string[];
}

/**
 * Default validator configuration
 */
export const DEFAULT_VALIDATOR_CONFIG: ValidatorConfig = {
  defaultContentOptions: {
    checkErrorPatterns: true,
  },
  defaultEvidenceOptions: {
    evidenceLevel: 'metadata',
  },
  strictMode: false,
  errorPagePatterns: [
    'error',
    '404',
    'not found',
    'access denied',
    'forbidden',
    'rate limit',
    'too many requests',
    'temporarily unavailable',
    'service unavailable',
    'internal server error',
    'bad gateway',
  ],
};

/**
 * Job data for validation
 */
export interface JobForValidation {
  /** Job ID */
  id: string;
  /** Study ID */
  studyId: string;
  /** Surface ID */
  surfaceId: string;
  /** Job result */
  result?: JobResult;
  /** Quality gates to apply */
  qualityGates: QualityGates;
  /** Evidence level required */
  evidenceLevel: EvidenceLevel;
}

/**
 * Study data for validation
 */
export interface StudyForValidation {
  /** Study ID */
  studyId: string;
  /** Completion criteria */
  completionCriteria: CompletionCriteria;
  /** Jobs by surface */
  jobsBySurface: Record<string, {
    total: number;
    completed: number;
    failed: number;
  }>;
}

/**
 * Validator statistics
 */
export interface ValidatorStats {
  /** Total validations performed */
  totalValidations: number;
  /** Validations passed */
  validationsPassed: number;
  /** Validations failed */
  validationsFailed: number;
  /** Pass rate */
  passRate: number;
  /** Common failure reasons */
  commonFailures: Record<string, number>;
}
