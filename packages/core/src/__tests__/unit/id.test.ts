import { describe, it, expect } from 'vitest';
import {
  generateId,
  generatePrefixedId,
  isValidId,
  extractIdPrefix,
  DEFAULT_ID_LENGTH,
} from '../../utils/id.js';

describe('generateId', () => {
  it('generates unique IDs', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });

  it('generates IDs of default length', () => {
    const id = generateId();
    expect(id.length).toBe(DEFAULT_ID_LENGTH);
  });

  it('generates IDs of custom length', () => {
    const id = generateId(10);
    expect(id.length).toBe(10);
  });

  it('generates IDs with valid characters', () => {
    const id = generateId();
    expect(id).toMatch(/^[a-zA-Z0-9_-]+$/);
  });
});

describe('generatePrefixedId', () => {
  it('generates ID with prefix', () => {
    const id = generatePrefixedId('study');
    expect(id).toMatch(/^study_[a-zA-Z0-9_-]+$/);
  });

  it('generates unique prefixed IDs', () => {
    const id1 = generatePrefixedId('job');
    const id2 = generatePrefixedId('job');
    expect(id1).not.toBe(id2);
  });

  it('uses custom length for random part', () => {
    const id = generatePrefixedId('test', 8);
    expect(id.length).toBe(8 + 5); // 8 random + 'test_'
  });
});

describe('isValidId', () => {
  it('returns true for valid IDs', () => {
    expect(isValidId('abc123')).toBe(true);
    expect(isValidId('ABC_xyz-123')).toBe(true);
    expect(isValidId(generateId())).toBe(true);
  });

  it('returns false for empty strings', () => {
    expect(isValidId('')).toBe(false);
  });

  it('returns false for invalid characters', () => {
    expect(isValidId('abc.123')).toBe(false);
    expect(isValidId('abc 123')).toBe(false);
    expect(isValidId('abc@123')).toBe(false);
  });

  it('respects minLength option', () => {
    expect(isValidId('ab', { minLength: 3 })).toBe(false);
    expect(isValidId('abc', { minLength: 3 })).toBe(true);
  });

  it('respects maxLength option', () => {
    expect(isValidId('abcde', { maxLength: 4 })).toBe(false);
    expect(isValidId('abcd', { maxLength: 4 })).toBe(true);
  });

  it('validates prefix', () => {
    expect(isValidId('study_abc123', { prefix: 'study' })).toBe(true);
    expect(isValidId('job_abc123', { prefix: 'study' })).toBe(false);
    expect(isValidId('abc123', { prefix: 'study' })).toBe(false);
  });
});

describe('extractIdPrefix', () => {
  it('extracts prefix from prefixed IDs', () => {
    expect(extractIdPrefix('study_abc123')).toBe('study');
    expect(extractIdPrefix('job_xyz')).toBe('job');
  });

  it('returns undefined for non-prefixed IDs', () => {
    expect(extractIdPrefix('abc123')).toBeUndefined();
    expect(extractIdPrefix('')).toBeUndefined();
  });

  it('handles IDs with multiple underscores', () => {
    expect(extractIdPrefix('study_abc_def')).toBe('study');
  });
});
