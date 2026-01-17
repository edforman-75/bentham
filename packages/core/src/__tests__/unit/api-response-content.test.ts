/**
 * API Response Content Tests
 *
 * These tests verify the EXACT content of API responses sent to tenants.
 * They ensure error messages are clear, actionable, and consistent.
 */

import { describe, it, expect } from 'vitest';
import { validateManifestForApi } from '../../schemas/manifest.js';

describe('API Response - Success Signaling', () => {
  it('signals success with success=true and valid=true for valid manifest', () => {
    const validManifest = {
      name: 'Test Study',
      queries: [{ text: 'What is AI?' }],
      surfaces: [{ id: 'chatgpt-web' }],
      locations: [{ id: 'us-national' }],
      completionCriteria: {
        requiredSurfaces: { surfaceIds: ['chatgpt-web'] }
      },
      deadline: '2030-12-31T23:59:59Z'
    };

    const response = validateManifestForApi(validManifest);

    // Top-level success indicator
    expect(response.success).toBe(true);

    // Data-level validity indicator
    expect(response.data?.valid).toBe(true);

    // No error object on success
    expect(response.error).toBeUndefined();

    // Study info is provided
    expect(response.data?.studyInfo).toBeDefined();
    expect(response.data?.studyInfo?.totalCells).toBeGreaterThan(0);
  });

  it('signals failure with success=false for invalid manifest', () => {
    const invalidManifest = {
      // Missing required fields
    };

    const response = validateManifestForApi(invalidManifest);

    // Top-level failure indicator
    expect(response.success).toBe(false);

    // Error object is present
    expect(response.error).toBeDefined();
    expect(response.error?.code).toBe('MANIFEST_VALIDATION_FAILED');

    // No data object on failure
    expect(response.data).toBeUndefined();
  });
});

