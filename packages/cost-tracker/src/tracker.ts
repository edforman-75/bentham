/**
 * Cost Tracker Implementation
 *
 * Records billable events and provides cost aggregation.
 */

import type { CostCategory, CostRecord, CostLineItem } from '@bentham/core';
import { createEmptyCostRecord, addCostLineItem } from '@bentham/core';
import type {
  BillableEvent,
  BillableEventType,
  CostAggregation,
  StudyCostSummary,
  TenantCostSummary,
  BillingReport,
  BillingLineItem,
  CostRates,
} from './types.js';
import { DEFAULT_COST_RATES } from './types.js';

/**
 * In-memory storage for cost records (will be replaced with database in production)
 */
interface CostStorage {
  events: BillableEvent[];
  records: Map<string, CostRecord>; // studyId -> record
}

/**
 * Cost Tracker service
 */
export class CostTracker {
  private storage: CostStorage;
  private rates: CostRates;

  constructor(rates: CostRates = DEFAULT_COST_RATES) {
    this.storage = {
      events: [],
      records: new Map(),
    };
    this.rates = rates;
  }

  /**
   * Record a billable event
   */
  recordEvent(event: BillableEvent): void {
    const timestampedEvent = {
      ...event,
      timestamp: event.timestamp ?? new Date(),
    };

    this.storage.events.push(timestampedEvent);

    // Update the study's cost record
    const record = this.getOrCreateRecord(event.studyId, event.tenantId);
    const lineItem: CostLineItem = {
      category: event.category,
      description: this.getEventDescription(event),
      amount: event.amount,
      quantity: event.quantity,
      unit: event.unit,
    };

    const updatedRecord = addCostLineItem(record, lineItem);
    this.storage.records.set(event.studyId, updatedRecord);
  }

  /**
   * Record multiple events at once
   */
  recordEvents(events: BillableEvent[]): void {
    for (const event of events) {
      this.recordEvent(event);
    }
  }

  /**
   * Get the cost record for a study
   */
  getStudyRecord(studyId: string): CostRecord | undefined {
    return this.storage.records.get(studyId);
  }

  /**
   * Get cost summary for a study
   */
  getStudyCostSummary(studyId: string, estimated: number = 0): StudyCostSummary | undefined {
    const record = this.storage.records.get(studyId);
    if (!record) return undefined;

    return {
      studyId: record.studyId,
      tenantId: record.tenantId,
      estimated,
      actual: record.total,
      breakdown: record.breakdown,
      isComplete: false, // Would be determined by study status
      updatedAt: record.updatedAt,
    };
  }

  /**
   * Get aggregated costs for a study
   */
  aggregateStudyCosts(studyId: string): CostAggregation {
    const events = this.storage.events.filter(e => e.studyId === studyId);
    return this.aggregateEvents(events);
  }

  /**
   * Get aggregated costs for a tenant
   */
  aggregateTenantCosts(
    tenantId: string,
    period?: { start: Date; end: Date }
  ): CostAggregation {
    let events = this.storage.events.filter(e => e.tenantId === tenantId);

    if (period) {
      events = events.filter(e => {
        const timestamp = e.timestamp ?? new Date();
        return timestamp >= period.start && timestamp <= period.end;
      });
    }

    return this.aggregateEvents(events);
  }

  /**
   * Get tenant cost summary
   */
  getTenantCostSummary(
    tenantId: string,
    period: { start: Date; end: Date }
  ): TenantCostSummary {
    const events = this.storage.events.filter(e => {
      const timestamp = e.timestamp ?? new Date();
      return (
        e.tenantId === tenantId &&
        timestamp >= period.start &&
        timestamp <= period.end
      );
    });

    // Group by study
    const byStudy = new Map<string, number>();
    for (const event of events) {
      const current = byStudy.get(event.studyId) ?? 0;
      byStudy.set(event.studyId, current + event.amount);
    }

    // Calculate category totals
    const byCategory = this.initializeCategoryTotals();
    for (const event of events) {
      byCategory[event.category] += event.amount;
    }

    return {
      tenantId,
      total: events.reduce((sum, e) => sum + e.amount, 0),
      byCategory,
      byStudy: Array.from(byStudy.entries()).map(([studyId, cost]) => ({
        studyId,
        cost,
      })),
      studyCount: byStudy.size,
      period,
    };
  }

