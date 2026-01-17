/**
 * Troubleshooter Module
 *
 * Analyzes failures, identifies root causes, and suggests fixes.
 * Critical for execution restart capability - helps determine what went wrong
 * and how to recover.
 */

import type {
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
} from '../types.js';

/**
 * Troubleshooter configuration
 */
export interface TroubleshooterConfig {
  /** Enable detailed root cause analysis */
  enableRootCauseAnalysis?: boolean;
  /** Enable similar issue lookup */
  enableSimilarIssueLookup?: boolean;
  /** Maximum recommendations to generate */
  maxRecommendations?: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<TroubleshooterConfig> = {
  enableRootCauseAnalysis: true,
  enableSimilarIssueLookup: true,
  maxRecommendations: 5,
};

/**
 * Error pattern mapping to categories
 */
const ERROR_PATTERNS: Array<{
  patterns: string[];
  category: DiagnosisCategory;
  severity: Diagnosis['severity'];
}> = [
  {
    patterns: ['rate limit', '429', 'too many requests', 'quota exceeded'],
    category: 'rate_limiting',
    severity: 'medium',
  },
  {
    patterns: ['unauthorized', '401', 'auth', 'forbidden', '403', 'invalid key', 'api key'],
    category: 'authentication',
    severity: 'high',
  },
  {
    patterns: ['timeout', 'timed out', 'etimedout', 'deadline', 'took too long'],
    category: 'timeout',
    severity: 'medium',
  },
  {
    patterns: ['network', 'econnrefused', 'econnreset', 'enotfound', 'socket', 'connection'],
    category: 'network',
    severity: 'medium',
  },
  {
    patterns: ['content policy', 'blocked', 'violation', 'cannot assist', 'harmful'],
    category: 'content_policy',
    severity: 'high',
  },
  {
    patterns: ['503', '502', 'service unavailable', 'bad gateway', 'maintenance'],
    category: 'service_unavailable',
    severity: 'medium',
  },
  {
    patterns: ['quota', 'billing', 'payment', 'limit exceeded', 'credits'],
    category: 'quota_exceeded',
    severity: 'critical',
  },
  {
    patterns: ['invalid', 'parse', 'json', 'malformed', 'syntax'],
    category: 'invalid_response',
    severity: 'low',
  },
  {
    patterns: ['session', 'expired', 'login required', 'sign in'],
    category: 'session_expired',
    severity: 'high',
  },
  {
    patterns: ['captcha', 'verification', 'robot', 'human verification'],
    category: 'captcha_required',
    severity: 'high',
  },
];

/**
 * Recommendation templates by category
 */
const RECOMMENDATION_TEMPLATES: Record<DiagnosisCategory, Array<{
  type: RecommendationType;
  priority: Recommendation['priority'];
  action: string;
  steps?: string[];
  expectedOutcome: string;
  estimatedResolutionTime?: string;
}>> = {
  rate_limiting: [
    {
      type: 'retry_with_delay',
      priority: 'immediate',
      action: 'Wait for rate limit to reset and retry',
      steps: [
        'Wait for the specified cooldown period (usually 60 seconds)',
        'Reduce request frequency',
        'Retry the failed query',
      ],
      expectedOutcome: 'Query should succeed after rate limit resets',
      estimatedResolutionTime: '1-5 minutes',
    },
    {
      type: 'switch_surface',
      priority: 'medium',
      action: 'Switch to an alternative surface while rate limited',
      expectedOutcome: 'Execution continues on different surface',
    },
  ],
  authentication: [
    {
      type: 'refresh_credentials',
      priority: 'immediate',
      action: 'Refresh or update authentication credentials',
      steps: [
        'Check if API key or credentials have expired',
        'Generate new credentials if needed',
        'Update the configuration with new credentials',
        'Retry the query',
      ],
      expectedOutcome: 'Authentication should succeed with valid credentials',
      estimatedResolutionTime: '5-10 minutes',
    },
  ],
  timeout: [
    {
      type: 'retry_with_modification',
      priority: 'immediate',
      action: 'Retry with a simpler or shorter query',
      steps: [
        'Simplify the query to reduce processing time',
        'Increase timeout threshold if possible',
        'Retry the query',
      ],
      expectedOutcome: 'Simplified query should complete within timeout',
    },
    {
      type: 'switch_surface',
      priority: 'medium',
      action: 'Try a faster surface',
      expectedOutcome: 'Alternative surface may respond more quickly',
    },
  ],
  network: [
    {
      type: 'retry_with_delay',
      priority: 'immediate',
      action: 'Wait briefly and retry the request',
      expectedOutcome: 'Network issue may be transient and resolve',
      estimatedResolutionTime: '1-2 minutes',
    },
    {
      type: 'rotate_proxy',
      priority: 'high',
      action: 'Rotate to a different proxy server',
      steps: [
        'Select an alternative proxy from the pool',
        'Update the connection to use the new proxy',
        'Retry the query',
      ],
      expectedOutcome: 'New proxy route may avoid network issues',
    },
  ],
  content_policy: [
    {
      type: 'retry_with_modification',
      priority: 'immediate',
      action: 'Reformulate the query to comply with content policies',
      steps: [
        'Review the query for potentially problematic content',
        'Rephrase to be more neutral or compliant',
        'Remove specific terms that may trigger filters',
        'Retry with modified query',
      ],
      expectedOutcome: 'Modified query should pass content filters',
    },
    {
      type: 'switch_surface',
      priority: 'high',
      action: 'Try a surface with different content policies',
      expectedOutcome: 'Different surface may have different restrictions',
    },
  ],
  service_unavailable: [
    {
      type: 'retry_with_delay',
      priority: 'immediate',
      action: 'Wait for service to recover',
      expectedOutcome: 'Service should be available after brief outage',
      estimatedResolutionTime: '5-30 minutes',
    },
    {
      type: 'switch_surface',
      priority: 'high',
      action: 'Switch to alternative surface during outage',
      expectedOutcome: 'Alternative surface can continue execution',
    },
  ],
  quota_exceeded: [
    {
      type: 'wait_for_quota_reset',
      priority: 'immediate',
      action: 'Wait for quota to reset',
      expectedOutcome: 'Quota should reset at billing cycle',
      estimatedResolutionTime: 'Hours to days depending on plan',
    },
    {
      type: 'manual_intervention',
      priority: 'high',
      action: 'Upgrade plan or add credits',
      steps: [
        'Review current usage and billing',
        'Upgrade to higher tier if needed',
        'Add additional credits',
        'Resume execution',
      ],
      expectedOutcome: 'Increased quota allows execution to continue',
    },
  ],
  invalid_response: [
    {
      type: 'retry_with_delay',
      priority: 'immediate',
      action: 'Retry the request',
      expectedOutcome: 'Transient parsing issue should resolve',
    },
    {
      type: 'retry_with_modification',
      priority: 'medium',
      action: 'Simplify the query',
      expectedOutcome: 'Simpler query may produce valid response',
    },
  ],
  session_expired: [
    {
      type: 'refresh_credentials',
      priority: 'immediate',
      action: 'Refresh session or re-authenticate',
      steps: [
        'Check if session cookies are valid',
        'Re-login if needed',
        'Update session state',
        'Retry the query',
      ],
      expectedOutcome: 'New session should allow queries to succeed',
      estimatedResolutionTime: '2-5 minutes',
    },
  ],
  captcha_required: [
    {
      type: 'manual_intervention',
      priority: 'immediate',
      action: 'Complete captcha verification manually',
      steps: [
        'Open the surface in a browser',
        'Complete the captcha challenge',
        'Export new session cookies',
        'Resume execution',
      ],
      expectedOutcome: 'Session will be verified after captcha completion',
    },
    {
      type: 'rotate_proxy',
      priority: 'high',
      action: 'Rotate proxy to avoid captcha',
      expectedOutcome: 'New IP may not trigger captcha',
    },
  ],
  malformed_request: [
    {
      type: 'retry_with_modification',
      priority: 'immediate',
      action: 'Fix the request format',
      expectedOutcome: 'Corrected request should succeed',
    },
  ],
  unknown: [
    {
      type: 'retry_with_delay',
      priority: 'medium',
      action: 'Retry after a brief delay',
      expectedOutcome: 'Issue may be transient',
    },
    {
      type: 'manual_intervention',
      priority: 'low',
      action: 'Investigate the error manually',
      expectedOutcome: 'Manual investigation may reveal the cause',
    },
  ],
};

/**
 * Troubleshooter
 *
 * Analyzes failures and suggests recovery actions.
 */
export class Troubleshooter {
  private config: Required<TroubleshooterConfig>;
  private issueHistory: Map<string, SimilarIssue[]> = new Map();

