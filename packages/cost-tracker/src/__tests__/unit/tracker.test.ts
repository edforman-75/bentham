/**
 * Cost Tracker Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CostTracker, createCostTracker } from '../../tracker.js';
import type { BillableEvent, CostRates } from '../../types.js';
import { DEFAULT_COST_RATES } from '../../types.js';

describe('CostTracker', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker();
  });

  describe('constructor', () => {
    it('should create tracker with default rates', () => {
      const rates = tracker.getRates();
      expect(rates).toEqual(DEFAULT_COST_RATES);
    });

    it('should create tracker with custom rates', () => {
      const customRates: CostRates = {
        proxyPerGb: 20.00,
        proxyPerRequest: 0.002,
        computePerMinute: 0.005,
        aiPer1kTokens: 0.02,
        storagePerGbMonth: 0.05,
        captchaPerSolve: 0.005,
        accountPerDay: 0.20,
      };
      const customTracker = new CostTracker(customRates);
      expect(customTracker.getRates()).toEqual(customRates);
    });
  });

  describe('recordEvent', () => {
    it('should record a single event', () => {
      const event: BillableEvent = {
        type: 'proxy_request',
        category: 'proxy',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        amount: 0.001,
        quantity: 1,
        unit: 'requests',
      };

      tracker.recordEvent(event);

      const record = tracker.getStudyRecord('study-1');
      expect(record).toBeDefined();
      expect(record!.total).toBe(0.001);
      expect(record!.breakdown.proxy).toBe(0.001);
    });

    it('should add timestamp if not provided', () => {
      const event: BillableEvent = {
        type: 'proxy_request',
        category: 'proxy',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        amount: 0.001,
      };

      const before = new Date();
      tracker.recordEvent(event);
      const after = new Date();

      const aggregation = tracker.aggregateStudyCosts('study-1');
      expect(aggregation.period.start.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(aggregation.period.start.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should accumulate costs across multiple events for same study', () => {
      const events: BillableEvent[] = [
        { type: 'proxy_request', category: 'proxy', studyId: 'study-1', tenantId: 'tenant-1', amount: 0.001 },
        { type: 'proxy_bandwidth', category: 'proxy', studyId: 'study-1', tenantId: 'tenant-1', amount: 0.50 },
        { type: 'compute_time', category: 'compute', studyId: 'study-1', tenantId: 'tenant-1', amount: 0.10 },
      ];

      for (const event of events) {
        tracker.recordEvent(event);
      }

      const record = tracker.getStudyRecord('study-1');
      expect(record!.total).toBeCloseTo(0.601, 3);
      expect(record!.breakdown.proxy).toBeCloseTo(0.501, 3);
      expect(record!.breakdown.compute).toBeCloseTo(0.10, 2);
    });
  });

  describe('recordEvents', () => {
    it('should record multiple events at once', () => {
      const events: BillableEvent[] = [
        { type: 'proxy_request', category: 'proxy', studyId: 'study-1', tenantId: 'tenant-1', amount: 0.001 },
        { type: 'ai_tokens', category: 'ai', studyId: 'study-1', tenantId: 'tenant-1', amount: 0.05 },
      ];

      tracker.recordEvents(events);

      const record = tracker.getStudyRecord('study-1');
      expect(record!.total).toBeCloseTo(0.051, 3);
    });
  });

  describe('getStudyRecord', () => {
    it('should return undefined for non-existent study', () => {
      const record = tracker.getStudyRecord('non-existent');
      expect(record).toBeUndefined();
    });

    it('should return the cost record for an existing study', () => {
      tracker.recordEvent({
        type: 'proxy_request',
        category: 'proxy',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        amount: 0.001,
      });

      const record = tracker.getStudyRecord('study-1');
      expect(record).toBeDefined();
      expect(record!.studyId).toBe('study-1');
      expect(record!.tenantId).toBe('tenant-1');
    });
  });

  describe('getStudyCostSummary', () => {
    it('should return undefined for non-existent study', () => {
      const summary = tracker.getStudyCostSummary('non-existent');
      expect(summary).toBeUndefined();
    });

    it('should return summary with estimated and actual costs', () => {
      tracker.recordEvent({
        type: 'proxy_request',
        category: 'proxy',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        amount: 1.50,
      });

      const summary = tracker.getStudyCostSummary('study-1', 2.00);
      expect(summary).toBeDefined();
      expect(summary!.estimated).toBe(2.00);
      expect(summary!.actual).toBe(1.50);
      expect(summary!.studyId).toBe('study-1');
      expect(summary!.tenantId).toBe('tenant-1');
    });
  });

  describe('aggregateStudyCosts', () => {
    it('should return empty aggregation for non-existent study', () => {
      const aggregation = tracker.aggregateStudyCosts('non-existent');
      expect(aggregation.total).toBe(0);
      expect(aggregation.eventCount).toBe(0);
    });

    it('should aggregate costs by category and event type', () => {
      const events: BillableEvent[] = [
        { type: 'proxy_request', category: 'proxy', studyId: 'study-1', tenantId: 'tenant-1', amount: 0.01 },
        { type: 'proxy_bandwidth', category: 'proxy', studyId: 'study-1', tenantId: 'tenant-1', amount: 0.50 },
        { type: 'ai_tokens', category: 'ai', studyId: 'study-1', tenantId: 'tenant-1', amount: 0.25 },
        { type: 'storage_write', category: 'storage', studyId: 'study-1', tenantId: 'tenant-1', amount: 0.02 },
      ];

      tracker.recordEvents(events);

      const aggregation = tracker.aggregateStudyCosts('study-1');
      expect(aggregation.total).toBeCloseTo(0.78, 2);
      expect(aggregation.eventCount).toBe(4);
      expect(aggregation.byCategory.proxy).toBeCloseTo(0.51, 2);
      expect(aggregation.byCategory.ai).toBeCloseTo(0.25, 2);
      expect(aggregation.byCategory.storage).toBeCloseTo(0.02, 2);
      expect(aggregation.byEventType.proxy_request).toBeCloseTo(0.01, 2);
      expect(aggregation.byEventType.proxy_bandwidth).toBeCloseTo(0.50, 2);
    });
  });

  describe('aggregateTenantCosts', () => {
    it('should aggregate costs across all studies for a tenant', () => {
      const events: BillableEvent[] = [
        { type: 'proxy_request', category: 'proxy', studyId: 'study-1', tenantId: 'tenant-1', amount: 1.00 },
        { type: 'proxy_request', category: 'proxy', studyId: 'study-2', tenantId: 'tenant-1', amount: 2.00 },
        { type: 'proxy_request', category: 'proxy', studyId: 'study-3', tenantId: 'tenant-2', amount: 3.00 },
      ];

      tracker.recordEvents(events);

      const aggregation = tracker.aggregateTenantCosts('tenant-1');
      expect(aggregation.total).toBe(3.00);
      expect(aggregation.eventCount).toBe(2);
    });

    it('should filter by period when provided', () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      const events: BillableEvent[] = [
        { type: 'proxy_request', category: 'proxy', studyId: 'study-1', tenantId: 'tenant-1', amount: 1.00, timestamp: twoDaysAgo },
        { type: 'proxy_request', category: 'proxy', studyId: 'study-1', tenantId: 'tenant-1', amount: 2.00, timestamp: yesterday },
        { type: 'proxy_request', category: 'proxy', studyId: 'study-1', tenantId: 'tenant-1', amount: 3.00, timestamp: now },
      ];

      tracker.recordEvents(events);

      const aggregation = tracker.aggregateTenantCosts('tenant-1', {
        start: yesterday,
        end: now,
      });

      expect(aggregation.total).toBe(5.00); // yesterday + now
      expect(aggregation.eventCount).toBe(2);
    });
  });

  describe('getTenantCostSummary', () => {
    it('should return detailed summary for a tenant', () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const events: BillableEvent[] = [
        { type: 'proxy_request', category: 'proxy', studyId: 'study-1', tenantId: 'tenant-1', amount: 1.00, timestamp: now },
        { type: 'ai_tokens', category: 'ai', studyId: 'study-1', tenantId: 'tenant-1', amount: 0.50, timestamp: now },
        { type: 'proxy_request', category: 'proxy', studyId: 'study-2', tenantId: 'tenant-1', amount: 2.00, timestamp: now },
      ];

      tracker.recordEvents(events);

      const summary = tracker.getTenantCostSummary('tenant-1', { start: yesterday, end: now });

      expect(summary.tenantId).toBe('tenant-1');
      expect(summary.total).toBe(3.50);
      expect(summary.studyCount).toBe(2);
      expect(summary.byCategory.proxy).toBe(3.00);
      expect(summary.byCategory.ai).toBe(0.50);
      expect(summary.byStudy).toHaveLength(2);
    });
  });

  describe('generateBillingReport', () => {
    it('should generate a billing report with line items', () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const events: BillableEvent[] = [
        { type: 'proxy_request', category: 'proxy', studyId: 'study-1', tenantId: 'tenant-1', amount: 1.00, quantity: 1000, unit: 'requests', timestamp: now },
        { type: 'ai_tokens', category: 'ai', studyId: 'study-1', tenantId: 'tenant-1', amount: 0.50, quantity: 50000, unit: 'tokens', timestamp: now },
      ];

      tracker.recordEvents(events);

      const report = tracker.generateBillingReport('tenant-1', { start: yesterday, end: now });

      expect(report.tenantId).toBe('tenant-1');
      expect(report.totalDue).toBe(1.50);
      expect(report.currency).toBe('USD');
      expect(report.lineItems).toHaveLength(2);
      expect(report.generatedAt).toBeInstanceOf(Date);
    });

    it('should sort line items by amount descending', () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const events: BillableEvent[] = [
        { type: 'proxy_request', category: 'proxy', studyId: 'study-1', tenantId: 'tenant-1', amount: 0.50, timestamp: now },
        { type: 'ai_tokens', category: 'ai', studyId: 'study-1', tenantId: 'tenant-1', amount: 2.00, timestamp: now },
        { type: 'storage_write', category: 'storage', studyId: 'study-1', tenantId: 'tenant-1', amount: 0.10, timestamp: now },
      ];

      tracker.recordEvents(events);

      const report = tracker.generateBillingReport('tenant-1', { start: yesterday, end: now });

      expect(report.lineItems[0].category).toBe('ai');
      expect(report.lineItems[1].category).toBe('proxy');
      expect(report.lineItems[2].category).toBe('storage');
    });
  });

  describe('calculateCost', () => {
    it('should calculate proxy bandwidth cost', () => {
      const cost = tracker.calculateCost('proxy_bandwidth', 2); // 2 GB
      expect(cost).toBe(2 * DEFAULT_COST_RATES.proxyPerGb);
    });

    it('should calculate proxy request cost', () => {
      const cost = tracker.calculateCost('proxy_request', 1000);
      expect(cost).toBe(1000 * DEFAULT_COST_RATES.proxyPerRequest);
    });

    it('should calculate compute time cost', () => {
      const cost = tracker.calculateCost('compute_time', 60); // 60 minutes
      expect(cost).toBe(60 * DEFAULT_COST_RATES.computePerMinute);
    });

    it('should calculate AI token cost', () => {
      const cost = tracker.calculateCost('ai_tokens', 10000); // 10K tokens
      expect(cost).toBe(10 * DEFAULT_COST_RATES.aiPer1kTokens);
    });

    it('should calculate storage cost', () => {
      const cost = tracker.calculateCost('storage_write', 5); // 5 GB
      expect(cost).toBe(5 * DEFAULT_COST_RATES.storagePerGbMonth);
    });

    it('should calculate captcha cost', () => {
      const cost = tracker.calculateCost('captcha_solve', 100);
      expect(cost).toBe(100 * DEFAULT_COST_RATES.captchaPerSolve);
    });

    it('should calculate account usage cost', () => {
      const cost = tracker.calculateCost('account_usage', 30); // 30 days
      expect(cost).toBe(30 * DEFAULT_COST_RATES.accountPerDay);
    });
  });

  describe('estimateStudyCost', () => {
    it('should estimate cost for a study with default options', () => {
      const estimate = tracker.estimateStudyCost(100);

      expect(estimate.min).toBeGreaterThan(0);
      expect(estimate.max).toBeGreaterThan(estimate.min);
      expect(estimate.breakdown).toBeDefined();
      expect(estimate.breakdown.proxy).toBeGreaterThan(0);
      expect(estimate.breakdown.compute).toBeGreaterThan(0);
      expect(estimate.breakdown.ai).toBeGreaterThan(0);
    });

    it('should estimate higher costs for full evidence level', () => {
      const metadataEstimate = tracker.estimateStudyCost(100, { evidenceLevel: 'metadata' });
      const fullEstimate = tracker.estimateStudyCost(100, { evidenceLevel: 'full' });

      expect(fullEstimate.breakdown.storage).toBeGreaterThan(metadataEstimate.breakdown.storage);
    });

    it('should estimate zero storage for none evidence level', () => {
      const estimate = tracker.estimateStudyCost(100, { evidenceLevel: 'none' });
      expect(estimate.breakdown.storage).toBe(0);
    });
  });

  describe('getRates', () => {
    it('should return a copy of current rates', () => {
      const rates = tracker.getRates();
      rates.proxyPerGb = 999;

      const freshRates = tracker.getRates();
      expect(freshRates.proxyPerGb).toBe(DEFAULT_COST_RATES.proxyPerGb);
    });
  });

  describe('updateRates', () => {
    it('should update specific rates', () => {
      tracker.updateRates({ proxyPerGb: 25.00 });

      const rates = tracker.getRates();
      expect(rates.proxyPerGb).toBe(25.00);
      expect(rates.computePerMinute).toBe(DEFAULT_COST_RATES.computePerMinute);
    });

    it('should affect future cost calculations', () => {
      tracker.updateRates({ proxyPerGb: 30.00 });

      const cost = tracker.calculateCost('proxy_bandwidth', 1);
      expect(cost).toBe(30.00);
    });
  });

  describe('clear', () => {
    it('should clear all stored data', () => {
      tracker.recordEvent({
        type: 'proxy_request',
        category: 'proxy',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        amount: 1.00,
      });

      tracker.clear();

      expect(tracker.getStudyRecord('study-1')).toBeUndefined();
      const aggregation = tracker.aggregateStudyCosts('study-1');
      expect(aggregation.eventCount).toBe(0);
    });
  });

  describe('createCostTracker', () => {
    it('should create a new tracker instance', () => {
      const newTracker = createCostTracker();
      expect(newTracker).toBeInstanceOf(CostTracker);
    });

    it('should create tracker with custom rates', () => {
      const customRates: CostRates = {
        proxyPerGb: 10.00,
        proxyPerRequest: 0.0005,
        computePerMinute: 0.001,
        aiPer1kTokens: 0.005,
        storagePerGbMonth: 0.01,
        captchaPerSolve: 0.001,
        accountPerDay: 0.05,
      };

      const newTracker = createCostTracker(customRates);
      expect(newTracker.getRates()).toEqual(customRates);
    });
  });
});
