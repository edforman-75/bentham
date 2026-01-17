/**
 * Validator Implementation
 *
 * Validates job outputs and study completion criteria.
 */

import type { JobEvidence } from '@bentham/core';
import type {
  JobValidationResult,
  StudyValidationResult,
  SurfaceValidationResult,
  ValidationCheck,
  ValidationStatus,
  ValidatorConfig,
  JobForValidation,
  StudyForValidation,
  ContentValidationOptions,
  EvidenceValidationOptions,
  ValidatorStats,
} from './types.js';
import { DEFAULT_VALIDATOR_CONFIG } from './types.js';

/**
 * Validator class - stateless validation service
 */
export class Validator {
  private config: ValidatorConfig;
  private stats: {
    totalValidations: number;
    passed: number;
    failed: number;
    failureReasons: Map<string, number>;
  };

  constructor(config: ValidatorConfig = {}) {
    this.config = {
      ...DEFAULT_VALIDATOR_CONFIG,
      ...config,
    };

    this.stats = {
      totalValidations: 0,
      passed: 0,
      failed: 0,
      failureReasons: new Map(),
    };
  }

  /**
   * Validate a job result
   */
  validateJob(job: JobForValidation): JobValidationResult {
    const checks: ValidationCheck[] = [];
    let isActualContent = false;
    let evidenceValidated = false;
    let responseLength = 0;

    this.stats.totalValidations++;

    // Check if job has result
    if (!job.result) {
      checks.push({
        name: 'result_present',
        passed: false,
        message: 'Job has no result',
        severity: 'error',
      });

      this.recordFailure('no_result');
      this.stats.failed++;

      return {
        jobId: job.id,
        status: 'failed',
        checks,
        qualityGatesPassed: false,
        isActualContent: false,
        evidenceValidated: false,
        responseLength: 0,
        validatedAt: new Date(),
      };
    }

    // Check if job succeeded
    if (!job.result.success) {
      checks.push({
        name: 'job_success',
        passed: false,
        message: job.result.error?.message ?? 'Job execution failed',
        severity: 'error',
        details: { error: job.result.error },
      });

      this.recordFailure('job_failed');
      this.stats.failed++;

      return {
        jobId: job.id,
        status: 'failed',
        checks,
        qualityGatesPassed: false,
        isActualContent: false,
        evidenceValidated: false,
        responseLength: 0,
        validatedAt: new Date(),
      };
    }

    checks.push({
      name: 'job_success',
      passed: true,
      message: 'Job execution succeeded',
      severity: 'info',
    });

    // Validate content
    const contentChecks = this.validateContent(
      job.result.response?.text ?? '',
      job.qualityGates
    );
    checks.push(...contentChecks);

    isActualContent = contentChecks.every(c => c.passed || c.severity !== 'error');
    responseLength = job.result.response?.text?.length ?? 0;

    // Validate evidence
    const evidenceChecks = this.validateEvidence(
      job.result.evidence,
      job.evidenceLevel
    );
    checks.push(...evidenceChecks);

    evidenceValidated = evidenceChecks.every(c => c.passed || c.severity !== 'error');

    // Determine overall status
    const hasErrors = checks.some(c => !c.passed && c.severity === 'error');
    const hasWarnings = checks.some(c => !c.passed && c.severity === 'warning');

    let status: ValidationStatus = 'passed';
    if (hasErrors) {
      status = 'failed';
      this.stats.failed++;
    } else if (hasWarnings && this.config.strictMode) {
      status = 'failed';
      this.stats.failed++;
    } else if (hasWarnings) {
      status = 'warning';
      this.stats.passed++;
    } else {
      this.stats.passed++;
    }

    return {
      jobId: job.id,
      status,
      checks,
      qualityGatesPassed: !hasErrors,
      isActualContent,
      evidenceValidated,
      responseLength,
      validatedAt: new Date(),
    };
  }

