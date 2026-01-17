/**
 * ID generation utilities
 */

import { nanoid } from 'nanoid';

/**
 * Default ID length (21 characters)
 */
export const DEFAULT_ID_LENGTH = 21;

/**
 * Generate a unique ID using nanoid
 * @param length - Length of the ID (default: 21)
 * @returns A unique identifier string
 */
export function generateId(length: number = DEFAULT_ID_LENGTH): string {
  return nanoid(length);
}

/**
 * Generate a prefixed ID for categorization
 * @param prefix - Prefix to add (e.g., 'study', 'job', 'tenant')
 * @param length - Length of the random part (default: 16)
 * @returns A prefixed identifier string
 */
export function generatePrefixedId(prefix: string, length: number = 16): string {
  return `${prefix}_${nanoid(length)}`;
}

/**
 * Validate that a string is a valid ID format
 * @param id - The ID to validate
 * @param options - Validation options
 * @returns Whether the ID is valid
 */
export function isValidId(
  id: string,
  options: {
    minLength?: number;
    maxLength?: number;
    prefix?: string;
  } = {}
): boolean {
  const { minLength = 1, maxLength = 100, prefix } = options;

  if (typeof id !== 'string') {
    return false;
  }

  if (id.length < minLength || id.length > maxLength) {
    return false;
  }

  if (prefix && !id.startsWith(`${prefix}_`)) {
    return false;
  }

  // Check for valid characters (alphanumeric, underscore, hyphen)
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

/**
 * Extract the prefix from a prefixed ID
 * @param id - The prefixed ID
 * @returns The prefix, or undefined if no prefix found
 */
export function extractIdPrefix(id: string): string | undefined {
  const underscoreIndex = id.indexOf('_');
  if (underscoreIndex > 0) {
    return id.slice(0, underscoreIndex);
  }
  return undefined;
}
