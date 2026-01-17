/**
 * API Validation Response Tests
 *
 * Tests the API-friendly validation responses for manifest submission.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { validateManifestForApi, formatValidationErrors, ManifestSchema } from '../../schemas/manifest.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '../fixtures/manifests');

function loadFixture(filename: string): unknown {
  const content = readFileSync(join(fixturesDir, filename), 'utf-8');
  return JSON.parse(content);
}

describe('validateManifestForApi - Success Responses', () => {
  it('returns structured success response for valid manifest', () => {
    const manifest = loadFixture('valid-minimal.json');
    const response = validateManifestForApi(manifest, 'req-123');

    expect(response.success).toBe(true);
    expect(response.data).toBeDefined();
    expect(response.data?.valid).toBe(true);
    expect(response.data?.studyInfo).toBeDefined();
    expect(response.data?.studyInfo?.totalCells).toBe(1); // 1 query × 1 surface × 1 location
    expect(response.meta?.requestId).toBe('req-123');
    expect(response.meta?.timestamp).toBeDefined();
  });

  it('includes cost estimate for valid manifest', () => {
    const manifest = loadFixture('valid-full.json');
    const response = validateManifestForApi(manifest);

    expect(response.success).toBe(true);
    expect(response.data?.studyInfo?.estimatedCost).toBeDefined();
    expect(response.data?.studyInfo?.estimatedCost?.currency).toBe('USD');
    expect(response.data?.studyInfo?.estimatedCost?.min).toBeGreaterThan(0);
    expect(response.data?.studyInfo?.estimatedCost?.max).toBeGreaterThan(
      response.data?.studyInfo?.estimatedCost?.min ?? 0
    );
  });

  it('calculates correct cell count', () => {
    const manifest = loadFixture('valid-full.json');
    const response = validateManifestForApi(manifest);

    // 3 queries × 4 surfaces × 5 locations = 60 cells
    expect(response.data?.studyInfo?.totalCells).toBe(60);
  });
});

describe('validateManifestForApi - Error Responses', () => {
  it('returns structured error response for invalid manifest', () => {
    const manifest = loadFixture('invalid-missing-name.json');
    const response = validateManifestForApi(manifest, 'req-456');

    expect(response.success).toBe(false);
    expect(response.error).toBeDefined();
    expect(response.error?.code).toBe('MANIFEST_VALIDATION_FAILED');
    expect(response.error?.details).toBeDefined();
    expect(response.error?.details?.length).toBeGreaterThan(0);
    expect(response.error?.requestId).toBe('req-456');
  });

  it('provides user-friendly field paths', () => {
    const manifest = loadFixture('invalid-bad-surface-id.json');
    const response = validateManifestForApi(manifest);

    expect(response.success).toBe(false);
    const surfaceError = response.error?.details?.find(d => d.field.includes('surfaces'));
    expect(surfaceError).toBeDefined();
    expect(surfaceError?.field).toMatch(/surfaces\[\d+\]\.id/);
  });

  it('includes constraint type in error details', () => {
    const manifest = loadFixture('invalid-empty-queries.json');
    const response = validateManifestForApi(manifest);

    expect(response.success).toBe(false);
    const queriesError = response.error?.details?.find(d => d.field === 'queries');
    expect(queriesError?.constraint).toBe('minimum');
  });

  it('handles multiple validation errors', () => {
    // Create a manifest with multiple errors
    const manifest = {
      // Missing name
      queries: [], // Empty array
      surfaces: [{ id: 'invalid-surface' }],
      locations: [{ id: 'invalid-location' }],
      completionCriteria: {
        requiredSurfaces: { surfaceIds: [] } // Empty required surfaces
      },
      deadline: '2020-01-01T00:00:00Z' // Past date
    };

    const response = validateManifestForApi(manifest);

    expect(response.success).toBe(false);
    expect(response.error?.details?.length).toBeGreaterThan(1);
    expect(response.error?.message).toContain('errors');
  });
});

describe('validateManifestForApi - Warnings', () => {
  it('generates warning for 100% coverage threshold', () => {
    const manifest = loadFixture('valid-minimal.json') as Record<string, unknown>;
    manifest.completionCriteria = {
      requiredSurfaces: {
        surfaceIds: ['chatgpt-web'],
        coverageThreshold: 1.0
      }
    };

    const response = validateManifestForApi(manifest);

    expect(response.success).toBe(true);
    expect(response.data?.warnings).toBeDefined();
    expect(response.data?.warnings?.some(w =>
      w.field.includes('coverageThreshold')
    )).toBe(true);
  });

  it('generates warning for minimum retries', () => {
    const manifest = loadFixture('valid-minimal.json') as Record<string, unknown>;
    manifest.completionCriteria = {
      requiredSurfaces: {
        surfaceIds: ['chatgpt-web']
      },
      maxRetriesPerCell: 1
    };

    const response = validateManifestForApi(manifest);

    expect(response.success).toBe(true);
    expect(response.data?.warnings?.some(w =>
      w.field.includes('maxRetriesPerCell')
    )).toBe(true);
  });
});

describe('formatValidationErrors', () => {
  it('formats nested array paths correctly', () => {
    const result = ManifestSchema.safeParse({
      name: 'Test',
      queries: [{ text: '' }], // Invalid: empty text
      surfaces: [{ id: 'chatgpt-web' }],
      locations: [{ id: 'us-national' }],
      completionCriteria: { requiredSurfaces: { surfaceIds: ['chatgpt-web'] } },
      deadline: '2030-12-31T23:59:59Z'
    });

    if (!result.success) {
      const errors = formatValidationErrors(result.error);
      const queryError = errors.find(e => e.field.includes('queries'));
      expect(queryError?.field).toBe('queries[0].text');
    }
  });

  it('formats root-level errors', () => {
    const result = ManifestSchema.safeParse({});

    if (!result.success) {
      const errors = formatValidationErrors(result.error);
      expect(errors.length).toBeGreaterThan(0);
    }
  });
});

describe('API Response Structure', () => {
  it('matches expected JSON structure for error response', () => {
    const manifest = loadFixture('invalid-missing-name.json');
    const response = validateManifestForApi(manifest, 'req-test-123');

    // This is the structure that will be sent to the tenant
    const expectedStructure = {
      success: false,
      error: {
        code: expect.any(String),
        message: expect.any(String),
        details: expect.arrayContaining([
          expect.objectContaining({
            field: expect.any(String),
            message: expect.any(String),
          })
        ]),
        requestId: 'req-test-123',
      },
      meta: {
        timestamp: expect.any(String),
        requestId: 'req-test-123',
      }
    };

    expect(response).toMatchObject(expectedStructure);
  });

  it('matches expected JSON structure for success response', () => {
    const manifest = loadFixture('valid-minimal.json');
    const response = validateManifestForApi(manifest, 'req-test-456');

    const expectedStructure = {
      success: true,
      data: {
        valid: true,
        studyInfo: {
          totalCells: expect.any(Number),
          estimatedCost: {
            min: expect.any(Number),
            max: expect.any(Number),
            currency: 'USD',
          }
        }
      },
      meta: {
        timestamp: expect.any(String),
        requestId: 'req-test-456',
      }
    };

    expect(response).toMatchObject(expectedStructure);
  });
});