  /**
   * Validate content against quality gates
   */
  private validateContent(
    content: string,
    qualityGates: JobForValidation['qualityGates'],
    options?: ContentValidationOptions
  ): ValidationCheck[] {
    const checks: ValidationCheck[] = [];
    const opts = { ...this.config.defaultContentOptions, ...options };

    // Check content exists
    if (!content || content.trim().length === 0) {
      if (qualityGates.requireActualContent) {
        checks.push({
          name: 'content_present',
          passed: false,
          message: 'Response has no content',
          severity: 'error',
        });
        this.recordFailure('no_content');
      }
      return checks;
    }

    checks.push({
      name: 'content_present',
      passed: true,
      message: 'Response has content',
      severity: 'info',
    });

    // Check minimum length
    if (qualityGates.minResponseLength && content.length < qualityGates.minResponseLength) {
      checks.push({
        name: 'min_length',
        passed: false,
        message: `Response too short: ${content.length} < ${qualityGates.minResponseLength}`,
        severity: 'error',
        details: { actual: content.length, required: qualityGates.minResponseLength },
      });
      this.recordFailure('content_too_short');
    } else if (qualityGates.minResponseLength) {
      checks.push({
        name: 'min_length',
        passed: true,
        message: `Response length OK: ${content.length}`,
        severity: 'info',
      });
    }

    // Check for error patterns
    if (opts.checkErrorPatterns && qualityGates.requireActualContent) {
      const errorPattern = this.detectErrorPattern(content);
      if (errorPattern) {
        checks.push({
          name: 'error_pattern',
          passed: false,
          message: `Detected error pattern: ${errorPattern}`,
          severity: 'error',
          details: { pattern: errorPattern },
        });
        this.recordFailure('error_pattern_detected');
      } else {
        checks.push({
          name: 'error_pattern',
          passed: true,
          message: 'No error patterns detected',
          severity: 'info',
        });
      }
    }

    // Check required keywords
    if (opts.requiredKeywords && opts.requiredKeywords.length > 0) {
      const contentLower = content.toLowerCase();
      const missingKeywords = opts.requiredKeywords.filter(
        kw => !contentLower.includes(kw.toLowerCase())
      );

      if (missingKeywords.length > 0) {
        checks.push({
          name: 'required_keywords',
          passed: false,
          message: `Missing required keywords: ${missingKeywords.join(', ')}`,
          severity: 'warning',
          details: { missing: missingKeywords },
        });
      } else {
        checks.push({
          name: 'required_keywords',
          passed: true,
          message: 'All required keywords found',
          severity: 'info',
        });
      }
    }

    // Check forbidden keywords
    if (opts.forbiddenKeywords && opts.forbiddenKeywords.length > 0) {
      const contentLower = content.toLowerCase();
      const foundForbidden = opts.forbiddenKeywords.filter(
        kw => contentLower.includes(kw.toLowerCase())
      );

      if (foundForbidden.length > 0) {
        checks.push({
          name: 'forbidden_keywords',
          passed: false,
          message: `Found forbidden keywords: ${foundForbidden.join(', ')}`,
          severity: 'warning',
          details: { found: foundForbidden },
        });
      } else {
        checks.push({
          name: 'forbidden_keywords',
          passed: true,
          message: 'No forbidden keywords found',
          severity: 'info',
        });
      }
    }

    // Run custom validators
    if (opts.customValidators) {
      for (const validator of opts.customValidators) {
        checks.push(validator(content));
      }
    }

    return checks;
  }

  /**
   * Validate evidence
   */
  private validateEvidence(
    evidence: JobEvidence | undefined,
    evidenceLevel: JobForValidation['evidenceLevel'],
    _options?: EvidenceValidationOptions
  ): ValidationCheck[] {
    const checks: ValidationCheck[] = [];

    // If evidence level is 'none', skip validation
    if (evidenceLevel === 'none') {
      checks.push({
        name: 'evidence_level',
        passed: true,
        message: 'Evidence not required',
        severity: 'info',
      });
      return checks;
    }

    // Check evidence exists
    if (!evidence) {
      if (evidenceLevel === 'full') {
        checks.push({
          name: 'evidence_present',
          passed: false,
          message: 'Evidence required but not captured',
          severity: 'error',
        });
        this.recordFailure('no_evidence');
      } else {
        checks.push({
          name: 'evidence_present',
          passed: true,
          message: 'Evidence not present (metadata level)',
          severity: 'info',
        });
      }
      return checks;
    }

    checks.push({
      name: 'evidence_present',
      passed: true,
      message: 'Evidence captured',
      severity: 'info',
    });

    // Check hash
    if (evidence.sha256Hash) {
      checks.push({
        name: 'evidence_hash',
        passed: true,
        message: 'Evidence hash present',
        severity: 'info',
        details: { hash: evidence.sha256Hash },
      });
    } else if (evidenceLevel === 'full') {
      checks.push({
        name: 'evidence_hash',
        passed: false,
        message: 'Evidence hash missing',
        severity: 'warning',
      });
    }

    // Check timestamp
    if (evidence.timestampToken) {
      checks.push({
        name: 'evidence_timestamp',
        passed: true,
        message: 'RFC 3161 timestamp present',
        severity: 'info',
      });
    } else if (evidenceLevel === 'full') {
      checks.push({
        name: 'evidence_timestamp',
        passed: false,
        message: 'RFC 3161 timestamp missing',
        severity: 'warning',
      });
    }

    // Check screenshot
    if (evidenceLevel === 'full' && !evidence.screenshotUrl) {
      checks.push({
        name: 'evidence_screenshot',
        passed: false,
        message: 'Screenshot missing for full evidence',
        severity: 'warning',
      });
    }

    return checks;
  }

