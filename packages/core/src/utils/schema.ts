/**
 * Schema validation utilities using Zod
 */

import { z, ZodError, ZodSchema } from 'zod';

/**
 * Result of schema validation
 */
export interface ValidationResult<T> {
  /** Whether validation passed */
  success: boolean;
  /** Validated data (if success) */
  data?: T;
  /** Validation errors (if failure) */
  errors?: ValidationError[];
}

/**
 * Individual validation error
 */
export interface ValidationError {
  /** Path to the invalid field */
  path: (string | number)[];
  /** Error message */
  message: string;
  /** Error code */
  code: string;
}

/**
 * Validate data against a Zod schema
 * @param schema - The Zod schema to validate against
 * @param data - The data to validate
 * @returns Validation result with data or errors
 */
export function validateSchema<T>(
  schema: ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  try {
    const validData = schema.parse(data);
    return {
      success: true,
      data: validData,
    };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        success: false,
        errors: error.errors.map((e) => ({
          path: e.path,
          message: e.message,
          code: e.code,
        })),
      };
    }
    throw error;
  }
}

/**
 * Validate data against a Zod schema, returning just the data or throwing
 * @param schema - The Zod schema to validate against
 * @param data - The data to validate
 * @returns The validated data
 * @throws ZodError if validation fails
 */
export function parseSchema<T>(schema: ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Safely validate data against a Zod schema
 * @param schema - The Zod schema to validate against
 * @param data - The data to validate
 * @returns The validated data or undefined
 */
export function safeParseSchema<T>(
  schema: ZodSchema<T>,
  data: unknown
): T | undefined {
  const result = schema.safeParse(data);
  return result.success ? result.data : undefined;
}

// Re-export Zod for convenience
export { z };

// Common schema builders

/**
 * Schema for a non-empty string
 */
export const nonEmptyString = z.string().min(1);

/**
 * Schema for a positive integer
 */
export const positiveInt = z.number().int().positive();

/**
 * Schema for a percentage (0-1)
 */
export const percentage = z.number().min(0).max(1);

/**
 * Schema for an ISO date string
 */
export const isoDateString = z.string().datetime();

/**
 * Schema for a valid email
 */
export const email = z.string().email();

/**
 * Schema for a URL
 */
export const url = z.string().url();
