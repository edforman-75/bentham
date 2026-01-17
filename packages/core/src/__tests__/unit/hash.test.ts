import { describe, it, expect } from 'vitest';
import {
  hashContent,
  hashWithMetadata,
  verifyHash,
  generateChecksum,
  HASH_ALGORITHM,
} from '../../utils/hash.js';

describe('hashContent', () => {
  it('produces consistent hash for same input', () => {
    const hash1 = hashContent('test content');
    const hash2 = hashContent('test content');
    expect(hash1).toBe(hash2);
  });

  it('produces different hash for different input', () => {
    const hash1 = hashContent('content A');
    const hash2 = hashContent('content B');
    expect(hash1).not.toBe(hash2);
  });

  it('produces 64-character hex string (SHA-256)', () => {
    const hash = hashContent('test');
    expect(hash.length).toBe(64);
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it('handles Buffer input', () => {
    const buffer = Buffer.from('test content');
    const stringHash = hashContent('test content');
    const bufferHash = hashContent(buffer);
    expect(bufferHash).toBe(stringHash);
  });

  it('handles empty input', () => {
    const hash = hashContent('');
    expect(hash.length).toBe(64);
  });

  it('handles unicode content', () => {
    const hash = hashContent('こんにちは世界 🌍');
    expect(hash.length).toBe(64);
  });
});

describe('hashWithMetadata', () => {
  it('produces consistent hash for same content and metadata', () => {
    const date = new Date('2025-01-16T12:00:00Z');
    const hash1 = hashWithMetadata('content', { capturedAt: date, surfaceId: 'chatgpt' });
    const hash2 = hashWithMetadata('content', { capturedAt: date, surfaceId: 'chatgpt' });
    expect(hash1).toBe(hash2);
  });

  it('produces different hash when metadata differs', () => {
    const date = new Date('2025-01-16T12:00:00Z');
    const hash1 = hashWithMetadata('content', { capturedAt: date, surfaceId: 'chatgpt' });
    const hash2 = hashWithMetadata('content', { capturedAt: date, surfaceId: 'gemini' });
    expect(hash1).not.toBe(hash2);
  });

  it('produces different hash when content differs', () => {
    const date = new Date('2025-01-16T12:00:00Z');
    const hash1 = hashWithMetadata('content A', { capturedAt: date });
    const hash2 = hashWithMetadata('content B', { capturedAt: date });
    expect(hash1).not.toBe(hash2);
  });

  it('includes all metadata fields', () => {
    const date1 = new Date('2025-01-16T12:00:00Z');
    const date2 = new Date('2025-01-16T13:00:00Z');
    const hash1 = hashWithMetadata('content', { capturedAt: date1 });
    const hash2 = hashWithMetadata('content', { capturedAt: date2 });
    expect(hash1).not.toBe(hash2);
  });
});

describe('verifyHash', () => {
  it('returns true when content matches hash', () => {
    const content = 'test content';
    const hash = hashContent(content);
    expect(verifyHash(content, hash)).toBe(true);
  });

  it('returns false when content does not match hash', () => {
    const hash = hashContent('original content');
    expect(verifyHash('modified content', hash)).toBe(false);
  });

  it('works with Buffer content', () => {
    const content = 'test content';
    const hash = hashContent(content);
    expect(verifyHash(Buffer.from(content), hash)).toBe(true);
  });
});

describe('generateChecksum', () => {
  it('produces consistent checksum for same items', () => {
    const checksum1 = generateChecksum(['a', 1, true]);
    const checksum2 = generateChecksum(['a', 1, true]);
    expect(checksum1).toBe(checksum2);
  });

  it('produces different checksum for different items', () => {
    const checksum1 = generateChecksum(['a', 1]);
    const checksum2 = generateChecksum(['b', 2]);
    expect(checksum1).not.toBe(checksum2);
  });

  it('produces 8-character checksum', () => {
    const checksum = generateChecksum(['test', 123]);
    expect(checksum.length).toBe(8);
  });

  it('handles null and undefined values', () => {
    const checksum = generateChecksum([null, undefined, 'test']);
    expect(checksum.length).toBe(8);
  });
});

describe('HASH_ALGORITHM', () => {
  it('is sha256', () => {
    expect(HASH_ALGORITHM).toBe('sha256');
  });
});