describe('API Response - Error Message Content', () => {
  describe('Missing Required Fields', () => {
    it('provides clear message for missing name', () => {
      const manifest = {
        queries: [{ text: 'Test' }],
        surfaces: [{ id: 'chatgpt-web' }],
        locations: [{ id: 'us-national' }],
        completionCriteria: { requiredSurfaces: { surfaceIds: ['chatgpt-web'] } },
        deadline: '2030-12-31T23:59:59Z'
      };

      const response = validateManifestForApi(manifest);

      expect(response.success).toBe(false);
      const nameError = response.error?.details?.find(d => d.field === 'name');
      expect(nameError).toBeDefined();
      expect(nameError?.message).toContain('Required');
    });

    it('provides clear message for missing queries', () => {
      const manifest = {
        name: 'Test',
        surfaces: [{ id: 'chatgpt-web' }],
        locations: [{ id: 'us-national' }],
        completionCriteria: { requiredSurfaces: { surfaceIds: ['chatgpt-web'] } },
        deadline: '2030-12-31T23:59:59Z'
      };

      const response = validateManifestForApi(manifest);

      expect(response.success).toBe(false);
      const queriesError = response.error?.details?.find(d => d.field === 'queries');
      expect(queriesError).toBeDefined();
    });

    it('provides clear message for missing deadline', () => {
      const manifest = {
        name: 'Test',
        queries: [{ text: 'Test' }],
        surfaces: [{ id: 'chatgpt-web' }],
        locations: [{ id: 'us-national' }],
        completionCriteria: { requiredSurfaces: { surfaceIds: ['chatgpt-web'] } }
      };

      const response = validateManifestForApi(manifest);

      expect(response.success).toBe(false);
      const deadlineError = response.error?.details?.find(d => d.field === 'deadline');
      expect(deadlineError).toBeDefined();
    });
  });

  describe('Invalid Field Values', () => {
    it('provides clear message for invalid surface ID', () => {
      const manifest = {
        name: 'Test',
        queries: [{ text: 'Test' }],
        surfaces: [{ id: 'nonexistent-ai' }],
        locations: [{ id: 'us-national' }],
        completionCriteria: { requiredSurfaces: { surfaceIds: ['nonexistent-ai'] } },
        deadline: '2030-12-31T23:59:59Z'
      };

      const response = validateManifestForApi(manifest);

      expect(response.success).toBe(false);
      const surfaceError = response.error?.details?.find(d => d.field.includes('surfaces'));
      expect(surfaceError).toBeDefined();
      expect(surfaceError?.message).toContain('Invalid surface ID');
      expect(surfaceError?.field).toBe('surfaces[0].id');
    });

    it('provides clear message for invalid location ID', () => {
      const manifest = {
        name: 'Test',
        queries: [{ text: 'Test' }],
        surfaces: [{ id: 'chatgpt-web' }],
        locations: [{ id: 'moon-base-alpha' }],
        completionCriteria: { requiredSurfaces: { surfaceIds: ['chatgpt-web'] } },
        deadline: '2030-12-31T23:59:59Z'
      };

      const response = validateManifestForApi(manifest);

      expect(response.success).toBe(false);
      const locationError = response.error?.details?.find(d => d.field.includes('locations'));
      expect(locationError).toBeDefined();
      expect(locationError?.message).toContain('Invalid location ID');
      expect(locationError?.field).toBe('locations[0].id');
    });

    it('provides clear message for past deadline', () => {
      const manifest = {
        name: 'Test',
        queries: [{ text: 'Test' }],
        surfaces: [{ id: 'chatgpt-web' }],
        locations: [{ id: 'us-national' }],
        completionCriteria: { requiredSurfaces: { surfaceIds: ['chatgpt-web'] } },
        deadline: '2020-01-01T00:00:00Z'
      };

      const response = validateManifestForApi(manifest);

      expect(response.success).toBe(false);
      const deadlineError = response.error?.details?.find(d => d.field === 'deadline');
      expect(deadlineError).toBeDefined();
      expect(deadlineError?.message).toContain('future');
    });

    it('provides clear message for invalid evidence level', () => {
      const manifest = {
        name: 'Test',
        queries: [{ text: 'Test' }],
        surfaces: [{ id: 'chatgpt-web' }],
        locations: [{ id: 'us-national' }],
        completionCriteria: { requiredSurfaces: { surfaceIds: ['chatgpt-web'] } },
        deadline: '2030-12-31T23:59:59Z',
        evidenceLevel: 'invalid-level'
      };

      const response = validateManifestForApi(manifest);

      expect(response.success).toBe(false);
      const evidenceError = response.error?.details?.find(d => d.field === 'evidenceLevel');
      expect(evidenceError).toBeDefined();
    });
  });

  describe('Constraint Violations', () => {
    it('provides clear message for empty query text', () => {
      const manifest = {
        name: 'Test',
        queries: [{ text: '' }],
        surfaces: [{ id: 'chatgpt-web' }],
        locations: [{ id: 'us-national' }],
        completionCriteria: { requiredSurfaces: { surfaceIds: ['chatgpt-web'] } },
        deadline: '2030-12-31T23:59:59Z'
      };

      const response = validateManifestForApi(manifest);

      expect(response.success).toBe(false);
      const queryError = response.error?.details?.find(d => d.field === 'queries[0].text');
      expect(queryError).toBeDefined();
      expect(queryError?.message).toContain('required');
      expect(queryError?.constraint).toBe('minLength');
    });

    it('provides clear message for empty queries array', () => {
      const manifest = {
        name: 'Test',
        queries: [],
        surfaces: [{ id: 'chatgpt-web' }],
        locations: [{ id: 'us-national' }],
        completionCriteria: { requiredSurfaces: { surfaceIds: ['chatgpt-web'] } },
        deadline: '2030-12-31T23:59:59Z'
      };

      const response = validateManifestForApi(manifest);

      expect(response.success).toBe(false);
      const queriesError = response.error?.details?.find(d => d.field === 'queries');
      expect(queriesError).toBeDefined();
      expect(queriesError?.message).toContain('At least one query');
      expect(queriesError?.constraint).toBe('minimum');
    });

    it('provides clear message for coverage threshold over 1', () => {
      const manifest = {
        name: 'Test',
        queries: [{ text: 'Test' }],
        surfaces: [{ id: 'chatgpt-web' }],
        locations: [{ id: 'us-national' }],
        completionCriteria: {
          requiredSurfaces: {
            surfaceIds: ['chatgpt-web'],
            coverageThreshold: 1.5
          }
        },
        deadline: '2030-12-31T23:59:59Z'
      };

      const response = validateManifestForApi(manifest);

      expect(response.success).toBe(false);
      const coverageError = response.error?.details?.find(d =>
        d.field.includes('coverageThreshold')
      );
      expect(coverageError).toBeDefined();
      expect(coverageError?.constraint).toBe('maximum');
    });

    it('provides clear message for retries exceeding maximum', () => {
      const manifest = {
        name: 'Test',
        queries: [{ text: 'Test' }],
        surfaces: [{ id: 'chatgpt-web' }],
        locations: [{ id: 'us-national' }],
        completionCriteria: {
          requiredSurfaces: { surfaceIds: ['chatgpt-web'] },
          maxRetriesPerCell: 100
        },
        deadline: '2030-12-31T23:59:59Z'
      };

      const response = validateManifestForApi(manifest);

      expect(response.success).toBe(false);
      const retriesError = response.error?.details?.find(d =>
        d.field.includes('maxRetriesPerCell')
      );
      expect(retriesError).toBeDefined();
      expect(retriesError?.constraint).toBe('maximum');
    });
  });

  describe('Cross-Field Validation', () => {
    it('provides clear message for required surface not in surfaces list', () => {
      const manifest = {
        name: 'Test',
        queries: [{ text: 'Test' }],
        surfaces: [{ id: 'chatgpt-web' }],
        locations: [{ id: 'us-national' }],
        completionCriteria: {
          requiredSurfaces: { surfaceIds: ['chatgpt-web', 'claude-web'] }
        },
        deadline: '2030-12-31T23:59:59Z'
      };

      const response = validateManifestForApi(manifest);

      expect(response.success).toBe(false);
      const mismatchError = response.error?.details?.find(d =>
        d.message.includes('Required surface IDs must be included')
      );
      expect(mismatchError).toBeDefined();
    });

    it('provides clear message for legal hold without retention', () => {
      const manifest = {
        name: 'Test',
        queries: [{ text: 'Test' }],
        surfaces: [{ id: 'chatgpt-web' }],
        locations: [{ id: 'us-national' }],
        completionCriteria: { requiredSurfaces: { surfaceIds: ['chatgpt-web'] } },
        deadline: '2030-12-31T23:59:59Z',
        legalHold: true
      };

      const response = validateManifestForApi(manifest);

      expect(response.success).toBe(false);
      const legalHoldError = response.error?.details?.find(d =>
        d.message.includes('Legal hold')
      );
      expect(legalHoldError).toBeDefined();
    });
  });
});

