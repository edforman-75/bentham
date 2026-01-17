/**
 * Manifest Validation Tests
 *
 * Tests the manifest validation schema against various valid and invalid manifests.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { validateManifest, calculateCellCount, ManifestSchema } from '../../schemas/manifest.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '../fixtures/manifests');

function loadFixture(filename: string): unknown {
  const content = readFileSync(join(fixturesDir, filename), 'utf-8');
  return JSON.parse(content);
}

describe('Manifest Validation - Valid Manifests', () => {
  it('validates minimal manifest', () => {
    const manifest = loadFixture('valid-minimal.json');
    const result = validateManifest(manifest);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.name).toBe('Minimal Valid Study');
    expect(result.data?.queries).toHaveLength(1);
    expect(result.data?.surfaces).toHaveLength(1);
    expect(result.data?.locations).toHaveLength(1);
  });

  it('validates full-featured manifest', () => {
    const manifest = loadFixture('valid-full.json');
    const result = validateManifest(manifest);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.name).toBe('Comprehensive AI Response Study');
    expect(result.data?.queries).toHaveLength(3);
    expect(result.data?.surfaces).toHaveLength(4);
    expect(result.data?.locations).toHaveLength(5);
    expect(result.data?.legalHold).toBe(true);
    expect(result.data?.retentionDays).toBe(365);
  });

  it('validates multi-query manifest', () => {
    const manifest = loadFixture('valid-multi-query.json');
    const result = validateManifest(manifest);

    expect(result.success).toBe(true);
    expect(result.data?.queries).toHaveLength(10);
  });

  it('calculates cell count correctly', () => {
    const manifest = loadFixture('valid-full.json');
    const result = validateManifest(manifest);

    expect(result.success).toBe(true);
    if (result.data) {
      const cellCount = calculateCellCount(result.data);
      // 3 queries × 4 surfaces × 5 locations = 60 cells
      expect(cellCount).toBe(60);
    }
  });
});

describe('Manifest Validation - Invalid Manifests', () => {
  it('rejects missing name', () => {
    const manifest = loadFixture('invalid-missing-name.json');
    const result = validateManifest(manifest);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.some(e => e.path.includes('name'))).toBe(true);
  });

  it('rejects empty queries array', () => {
    const manifest = loadFixture('invalid-empty-queries.json');
    const result = validateManifest(manifest);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.some(e =>
      e.path.includes('queries') && e.message.includes('At least one query')
    )).toBe(true);
  });

  it('rejects invalid surface ID', () => {
    const manifest = loadFixture('invalid-bad-surface-id.json');
    const result = validateManifest(manifest);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.some(e => e.message.includes('Invalid surface ID'))).toBe(true);
  });

  it('rejects invalid location ID', () => {
    const manifest = loadFixture('invalid-bad-location-id.json');
    const result = validateManifest(manifest);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.some(e => e.message.includes('Invalid location ID'))).toBe(true);
  });

  it('rejects past deadline', () => {
    const manifest = loadFixture('invalid-deadline-past.json');
    const result = validateManifest(manifest);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.some(e => e.message.includes('future'))).toBe(true);
  });

  it('rejects required surface not in surfaces list', () => {
    const manifest = loadFixture('invalid-required-surface-mismatch.json');
    const result = validateManifest(manifest);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.some(e =>
      e.message.includes('Required surface IDs must be included')
    )).toBe(true);
  });

  it('rejects optional surface not in surfaces list', () => {
    const manifest = loadFixture('invalid-optional-surface-mismatch.json');
    const result = validateManifest(manifest);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.some(e =>
      e.message.includes('Optional surface IDs must be included')
    )).toBe(true);
  });

  it('rejects legal hold without retention specification', () => {
    const manifest = loadFixture('invalid-legal-hold-no-retention.json');
    const result = validateManifest(manifest);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.some(e =>
      e.message.includes('Legal hold studies must specify')
    )).toBe(true);
  });

  it('rejects empty query text', () => {
    const manifest = loadFixture('invalid-empty-query-text.json');
    const result = validateManifest(manifest);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.some(e => e.message.includes('required'))).toBe(true);
  });

  it('rejects invalid evidence level', () => {
    const manifest = loadFixture('invalid-evidence-level.json');
    const result = validateManifest(manifest);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it('rejects coverage threshold over 1.0', () => {
    const manifest = loadFixture('invalid-coverage-over-1.json');
    const result = validateManifest(manifest);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it('rejects retries over maximum', () => {
    const manifest = loadFixture('invalid-retries-too-high.json');
    const result = validateManifest(manifest);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it('rejects retention days over maximum', () => {
    const manifest = loadFixture('invalid-retention-too-high.json');
    const result = validateManifest(manifest);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
  });
});

describe('Manifest Validation - Edge Cases', () => {
  it('accepts minimum boundary values', () => {
    const manifest = loadFixture('edge-boundary-values.json');
    const result = validateManifest(manifest);

    expect(result.success).toBe(true);
    expect(result.data?.name).toBe('E'); // Single character name
    expect(result.data?.queries[0].text).toBe('X'); // Single character query
    expect(result.data?.completionCriteria.requiredSurfaces.coverageThreshold).toBe(0);
    expect(result.data?.completionCriteria.maxRetriesPerCell).toBe(1);
    expect(result.data?.qualityGates?.minResponseLength).toBe(0);
    expect(result.data?.retentionDays).toBe(1);
  });

  it('accepts maximum retention days', () => {
    const manifest = loadFixture('edge-max-retention.json');
    const result = validateManifest(manifest);

    expect(result.success).toBe(true);
    expect(result.data?.retentionDays).toBe(2555);
  });

  it('accepts preserveForever with legal hold (no retentionDays)', () => {
    const manifest = loadFixture('edge-preserve-forever.json');
    const result = validateManifest(manifest);

    expect(result.success).toBe(true);
    expect(result.data?.legalHold).toBe(true);
    expect(result.data?.preserveForever).toBe(true);
    expect(result.data?.retentionDays).toBeUndefined();
  });

  it('accepts all available surfaces', () => {
    const manifest = loadFixture('edge-all-surfaces.json');
    const result = validateManifest(manifest);

    expect(result.success).toBe(true);
    expect(result.data?.surfaces).toHaveLength(12);
  });

  it('rejects query text exceeding 10000 characters', () => {
    const manifest = loadFixture('invalid-query-too-long.json') as { queries: Array<{ text: string }> };
    // Replace placeholder with actual long string
    manifest.queries[0].text = 'x'.repeat(10001);

    const result = validateManifest(manifest);

    expect(result.success).toBe(false);
    expect(result.errors?.some(e => e.message.includes('too long'))).toBe(true);
  });

  it('accepts query text at exactly 10000 characters', () => {
    const manifest = loadFixture('valid-minimal.json') as { queries: Array<{ text: string }> };
    manifest.queries[0].text = 'x'.repeat(10000);

    const result = validateManifest(manifest);

    expect(result.success).toBe(true);
  });

  it('generates 1000 queries without error', () => {
    const manifest = loadFixture('valid-minimal.json') as {
      queries: Array<{ text: string }>;
      name: string;
    };

    // Generate 1000 queries
    manifest.queries = Array.from({ length: 1000 }, (_, i) => ({
      text: `Query number ${i + 1}`
    }));
    manifest.name = 'Max Queries Test';

    const result = validateManifest(manifest);

    expect(result.success).toBe(true);
    expect(result.data?.queries).toHaveLength(1000);
  });

  it('rejects more than 1000 queries', () => {
    const manifest = loadFixture('valid-minimal.json') as {
      queries: Array<{ text: string }>;
      name: string;
    };

    // Generate 1001 queries
    manifest.queries = Array.from({ length: 1001 }, (_, i) => ({
      text: `Query number ${i + 1}`
    }));
    manifest.name = 'Too Many Queries Test';

    const result = validateManifest(manifest);

    expect(result.success).toBe(false);
  });
});

describe('Manifest Validation - Default Values', () => {
  it('applies default values correctly', () => {
    const manifest = loadFixture('valid-minimal.json');
    const result = validateManifest(manifest);

    expect(result.success).toBe(true);
    expect(result.data?.version).toBeDefined(); // Should have default version
    expect(result.data?.surfaces[0].required).toBe(true); // Default required
    expect(result.data?.locations[0].proxyType).toBe('residential'); // Default proxy type
    expect(result.data?.locations[0].requireSticky).toBe(false); // Default sticky
    expect(result.data?.completionCriteria.requiredSurfaces.coverageThreshold).toBe(0.95); // Default coverage
    expect(result.data?.completionCriteria.maxRetriesPerCell).toBe(3); // Default retries
    expect(result.data?.qualityGates?.requireActualContent).toBe(true); // Default quality gate
    expect(result.data?.evidenceLevel).toBe('metadata'); // Default evidence level
    expect(result.data?.legalHold).toBe(false); // Default legal hold
    expect(result.data?.sessionIsolation).toBe('shared'); // Default session isolation
  });
});

describe('Manifest Schema Direct Access', () => {
  it('exposes ManifestSchema for direct usage', () => {
    const manifest = loadFixture('valid-minimal.json');
    const result = ManifestSchema.safeParse(manifest);

    expect(result.success).toBe(true);
  });

  it('provides detailed error paths', () => {
    const manifest = {
      name: 'Test',
      queries: [{ text: 'q' }],
      surfaces: [{ id: 'chatgpt-web' }],
      locations: [{ id: 'us-national' }],
      completionCriteria: {
        requiredSurfaces: {
          surfaceIds: ['chatgpt-web'],
          coverageThreshold: 2.0  // Invalid: > 1
        }
      },
      deadline: '2030-12-31T23:59:59Z'
    };

    const result = ManifestSchema.safeParse(manifest);

    expect(result.success).toBe(false);
    if (!result.success) {
      const error = result.error.errors[0];
      expect(error.path).toContain('completionCriteria');
    }
  });
});
