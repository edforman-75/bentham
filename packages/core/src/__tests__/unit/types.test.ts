import { describe, it, expect } from 'vitest';
import {
  LOCATIONS,
  isValidLocationId,
  getLocationConfig,
  SURFACES,
  isValidSurfaceId,
  getSurfaceDefinition,
  createEmptyCostEstimate,
  createEmptyCostRecord,
  addCostLineItem,
  createDefaultQuota,
  createDefaultNotificationPrefs,
} from '../../types/index.js';

describe('LOCATIONS', () => {
  it('defines US locations', () => {
    expect(LOCATIONS['us-national']).toBeDefined();
    expect(LOCATIONS['us-nyc']).toBeDefined();
    expect(LOCATIONS['us-la']).toBeDefined();
    expect(LOCATIONS['us-national'].country).toBe('US');
  });

  it('defines European locations', () => {
    expect(LOCATIONS['uk-lon']).toBeDefined();
    expect(LOCATIONS['de-ber']).toBeDefined();
    expect(LOCATIONS['fr-par']).toBeDefined();
    expect(LOCATIONS['uk-lon'].country).toBe('GB');
  });

  it('defines Asia Pacific locations', () => {
    expect(LOCATIONS['jp-tok']).toBeDefined();
    expect(LOCATIONS['au-syd']).toBeDefined();
    expect(LOCATIONS['jp-tok'].country).toBe('JP');
  });

  it('includes city information where applicable', () => {
    expect(LOCATIONS['us-nyc'].city).toBe('New York');
    expect(LOCATIONS['uk-lon'].city).toBe('London');
  });
});

describe('isValidLocationId', () => {
  it('returns true for valid location IDs', () => {
    expect(isValidLocationId('us-national')).toBe(true);
    expect(isValidLocationId('uk-lon')).toBe(true);
    expect(isValidLocationId('jp-tok')).toBe(true);
  });

  it('returns false for invalid location IDs', () => {
    expect(isValidLocationId('invalid')).toBe(false);
    expect(isValidLocationId('us-boston')).toBe(false);
    expect(isValidLocationId('')).toBe(false);
  });
});

describe('getLocationConfig', () => {
  it('returns configuration for valid location', () => {
    const config = getLocationConfig('us-nyc');
    expect(config.country).toBe('US');
    expect(config.city).toBe('New York');
    expect(config.name).toBe('New York, US');
  });
});

describe('SURFACES', () => {
  it('defines API surfaces', () => {
    expect(SURFACES['openai-api']).toBeDefined();
    expect(SURFACES['anthropic-api']).toBeDefined();
    expect(SURFACES['openai-api'].category).toBe('api');
  });

  it('defines web chatbot surfaces', () => {
    expect(SURFACES['chatgpt-web']).toBeDefined();
    expect(SURFACES['gemini-web']).toBeDefined();
    expect(SURFACES['chatgpt-web'].category).toBe('web_chatbot');
  });

  it('defines search surfaces', () => {
    expect(SURFACES['google-search']).toBeDefined();
    expect(SURFACES['bing-copilot']).toBeDefined();
    expect(SURFACES['google-search'].category).toBe('search');
  });

  it('includes correct auth requirements', () => {
    expect(SURFACES['openai-api'].requiresAuth).toBe(true);
    expect(SURFACES['perplexity-web'].supportsAnonymous).toBe(true);
    expect(SURFACES['chatgpt-web'].requiresAuth).toBe(true);
  });

  it('includes geo-targeting support', () => {
    expect(SURFACES['openai-api'].supportsGeoTargeting).toBe(false);
    expect(SURFACES['chatgpt-web'].supportsGeoTargeting).toBe(true);
    expect(SURFACES['google-search'].supportsGeoTargeting).toBe(true);
  });
});

describe('isValidSurfaceId', () => {
  it('returns true for valid surface IDs', () => {
    expect(isValidSurfaceId('openai-api')).toBe(true);
    expect(isValidSurfaceId('chatgpt-web')).toBe(true);
    expect(isValidSurfaceId('google-search')).toBe(true);
  });

  it('returns false for invalid surface IDs', () => {
    expect(isValidSurfaceId('invalid')).toBe(false);
    expect(isValidSurfaceId('gpt-4')).toBe(false);
    expect(isValidSurfaceId('')).toBe(false);
  });
});

