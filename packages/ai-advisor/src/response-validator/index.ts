/**
 * Response Validator Module
 *
 * Validates AI responses against quality criteria and gates.
 */

import type {
  ValidationContext,
  ValidationResult,
  ValidationCheck,
  QualityGateResult,
  ValidationIssue,
  ValidationIssueType,
  QualityGate,
} from '../types.js';

/**
 * Response validator configuration
 */
export interface ResponseValidatorConfig {
  /** Minimum acceptable response length */
  defaultMinLength?: number;
  /** Maximum acceptable response length */
  defaultMaxLength?: number;
  /** Whether to detect refusal responses */
  detectRefusals?: boolean;
  /** Whether to detect error responses */
  detectErrors?: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<ResponseValidatorConfig> = {
  defaultMinLength: 10,
  defaultMaxLength: 100000,
  detectRefusals: true,
  detectErrors: true,
};

/**
 * Common refusal phrases
 */
const REFUSAL_PHRASES = [
  "i can't help",
  "i cannot help",
  "i'm unable to",
  "i am unable to",
  "i won't be able",
  "i will not be able",
  "i'm not able to",
  "i am not able to",
  "i apologize, but i cannot",
  "i'm sorry, but i cannot",
  "as an ai",
  "as a language model",
  "i don't have the ability",
  "i do not have the ability",
  "this goes against my guidelines",
];

/**
 * Common error indicators
 */
const ERROR_INDICATORS = [
  "error:",
  "exception:",
  "failed to",
  "something went wrong",
  "an error occurred",
  "internal server error",
  "service unavailable",
  "timeout",
  "rate limited",
];

/**
 * Response Validator
 *
 * Validates AI responses against criteria and quality gates.
 */
export class ResponseValidator {
  private config: Required<ResponseValidatorConfig>;

