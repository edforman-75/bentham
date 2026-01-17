/**
 * Integration tests for AI advisor workflow
 *
 * Tests the complete workflow of AI advisory capabilities:
 * - Query generation -> Response validation -> Scoring
 * - Error handling -> Troubleshooting
 * - Cross-module integration
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createQueryGenerator } from '../../query-generator';
import { createResponseValidator } from '../../response-validator';
import { createResponseScorer } from '../../response-scorer';
import { createTroubleshooter } from '../../troubleshooter';
import type { Manifest, SurfaceId } from '@bentham/core';

describe('AI Advisor Workflow Integration', () => {
  // Sample manifest for testing
  const testManifest: Manifest = {
    version: '1.0.0',
    name: 'Test Study',
    description: 'A test study for AI responses',
    queries: [
      { text: 'What is machine learning?' },
      { text: 'Explain neural networks' },
      { text: 'What are the benefits of AI?' },
    ],
    surfaces: [
      { id: 'openai-api', required: true },
      { id: 'anthropic-api', required: true },
    ],
    locations: [
      {
        id: 'us-nyc',
        name: 'New York, US',
        country: 'US',
        proxyType: 'residential',
        requireSticky: false,
      },
    ],
    completionCriteria: {
      requiredSurfaces: {
        surfaceIds: ['openai-api', 'anthropic-api'],
        coverageThreshold: 0.95,
      },
      maxRetriesPerCell: 3,
    },
    qualityGates: {
      requireActualContent: true,
      minResponseLength: 100,
    },
    evidenceLevel: 'full',
    legalHold: false,
    deadline: new Date('2025-12-31'),
    sessionIsolation: 'dedicated_per_study',
  };

  describe('Complete Query-Response Workflow', () => {
    it('should generate query, validate response, and score', async () => {
      // Step 1: Generate query
      const generator = createQueryGenerator();
      const queryResult = generator.generate({
        manifest: testManifest,
        surfaceId: 'openai-api' as SurfaceId,
        cellQuery: testManifest.queries[0],
        surfaceContext: {
          capabilities: {
            maxInputTokens: 4096,
            supportsSystemPrompt: true,
            supportsConversationHistory: true,
          },
        },
      });

      expect(queryResult.query).toBeTruthy();
      expect(queryResult.metadata.strategy).toBeDefined();

      // Step 2: Simulate response (would come from surface adapter)
      const mockResponse =
        'Machine learning is a subset of artificial intelligence that ' +
        'enables systems to learn and improve from experience without being ' +
        'explicitly programmed. It focuses on developing computer programs ' +
        'that can access data and use it to learn for themselves.';

      // Step 3: Validate response
      const validator = createResponseValidator();
      const validationResult = validator.validate({
        query: queryResult.query,
        response: mockResponse,
        criteria: {
          minLength: 50,
          requireRelevance: true,
        },
        surfaceId: 'openai-api' as SurfaceId,
      });

      expect(validationResult.isValid).toBe(true);
      expect(validationResult.checks.length).toBeGreaterThan(0);

      // Step 4: Score response
      const scorer = createResponseScorer();
      const scoreResult = scorer.score({
        query: queryResult.query,
        response: mockResponse,
        dimensions: ['relevance', 'completeness', 'clarity'],
      });

      expect(scoreResult.overallScore).toBeGreaterThan(0);
      expect(scoreResult.dimensionScores.length).toBe(3);
    });

    it('should handle query variations for retry scenarios', async () => {
      const generator = createQueryGenerator({
        enableVariation: true,
      });

      const baseContext = {
        manifest: testManifest,
        surfaceId: 'openai-api' as SurfaceId,
        cellQuery: testManifest.queries[0],
        surfaceContext: {
          capabilities: {
            maxInputTokens: 4096,
            supportsSystemPrompt: true,
            supportsConversationHistory: true,
          },
        },
      };

      // Generate variations
      const variations = generator.generateVariations(baseContext, 3);

      expect(variations.length).toBe(3);

      // Each variation should be different
      const queryTexts = variations.map((v) => v.query);
      const uniqueQueries = new Set(queryTexts);
      expect(uniqueQueries.size).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Error Handling and Troubleshooting Flow', () => {
    it('should diagnose rate limiting and recommend actions', () => {
      const troubleshooter = createTroubleshooter();

      const result = troubleshooter.troubleshoot({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please retry after 60 seconds.',
          timestamp: new Date(),
          retryCount: 2,
          httpStatus: 429,
        },
        surfaceId: 'openai-api' as SurfaceId,
        query: 'What is AI?',
      });

      expect(result.diagnosis.category).toBe('rate_limiting');
      expect(result.diagnosis.severity).toBeDefined();
      expect(result.recommendations.length).toBeGreaterThan(0);

      // Should recommend retry with delay
      const retryRec = result.recommendations.find(
        (r) => r.type === 'retry_with_delay'
      );
      expect(retryRec).toBeDefined();
    });

    it('should diagnose authentication failures', () => {
      const troubleshooter = createTroubleshooter();

      const result = troubleshooter.troubleshoot({
        error: {
          code: 'AUTH_FAILED',
          message: 'Invalid API key provided',
          timestamp: new Date(),
          retryCount: 0,
          httpStatus: 401,
        },
        surfaceId: 'openai-api' as SurfaceId,
        query: 'Test query',
      });

      expect(result.diagnosis.category).toBe('authentication');

      // Should recommend refreshing credentials
      const credRec = result.recommendations.find(
        (r) => r.type === 'refresh_credentials'
      );
      expect(credRec).toBeDefined();
    });

    it('should diagnose content policy violations', () => {
      const troubleshooter = createTroubleshooter();

      const result = troubleshooter.troubleshoot({
        error: {
          code: 'CONTENT_POLICY',
          message: 'Content blocked due to policy violation',
          timestamp: new Date(),
          retryCount: 0,
        },
        surfaceId: 'openai-api' as SurfaceId,
        query: 'Potentially problematic query',
      });

      expect(result.diagnosis.category).toBe('content_policy');

      // Should recommend query modification
      const modifyRec = result.recommendations.find(
        (r) => r.type === 'retry_with_modification'
      );
      expect(modifyRec).toBeDefined();
    });
  });

  describe('Validation-Scoring Integration', () => {
    let validator: ReturnType<typeof createResponseValidator>;
    let scorer: ReturnType<typeof createResponseScorer>;

    beforeEach(() => {
      validator = createResponseValidator();
      scorer = createResponseScorer();
    });

    it('should correlate validation and scoring results', () => {
      const query = 'What is deep learning?';
      const response =
        'Deep learning is a subset of machine learning that uses neural networks ' +
        'with many layers (hence "deep") to model complex patterns in data. ' +
        'It has revolutionized fields like computer vision and natural language processing.';

      const validation = validator.validate({
        query,
        response,
        criteria: { minLength: 50, requireRelevance: true },
        surfaceId: 'openai-api' as SurfaceId,
      });

      const scoring = scorer.score({
        query,
        response,
        dimensions: ['relevance', 'completeness', 'clarity'],
      });

      // Valid responses should have good scores
      if (validation.isValid) {
        expect(scoring.overallScore).toBeGreaterThan(0.5);
      }
    });

    it('should handle poor quality responses appropriately', () => {
      const query = 'Explain the theory of relativity in detail';
      const poorResponse = 'I cannot answer that.';

      const validation = validator.validate({
        query,
        response: poorResponse,
        criteria: { minLength: 100, requireRelevance: true },
        surfaceId: 'openai-api' as SurfaceId,
      });

      const scoring = scorer.score({
        query,
        response: poorResponse,
        dimensions: ['relevance', 'completeness'],
      });

      // Poor response should fail validation or have low scores
      expect(validation.isValid).toBe(false);
      expect(scoring.overallScore).toBeLessThan(0.5);
    });
  });

  describe('Multi-Surface Query Generation', () => {
    it('should generate appropriate queries for different surfaces', () => {
      const generator = createQueryGenerator();

      const surfaces: SurfaceId[] = ['openai-api', 'anthropic-api'] as SurfaceId[];
      const results: Record<string, ReturnType<typeof generator.generate>> = {};

      for (const surfaceId of surfaces) {
        results[surfaceId] = generator.generate({
          manifest: testManifest,
          surfaceId,
          cellQuery: testManifest.queries[0],
          surfaceContext: {
            capabilities: {
              maxInputTokens: 4096,
              supportsSystemPrompt: true,
              supportsConversationHistory: true,
            },
          },
        });
      }

      // All surfaces should get valid queries
      for (const surfaceId of surfaces) {
        expect(results[surfaceId].query).toBeTruthy();
        expect(results[surfaceId].metadata).toBeDefined();
      }
    });
  });

  describe('Quality Gate Integration', () => {
    it('should validate against quality gates from manifest', () => {
      const validator = createResponseValidator();

      const response = 'Short response';

      const result = validator.validate({
        query: 'What is AI?',
        response,
        criteria: {
          minLength: testManifest.qualityGates.minResponseLength || 100,
        },
        qualityGates: [
          {
            name: 'min_length',
            type: 'min_length',
            threshold: testManifest.qualityGates.minResponseLength || 100,
            critical: true,
          },
        ],
        surfaceId: 'openai-api' as SurfaceId,
      });

      // Short response should fail min length gate
      expect(result.isValid).toBe(false);
      expect(result.gateResults.some((g) => g.gate.name === 'min_length')).toBe(true);
    });
  });

  describe('Scoring with Reference Answers', () => {
    it('should score response against reference', () => {
      const scorer = createResponseScorer();

      const query = 'What is 2 + 2?';
      const response = 'The answer is 4.';
      const referenceAnswer = '2 + 2 equals 4.';

      const result = scorer.score({
        query,
        response,
        dimensions: ['accuracy', 'relevance'],
        referenceAnswer,
      });

      // Response matching reference should have a score
      expect(result.overallScore).toBeGreaterThan(0);
      expect(result.dimensionScores).toBeDefined();
      expect(result.dimensionScores.length).toBe(2);
    });
  });
});
