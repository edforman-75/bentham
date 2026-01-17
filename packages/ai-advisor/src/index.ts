/**
 * @bentham/ai-advisor
 *
 * AI advisor modules for Bentham.
 * Provides Query Generation, Response Validation, Response Scoring, and Troubleshooting.
 */

// Types
export type {
  // Query Generator types
  QueryGenerationContext,
  GeneratedQuery,
  QueryStrategy,
  QueryMetadata,
  SurfaceQueryContext,
  // Response Validator types
  ValidationContext,
  ValidationResult,
  ValidationCheck,
  QualityGateResult,
  ValidationIssue,
  ValidationIssueType,
  ValidationCriteria,
  QualityGate,
  QualityGateType,
  ValidationMetadata,
  // Response Scorer types
  ScoringContext,
  ScoringResult,
  DimensionScore,
  ScoringDimension,
  ScoringMetadata,
  // Troubleshooter types
  TroubleshootingContext,
  TroubleshootingResult,
  Diagnosis,
  DiagnosisCategory,
  Recommendation,
  RecommendationType,
  RootCauseAnalysis,
  SimilarIssue,
  ErrorInfo,
  SurfacePerformanceHistory,
  ExecutionContext,
  TroubleshootingMetadata,
} from './types.js';

// Query Generator
export {
  QueryGenerator,
  createQueryGenerator,
  type QueryGeneratorConfig,
} from './query-generator/index.js';

// Response Validator
export {
  ResponseValidator,
  createResponseValidator,
  type ResponseValidatorConfig,
} from './response-validator/index.js';

// Response Scorer
export {
  ResponseScorer,
  createResponseScorer,
  type ResponseScorerConfig,
} from './response-scorer/index.js';

// Troubleshooter
export {
  Troubleshooter,
  createTroubleshooter,
  type TroubleshooterConfig,
} from './troubleshooter/index.js';
