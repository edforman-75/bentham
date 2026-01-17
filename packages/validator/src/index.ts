/**
 * @bentham/validator
 *
 * Job and study validation for Bentham.
 */

// Types
export type {
  ValidationStatus,
  ValidationCheck,
  JobValidationResult,
  StudyValidationResult,
  SurfaceValidationResult,
  ContentValidationOptions,
  ContentValidator,
  EvidenceValidationOptions,
  ValidatorConfig,
  JobForValidation,
  StudyForValidation,
  ValidatorStats,
} from './types.js';

export { DEFAULT_VALIDATOR_CONFIG } from './types.js';

// Validator
export { Validator, createValidator } from './validator.js';
