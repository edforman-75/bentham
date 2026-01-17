/**
 * Edge Cases Regression Tests
 *
 * These tests verify behavior in edge cases and boundary conditions.
 * DO NOT modify or delete these tests without explicit justification.
 */

import { describe, it, expect } from 'vitest';
import type { ErrorCode } from '../../index.js';
import {
  generateId,
  hashContent,
  validateSchema,
  z,
  BenthamError,
  isRetryableError,
  formatError,
} from '../../index.js';

describe('Regression: Edge Cases - ID Generation', () => {
  it('handles custom lengths correctly', () => {
    const shortId = generateId(5);
    const longId = generateId(50);
    expect(shortId.length).toBe(5);
    expect(longId.length).toBe(50);
  });

  it('IDs contain only safe characters', () => {
    // Generate many IDs and check for URL-unsafe characters
    for (let i = 0; i < 100; i++) {
      const id = generateId();
      expect(id).toMatch(/^[a-zA-Z0-9_-]+$/);
      expect(id).not.toContain('/');
      expect(id).not.toContain('\\');
      expect(id).not.toContain(' ');
    }
  });
});

describe('Regression: Edge Cases - Hashing', () => {
  it('handles empty string', () => {
    const hash = hashContent('');
    expect(hash.length).toBe(64);
  });

  it('handles very long content', () => {
    const longContent = 'x'.repeat(1_000_000);
    const hash = hashContent(longContent);
    expect(hash.length).toBe(64);
  });

  it('handles unicode content', () => {
    const unicode = '日本語テスト 🎉 émojis и кириллица';
    const hash = hashContent(unicode);
    expect(hash.length).toBe(64);
  });

  it('handles binary content', () => {
    const buffer = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);
    const hash = hashContent(buffer);
    expect(hash.length).toBe(64);
  });

  it('is case sensitive', () => {
    const hash1 = hashContent('Test');
    const hash2 = hashContent('test');
    expect(hash1).not.toBe(hash2);
  });

  it('is whitespace sensitive', () => {
    const hash1 = hashContent('test');
    const hash2 = hashContent('test ');
    const hash3 = hashContent(' test');
    expect(hash1).not.toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash2).not.toBe(hash3);
  });
});

describe('Regression: Edge Cases - Schema Validation', () => {
  it('handles deeply nested objects', () => {
    const schema = z.object({
      level1: z.object({
        level2: z.object({
          level3: z.object({
            value: z.string(),
          }),
        }),
      }),
    });

    const result = validateSchema(schema, {
      level1: { level2: { level3: { value: 'deep' } } },
    });
    expect(result.success).toBe(true);
  });

  it('handles arrays correctly', () => {
    const schema = z.object({
      items: z.array(z.string()),
    });

    expect(validateSchema(schema, { items: [] }).success).toBe(true);
    expect(validateSchema(schema, { items: ['a', 'b'] }).success).toBe(true);
    expect(validateSchema(schema, { items: [1, 2] }).success).toBe(false);
  });

  it('handles optional fields', () => {
    const schema = z.object({
      required: z.string(),
      optional: z.string().optional(),
    });

    expect(validateSchema(schema, { required: 'yes' }).success).toBe(true);
    expect(validateSchema(schema, { required: 'yes', optional: 'also' }).success).toBe(true);
    expect(validateSchema(schema, {}).success).toBe(false);
  });

  it('provides path information for nested errors', () => {
    const schema = z.object({
      user: z.object({
        profile: z.object({
          age: z.number(),
        }),
      }),
    });

    const result = validateSchema(schema, {
      user: { profile: { age: 'not a number' } },
    });

    expect(result.success).toBe(false);
    expect(result.errors![0].path).toEqual(['user', 'profile', 'age']);
  });
});

describe('Regression: Edge Cases - Error Handling', () => {
  it('BenthamError preserves cause chain', () => {
    const originalError = new Error('Original');
    const wrappedError = new BenthamError('INTERNAL_ERROR', 'Wrapped', {
      cause: originalError,
    });

    expect(wrappedError.cause).toBe(originalError);
    expect(wrappedError.cause?.message).toBe('Original');
  });

  it('BenthamError serializes without circular references', () => {
    const error = new BenthamError('INTERNAL_ERROR', 'Test', {
      details: { nested: { data: [1, 2, 3] } },
    });

    const json = JSON.stringify(error.toJSON());
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('isRetryableError handles all retryable codes', () => {
    const retryableCodes = [
      'RATE_LIMITED',
      'TIMEOUT',
      'SESSION_INVALID',
      'PROXY_ERROR',
      'CAPTCHA_REQUIRED',
      'TEMPORARY_FAILURE',
      'SURFACE_UNAVAILABLE',
    ];

    for (const code of retryableCodes) {
      const error = new BenthamError(code as ErrorCode, 'test');
      expect(isRetryableError(error)).toBe(true);
    }
  });

  it('formatError handles all error types', () => {
    expect(formatError(new BenthamError('INTERNAL_ERROR', 'test'))).toContain('INTERNAL_ERROR');
    expect(formatError(new Error('regular'))).toContain('regular');
    expect(formatError('string error')).toBe('string error');
    expect(formatError(123)).toBe('123');
    expect(formatError(null)).toBe('null');
    expect(formatError(undefined)).toBe('undefined');
  });
});

describe('Regression: Edge Cases - Boundary Values', () => {
  it('handles maximum safe integer', () => {
    const schema = z.number();
    const result = validateSchema(schema, Number.MAX_SAFE_INTEGER);
    expect(result.success).toBe(true);
  });

  it('handles minimum safe integer', () => {
    const schema = z.number();
    const result = validateSchema(schema, Number.MIN_SAFE_INTEGER);
    expect(result.success).toBe(true);
  });

  it('handles empty objects', () => {
    const schema = z.object({});
    expect(validateSchema(schema, {}).success).toBe(true);
  });

  it('handles empty arrays', () => {
    const schema = z.array(z.any());
    expect(validateSchema(schema, []).success).toBe(true);
  });
});
