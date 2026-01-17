/**
 * Hashing utilities for content verification
 */

import { createHash } from 'node:crypto';

/**
 * Hash algorithm to use
 */
export const HASH_ALGORITHM = 'sha256';

/**
 * Generate a SHA-256 hash of content
 * @param content - The content to hash (string or Buffer)
 * @returns The hexadecimal hash string
 */
export function hashContent(content: string | Buffer): string {
  const hash = createHash(HASH_ALGORITHM);
  hash.update(content);
  return hash.digest('hex');
}

/**
 * Generate a SHA-256 hash of a file-like object with metadata
 * @param content - The content to hash
 * @param metadata - Metadata to include in the hash
 * @returns The hexadecimal hash string
 */
export function hashWithMetadata(
  content: string | Buffer,
  metadata: {
    filename?: string;
    capturedAt: Date;
    surfaceId?: string;
    locationId?: string;
  }
): string {
  const hash = createHash(HASH_ALGORITHM);

  // Include metadata in hash for tamper evidence
  const metadataString = JSON.stringify({
    filename: metadata.filename,
    capturedAt: metadata.capturedAt.toISOString(),
    surfaceId: metadata.surfaceId,
    locationId: metadata.locationId,
  });

  hash.update(metadataString);
  hash.update(content);

  return hash.digest('hex');
}

/**
 * Verify that content matches an expected hash
 * @param content - The content to verify
 * @param expectedHash - The expected hash value
 * @returns Whether the content matches the hash
 */
export function verifyHash(content: string | Buffer, expectedHash: string): boolean {
  const actualHash = hashContent(content);
  return actualHash === expectedHash;
}

/**
 * Generate a hash-based checksum for quick comparison
 * @param items - Items to include in the checksum
 * @returns A short checksum string
 */
export function generateChecksum(items: (string | number | boolean | null | undefined)[]): string {
  const hash = createHash(HASH_ALGORITHM);
  for (const item of items) {
    hash.update(String(item ?? ''));
  }
  // Return first 8 characters for brevity
  return hash.digest('hex').slice(0, 8);
}