  /**
   * Generate a billing report for a tenant
   */
  generateBillingReport(
    tenantId: string,
    period: { start: Date; end: Date }
  ): BillingReport {
    const events = this.storage.events.filter(e => {
      const timestamp = e.timestamp ?? new Date();
      return (
        e.tenantId === tenantId &&
        timestamp >= period.start &&
        timestamp <= period.end
      );
    });

    // Group events by category and study for line items
    const lineItems = this.generateLineItems(events);

    return {
      tenantId,
      period,
      totalDue: events.reduce((sum, e) => sum + e.amount, 0),
      currency: 'USD',
      lineItems,
      generatedAt: new Date(),
    };
  }

  /**
   * Calculate cost for a specific event type and quantity
   */
  calculateCost(
    eventType: BillableEventType,
    quantity: number
  ): number {
    switch (eventType) {
      case 'proxy_bandwidth':
        return quantity * this.rates.proxyPerGb;
      case 'proxy_request':
        return quantity * this.rates.proxyPerRequest;
      case 'compute_time':
        return quantity * this.rates.computePerMinute;
      case 'ai_api_call':
      case 'ai_tokens':
        return (quantity / 1000) * this.rates.aiPer1kTokens;
      case 'storage_write':
      case 'storage_read':
        return quantity * this.rates.storagePerGbMonth;
      case 'captcha_solve':
        return quantity * this.rates.captchaPerSolve;
      case 'account_usage':
        return quantity * this.rates.accountPerDay;
      default:
        return 0;
    }
  }

  /**
   * Estimate cost for a study based on cell count
   */
  estimateStudyCost(
    cellCount: number,
    options: {
      averageResponseSize?: number; // KB
      averageTokens?: number;
      evidenceLevel?: 'full' | 'metadata' | 'none';
    } = {}
  ): { min: number; max: number; breakdown: Record<CostCategory, number> } {
    const {
      averageResponseSize = 50, // 50KB average
      averageTokens = 500,
      evidenceLevel = 'metadata',
    } = options;

    // Proxy costs
    const proxyGb = (cellCount * averageResponseSize) / (1024 * 1024);
    const proxyCost = this.calculateCost('proxy_bandwidth', proxyGb) +
                      this.calculateCost('proxy_request', cellCount);

    // Compute costs (assume 30 seconds per cell)
    const computeMinutes = (cellCount * 0.5);
    const computeCost = this.calculateCost('compute_time', computeMinutes);

    // AI costs (for validation, ~100 tokens per response)
    const aiTokens = cellCount * (averageTokens + 100);
    const aiCost = this.calculateCost('ai_tokens', aiTokens);

    // Storage costs
    let storageCost = 0;
    if (evidenceLevel === 'full') {
      // Screenshots + HTML + HAR
      const storageGb = (cellCount * 0.5) / 1024; // ~500KB per cell
      storageCost = this.calculateCost('storage_write', storageGb);
    } else if (evidenceLevel === 'metadata') {
      // Just metadata
      const storageGb = (cellCount * 0.01) / 1024; // ~10KB per cell
      storageCost = this.calculateCost('storage_write', storageGb);
    }

    // Captcha costs (assume 5% hit rate)
    const captchaCost = this.calculateCost('captcha_solve', cellCount * 0.05);

    const breakdown: Record<CostCategory, number> = {
      proxy: proxyCost,
      compute: computeCost,
      ai: aiCost,
      storage: storageCost,
      captcha: captchaCost,
      account: 0, // Depends on account usage pattern
    };

    const base = proxyCost + computeCost + aiCost + storageCost + captchaCost;

    return {
      min: Math.round(base * 0.8 * 100) / 100,
      max: Math.round(base * 1.5 * 100) / 100,
      breakdown,
    };
  }

  /**
   * Get current cost rates
   */
  getRates(): CostRates {
    return { ...this.rates };
  }

  /**
   * Update cost rates
   */
  updateRates(newRates: Partial<CostRates>): void {
    this.rates = { ...this.rates, ...newRates };
  }

