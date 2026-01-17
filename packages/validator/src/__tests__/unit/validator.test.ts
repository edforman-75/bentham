/**
 * Validator Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  Validator,
  createValidator,
  type JobForValidation,
  type StudyForValidation,
  type ValidationCheck,
  DEFAULT_VALIDATOR_CONFIG,
} from '../../index.js';
import type { JobResult, JobEvidence } from '@bentham/core';

// Helper to create a valid job result
function createValidJobResult(
  text: string,
  options: {
    success?: boolean;
    responseTimeMs?: number;
    evidence?: Partial<JobEvidence>;
    error?: { code: string; message: string; retryable: boolean };
  } = {}
): JobResult {
  const { success = true, responseTimeMs = 100, evidence, error } = options;

  const baseResult: JobResult = {
    success,
    validation: {
      passedQualityGates: true,
      isActualContent: true,
      responseLength: text.length,
    },
    context: {
      sessionId: 'session-1',
      userAgent: 'test-agent',
    },
  };

  if (success && text) {
    baseResult.response = {
      text,
      responseTimeMs,
    };
  }

  if (evidence) {
    baseResult.evidence = {
      capturedAt: new Date(),
      sha256Hash: evidence.sha256Hash || 'abc123hash',
      ...evidence,
    };
  }

  if (error) {
    baseResult.error = error;
  }

  return baseResult;
}

// Helper to create a valid job for validation
function createJobForValidation(
  text: string,
  options: {
    id?: string;
    success?: boolean;
    evidenceLevel?: 'full' | 'metadata' | 'none';
    minResponseLength?: number;
    evidence?: Partial<JobEvidence>;
    error?: { code: string; message: string; retryable: boolean };
  } = {}
): JobForValidation {
  const {
    id = 'job-1',
    success = true,
    evidenceLevel = 'metadata',
    minResponseLength,
    evidence,
    error,
  } = options;

  return {
    id,
    studyId: 'study-1',
    surfaceId: 'chatgpt-web',
    result: text || error
      ? createValidJobResult(text, { success, evidence, error })
      : undefined,
    qualityGates: {
      requireActualContent: true,
      minResponseLength,
    },
    evidenceLevel,
  };
}

describe('Validator', () => {
  let validator: Validator;

  beforeEach(() => {
    validator = createValidator();
  });

  describe('constructor', () => {
    it('should create validator with default config', () => {
      const stats = validator.getStats();
      expect(stats.totalValidations).toBe(0);
    });

    it('should create validator with custom config', () => {
      const customValidator = createValidator({
        strictMode: true,
        errorPagePatterns: ['custom-error'],
      });
      expect(customValidator).toBeInstanceOf(Validator);
    });
  });

  describe('validateJob', () => {
    it('should pass for successful job with valid content', () => {
      const job = createJobForValidation(
        'This is a valid response with enough content to pass validation checks.',
        { minResponseLength: 10 }
      );

      const result = validator.validateJob(job);

      expect(result.status).toBe('passed');
      expect(result.qualityGatesPassed).toBe(true);
      expect(result.isActualContent).toBe(true);
    });

    it('should fail for job without result', () => {
      const job: JobForValidation = {
        id: 'job-1',
        studyId: 'study-1',
        surfaceId: 'chatgpt-web',
        result: undefined,
        qualityGates: { requireActualContent: true },
        evidenceLevel: 'metadata',
      };

      const result = validator.validateJob(job);

      expect(result.status).toBe('failed');
      expect(result.qualityGatesPassed).toBe(false);
      expect(result.checks.some(c => c.name === 'result_present' && !c.passed)).toBe(true);
    });

    it('should fail for unsuccessful job', () => {
      const job = createJobForValidation('', {
        success: false,
        error: {
          code: 'EXECUTION_FAILED',
          message: 'Job execution failed',
          retryable: false,
        },
      });

      const result = validator.validateJob(job);

      expect(result.status).toBe('failed');
      expect(result.qualityGatesPassed).toBe(false);
    });

    it('should fail for empty response when content required', () => {
      const job = createJobForValidation('');

      const result = validator.validateJob(job);

      expect(result.status).toBe('failed');
      expect(result.checks.some(c => c.name === 'content_present' && !c.passed)).toBe(true);
    });

    it('should fail for response shorter than minimum length', () => {
      const job = createJobForValidation('Short', { minResponseLength: 100 });

      const result = validator.validateJob(job);

      expect(result.status).toBe('failed');
      expect(result.checks.some(c => c.name === 'min_length' && !c.passed)).toBe(true);
    });

    it('should detect error patterns', () => {
      const job = createJobForValidation('Error: Page not found - 404');

      const result = validator.validateJob(job);

      expect(result.status).toBe('failed');
      expect(result.checks.some(c => c.name === 'error_pattern' && !c.passed)).toBe(true);
    });

    it('should detect rate limit errors', () => {
      const job = createJobForValidation('Rate limit exceeded. Please try again later.');

      const result = validator.validateJob(job);

      expect(result.status).toBe('failed');
      expect(result.checks.some(c => c.name === 'error_pattern' && !c.passed)).toBe(true);
    });

    it('should validate with custom keywords', () => {
      const customValidator = createValidator({
        defaultContentOptions: {
          requiredKeywords: ['important', 'data'],
          forbiddenKeywords: ['banned'],
        },
      });

      const job = createJobForValidation(
        'This important response contains data that is relevant.'
      );

      const result = customValidator.validateJob(job);

      expect(result.status).toBe('passed');
      expect(result.checks.some(c => c.name === 'required_keywords' && c.passed)).toBe(true);
    });

    it('should warn on missing required keywords', () => {
      const customValidator = createValidator({
        defaultContentOptions: {
          requiredKeywords: ['missing-keyword'],
        },
      });

      const job = createJobForValidation(
        'This response does not contain the required word.'
      );

      const result = customValidator.validateJob(job);

      expect(result.status).toBe('warning');
      expect(result.checks.some(c => c.name === 'required_keywords' && !c.passed)).toBe(true);
    });

    it('should warn on forbidden keywords', () => {
      const customValidator = createValidator({
        defaultContentOptions: {
          forbiddenKeywords: ['banned'],
        },
      });

      const job = createJobForValidation('This response contains a banned word.');

      const result = customValidator.validateJob(job);

      expect(result.status).toBe('warning');
      expect(result.checks.some(c => c.name === 'forbidden_keywords' && !c.passed)).toBe(true);
    });

    it('should fail warnings in strict mode', () => {
      const strictValidator = createValidator({
        strictMode: true,
        defaultContentOptions: {
          forbiddenKeywords: ['warning-word'],
        },
      });

      const job = createJobForValidation('This has a warning-word in it.');

      const result = strictValidator.validateJob(job);

      expect(result.status).toBe('failed');
    });
  });

  describe('evidence validation', () => {
    it('should skip evidence validation for none level', () => {
      const job = createJobForValidation('Valid response content.', {
        evidenceLevel: 'none',
      });

      const result = validator.validateJob(job);

      expect(result.status).toBe('passed');
      expect(result.evidenceValidated).toBe(true);
    });

    it('should validate evidence for full level', () => {
      const job = createJobForValidation('Valid response content.', {
        evidenceLevel: 'full',
        evidence: {
          sha256Hash: 'abc123',
          timestampToken: 'TST:abc123:2024-01-01',
          screenshotUrl: 'memory://job-1/screenshot.png',
          capturedAt: new Date(),
        },
      });

      const result = validator.validateJob(job);

      expect(result.status).toBe('passed');
      expect(result.evidenceValidated).toBe(true);
    });

    it('should warn on missing evidence for full level', () => {
      const job = createJobForValidation('Valid response content.', {
        evidenceLevel: 'full',
      });

      const result = validator.validateJob(job);

      expect(result.checks.some(c => c.name === 'evidence_present' && !c.passed)).toBe(true);
    });

    it('should warn on missing screenshot for full level', () => {
      const job = createJobForValidation('Valid response content.', {
        evidenceLevel: 'full',
        evidence: {
          sha256Hash: 'abc123',
          timestampToken: 'TST:abc123:2024-01-01',
          capturedAt: new Date(),
        },
      });

      const result = validator.validateJob(job);

      expect(result.checks.some(c => c.name === 'evidence_screenshot' && !c.passed)).toBe(true);
    });
  });

  describe('validateStudy', () => {
    it('should pass for study meeting all criteria', () => {
      const study: StudyForValidation = {
        studyId: 'study-1',
        completionCriteria: {
          requiredSurfaces: {
            surfaceIds: ['chatgpt-web', 'anthropic-api'],
            coverageThreshold: 0.8,
          },
          optionalSurfaces: {
            surfaceIds: ['gemini-web'],
          },
          maxRetriesPerCell: 3,
        },
        jobsBySurface: {
          'chatgpt-web': { total: 10, completed: 9, failed: 1 },
          'anthropic-api': { total: 10, completed: 8, failed: 2 },
          'gemini-web': { total: 5, completed: 4, failed: 1 },
        },
      };

      const result = validator.validateStudy(study);

      expect(result.status).toBe('passed');
      expect(result.canComplete).toBe(true);
      expect(result.completionCriteriaMet).toBe(true);
    });

    it('should fail when required surface below threshold', () => {
      const study: StudyForValidation = {
        studyId: 'study-1',
        completionCriteria: {
          requiredSurfaces: {
            surfaceIds: ['chatgpt-web'],
            coverageThreshold: 0.8,
          },
          maxRetriesPerCell: 3,
        },
        jobsBySurface: {
          'chatgpt-web': { total: 10, completed: 5, failed: 5 }, // 50% < 80%
        },
      };

      const result = validator.validateStudy(study);

      expect(result.status).toBe('failed');
      expect(result.canComplete).toBe(false);
      expect(result.completionCriteriaMet).toBe(false);
      expect(result.missingCriteria.length).toBeGreaterThan(0);
    });

    it('should fail when required surface has no data', () => {
      const study: StudyForValidation = {
        studyId: 'study-1',
        completionCriteria: {
          requiredSurfaces: {
            surfaceIds: ['chatgpt-web', 'missing-surface'],
            coverageThreshold: 0.8,
          },
          maxRetriesPerCell: 3,
        },
        jobsBySurface: {
          'chatgpt-web': { total: 10, completed: 9, failed: 1 },
        },
      };

      const result = validator.validateStudy(study);

      expect(result.status).toBe('failed');
      expect(result.missingCriteria.some(c => c.includes('missing-surface'))).toBe(true);
    });

    it('should warn on low optional surface completion', () => {
      const study: StudyForValidation = {
        studyId: 'study-1',
        completionCriteria: {
          requiredSurfaces: {
            surfaceIds: ['chatgpt-web'],
            coverageThreshold: 0.8,
          },
          optionalSurfaces: {
            surfaceIds: ['gemini-web'],
          },
          maxRetriesPerCell: 3,
        },
        jobsBySurface: {
          'chatgpt-web': { total: 10, completed: 9, failed: 1 },
          'gemini-web': { total: 10, completed: 3, failed: 7 }, // 30% - low
        },
      };

      const result = validator.validateStudy(study);

      expect(result.status).toBe('warning');
      expect(result.canComplete).toBe(true); // Can still complete
      expect(result.warnings.some(w => w.includes('gemini-web'))).toBe(true);
    });

    it('should handle zero total jobs', () => {
      const study: StudyForValidation = {
        studyId: 'study-1',
        completionCriteria: {
          requiredSurfaces: {
            surfaceIds: ['chatgpt-web'],
            coverageThreshold: 0.8,
          },
          maxRetriesPerCell: 3,
        },
        jobsBySurface: {
          'chatgpt-web': { total: 0, completed: 0, failed: 0 },
        },
      };

      const result = validator.validateStudy(study);

      expect(result.status).toBe('failed');
      expect(result.surfaceResults[0].completionRate).toBe(0);
    });

    it('should report per-surface results', () => {
      const study: StudyForValidation = {
        studyId: 'study-1',
        completionCriteria: {
          requiredSurfaces: {
            surfaceIds: ['chatgpt-web', 'anthropic-api'],
            coverageThreshold: 0.8,
          },
          maxRetriesPerCell: 3,
        },
        jobsBySurface: {
          'chatgpt-web': { total: 10, completed: 10, failed: 0 },
          'anthropic-api': { total: 10, completed: 8, failed: 2 },
        },
      };

      const result = validator.validateStudy(study);

      expect(result.surfaceResults).toHaveLength(2);

      const chatgptResult = result.surfaceResults.find(r => r.surfaceId === 'chatgpt-web');
      expect(chatgptResult?.completionRate).toBe(1);
      expect(chatgptResult?.thresholdMet).toBe(true);

      const claudeResult = result.surfaceResults.find(r => r.surfaceId === 'anthropic-api');
      expect(claudeResult?.completionRate).toBe(0.8);
      expect(claudeResult?.thresholdMet).toBe(true);
    });
  });

  describe('statistics', () => {
    it('should track validation statistics', () => {
      const passJob = createJobForValidation('Valid response content.');
      const failJob: JobForValidation = {
        id: 'job-2',
        studyId: 'study-1',
        surfaceId: 'chatgpt-web',
        result: undefined,
        qualityGates: { requireActualContent: true },
        evidenceLevel: 'metadata',
      };

      validator.validateJob(passJob);
      validator.validateJob(failJob);

      const stats = validator.getStats();
      expect(stats.totalValidations).toBe(2);
      expect(stats.validationsPassed).toBe(1);
      expect(stats.validationsFailed).toBe(1);
      expect(stats.passRate).toBe(0.5);
    });

    it('should track common failure reasons', () => {
      const noResultJob: JobForValidation = {
        id: 'job-1',
        studyId: 'study-1',
        surfaceId: 'chatgpt-web',
        result: undefined,
        qualityGates: { requireActualContent: true },
        evidenceLevel: 'metadata',
      };

      const emptyContentJob = createJobForValidation('');

      validator.validateJob(noResultJob);
      validator.validateJob(emptyContentJob);

      const stats = validator.getStats();
      expect(stats.commonFailures['no_result']).toBe(1);
      expect(stats.commonFailures['no_content']).toBe(1);
    });

    it('should reset statistics', () => {
      const job: JobForValidation = {
        id: 'job-1',
        studyId: 'study-1',
        surfaceId: 'chatgpt-web',
        result: undefined,
        qualityGates: { requireActualContent: true },
        evidenceLevel: 'metadata',
      };

      validator.validateJob(job);
      validator.resetStats();

      const stats = validator.getStats();
      expect(stats.totalValidations).toBe(0);
      expect(stats.validationsPassed).toBe(0);
      expect(stats.validationsFailed).toBe(0);
    });
  });

  describe('custom validators', () => {
    it('should run custom content validators', () => {
      const customValidator = createValidator({
        defaultContentOptions: {
          customValidators: [
            (content: string): ValidationCheck => ({
              name: 'custom_check',
              passed: content.includes('required-text'),
              message: content.includes('required-text')
                ? 'Custom check passed'
                : 'Custom check failed',
              severity: 'warning',
            }),
          ],
        },
      });

      const job = createJobForValidation('This contains required-text.');

      const result = customValidator.validateJob(job);

      expect(result.checks.some(c => c.name === 'custom_check' && c.passed)).toBe(true);
    });
  });

  describe('DEFAULT_VALIDATOR_CONFIG', () => {
    it('should have expected default values', () => {
      expect(DEFAULT_VALIDATOR_CONFIG.strictMode).toBe(false);
      expect(DEFAULT_VALIDATOR_CONFIG.errorPagePatterns).toContain('404');
      expect(DEFAULT_VALIDATOR_CONFIG.errorPagePatterns).toContain('rate limit');
      expect(DEFAULT_VALIDATOR_CONFIG.defaultContentOptions?.checkErrorPatterns).toBe(true);
    });
  });
});
