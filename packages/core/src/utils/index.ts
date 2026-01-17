/**
 * Utility exports for @bentham/core
 */

// ID utilities
export {
  generateId,
  generatePrefixedId,
  isValidId,
  extractIdPrefix,
  DEFAULT_ID_LENGTH,
} from './id.js';

// Hash utilities
export {
  hashContent,
  hashWithMetadata,
  verifyHash,
  generateChecksum,
  HASH_ALGORITHM,
} from './hash.js';

// Schema validation utilities
export {
  validateSchema,
  parseSchema,
  safeParseSchema,
  z,
  nonEmptyString,
  positiveInt,
  percentage,
  isoDateString,
  email,
  url,
} from './schema.js';
export type { ValidationResult, ValidationError } from './schema.js';

// Error utilities
export {
  isRetryableError,
  formatError,
  formatErrorDetails,
  getUserFriendlyMessage,
  wrapAsync,
} from './error-helpers.js';