  /**
   * Clear all stored data (for testing)
   */
  clear(): void {
    this.storage.events = [];
    this.storage.records.clear();
  }

  // Private helper methods

  private getOrCreateRecord(studyId: string, tenantId: string): CostRecord {
    let record = this.storage.records.get(studyId);
    if (!record) {
      record = createEmptyCostRecord(studyId, tenantId);
      this.storage.records.set(studyId, record);
    }
    return record;
  }

  private getEventDescription(event: BillableEvent): string {
    switch (event.type) {
      case 'proxy_request':
        return 'Proxy request';
      case 'proxy_bandwidth':
        return `Proxy bandwidth (${event.quantity?.toFixed(2) ?? 0} ${event.unit ?? 'GB'})`;
      case 'compute_time':
        return `Compute time (${event.quantity?.toFixed(1) ?? 0} ${event.unit ?? 'min'})`;
      case 'ai_api_call':
        return 'AI API call';
      case 'ai_tokens':
        return `AI tokens (${event.quantity ?? 0})`;
      case 'storage_write':
        return 'Storage write';
      case 'storage_read':
        return 'Storage read';
      case 'captcha_solve':
        return 'CAPTCHA solve';
      case 'account_usage':
        return 'Account usage';
      default:
        return event.type;
    }
  }

  private aggregateEvents(events: BillableEvent[]): CostAggregation {
    const byCategory = this.initializeCategoryTotals();
    const byEventType = this.initializeEventTypeTotals();

    let total = 0;
    let minTime: Date | undefined;
    let maxTime: Date | undefined;

    for (const event of events) {
      total += event.amount;
      byCategory[event.category] += event.amount;
      byEventType[event.type] += event.amount;

      const timestamp = event.timestamp ?? new Date();
      if (!minTime || timestamp < minTime) minTime = timestamp;
      if (!maxTime || timestamp > maxTime) maxTime = timestamp;
    }

    return {
      total,
      byCategory,
      byEventType,
      eventCount: events.length,
      period: {
        start: minTime ?? new Date(),
        end: maxTime ?? new Date(),
      },
    };
  }

  private generateLineItems(events: BillableEvent[]): BillingLineItem[] {
    // Group by category and study
    const groups = new Map<string, BillableEvent[]>();

    for (const event of events) {
      const key = `${event.category}:${event.studyId}`;
      const group = groups.get(key) ?? [];
      group.push(event);
      groups.set(key, group);
    }

    const lineItems: BillingLineItem[] = [];

    for (const [key, groupEvents] of groups) {
      const [category, studyId] = key.split(':');
      const totalAmount = groupEvents.reduce((sum, e) => sum + e.amount, 0);
      const totalQuantity = groupEvents.reduce((sum, e) => sum + (e.quantity ?? 1), 0);

      lineItems.push({
        description: `${this.formatCategory(category as CostCategory)} - Study ${studyId.slice(0, 8)}`,
        category: category as CostCategory,
        studyId,
        quantity: totalQuantity,
        unit: groupEvents[0]?.unit ?? 'units',
        unitPrice: totalAmount / totalQuantity,
        amount: totalAmount,
      });
    }

    return lineItems.sort((a, b) => b.amount - a.amount);
  }

  private formatCategory(category: CostCategory): string {
    const labels: Record<CostCategory, string> = {
      proxy: 'Proxy Services',
      compute: 'Compute',
      ai: 'AI Services',
      storage: 'Storage',
      captcha: 'CAPTCHA Solving',
      account: 'Account Services',
    };
    return labels[category] ?? category;
  }

  private initializeCategoryTotals(): Record<CostCategory, number> {
    return {
      proxy: 0,
      compute: 0,
      ai: 0,
      storage: 0,
      captcha: 0,
      account: 0,
    };
  }

  private initializeEventTypeTotals(): Record<BillableEventType, number> {
    return {
      proxy_request: 0,
      proxy_bandwidth: 0,
      compute_time: 0,
      ai_api_call: 0,
      ai_tokens: 0,
      storage_write: 0,
      storage_read: 0,
      captcha_solve: 0,
      account_usage: 0,
    };
  }
}

/**
 * Create a new cost tracker instance
 */
export function createCostTracker(rates?: CostRates): CostTracker {
  return new CostTracker(rates);
}