  constructor(config: TroubleshooterConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Troubleshoot an error
   */
  troubleshoot(context: TroubleshootingContext): TroubleshootingResult {
    const startTime = Date.now();

    // Diagnose the issue
    const diagnosis = this.diagnose(context);

    // Generate recommendations
    const recommendations = this.generateRecommendations(diagnosis, context);

    // Analyze root cause if enabled
    const rootCause = this.config.enableRootCauseAnalysis
      ? this.analyzeRootCause(context, diagnosis)
      : undefined;

    // Find similar issues if enabled
    const similarIssues = this.config.enableSimilarIssueLookup
      ? this.findSimilarIssues(context, diagnosis)
      : undefined;

    // Record this issue for future reference
    this.recordIssue(context, diagnosis);

    return {
      diagnosis,
      recommendations,
      rootCause,
      similarIssues,
      metadata: {
        durationMs: Date.now() - startTime,
        analyzedAt: new Date(),
        troubleshooterVersion: '1.0.0',
      },
    };
  }

  /**
   * Quick diagnosis (returns category only)
   */
  quickDiagnose(errorMessage: string): DiagnosisCategory {
    const lowerMessage = errorMessage.toLowerCase();

    for (const { patterns, category } of ERROR_PATTERNS) {
      for (const pattern of patterns) {
        if (lowerMessage.includes(pattern)) {
          return category;
        }
      }
    }

    return 'unknown';
  }

  /**
   * Check if error is retryable
   */
  isRetryable(errorCode: string): boolean {
    const retryableCategories: DiagnosisCategory[] = [
      'rate_limiting',
      'timeout',
      'network',
      'service_unavailable',
      'invalid_response',
    ];

    const category = this.quickDiagnose(errorCode);
    return retryableCategories.includes(category);
  }

  /**
   * Get suggested delay for retry
   */
  getSuggestedRetryDelay(errorCode: string): number {
    const category = this.quickDiagnose(errorCode);

    const delays: Partial<Record<DiagnosisCategory, number>> = {
      rate_limiting: 60000, // 1 minute
      timeout: 5000,
      network: 10000,
      service_unavailable: 30000,
      invalid_response: 2000,
    };

    return delays[category] ?? 5000;
  }

  /**
   * Check if surface should be disabled
   */
  shouldDisableSurface(history: SurfacePerformanceHistory): boolean {
    // Disable if failure rate is too high
    const failureRate = history.totalQueries > 0
      ? history.failedQueries / history.totalQueries
      : 0;

    // Disable if >50% failure rate with at least 10 queries
    if (history.totalQueries >= 10 && failureRate > 0.5) {
      return true;
    }

    // Disable if consistent authentication failures
    const authFailures = history.errorsByType['AUTH_FAILED'] ?? 0;
    if (authFailures >= 3) {
      return true;
    }

    // Disable if quota is exceeded
    const quotaExceeded = history.errorsByType['QUOTA_EXCEEDED'] ?? 0;
    if (quotaExceeded >= 1) {
      return true;
    }

    return false;
  }

  /**
   * Diagnose the issue
   */
  private diagnose(context: TroubleshootingContext): Diagnosis {
    const { error, surfaceHistory } = context;
    const lowerMessage = error.message.toLowerCase();

    // Find matching category
    let category: DiagnosisCategory = 'unknown';
    let severity: Diagnosis['severity'] = 'medium';

    for (const { patterns, category: cat, severity: sev } of ERROR_PATTERNS) {
      for (const pattern of patterns) {
        if (lowerMessage.includes(pattern)) {
          category = cat;
          severity = sev;
          break;
        }
      }
      if (category !== 'unknown') break;
    }

    // Adjust severity based on retry count and history
    if (error.retryCount > 3) {
      severity = this.escalateSeverity(severity);
    }

    if (surfaceHistory && surfaceHistory.failedQueries > surfaceHistory.successfulQueries) {
      severity = this.escalateSeverity(severity);
    }

    // Generate description
    const summary = this.generateSummary(category, error);
    const description = this.generateDescription(category, error, context);

    // Calculate confidence
    const confidence = this.calculateDiagnosisConfidence(category, error);

    return {
      category,
      severity,
      summary,
      description,
      confidence,
    };
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    diagnosis: Diagnosis,
    context: TroubleshootingContext
  ): Recommendation[] {
    const templates = RECOMMENDATION_TEMPLATES[diagnosis.category] ?? RECOMMENDATION_TEMPLATES.unknown;
    const recommendations: Recommendation[] = [];

    for (const template of templates) {
      if (recommendations.length >= this.config.maxRecommendations) {
        break;
      }

      // Customize recommendation based on context
      const recommendation = this.customizeRecommendation(template, context);
      recommendations.push(recommendation);
    }

    // Add context-specific recommendations
    this.addContextSpecificRecommendations(recommendations, diagnosis, context);

    // Sort by priority
    return recommendations.sort((a, b) => {
      const priorityOrder = { immediate: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }).slice(0, this.config.maxRecommendations);
  }

  /**
   * Customize recommendation based on context
   */
  private customizeRecommendation(
    template: typeof RECOMMENDATION_TEMPLATES.unknown[0],
    context: TroubleshootingContext
  ): Recommendation {
    const recommendation: Recommendation = { ...template };

    // Add surface-specific details
    recommendation.action = template.action.replace(
      '{surface}',
      context.surfaceId
    );

    // Add timing if rate limited
    if (template.type === 'retry_with_delay' && context.error.retryCount > 0) {
      const delay = this.getSuggestedRetryDelay(context.error.code);
      recommendation.steps = [
        `Wait ${Math.round(delay / 1000)} seconds`,
        ...(template.steps ?? []),
      ];
    }

    return recommendation;
  }

  /**
   * Add context-specific recommendations
   */
  private addContextSpecificRecommendations(
    recommendations: Recommendation[],
    _diagnosis: Diagnosis,
    context: TroubleshootingContext
  ): void {
    // If multiple retries failed, suggest switching surface
    if (context.error.retryCount >= 3) {
      const hasSwitch = recommendations.some(r => r.type === 'switch_surface');
      if (!hasSwitch) {
        recommendations.push({
          type: 'switch_surface',
          priority: 'high',
          action: `Switch away from ${context.surfaceId} after ${context.error.retryCount} failed attempts`,
          expectedOutcome: 'Alternative surface may succeed',
        });
      }
    }

    // If surface has high failure rate, suggest disabling
    if (context.surfaceHistory && this.shouldDisableSurface(context.surfaceHistory)) {
      recommendations.push({
        type: 'disable_surface',
        priority: 'high',
        action: `Temporarily disable ${context.surfaceId} due to high failure rate`,
        expectedOutcome: 'Prevents further failed attempts',
      });
    }
  }

  /**
   * Analyze root cause
   */
  private analyzeRootCause(
    context: TroubleshootingContext,
    diagnosis: Diagnosis
  ): RootCauseAnalysis {
    const { error, surfaceHistory } = context;
    const evidence: string[] = [];
    const contributingFactors: string[] = [];

    // Collect evidence
    evidence.push(`Error code: ${error.code}`);
    evidence.push(`Error message: ${error.message}`);

    if (error.httpStatus) {
      evidence.push(`HTTP status: ${error.httpStatus}`);
    }

    if (error.retryCount > 0) {
      evidence.push(`Failed after ${error.retryCount} retries`);
      contributingFactors.push('Multiple retry attempts failed');
    }

    // Analyze surface history
    if (surfaceHistory) {
      const failureRate = surfaceHistory.totalQueries > 0
        ? surfaceHistory.failedQueries / surfaceHistory.totalQueries
        : 0;

      if (failureRate > 0.3) {
        contributingFactors.push(`High surface failure rate: ${Math.round(failureRate * 100)}%`);
      }

      // Check for error patterns
      const topErrors = Object.entries(surfaceHistory.errorsByType)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3);

      if (topErrors.length > 0) {
        contributingFactors.push(
          `Common errors: ${topErrors.map(([type, count]) => `${type} (${count})`).join(', ')}`
        );
      }
    }

    // Determine root cause
    const rootCause = this.determineRootCause(diagnosis, contributingFactors);

    return {
      rootCause,
      contributingFactors,
      evidence,
      confidence: diagnosis.confidence * 0.9, // Slightly less confident than diagnosis
    };
  }

  /**
   * Determine root cause based on diagnosis and factors
   */
  private determineRootCause(diagnosis: Diagnosis, _factors: string[]): string {
    const causeMap: Record<DiagnosisCategory, string> = {
      rate_limiting: 'Request rate exceeded surface limits',
      authentication: 'Invalid or expired authentication credentials',
      timeout: 'Surface took too long to respond',
      network: 'Network connectivity issue between client and surface',
      content_policy: 'Query content triggered surface content filters',
      service_unavailable: 'Surface is experiencing downtime or maintenance',
      quota_exceeded: 'Account usage quota has been exceeded',
      invalid_response: 'Surface returned malformed or unparseable response',
      session_expired: 'Web session has expired or become invalid',
      captcha_required: 'Surface detected automated access and requires human verification',
      malformed_request: 'Request was incorrectly formatted',
      unknown: 'Unable to determine specific root cause',
    };

    return causeMap[diagnosis.category];
  }

  /**
   * Find similar past issues
   */
  private findSimilarIssues(
    context: TroubleshootingContext,
    diagnosis: Diagnosis
  ): SimilarIssue[] {
    const key = `${context.surfaceId}:${diagnosis.category}`;
    const pastIssues = this.issueHistory.get(key) ?? [];

    // Return most recent similar issues
    return pastIssues
      .slice(-5)
      .map(issue => ({
        ...issue,
        similarity: this.calculateIssueSimilarity(context.error, issue),
      }))
      .sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Record issue for future reference
   */
  private recordIssue(context: TroubleshootingContext, diagnosis: Diagnosis): void {
    const key = `${context.surfaceId}:${diagnosis.category}`;
    const issues = this.issueHistory.get(key) ?? [];

    issues.push({
      issueId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      similarity: 1,
      resolution: undefined,
      resolutionSuccessful: undefined,
    });

    // Keep only recent issues
    if (issues.length > 100) {
      issues.shift();
    }

    this.issueHistory.set(key, issues);
  }

  /**
   * Record successful resolution
   */
  recordResolution(issueId: string, resolution: string, successful: boolean): void {
    for (const issues of this.issueHistory.values()) {
      const issue = issues.find(i => i.issueId === issueId);
      if (issue) {
        issue.resolution = resolution;
        issue.resolutionSuccessful = successful;
        break;
      }
    }
  }

  /**
   * Generate summary for diagnosis
   */
  private generateSummary(category: DiagnosisCategory, _error: ErrorInfo): string {
    const summaries: Record<DiagnosisCategory, string> = {
      rate_limiting: 'Rate limit exceeded',
      authentication: 'Authentication failed',
      timeout: 'Request timed out',
      network: 'Network error',
      content_policy: 'Content policy violation',
      service_unavailable: 'Service unavailable',
      quota_exceeded: 'Quota exceeded',
      invalid_response: 'Invalid response received',
      session_expired: 'Session expired',
      captcha_required: 'Captcha verification required',
      malformed_request: 'Malformed request',
      unknown: 'Unknown error',
    };

    return summaries[category];
  }

  /**
   * Generate detailed description
   */
  private generateDescription(
    _category: DiagnosisCategory,
    error: ErrorInfo,
    context: TroubleshootingContext
  ): string {
    const parts: string[] = [];

    parts.push(`Error occurred on surface "${context.surfaceId}".`);
    parts.push(`Error message: ${error.message}`);

    if (error.retryCount > 0) {
      parts.push(`The request was retried ${error.retryCount} times without success.`);
    }

    if (context.surfaceHistory) {
      const recentFailures = context.surfaceHistory.recentErrors.length;
      if (recentFailures > 1) {
        parts.push(`There have been ${recentFailures} recent errors on this surface.`);
      }
    }

    return parts.join(' ');
  }

  /**
   * Calculate diagnosis confidence
   */
  private calculateDiagnosisConfidence(category: DiagnosisCategory, error: ErrorInfo): number {
    // Higher confidence for specific error codes
    if (error.httpStatus) {
      const httpConfidence: Record<number, number> = {
        401: 0.95,
        403: 0.9,
        429: 0.95,
        500: 0.7,
        502: 0.8,
        503: 0.85,
        504: 0.85,
      };
      return httpConfidence[error.httpStatus] ?? 0.6;
    }

    // Lower confidence for unknown category
    if (category === 'unknown') {
      return 0.3;
    }

    return 0.7;
  }

  /**
   * Escalate severity
   */
  private escalateSeverity(current: Diagnosis['severity']): Diagnosis['severity'] {
    const order: Diagnosis['severity'][] = ['low', 'medium', 'high', 'critical'];
    const index = order.indexOf(current);
    return order[Math.min(index + 1, order.length - 1)];
  }

  /**
   * Calculate similarity between issues
   */
  private calculateIssueSimilarity(_error: ErrorInfo, _issue: SimilarIssue): number {
    // Simple similarity based on having the same issue ID pattern
    // In a real implementation, this would compare error details
    return 0.8; // Placeholder
  }
}

/**
 * Create a troubleshooter instance
 */
export function createTroubleshooter(config?: TroubleshooterConfig): Troubleshooter {
  return new Troubleshooter(config);
}