describe('API Response - Error Count and Summary', () => {
  it('includes accurate error count in message', () => {
    const manifest = {
      // Missing multiple fields
      queries: [],
      surfaces: [],
      locations: []
    };

    const response = validateManifestForApi(manifest);

    expect(response.success).toBe(false);
    expect(response.error?.details).toBeDefined();

    const errorCount = response.error?.details?.length ?? 0;
    expect(response.error?.message).toContain(`${errorCount} error`);
  });

  it('uses singular "error" for single validation failure', () => {
    const manifest = {
      name: 'Test',
      queries: [{ text: 'Test' }],
      surfaces: [{ id: 'invalid-surface' }],
      locations: [{ id: 'us-national' }],
      completionCriteria: { requiredSurfaces: { surfaceIds: ['invalid-surface'] } },
      deadline: '2030-12-31T23:59:59Z'
    };

    const response = validateManifestForApi(manifest);

    expect(response.success).toBe(false);
    // Should say "1 error" not "1 errors"
    if (response.error?.details?.length === 1) {
      expect(response.error?.message).toMatch(/1 error($|[^s])/);
    }
  });
});

describe('API Response - Field Path Format', () => {
  it('formats simple field paths correctly', () => {
    const manifest = {
      queries: [{ text: 'Test' }],
      surfaces: [{ id: 'chatgpt-web' }],
      locations: [{ id: 'us-national' }],
      completionCriteria: { requiredSurfaces: { surfaceIds: ['chatgpt-web'] } },
      deadline: '2030-12-31T23:59:59Z'
    };

    const response = validateManifestForApi(manifest);

    expect(response.success).toBe(false);
    const nameError = response.error?.details?.find(d => d.field === 'name');
    expect(nameError?.field).toBe('name');
  });

  it('formats array index paths correctly', () => {
    const manifest = {
      name: 'Test',
      queries: [{ text: 'Valid' }, { text: '' }],
      surfaces: [{ id: 'chatgpt-web' }],
      locations: [{ id: 'us-national' }],
      completionCriteria: { requiredSurfaces: { surfaceIds: ['chatgpt-web'] } },
      deadline: '2030-12-31T23:59:59Z'
    };

    const response = validateManifestForApi(manifest);

    expect(response.success).toBe(false);
    const queryError = response.error?.details?.find(d => d.field.includes('queries[1]'));
    expect(queryError?.field).toBe('queries[1].text');
  });

  it('formats nested object paths correctly', () => {
    const manifest = {
      name: 'Test',
      queries: [{ text: 'Test' }],
      surfaces: [{ id: 'chatgpt-web' }],
      locations: [{ id: 'us-national' }],
      completionCriteria: {
        requiredSurfaces: {
          surfaceIds: ['chatgpt-web'],
          coverageThreshold: 5
        }
      },
      deadline: '2030-12-31T23:59:59Z'
    };

    const response = validateManifestForApi(manifest);

    expect(response.success).toBe(false);
    const coverageError = response.error?.details?.find(d =>
      d.field.includes('coverageThreshold')
    );
    expect(coverageError?.field).toBe(
      'completionCriteria.requiredSurfaces.coverageThreshold'
    );
  });
});