describe('getSurfaceDefinition', () => {
  it('returns definition for valid surface', () => {
    const def = getSurfaceDefinition('chatgpt-web');
    expect(def.name).toBe('ChatGPT Web');
    expect(def.category).toBe('web_chatbot');
    expect(def.requiresAuth).toBe(true);
  });
});

describe('Cost utilities', () => {
  describe('createEmptyCostEstimate', () => {
    it('creates estimate with zero values', () => {
      const estimate = createEmptyCostEstimate();
      expect(estimate.total).toBe(0);
      expect(estimate.breakdown.proxy).toBe(0);
      expect(estimate.breakdown.compute).toBe(0);
      expect(estimate.breakdown.ai).toBe(0);
      expect(estimate.confidence).toBe(0);
      expect(estimate.assumptions).toEqual([]);
    });

    it('sets calculatedAt timestamp', () => {
      const before = new Date();
      const estimate = createEmptyCostEstimate();
      const after = new Date();
      expect(estimate.calculatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(estimate.calculatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('createEmptyCostRecord', () => {
    it('creates record with study and tenant IDs', () => {
      const record = createEmptyCostRecord('study_123', 'tenant_456');
      expect(record.studyId).toBe('study_123');
      expect(record.tenantId).toBe('tenant_456');
      expect(record.total).toBe(0);
      expect(record.lineItems).toEqual([]);
    });
  });

  describe('addCostLineItem', () => {
    it('adds item and updates totals', () => {
      const record = createEmptyCostRecord('study_1', 'tenant_1');
      const updated = addCostLineItem(record, {
        category: 'proxy',
        description: 'Bandwidth usage',
        amount: 10.50,
      });

      expect(updated.total).toBe(10.50);
      expect(updated.breakdown.proxy).toBe(10.50);
      expect(updated.lineItems.length).toBe(1);
    });

    it('accumulates multiple items', () => {
      let record = createEmptyCostRecord('study_1', 'tenant_1');
      record = addCostLineItem(record, {
        category: 'proxy',
        description: 'Proxy 1',
        amount: 5.00,
      });
      record = addCostLineItem(record, {
        category: 'ai',
        description: 'AI calls',
        amount: 3.00,
      });
      record = addCostLineItem(record, {
        category: 'proxy',
        description: 'Proxy 2',
        amount: 2.00,
      });

      expect(record.total).toBe(10.00);
      expect(record.breakdown.proxy).toBe(7.00);
      expect(record.breakdown.ai).toBe(3.00);
      expect(record.lineItems.length).toBe(3);
    });

    it('does not mutate original record', () => {
      const original = createEmptyCostRecord('study_1', 'tenant_1');
      const updated = addCostLineItem(original, {
        category: 'compute',
        description: 'Compute',
        amount: 5.00,
      });

      expect(original.total).toBe(0);
      expect(updated.total).toBe(5.00);
    });
  });
});

describe('Tenant utilities', () => {
  describe('createDefaultQuota', () => {
    it('creates quota with reasonable defaults', () => {
      const quota = createDefaultQuota();
      expect(quota.maxConcurrentStudies).toBeGreaterThan(0);
      expect(quota.maxCellsPerStudy).toBeGreaterThan(0);
      expect(quota.maxMonthlyBudget).toBeGreaterThan(0);
      expect(quota.allowedSurfaces.length).toBeGreaterThan(0);
      expect(quota.allowedLocations.length).toBeGreaterThan(0);
    });
  });

  describe('createDefaultNotificationPrefs', () => {
    it('creates prefs with reasonable defaults', () => {
      const prefs = createDefaultNotificationPrefs();
      expect(prefs.emailAddresses).toEqual([]);
      expect(prefs.notifyOnComplete).toBe(true);
      expect(prefs.notifyOnFailure).toBe(true);
      expect(prefs.notifyOnAtRisk).toBe(true);
    });
  });
});
