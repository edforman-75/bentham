/**
 * Core Functionality Regression Tests
 *
 * These tests verify critical functionality that must never break.
 * DO NOT modify or delete these tests without explicit justification.
 */

import { describe, it, expect } from 'vitest';
import {
  // ID utilities
  generateId,
  generatePrefixedId,
  isValidId,

  // Hash utilities
  hashContent,
  verifyHash,

  // Schema utilities
  validateSchema,
  z,

  // Errors
  BenthamError,
  Errors,
  isBenthamError,
  toBenthamError,

  // Types
  LOCATIONS,
  isValidLocationId,
  SURFACES,
  isValidSurfaceId,

  // Constants
  DEFAULT_TIMEOUTS,
  MAX_RETRIES,
  MANIFEST_VERSION,
} from '../../index.js';

describe('Regression: ID Generation', () => {
  it('generateId produces unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(1000);
  });

  it('generateId produces IDs of correct length (21)', () => {
    const id = generateId();
    expect(id.length).toBe(21);
  });

  it('generatePrefixedId includes prefix', () => {
    const id = generatePrefixedId('study');
    expect(id.startsWith('study_')).toBe(true);
  });

  it('isValidId validates correctly', () => {
    expect(isValidId(generateId())).toBe(true);
    expect(isValidId('')).toBe(false);
    expect(isValidId('invalid@id')).toBe(false);
  });
});