describe('API Response - Success Response Content', () => {
  it('includes total cell count', () => {
    const manifest = {
      name: 'Test',
      queries: [{ text: 'Q1' }, { text: 'Q2' }],
      surfaces: [{ id: 'chatgpt-web' }, { id: 'claude-web' }],
      locations: [{ id: 'us-national' }, { id: 'us-nyc' }, { id: 'uk-lon' }],
      completionCriteria: { requiredSurfaces: { surfaceIds: ['chatgpt-web'] } },
      deadline: '2030-12-31T23:59:59Z'
    };

    const response = validateManifestForApi(manifest);

    expect(response.success).toBe(true);
    // 2 queries × 2 surfaces × 3 locations = 12 cells
    expect(response.data?.studyInfo?.totalCells).toBe(12);
  });

  it('includes cost estimate with min, max, and currency', () => {
    const manifest = {
      name: 'Test',
      queries: [{ text: 'Test' }],
      surfaces: [{ id: 'chatgpt-web' }],
      locations: [{ id: 'us-national' }],
      completionCriteria: { requiredSurfaces: { surfaceIds: ['chatgpt-web'] } },
      deadline: '2030-12-31T23:59:59Z'
    };

    const response = validateManifestForApi(manifest);

    expect(response.success).toBe(true);
    expect(response.data?.studyInfo?.estimatedCost).toMatchObject({
      min: expect.any(Number),
      max: expect.any(Number),
      currency: 'USD'
    });
    expect(response.data?.studyInfo?.estimatedCost?.max).toBeGreaterThanOrEqual(
      response.data?.studyInfo?.estimatedCost?.min ?? 0
    );
  });

  it('includes timestamp in ISO format', () => {
    const manifest = {
      name: 'Test',
      queries: [{ text: 'Test' }],
      surfaces: [{ id: 'chatgpt-web' }],
      locations: [{ id: 'us-national' }],
      completionCriteria: { requiredSurfaces: { surfaceIds: ['chatgpt-web'] } },
      deadline: '2030-12-31T23:59:59Z'
    };

    const response = validateManifestForApi(manifest);

    expect(response.meta?.timestamp).toBeDefined();
    // Verify it's a valid ISO date
    const timestamp = new Date(response.meta?.timestamp ?? '');
    expect(timestamp.toISOString()).toBe(response.meta?.timestamp);
  });

  it('includes request ID when provided', () => {
    const manifest = {
      name: 'Test',
      queries: [{ text: 'Test' }],
      surfaces: [{ id: 'chatgpt-web' }],
      locations: [{ id: 'us-national' }],
      completionCriteria: { requiredSurfaces: { surfaceIds: ['chatgpt-web'] } },
      deadline: '2030-12-31T23:59:59Z'
    };

    const requestId = 'tenant-req-12345-abcde';
    const response = validateManifestForApi(manifest, requestId);

    expect(response.meta?.requestId).toBe(requestId);
  });
});

describe('API Response - Warning Content', () => {
  it('includes recommendation in warnings', () => {
    const manifest = {
      name: 'Test',
      queries: [{ text: 'Test' }],
      surfaces: [{ id: 'chatgpt-web' }],
      locations: [{ id: 'us-national' }],
      completionCriteria: {
        requiredSurfaces: {
          surfaceIds: ['chatgpt-web'],
          coverageThreshold: 1.0
        }
      },
      deadline: '2030-12-31T23:59:59Z'
    };

    const response = validateManifestForApi(manifest);

    expect(response.success).toBe(true);
    expect(response.data?.warnings).toBeDefined();

    const coverageWarning = response.data?.warnings?.find(w =>
      w.field.includes('coverageThreshold')
    );
    expect(coverageWarning?.recommendation).toBeDefined();
    expect(coverageWarning?.recommendation).toContain('0.95');
  });
});

describe('API Response - JSON Serialization', () => {
  it('error response serializes to valid JSON', () => {
    const manifest = { invalid: true };
    const response = validateManifestForApi(manifest);

    const json = JSON.stringify(response);
    const parsed = JSON.parse(json);

    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe('MANIFEST_VALIDATION_FAILED');
    expect(Array.isArray(parsed.error.details)).toBe(true);
  });

  it('success response serializes to valid JSON', () => {
    const manifest = {
      name: 'Test',
      queries: [{ text: 'Test' }],
      surfaces: [{ id: 'chatgpt-web' }],
      locations: [{ id: 'us-national' }],
      completionCriteria: { requiredSurfaces: { surfaceIds: ['chatgpt-web'] } },
      deadline: '2030-12-31T23:59:59Z'
    };

    const response = validateManifestForApi(manifest);

    const json = JSON.stringify(response);
    const parsed = JSON.parse(json);

    expect(parsed.success).toBe(true);
    expect(parsed.data.valid).toBe(true);
    expect(typeof parsed.data.studyInfo.totalCells).toBe('number');
  });
});
