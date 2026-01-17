/**
 * Unit tests for AI Advisor modules
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  QueryGenerator,
  createQueryGenerator,
  ResponseValidator,
  createResponseValidator,
  ResponseScorer,
  createResponseScorer,
  Troubleshooter,
  createTroubleshooter,
  type QueryGenerationContext,
  type ValidationContext,
  type ScoringContext,
  type TroubleshootingContext,
  type ScoringDimension,
} from '../../index.js';
import type { Manifest, Query } from '@bentham/core';

// Helper to create a minimal manifest
function createTestManifest(): Manifest {
  return {
    version: '1.0.0',
    name: 'Test Study',
    description: 'A test study for AI research',
    queries: [{ text: 'What is AI?' }],
    surfaces: [],
    locations: [],
    completionCriteria: {
      requiredSurfaces: { surfaceIds: ['openai-api'], coverageThreshold: 0.95 },
      maxRetriesPerCell: 3,
    },
    qualityGates: { requireActualContent: true },
    evidenceLevel: 'metadata',
    legalHold: false,
    deadline: new Date('2025-12-31'),
    sessionIsolation: 'shared',
  };
}

// Helper to create a test query
function createTestQuery(text: string = 'What is artificial intelligence?'): Query {
  return { text };
}

describe('AI Advisor Modules', () => {
  describe('Query Generator', () => {
    let generator: QueryGenerator;

    beforeEach(() => {
      generator = createQueryGenerator();
    });

    it('should create generator with default config', () => {
      expect(generator).toBeInstanceOf(QueryGenerator);
    });

    it('should generate direct query', () => {
      // Use small maxInputTokens so query is not considered "short" (which would trigger expansion)
      // Query "What is artificial intelligence?" is ~34 chars / 4 = ~8.5 tokens
      // To avoid expansion: 8.5 must be >= maxInputTokens * 0.1, so maxInputTokens <= 85
      const context: QueryGenerationContext = {
        manifest: createTestManifest(),
        surfaceId: 'openai-api',
        cellQuery: createTestQuery(),
        surfaceContext: {
          capabilities: {
            maxInputTokens: 50, // threshold: 5 tokens, query ~8.5 tokens -> direct
          },
        },
      };

      const result = generator.generate(context);

      expect(result.query).toBe('What is artificial intelligence?');
      expect(result.metadata.strategy).toBe('direct');
      expect(result.metadata.generatedAt).toBeInstanceOf(Date);
    });

    it('should generate reformulated query on retry', () => {
      // Retry strategy uses previousQueries.length % 3:
      // 0 -> doesn't enter retry logic
      // 1 -> 'simplified'
      // 2 -> 'expanded'
      // 3 -> 'reformulated'
      const context: QueryGenerationContext = {
        manifest: createTestManifest(),
        surfaceId: 'openai-api',
        cellQuery: createTestQuery('what is AI'),
        isRetry: true,
        previousQueries: ['query1', 'query2', 'query3'], // 3 % 3 = 0 -> 'reformulated'
      };

      const result = generator.generate(context);

      expect(result.metadata.strategy).toBe('reformulated');
    });

    it('should generate system prompt when surface supports it', () => {
      const context: QueryGenerationContext = {
        manifest: createTestManifest(),
        surfaceId: 'openai-api',
        cellQuery: createTestQuery(),
        surfaceContext: {
          capabilities: {
            supportsSystemPrompt: true,
          },
        },
      };

      const result = generator.generate(context);

      expect(result.systemPrompt).toBeDefined();
      expect(result.systemPrompt).toContain('helpful assistant');
    });

    it('should generate multiple variations', () => {
      const context: QueryGenerationContext = {
        manifest: createTestManifest(),
        surfaceId: 'openai-api',
        cellQuery: createTestQuery(),
      };

      const variations = generator.generateVariations(context, 3);

      expect(variations.length).toBeGreaterThanOrEqual(1);
      expect(variations.length).toBeLessThanOrEqual(3);
    });

    it('should estimate token count', () => {
      const context: QueryGenerationContext = {
        manifest: createTestManifest(),
        surfaceId: 'openai-api',
        cellQuery: createTestQuery('This is a longer query with multiple words to test token estimation'),
      };

      const result = generator.generate(context);

      expect(result.metadata.estimatedTokens).toBeGreaterThan(0);
    });
  });

  describe('Response Validator', () => {
    let validator: ResponseValidator;

    beforeEach(() => {
      validator = createResponseValidator();
    });

    it('should create validator with default config', () => {
      expect(validator).toBeInstanceOf(ResponseValidator);
    });

    it('should validate valid response', () => {
      const context: ValidationContext = {
        query: 'What is artificial intelligence?',
        response: 'Artificial intelligence (AI) refers to the simulation of human intelligence in machines that are programmed to think and learn like humans. It encompasses various technologies including machine learning, natural language processing, and computer vision.',
        criteria: {},
        surfaceId: 'openai-api',
      };

      const result = validator.validate(context);

      expect(result.isValid).toBe(true);
      expect(result.checks.length).toBeGreaterThan(0);
    });

    it('should fail validation for too short response', () => {
      const context: ValidationContext = {
        query: 'What is AI?',
        response: 'AI.',
        criteria: { minLength: 10 },
        surfaceId: 'openai-api',
      };

      const result = validator.validate(context);

      expect(result.isValid).toBe(false);
      expect(result.issues.some(i => i.type === 'too_short')).toBe(true);
    });

    it('should detect refusal response', () => {
      const context: ValidationContext = {
        query: 'How do I hack a computer?',
        response: "I'm sorry, but I cannot help with that request as it involves potentially harmful activities.",
        criteria: {},
        surfaceId: 'openai-api',
      };

      const result = validator.validate(context);

      expect(result.isValid).toBe(false);
      expect(result.issues.some(i => i.type === 'refusal_response')).toBe(true);
    });

    it('should check required keywords', () => {
      const context: ValidationContext = {
        query: 'What is AI?',
        response: 'It is a technology that uses computers to perform tasks.',
        criteria: { requiredKeywords: ['artificial', 'intelligence'] },
        surfaceId: 'openai-api',
      };

      const result = validator.validate(context);

      expect(result.checks.some(c => c.name === 'required_keywords' && !c.passed)).toBe(true);
    });

    it('should check forbidden patterns', () => {
      const context: ValidationContext = {
        query: 'What is AI?',
        response: 'ERROR: Cannot process request. AI is undefined.',
        criteria: { forbiddenPatterns: ['ERROR:'] },
        surfaceId: 'openai-api',
      };

      const result = validator.validate(context);

      expect(result.checks.some(c => c.name === 'forbidden_patterns' && !c.passed)).toBe(true);
    });

    it('should perform quick validation', () => {
      expect(validator.quickValidate('This is a valid response with enough content.')).toBe(true);
      expect(validator.quickValidate('No')).toBe(false);
      expect(validator.quickValidate("I cannot help with that request")).toBe(false);
    });

    it('should evaluate quality gates', () => {
      const context: ValidationContext = {
        query: 'What is AI?',
        response: 'Artificial intelligence is the simulation of human intelligence by machines.',
        criteria: {},
        qualityGates: [
          { name: 'min_length', type: 'min_length', threshold: 50, critical: true },
          { name: 'max_length', type: 'max_length', threshold: 1000, critical: false },
        ],
        surfaceId: 'openai-api',
      };

      const result = validator.validate(context);

      expect(result.gateResults.length).toBe(2);
      expect(result.gateResults.every(g => g.passed)).toBe(true);
    });
  });

  describe('Response Scorer', () => {
    let scorer: ResponseScorer;

    beforeEach(() => {
      scorer = createResponseScorer();
    });

    it('should create scorer with default config', () => {
      expect(scorer).toBeInstanceOf(ResponseScorer);
    });

    it('should score response', () => {
      const context: ScoringContext = {
        query: 'What is artificial intelligence?',
        response: 'Artificial intelligence (AI) refers to the simulation of human intelligence in machines. It includes technologies like machine learning, natural language processing, and computer vision. AI systems can learn, reason, and adapt to new situations.',
        dimensions: ['relevance', 'completeness', 'clarity'],
      };

      const result = scorer.score(context);

      expect(result.overallScore).toBeGreaterThan(0);
      expect(result.overallScore).toBeLessThanOrEqual(1);
      expect(result.dimensionScores.length).toBe(3);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should score all dimensions', () => {
      const dimensions: ScoringDimension[] = [
        'relevance', 'accuracy', 'completeness', 'clarity',
        'coherence', 'helpfulness', 'safety', 'consistency',
      ];

      const context: ScoringContext = {
        query: 'What is AI?',
        response: 'Artificial intelligence is the field of computer science that focuses on creating intelligent machines.',
        dimensions,
      };

      const result = scorer.score(context);

      expect(result.dimensionScores.length).toBe(8);
      result.dimensionScores.forEach(ds => {
        expect(ds.score).toBeGreaterThanOrEqual(0);
        expect(ds.score).toBeLessThanOrEqual(1);
      });
    });

    it('should quick score', () => {
      const score = scorer.quickScore(
        'Artificial intelligence simulates human intelligence in machines.',
        'What is AI?'
      );

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should compare two responses', () => {
      const response1 = 'AI is a broad field of computer science focused on creating systems that can perform tasks requiring human intelligence.';
      const response2 = 'AI means computers.';

      const comparison = scorer.compare(response1, response2, 'What is artificial intelligence?');

      expect(comparison.winner).toBe('response1');
      expect(comparison.score1.overallScore).toBeGreaterThan(comparison.score2.overallScore);
      expect(comparison.comparison).toContain('Response 1');
    });

    it('should generate explanations', () => {
      const context: ScoringContext = {
        query: 'What is AI?',
        response: 'AI is the simulation of human intelligence by machines.',
        dimensions: ['relevance', 'clarity'],
      };

      const result = scorer.score(context);

      expect(result.explanation).toBeDefined();
      expect(result.dimensionScores.some(ds => ds.explanation)).toBe(true);
    });

    it('should score accuracy with reference answer', () => {
      const context: ScoringContext = {
        query: 'What year was AI coined as a term?',
        response: 'The term "Artificial Intelligence" was coined in 1956 at the Dartmouth Conference.',
        dimensions: ['accuracy'],
        referenceAnswer: 'The term AI was coined in 1956 at the Dartmouth Conference.',
      };

      const result = scorer.score(context);

      const accuracyScore = result.dimensionScores.find(ds => ds.dimension === 'accuracy');
      expect(accuracyScore).toBeDefined();
      expect(accuracyScore!.score).toBeGreaterThan(0.5);
    });
  });

  describe('Troubleshooter', () => {
    let troubleshooter: Troubleshooter;

    beforeEach(() => {
      troubleshooter = createTroubleshooter();
    });

    it('should create troubleshooter with default config', () => {
      expect(troubleshooter).toBeInstanceOf(Troubleshooter);
    });

    it('should diagnose rate limit error', () => {
      const context: TroubleshootingContext = {
        error: {
          code: 'RATE_LIMITED',
          message: 'Rate limit exceeded: too many requests',
          timestamp: new Date(),
          retryCount: 0,
        },
        surfaceId: 'openai-api',
        query: 'What is AI?',
      };

      const result = troubleshooter.troubleshoot(context);

      expect(result.diagnosis.category).toBe('rate_limiting');
      expect(result.diagnosis.severity).toBe('medium');
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should diagnose authentication error', () => {
      const context: TroubleshootingContext = {
        error: {
          code: 'AUTH_FAILED',
          message: 'Unauthorized: Invalid API key',
          httpStatus: 401,
          timestamp: new Date(),
          retryCount: 0,
        },
        surfaceId: 'openai-api',
        query: 'What is AI?',
      };

      const result = troubleshooter.troubleshoot(context);

      expect(result.diagnosis.category).toBe('authentication');
      expect(result.diagnosis.severity).toBe('high');
      expect(result.recommendations.some(r => r.type === 'refresh_credentials')).toBe(true);
    });

    it('should diagnose timeout error', () => {
      const context: TroubleshootingContext = {
        error: {
          code: 'TIMEOUT',
          message: 'Request timed out after 30s',
          timestamp: new Date(),
          retryCount: 2,
        },
        surfaceId: 'chatgpt-web',
        query: 'What is AI?',
      };

      const result = troubleshooter.troubleshoot(context);

      expect(result.diagnosis.category).toBe('timeout');
      expect(result.recommendations.some(r => r.type === 'retry_with_modification')).toBe(true);
    });

    it('should diagnose content policy violation', () => {
      const context: TroubleshootingContext = {
        error: {
          code: 'CONTENT_BLOCKED',
          message: 'Content policy violation: cannot assist with harmful content',
          timestamp: new Date(),
          retryCount: 0,
        },
        surfaceId: 'openai-api',
        query: 'How to hack?',
      };

      const result = troubleshooter.troubleshoot(context);

      expect(result.diagnosis.category).toBe('content_policy');
      expect(result.recommendations.some(r => r.type === 'retry_with_modification')).toBe(true);
    });

    it('should quick diagnose', () => {
      expect(troubleshooter.quickDiagnose('Rate limit exceeded')).toBe('rate_limiting');
      expect(troubleshooter.quickDiagnose('Unauthorized')).toBe('authentication');
      expect(troubleshooter.quickDiagnose('Network error: ECONNREFUSED')).toBe('network');
      expect(troubleshooter.quickDiagnose('Some random error')).toBe('unknown');
    });

    it('should check if error is retryable', () => {
      expect(troubleshooter.isRetryable('rate limit')).toBe(true);
      expect(troubleshooter.isRetryable('timeout')).toBe(true);
      expect(troubleshooter.isRetryable('network')).toBe(true);
      expect(troubleshooter.isRetryable('unauthorized')).toBe(false);
      expect(troubleshooter.isRetryable('content policy')).toBe(false);
    });

    it('should suggest retry delay', () => {
      expect(troubleshooter.getSuggestedRetryDelay('rate limit')).toBe(60000);
      expect(troubleshooter.getSuggestedRetryDelay('timeout')).toBe(5000);
      expect(troubleshooter.getSuggestedRetryDelay('network')).toBe(10000);
    });

    it('should check if surface should be disabled', () => {
      // Low failure rate - don't disable
      expect(troubleshooter.shouldDisableSurface({
        totalQueries: 100,
        successfulQueries: 90,
        failedQueries: 10,
        avgResponseTimeMs: 1000,
        errorsByType: {},
        recentErrors: [],
      })).toBe(false);

      // High failure rate - disable
      expect(troubleshooter.shouldDisableSurface({
        totalQueries: 20,
        successfulQueries: 5,
        failedQueries: 15,
        avgResponseTimeMs: 1000,
        errorsByType: {},
        recentErrors: [],
      })).toBe(true);

      // Multiple auth failures - disable
      expect(troubleshooter.shouldDisableSurface({
        totalQueries: 10,
        successfulQueries: 7,
        failedQueries: 3,
        avgResponseTimeMs: 1000,
        errorsByType: { 'AUTH_FAILED': 3 },
        recentErrors: [],
      })).toBe(true);
    });

    it('should escalate severity with retries', () => {
      const context: TroubleshootingContext = {
        error: {
          code: 'TIMEOUT',
          message: 'Request timed out',
          timestamp: new Date(),
          retryCount: 5, // Many retries
        },
        surfaceId: 'chatgpt-web',
        query: 'What is AI?',
      };

      const result = troubleshooter.troubleshoot(context);

      // Severity should be escalated due to retries
      expect(['medium', 'high', 'critical']).toContain(result.diagnosis.severity);
    });

    it('should perform root cause analysis', () => {
      const context: TroubleshootingContext = {
        error: {
          code: 'RATE_LIMITED',
          message: '429 Too Many Requests',
          httpStatus: 429,
          timestamp: new Date(),
          retryCount: 2,
        },
        surfaceId: 'openai-api',
        query: 'What is AI?',
        surfaceHistory: {
          totalQueries: 50,
          successfulQueries: 45,
          failedQueries: 5,
          avgResponseTimeMs: 1500,
          errorsByType: { 'RATE_LIMITED': 3 },
          recentErrors: [],
        },
      };

      const result = troubleshooter.troubleshoot(context);

      expect(result.rootCause).toBeDefined();
      expect(result.rootCause!.rootCause).toContain('rate');
      expect(result.rootCause!.evidence.length).toBeGreaterThan(0);
    });

    it('should include metadata', () => {
      const context: TroubleshootingContext = {
        error: {
          code: 'UNKNOWN',
          message: 'Something went wrong',
          timestamp: new Date(),
          retryCount: 0,
        },
        surfaceId: 'openai-api',
        query: 'What is AI?',
      };

      const result = troubleshooter.troubleshoot(context);

      expect(result.metadata.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.metadata.analyzedAt).toBeInstanceOf(Date);
      expect(result.metadata.troubleshooterVersion).toBeDefined();
    });
  });
});