  constructor(config: ResponseValidatorConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Validate a response
   */
  validate(context: ValidationContext): ValidationResult {
    const startTime = Date.now();
    const checks: ValidationCheck[] = [];
    const issues: ValidationIssue[] = [];

    // Run basic checks
    checks.push(this.checkLength(context));
    checks.push(this.checkRelevance(context));
    checks.push(this.checkCoherence(context));

    // Check required keywords
    if (context.criteria.requiredKeywords?.length) {
      checks.push(this.checkRequiredKeywords(context));
    }

    // Check forbidden patterns
    if (context.criteria.forbiddenPatterns?.length) {
      checks.push(this.checkForbiddenPatterns(context));
    }

    // Detect refusals
    if (this.config.detectRefusals) {
      checks.push(this.checkForRefusal(context));
    }

    // Detect errors
    if (this.config.detectErrors) {
      checks.push(this.checkForErrorResponse(context));
    }

    // Evaluate quality gates
    const gateResults = this.evaluateQualityGates(context, checks);

    // Collect issues from failed checks
    for (const check of checks) {
      if (!check.passed) {
        const issue = this.checkToIssue(check);
        if (issue) {
          issues.push(issue);
        }
      }
    }

    // Determine overall validity
    const isValid = this.determineValidity(checks, gateResults, issues);

    return {
      isValid,
      checks,
      gateResults,
      issues,
      metadata: {
        durationMs: Date.now() - startTime,
        validatedAt: new Date(),
        validatorVersion: '1.0.0',
      },
    };
  }

  /**
   * Quick validation (basic checks only)
   */
  quickValidate(response: string): boolean {
    // Check minimum length
    if (response.trim().length < this.config.defaultMinLength) {
      return false;
    }

    // Check for obvious errors/refusals
    const lowerResponse = response.toLowerCase();

    if (this.config.detectRefusals) {
      for (const phrase of REFUSAL_PHRASES) {
        if (lowerResponse.includes(phrase)) {
          return false;
        }
      }
    }

    if (this.config.detectErrors) {
      for (const indicator of ERROR_INDICATORS) {
        if (lowerResponse.includes(indicator)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Check response length
   */
  private checkLength(context: ValidationContext): ValidationCheck {
    const { response, criteria } = context;
    const length = response.trim().length;
    const minLength = criteria.minLength ?? this.config.defaultMinLength;
    const maxLength = criteria.maxLength ?? this.config.defaultMaxLength;

    if (length < minLength) {
      return {
        name: 'length',
        passed: false,
        details: `Response too short: ${length} chars (min: ${minLength})`,
        value: length,
      };
    }

    if (length > maxLength) {
      return {
        name: 'length',
        passed: false,
        details: `Response too long: ${length} chars (max: ${maxLength})`,
        value: length,
      };
    }

    return {
      name: 'length',
      passed: true,
      details: `Response length OK: ${length} chars`,
      value: length,
    };
  }

  /**
   * Check response relevance
   */
  private checkRelevance(context: ValidationContext): ValidationCheck {
    const { query, response, criteria } = context;

    if (!criteria.requireRelevance) {
      return { name: 'relevance', passed: true, details: 'Relevance check skipped' };
    }

    // Simple relevance check: look for query keywords in response
    const queryWords = this.extractKeywords(query);
    const responseWords = new Set(this.extractKeywords(response));

    let matchCount = 0;
    for (const word of queryWords) {
      if (responseWords.has(word)) {
        matchCount++;
      }
    }

    const relevanceScore = queryWords.length > 0 ? matchCount / queryWords.length : 1;
    const passed = relevanceScore >= 0.2; // At least 20% keyword overlap

    return {
      name: 'relevance',
      passed,
      details: passed
        ? `Response appears relevant (${Math.round(relevanceScore * 100)}% keyword match)`
        : `Response may not be relevant (only ${Math.round(relevanceScore * 100)}% keyword match)`,
      value: relevanceScore,
    };
  }

  /**
   * Check response coherence
   */
  private checkCoherence(context: ValidationContext): ValidationCheck {
    const { response, criteria } = context;

    if (!criteria.requireCoherence) {
      return { name: 'coherence', passed: true, details: 'Coherence check skipped' };
    }

    // Simple coherence checks
    const issues: string[] = [];

    // Check for sentence structure
    const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length === 0) {
      issues.push('No complete sentences');
    }

    // Check for extremely long sentences (might indicate incoherence)
    const longSentences = sentences.filter(s => s.trim().split(' ').length > 100);
    if (longSentences.length > 0) {
      issues.push('Contains extremely long sentences');
    }

    // Check for repeated content (might indicate loops)
    const repeatedPhrases = this.detectRepeatedPhrases(response);
    if (repeatedPhrases.length > 0) {
      issues.push('Contains repeated phrases');
    }

    const passed = issues.length === 0;

    return {
      name: 'coherence',
      passed,
      details: passed
        ? 'Response appears coherent'
        : `Coherence issues: ${issues.join(', ')}`,
    };
  }

  /**
   * Check required keywords
   */
  private checkRequiredKeywords(context: ValidationContext): ValidationCheck {
    const { response, criteria } = context;
    const keywords = criteria.requiredKeywords ?? [];
    const lowerResponse = response.toLowerCase();

    const missingKeywords: string[] = [];
    for (const keyword of keywords) {
      if (!lowerResponse.includes(keyword.toLowerCase())) {
        missingKeywords.push(keyword);
      }
    }

    const passed = missingKeywords.length === 0;

    return {
      name: 'required_keywords',
      passed,
      details: passed
        ? 'All required keywords present'
        : `Missing keywords: ${missingKeywords.join(', ')}`,
      value: `${keywords.length - missingKeywords.length}/${keywords.length}`,
    };
  }

  /**
   * Check forbidden patterns
   */
  private checkForbiddenPatterns(context: ValidationContext): ValidationCheck {
    const { response, criteria } = context;
    const patterns = criteria.forbiddenPatterns ?? [];

    const foundPatterns: string[] = [];
    for (const pattern of patterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(response)) {
          foundPatterns.push(pattern);
        }
      } catch {
        // Invalid regex, try as literal string
        if (response.toLowerCase().includes(pattern.toLowerCase())) {
          foundPatterns.push(pattern);
        }
      }
    }

    const passed = foundPatterns.length === 0;

    return {
      name: 'forbidden_patterns',
      passed,
      details: passed
        ? 'No forbidden patterns found'
        : `Found forbidden patterns: ${foundPatterns.join(', ')}`,
    };
  }

  /**
   * Check for refusal response
   */
  private checkForRefusal(context: ValidationContext): ValidationCheck {
    const lowerResponse = context.response.toLowerCase();

    for (const phrase of REFUSAL_PHRASES) {
      if (lowerResponse.includes(phrase)) {
        return {
          name: 'refusal_detection',
          passed: false,
          details: `Response appears to be a refusal: "${phrase}"`,
        };
      }
    }

    return {
      name: 'refusal_detection',
      passed: true,
      details: 'No refusal detected',
    };
  }

  /**
   * Check for error response
   */
  private checkForErrorResponse(context: ValidationContext): ValidationCheck {
    const lowerResponse = context.response.toLowerCase();

    for (const indicator of ERROR_INDICATORS) {
      if (lowerResponse.includes(indicator)) {
        return {
          name: 'error_detection',
          passed: false,
          details: `Response appears to be an error: "${indicator}"`,
        };
      }
    }

    return {
      name: 'error_detection',
      passed: true,
      details: 'No error detected',
    };
  }

  /**
   * Evaluate quality gates
   */
  private evaluateQualityGates(
    context: ValidationContext,
    checks: ValidationCheck[]
  ): QualityGateResult[] {
    const gates = context.qualityGates ?? [];
    const results: QualityGateResult[] = [];

    for (const gate of gates) {
      const result = this.evaluateGate(gate, context, checks);
      results.push(result);
    }

    return results;
  }

  /**
   * Evaluate a single quality gate
   */
  private evaluateGate(
    gate: QualityGate,
    context: ValidationContext,
    checks: ValidationCheck[]
  ): QualityGateResult {
    let actualValue: number;

    switch (gate.type) {
      case 'min_length':
        actualValue = context.response.trim().length;
        break;
      case 'max_length':
        actualValue = context.response.trim().length;
        break;
      case 'relevance_score':
        const relevanceCheck = checks.find(c => c.name === 'relevance');
        actualValue = typeof relevanceCheck?.value === 'number' ? relevanceCheck.value : 0;
        break;
      case 'coherence_score':
        const coherenceCheck = checks.find(c => c.name === 'coherence');
        actualValue = coherenceCheck?.passed ? 1 : 0;
        break;
      case 'completeness_score':
        // Simple completeness: response has reasonable length
        actualValue = Math.min(1, context.response.length / 500);
        break;
      default:
        actualValue = 0;
    }

    let passed: boolean;
    let margin: number;

    if (gate.type === 'max_length') {
      passed = actualValue <= gate.threshold;
      margin = gate.threshold - actualValue;
    } else {
      passed = actualValue >= gate.threshold;
      margin = actualValue - gate.threshold;
    }

    return { gate, passed, actualValue, margin };
  }

  /**
   * Convert check failure to issue
   */
  private checkToIssue(check: ValidationCheck): ValidationIssue | null {
    const issueMap: Record<string, { type: ValidationIssueType; severity: 'error' | 'warning' | 'info' }> = {
      'length': { type: 'too_short', severity: 'error' },
      'relevance': { type: 'irrelevant', severity: 'warning' },
      'coherence': { type: 'incoherent', severity: 'warning' },
      'required_keywords': { type: 'missing_keywords', severity: 'error' },
      'forbidden_patterns': { type: 'forbidden_content', severity: 'error' },
      'refusal_detection': { type: 'refusal_response', severity: 'error' },
      'error_detection': { type: 'error_response', severity: 'error' },
    };

    const mapping = issueMap[check.name];
    if (!mapping) {
      return null;
    }

    return {
      type: mapping.type,
      severity: mapping.severity,
      message: check.details ?? `${check.name} check failed`,
      suggestion: this.getSuggestion(mapping.type),
    };
  }

  /**
   * Get suggestion for an issue type
   */
  private getSuggestion(type: ValidationIssueType): string {
    const suggestions: Record<ValidationIssueType, string> = {
      'too_short': 'Consider providing more context in the query',
      'too_long': 'Consider asking for a more concise response',
      'missing_keywords': 'Ensure the query explicitly asks about the required topics',
      'forbidden_content': 'Review query to avoid triggering problematic content',
      'irrelevant': 'Rephrase the query to be more specific',
      'incoherent': 'Try simplifying the query or breaking it into parts',
      'incomplete': 'Ask follow-up questions to get complete information',
      'error_response': 'Retry the query or try a different surface',
      'refusal_response': 'Rephrase the query to comply with surface policies',
      'hallucination_detected': 'Verify facts with authoritative sources',
    };

    return suggestions[type];
  }

  /**
   * Determine overall validity
   */
  private determineValidity(
    checks: ValidationCheck[],
    gateResults: QualityGateResult[],
    issues: ValidationIssue[]
  ): boolean {
    // Fail if any critical issue
    if (issues.some(i => i.severity === 'error')) {
      return false;
    }

    // Fail if any critical gate failed
    if (gateResults.some(r => r.gate.critical && !r.passed)) {
      return false;
    }

    // Pass if all important checks passed
    return checks.filter(c => c.name !== 'relevance' && c.name !== 'coherence')
      .every(c => c.passed);
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further', 'once', 'here', 'there', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'can', 'just']);

    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }

  /**
   * Detect repeated phrases
   */
  private detectRepeatedPhrases(text: string, minLength: number = 20): string[] {
    const repeated: string[] = [];
    const words = text.split(/\s+/);

    // Check for repeated sequences of 5+ words
    for (let i = 0; i < words.length - 10; i++) {
      const phrase = words.slice(i, i + 5).join(' ');
      const restOfText = words.slice(i + 5).join(' ');

      if (restOfText.includes(phrase) && phrase.length >= minLength) {
        if (!repeated.includes(phrase)) {
          repeated.push(phrase);
        }
      }
    }

    return repeated;
  }
}

/**
 * Create a response validator instance
 */
export function createResponseValidator(config?: ResponseValidatorConfig): ResponseValidator {
  return new ResponseValidator(config);
}