  /**
   * Detect error patterns in content
   */
  private detectErrorPattern(content: string): string | null {
    const contentLower = content.toLowerCase();
    const patterns = this.config.errorPagePatterns ?? DEFAULT_VALIDATOR_CONFIG.errorPagePatterns!;

    for (const pattern of patterns) {
      if (contentLower.includes(pattern)) {
        return pattern;
      }
    }

    return null;
  }

  /**
   * Validate study completion
   */
  validateStudy(study: StudyForValidation): StudyValidationResult {
    const surfaceResults: SurfaceValidationResult[] = [];
    const missingCriteria: string[] = [];
    const warnings: string[] = [];

    const { requiredSurfaces, optionalSurfaces } = study.completionCriteria;

    // Validate required surfaces
    for (const surfaceId of requiredSurfaces.surfaceIds) {
      const surfaceData = study.jobsBySurface[surfaceId];

      if (!surfaceData) {
        missingCriteria.push(`No data for required surface: ${surfaceId}`);
        surfaceResults.push({
          surfaceId,
          isRequired: true,
          totalJobs: 0,
          completedJobs: 0,
          failedJobs: 0,
          completionRate: 0,
          requiredThreshold: requiredSurfaces.coverageThreshold,
          thresholdMet: false,
        });
        continue;
      }

      const completionRate = surfaceData.total > 0
        ? surfaceData.completed / surfaceData.total
        : 0;

      const thresholdMet = completionRate >= requiredSurfaces.coverageThreshold;

      if (!thresholdMet) {
        missingCriteria.push(
          `Surface ${surfaceId}: ${(completionRate * 100).toFixed(1)}% < ${(requiredSurfaces.coverageThreshold * 100).toFixed(1)}% required`
        );
      }

      surfaceResults.push({
        surfaceId,
        isRequired: true,
        totalJobs: surfaceData.total,
        completedJobs: surfaceData.completed,
        failedJobs: surfaceData.failed,
        completionRate,
        requiredThreshold: requiredSurfaces.coverageThreshold,
        thresholdMet,
      });
    }

    // Validate optional surfaces (just for reporting)
    if (optionalSurfaces) {
      for (const surfaceId of optionalSurfaces.surfaceIds) {
        const surfaceData = study.jobsBySurface[surfaceId];

        if (!surfaceData) {
          warnings.push(`No data for optional surface: ${surfaceId}`);
          continue;
        }

        const completionRate = surfaceData.total > 0
          ? surfaceData.completed / surfaceData.total
          : 0;

        if (completionRate < 0.5) {
          warnings.push(
            `Optional surface ${surfaceId} has low completion: ${(completionRate * 100).toFixed(1)}%`
          );
        }

        surfaceResults.push({
          surfaceId,
          isRequired: false,
          totalJobs: surfaceData.total,
          completedJobs: surfaceData.completed,
          failedJobs: surfaceData.failed,
          completionRate,
          requiredThreshold: 0, // No threshold for optional
          thresholdMet: true, // Always "met" for optional
        });
      }
    }

    // Determine overall result
    const completionCriteriaMet = missingCriteria.length === 0;
    const canComplete = completionCriteriaMet;

    let status: ValidationStatus = 'passed';
    if (!completionCriteriaMet) {
      status = 'failed';
    } else if (warnings.length > 0) {
      status = 'warning';
    }

    return {
      studyId: study.studyId,
      status,
      canComplete,
      surfaceResults,
      completionCriteriaMet,
      missingCriteria,
      warnings,
      validatedAt: new Date(),
    };
  }

  /**
   * Record a failure reason
   */
  private recordFailure(reason: string): void {
    const count = this.stats.failureReasons.get(reason) ?? 0;
    this.stats.failureReasons.set(reason, count + 1);
  }

  /**
   * Get validator statistics
   */
  getStats(): ValidatorStats {
    const total = this.stats.totalValidations;

    const commonFailures: Record<string, number> = {};
    for (const [reason, count] of this.stats.failureReasons) {
      commonFailures[reason] = count;
    }

    return {
      totalValidations: total,
      validationsPassed: this.stats.passed,
      validationsFailed: this.stats.failed,
      passRate: total > 0 ? this.stats.passed / total : 0,
      commonFailures,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalValidations: 0,
      passed: 0,
      failed: 0,
      failureReasons: new Map(),
    };
  }
}

/**
 * Create a new validator instance
 */
export function createValidator(config?: ValidatorConfig): Validator {
  return new Validator(config);
}
