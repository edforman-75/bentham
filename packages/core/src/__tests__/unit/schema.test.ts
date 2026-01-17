import { describe, it, expect } from 'vitest';
import {
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
} from '../../utils/schema.js';

describe('validateSchema', () => {
  const testSchema = z.object({
    name: z.string(),
    age: z.number(),
  });

  it('returns success for valid data', () => {
    const result = validateSchema(testSchema, { name: 'John', age: 30 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: 'John', age: 30 });
    expect(result.errors).toBeUndefined();
  });

  it('returns errors for invalid data', () => {
    const result = validateSchema(testSchema, { name: 'John' });
    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.errors).toBeDefined();
    expect(result.errors?.length).toBeGreaterThan(0);
  });

  it('provides error path information', () => {
    const result = validateSchema(testSchema, { name: 123, age: 'thirty' });
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();

    const namePaths = result.errors?.map((e) => e.path);
    expect(namePaths).toContainEqual(['name']);
    expect(namePaths).toContainEqual(['age']);
  });
});

describe('parseSchema', () => {
  const testSchema = z.object({
    id: z.string(),
  });

  it('returns data for valid input', () => {
    const result = parseSchema(testSchema, { id: 'abc123' });
    expect(result).toEqual({ id: 'abc123' });
  });

  it('throws for invalid input', () => {
    expect(() => parseSchema(testSchema, { id: 123 })).toThrow();
  });
});

describe('safeParseSchema', () => {
  const testSchema = z.object({
    value: z.number(),
  });

  it('returns data for valid input', () => {
    const result = safeParseSchema(testSchema, { value: 42 });
    expect(result).toEqual({ value: 42 });
  });

  it('returns undefined for invalid input', () => {
    const result = safeParseSchema(testSchema, { value: 'not a number' });
    expect(result).toBeUndefined();
  });
});

describe('common schema builders', () => {
  describe('nonEmptyString', () => {
    it('accepts non-empty strings', () => {
      expect(() => nonEmptyString.parse('hello')).not.toThrow();
    });

    it('rejects empty strings', () => {
      expect(() => nonEmptyString.parse('')).toThrow();
    });
  });

  describe('positiveInt', () => {
    it('accepts positive integers', () => {
      expect(() => positiveInt.parse(1)).not.toThrow();
      expect(() => positiveInt.parse(100)).not.toThrow();
    });

    it('rejects zero', () => {
      expect(() => positiveInt.parse(0)).toThrow();
    });

    it('rejects negative numbers', () => {
      expect(() => positiveInt.parse(-1)).toThrow();
    });

    it('rejects non-integers', () => {
      expect(() => positiveInt.parse(1.5)).toThrow();
    });
  });

  describe('percentage', () => {
    it('accepts values between 0 and 1', () => {
      expect(() => percentage.parse(0)).not.toThrow();
      expect(() => percentage.parse(0.5)).not.toThrow();
      expect(() => percentage.parse(1)).not.toThrow();
    });

    it('rejects values below 0', () => {
      expect(() => percentage.parse(-0.1)).toThrow();
    });

    it('rejects values above 1', () => {
      expect(() => percentage.parse(1.1)).toThrow();
    });
  });

  describe('isoDateString', () => {
    it('accepts valid ISO date strings', () => {
      expect(() => isoDateString.parse('2025-01-16T12:00:00Z')).not.toThrow();
      expect(() => isoDateString.parse('2025-01-16T12:00:00.000Z')).not.toThrow();
    });

    it('rejects invalid date strings', () => {
      expect(() => isoDateString.parse('2025-01-16')).toThrow();
      expect(() => isoDateString.parse('not a date')).toThrow();
    });
  });

  describe('email', () => {
    it('accepts valid emails', () => {
      expect(() => email.parse('user@example.com')).not.toThrow();
      expect(() => email.parse('user+tag@example.co.uk')).not.toThrow();
    });

    it('rejects invalid emails', () => {
      expect(() => email.parse('not-an-email')).toThrow();
      expect(() => email.parse('@example.com')).toThrow();
    });
  });

  describe('url', () => {
    it('accepts valid URLs', () => {
      expect(() => url.parse('https://example.com')).not.toThrow();
      expect(() => url.parse('http://localhost:3000/path')).not.toThrow();
    });

    it('rejects invalid URLs', () => {
      expect(() => url.parse('not-a-url')).toThrow();
      expect(() => url.parse('example.com')).toThrow();
    });
  });
});
