/**
 * AI Advisor Types
 *
 * Types for AI advisor modules: Query Generator, Response Validator,
 * Response Scorer, and Troubleshooter.
 */

import type { Manifest, Query, SurfaceId } from '@bentham/core';

// ============================================
// Query Generator Types
// ============================================

/**
 * Context for generating queries
 */
export interface QueryGenerationContext {
  /** The study manifest */
  manifest: Manifest;
  /** Target surface ID */
  surfaceId: SurfaceId;
  /** Cell query from manifest */
  cellQuery: Query;
  /** Whether this is a retry (allows query variation) */
  isRetry?: boolean;
  /** Previous queries for this cell (to avoid repetition) */
  previousQueries?: string[];
  /** Surface-specific context */
  surfaceContext?: SurfaceQueryContext;
}

/**
 * Surface-specific query context
 */
export interface SurfaceQueryContext {
  /** Surface capabilities */
  capabilities?: {
    maxInputTokens?: number;
    supportsSystemPrompt?: boolean;
    supportsConversationHistory?: boolean;
  };
  /** Surface-specific formatting guidelines */
  formattingGuidelines?: string;
  /** Known surface limitations */
  limitations?: string[];
}

/**
 * Generated query result
 */
export interface GeneratedQuery {
  /** The query text */
  query: string;
  /** System prompt if applicable */
  systemPrompt?: string;
  /** Conversation history if needed */
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Query metadata */
  metadata: QueryMetadata;
}

/**
 * Query metadata
 */
export interface QueryMetadata {
  /** Query generation strategy used */
  strategy: QueryStrategy;
  /** Estimated token count */
  estimatedTokens?: number;
  /** Query variations available */
  variationsAvailable?: number;
  /** Generation timestamp */
  generatedAt: Date;
}

/**
 * Query generation strategy
 */
export type QueryStrategy =
  | 'direct'           // Use cell query directly
  | 'reformulated'     // Reformulate for clarity
  | 'expanded'         // Expand with context
  | 'simplified'       // Simplify for surface limitations
  | 'persona_adapted'; // Adapted for specific persona

// ============================================
// Response Validator Types
// ============================================

/**
 * Response validation context
 */
export interface ValidationContext {
  /** The original query */
  query: string;
  /** The response to validate */
  response: string;
  /** Expected criteria from manifest */
  criteria: ValidationCriteria;
  /** Quality gates to check */
  qualityGates?: QualityGate[];
  /** Surface that generated the response */
  surfaceId: SurfaceId;
}

/**
 * Validation criteria
 */
export interface ValidationCriteria {
  /** Minimum response length */
  minLength?: number;
  /** Maximum response length */
  maxLength?: number;
  /** Required keywords that must be present */
  requiredKeywords?: string[];
  /** Forbidden keywords/patterns */
  forbiddenPatterns?: string[];
  /** Response must be relevant to query */
  requireRelevance?: boolean;
  /** Response must be coherent */
  requireCoherence?: boolean;
  /** Response must be factual */
  requireFactual?: boolean;
  /** Custom validation function (serialized) */
  customValidator?: string;
}

/**
 * Quality gate definition
 */
export interface QualityGate {
  /** Gate name */
  name: string;
  /** Gate type */
  type: QualityGateType;
  /** Threshold value */
  threshold: number;
  /** Whether failure is critical */
  critical: boolean;
}

/**
 * Quality gate types
 */
export type QualityGateType =
  | 'min_length'
  | 'max_length'
  | 'relevance_score'
  | 'coherence_score'
  | 'completeness_score'
  | 'custom';

/**
 * Validation result
 */
export interface ValidationResult {
  /** Overall validation pass/fail */
  isValid: boolean;
  /** Individual check results */
  checks: ValidationCheck[];
  /** Quality gate results */
  gateResults: QualityGateResult[];
  /** Issues found */
  issues: ValidationIssue[];
  /** Validation metadata */
  metadata: ValidationMetadata;
}

/**
 * Individual validation check
 */
export interface ValidationCheck {
  /** Check name */
  name: string;
  /** Pass/fail status */
  passed: boolean;
  /** Details about the check */
  details?: string;
  /** Measured value if applicable */
  value?: number | string;
}

/**
 * Quality gate result
 */
export interface QualityGateResult {
  /** Gate that was checked */
  gate: QualityGate;
  /** Pass/fail status */
  passed: boolean;
  /** Actual value */
  actualValue: number;
  /** Margin from threshold */
  margin: number;
}

/**
 * Validation issue
 */
export interface ValidationIssue {
  /** Issue type */
  type: ValidationIssueType;
  /** Issue severity */
  severity: 'error' | 'warning' | 'info';
  /** Issue message */
  message: string;
  /** Suggestion for resolution */
  suggestion?: string;
}

/**
 * Validation issue types
 */
export type ValidationIssueType =
  | 'too_short'
  | 'too_long'
  | 'missing_keywords'
  | 'forbidden_content'
  | 'irrelevant'
  | 'incoherent'
  | 'incomplete'
  | 'error_response'
  | 'refusal_response'
  | 'hallucination_detected';

/**
 * Validation metadata
 */
export interface ValidationMetadata {
  /** Validation duration in ms */
  durationMs: number;
  /** Validation timestamp */
  validatedAt: Date;
  /** Validator version */
  validatorVersion: string;
}

// ============================================
// Response Scorer Types
// ============================================

/**
 * Scoring context
 */
export interface ScoringContext {
  /** The query that was asked */
  query: string;
  /** The response to score */
  response: string;
  /** Scoring dimensions to evaluate */
  dimensions: ScoringDimension[];
  /** Reference answer if available */
  referenceAnswer?: string;
  /** Scoring model to use */
  scoringModel?: string;
}