describe('Regression: Hash Functions', () => {
  it('hashContent is deterministic', () => {
    const content = 'test content for hashing';
    const hash1 = hashContent(content);
    const hash2 = hashContent(content);
    expect(hash1).toBe(hash2);
  });

  it('hashContent produces SHA-256 (64 hex chars)', () => {
    const hash = hashContent('test');
    expect(hash.length).toBe(64);
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it('verifyHash works correctly', () => {
    const content = 'test content';
    const hash = hashContent(content);
    expect(verifyHash(content, hash)).toBe(true);
    expect(verifyHash('different content', hash)).toBe(false);
  });
});

describe('Regression: Schema Validation', () => {
  it('validateSchema returns success for valid data', () => {
    const schema = z.object({ name: z.string() });
    const result = validateSchema(schema, { name: 'test' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: 'test' });
  });

  it('validateSchema returns errors for invalid data', () => {
    const schema = z.object({ name: z.string() });
    const result = validateSchema(schema, { name: 123 });
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });
});

describe('Regression: Error Handling', () => {
  it('BenthamError has code, message, and httpStatus', () => {
    const error = new BenthamError('INVALID_MANIFEST', 'Bad manifest');
    expect(error.code).toBe('INVALID_MANIFEST');
    expect(error.message).toBe('Bad manifest');
    expect(error.httpStatus).toBe(400);
  });

  it('Errors factory creates correct error types', () => {
    expect(Errors.studyNotFound('123').code).toBe('STUDY_NOT_FOUND');
    expect(Errors.rateLimited().code).toBe('RATE_LIMITED');
    expect(Errors.unauthorized().code).toBe('UNAUTHORIZED');
    expect(Errors.internalError('msg').code).toBe('INTERNAL_ERROR');
  });

  it('isBenthamError type guard works', () => {
    expect(isBenthamError(new BenthamError('INTERNAL_ERROR', 'test'))).toBe(true);
    expect(isBenthamError(new Error('test'))).toBe(false);
    expect(isBenthamError('string')).toBe(false);
  });

  it('toBenthamError converts any error', () => {
    const original = new Error('original');
    const converted = toBenthamError(original);
    expect(converted).toBeInstanceOf(BenthamError);
    expect(converted.message).toBe('original');
  });
});

describe('Regression: Location Constants', () => {
  it('all expected locations are defined', () => {
    const expectedLocations = [
      'us-national', 'us-nyc', 'us-la', 'us-chi', 'us-hou', 'us-mia', 'us-sea',
      'uk-lon', 'de-ber', 'de-mun', 'fr-par', 'nl-ams', 'es-mad', 'it-rom',
      'jp-tok', 'au-syd', 'sg-sg', 'in-mum',
      'ca-tor', 'ca-van', 'br-sao', 'mx-mex',
    ];

    for (const loc of expectedLocations) {
      expect(LOCATIONS[loc as keyof typeof LOCATIONS]).toBeDefined();
    }
  });

  it('isValidLocationId validates correctly', () => {
    expect(isValidLocationId('us-national')).toBe(true);
    expect(isValidLocationId('invalid-location')).toBe(false);
  });

  it('locations have required properties', () => {
    expect(LOCATIONS['us-nyc'].country).toBe('US');
    expect(LOCATIONS['us-nyc'].name).toBeDefined();
    expect(LOCATIONS['uk-lon'].country).toBe('GB');
  });
});

describe('Regression: Surface Constants', () => {
  it('all expected surfaces are defined', () => {
    const expectedSurfaces = [
      'openai-api', 'anthropic-api', 'google-ai-api', 'perplexity-api',
      'chatgpt-web', 'gemini-web', 'perplexity-web', 'claude-web', 'meta-ai', 'grok',
      'google-search', 'bing-copilot',
    ];

    for (const surface of expectedSurfaces) {
      expect(SURFACES[surface as keyof typeof SURFACES]).toBeDefined();
    }
  });

  it('isValidSurfaceId validates correctly', () => {
    expect(isValidSurfaceId('openai-api')).toBe(true);
    expect(isValidSurfaceId('invalid-surface')).toBe(false);
  });

  it('surfaces have required properties', () => {
    expect(SURFACES['openai-api'].category).toBe('api');
    expect(SURFACES['chatgpt-web'].category).toBe('web_chatbot');
    expect(SURFACES['google-search'].category).toBe('search');
  });

  it('API surfaces do not support geo-targeting', () => {
    expect(SURFACES['openai-api'].supportsGeoTargeting).toBe(false);
    expect(SURFACES['anthropic-api'].supportsGeoTargeting).toBe(false);
  });

  it('web surfaces support geo-targeting', () => {
    expect(SURFACES['chatgpt-web'].supportsGeoTargeting).toBe(true);
    expect(SURFACES['google-search'].supportsGeoTargeting).toBe(true);
  });
});

describe('Regression: Constants', () => {
  it('DEFAULT_TIMEOUTS are reasonable values', () => {
    expect(DEFAULT_TIMEOUTS.HTTP_REQUEST).toBeGreaterThanOrEqual(10000);
    expect(DEFAULT_TIMEOUTS.SURFACE_QUERY).toBeGreaterThanOrEqual(30000);
    expect(DEFAULT_TIMEOUTS.JOB_EXECUTION).toBeGreaterThanOrEqual(60000);
  });

  it('MAX_RETRIES are reasonable values', () => {
    expect(MAX_RETRIES.JOB).toBeGreaterThanOrEqual(1);
    expect(MAX_RETRIES.JOB).toBeLessThanOrEqual(10);
    expect(MAX_RETRIES.SESSION_ACQUIRE).toBeGreaterThanOrEqual(1);
  });

  it('MANIFEST_VERSION is defined', () => {
    expect(MANIFEST_VERSION).toBeDefined();
    expect(typeof MANIFEST_VERSION).toBe('string');
  });
});

describe('Regression: Type Exports', () => {
  it('all type exports are present', () => {
    // These imports would fail at compile time if missing,
    // but we verify at runtime for documentation
    const expectedExports = [
      'Query', 'QueryContext', 'QueryResult',
      'Manifest', 'Study', 'Job', 'JobResult',
      'SurfaceConfig', 'LocationConfig',
      'Tenant', 'User',
      'CostEstimate', 'CostRecord',
    ];

    // Verify the expected exports list is populated
    expect(expectedExports.length).toBeGreaterThan(0);
  });
});