/**
 * Scoring dimensions
 */
export type ScoringDimension =
  | 'relevance'      // How relevant is the response to the query
  | 'accuracy'       // How accurate/factual is the response
  | 'completeness'   // How complete is the response
  | 'clarity'        // How clear and understandable
  | 'coherence'      // How well-structured and logical
  | 'helpfulness'    // How helpful for the user
  | 'safety'         // How safe/appropriate
  | 'consistency';   // How consistent with prior responses

/**
 * Scoring result
 */
export interface ScoringResult {
  /** Overall score (0-1) */
  overallScore: number;
  /** Individual dimension scores */
  dimensionScores: DimensionScore[];
  /** Confidence in the scores */
  confidence: number;
  /** Scoring explanation */
  explanation?: string;
  /** Scoring metadata */
  metadata: ScoringMetadata;
}

/**
 * Individual dimension score
 */
export interface DimensionScore {
  /** The dimension scored */
  dimension: ScoringDimension;
  /** Score (0-1) */
  score: number;
  /** Confidence in this score */
  confidence: number;
  /** Explanation for this score */
  explanation?: string;
}

/**
 * Scoring metadata
 */
export interface ScoringMetadata {
  /** Scoring duration in ms */
  durationMs: number;
  /** Scoring timestamp */
  scoredAt: Date;
  /** Scorer model used */
  scorerModel: string;
  /** Scorer version */
  scorerVersion: string;
}

// ============================================
// Troubleshooter Types
// ============================================

/**
 * Troubleshooting context
 */
export interface TroubleshootingContext {
  /** The error or issue */
  error: ErrorInfo;
  /** The surface that failed */
  surfaceId: SurfaceId;
  /** The query that was attempted */
  query: string;
  /** Historical performance for this surface */
  surfaceHistory?: SurfacePerformanceHistory;
  /** Execution context */
  executionContext?: ExecutionContext;
}

/**
 * Error information
 */
export interface ErrorInfo {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Stack trace if available */
  stackTrace?: string;
  /** HTTP status code if applicable */
  httpStatus?: number;
  /** Error timestamp */
  timestamp: Date;
  /** Number of retry attempts */
  retryCount: number;
}

/**
 * Surface performance history
 */
export interface SurfacePerformanceHistory {
  /** Total queries in history window */
  totalQueries: number;
  /** Successful queries */
  successfulQueries: number;
  /** Failed queries */
  failedQueries: number;
  /** Average response time */
  avgResponseTimeMs: number;
  /** Error breakdown */
  errorsByType: Record<string, number>;
  /** Recent errors */
  recentErrors: ErrorInfo[];
}

/**
 * Execution context
 */
export interface ExecutionContext {
  /** Job ID */
  jobId: string;
  /** Study ID */
  studyId: string;
  /** Cell being executed */
  cellId: string;
  /** Execution start time */
  startedAt: Date;
  /** Retry configuration */
  retryConfig: {
    maxRetries: number;
    currentAttempt: number;
  };
}

/**
 * Troubleshooting result
 */
export interface TroubleshootingResult {
  /** Diagnosis of the issue */
  diagnosis: Diagnosis;
  /** Recommended actions */
  recommendations: Recommendation[];
  /** Root cause analysis */
  rootCause?: RootCauseAnalysis;
  /** Similar past issues */
  similarIssues?: SimilarIssue[];
  /** Troubleshooting metadata */
  metadata: TroubleshootingMetadata;
}

/**
 * Diagnosis
 */
export interface Diagnosis {
  /** Issue category */
  category: DiagnosisCategory;
  /** Severity level */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Summary of the issue */
  summary: string;
  /** Detailed description */
  description: string;
  /** Confidence in diagnosis */
  confidence: number;
}

/**
 * Diagnosis categories
 */
export type DiagnosisCategory =
  | 'rate_limiting'
  | 'authentication'
  | 'network'
  | 'content_policy'
  | 'timeout'
  | 'malformed_request'
  | 'service_unavailable'
  | 'quota_exceeded'
  | 'invalid_response'
  | 'session_expired'
  | 'captcha_required'
  | 'unknown';

/**
 * Recommendation
 */
export interface Recommendation {
  /** Recommendation type */
  type: RecommendationType;
  /** Priority */
  priority: 'immediate' | 'high' | 'medium' | 'low';
  /** Action to take */
  action: string;
  /** Detailed steps */
  steps?: string[];
  /** Expected outcome */
  expectedOutcome: string;
  /** Estimated time to resolve */
  estimatedResolutionTime?: string;
}

/**
 * Recommendation types
 */
export type RecommendationType =
  | 'retry_with_delay'
  | 'retry_with_modification'
  | 'switch_surface'
  | 'refresh_credentials'
  | 'rotate_proxy'
  | 'reduce_query_complexity'
  | 'wait_for_quota_reset'
  | 'manual_intervention'
  | 'disable_surface';

/**
 * Root cause analysis
 */
export interface RootCauseAnalysis {
  /** Identified root cause */
  rootCause: string;
  /** Contributing factors */
  contributingFactors: string[];
  /** Evidence supporting the analysis */
  evidence: string[];
  /** Confidence in the analysis */
  confidence: number;
}

/**
 * Similar past issue
 */
export interface SimilarIssue {
  /** Issue ID */
  issueId: string;
  /** Similarity score */
  similarity: number;
  /** How it was resolved */
  resolution?: string;
  /** Whether resolution was successful */
  resolutionSuccessful?: boolean;
}

/**
 * Troubleshooting metadata
 */
export interface TroubleshootingMetadata {
  /** Analysis duration in ms */
  durationMs: number;
  /** Analysis timestamp */
  analyzedAt: Date;
  /** Troubleshooter version */
  troubleshooterVersion: string;
}
