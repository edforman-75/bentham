/**
 * Cost Tracker Types
 */

import type { CostCategory } from '@bentham/core';

/**
 * A billable event that can be recorded
 */
export interface BillableEvent {
  /** Type of billable event */
  type: BillableEventType;
  /** Cost category for billing */
  category: CostCategory;
  /** Study ID this event belongs to */
  studyId: string;
  /** Tenant ID for billing */
  tenantId: string;
  /** Amount in USD */
  amount: number;
  /** Quantity (e.g., bytes, requests) */
  quantity?: number;
  /** Unit of measurement */
  unit?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** When the event occurred */
  timestamp?: Date;
}

/**
 * Types of billable events
 */
export type BillableEventType =
  | 'proxy_request'
  | 'proxy_bandwidth'
  | 'compute_time'
  | 'ai_api_call'
  | 'ai_tokens'
  | 'storage_write'
  | 'storage_read'
  | 'captcha_solve'
  | 'account_usage';

/**
 * Cost aggregation result
 */
export interface CostAggregation {
  /** Total cost in USD */
  total: number;
  /** Breakdown by category */
  byCategory: Record<CostCategory, number>;
  /** Breakdown by event type */
  byEventType: Record<BillableEventType, number>;
  /** Number of events */
  eventCount: number;
  /** Time range */
  period: {
    start: Date;
    end: Date;
  };
}

/**
 * Cost summary for a study
 */
export interface StudyCostSummary {
  studyId: string;
  tenantId: string;
  /** Estimated cost before execution */
  estimated: number;
  /** Actual cost so far */
  actual: number;
  /** Breakdown by category */
  breakdown: Record<CostCategory, number>;
  /** Whether the study is complete */
  isComplete: boolean;
  /** Last updated timestamp */
  updatedAt: Date;
}

/**
 * Cost summary for a tenant
 */
export interface TenantCostSummary {
  tenantId: string;
  /** Total cost for the period */
  total: number;
  /** Breakdown by category */
  byCategory: Record<CostCategory, number>;
  /** Breakdown by study */
  byStudy: Array<{
    studyId: string;
    cost: number;
  }>;
  /** Number of studies */
  studyCount: number;
  /** Time period */
  period: {
    start: Date;
    end: Date;
  };
}

/**
 * Billing report
 */
export interface BillingReport {
  /** Tenant ID */
  tenantId: string;
  /** Report period */
  period: {
    start: Date;
    end: Date;
  };
  /** Total amount due */
  totalDue: number;
  /** Currency */
  currency: string;
  /** Line items */
  lineItems: BillingLineItem[];
  /** Generated at */
  generatedAt: Date;
}

/**
 * Billing line item
 */
export interface BillingLineItem {
  /** Description */
  description: string;
  /** Category */
  category: CostCategory;
  /** Study ID (if applicable) */
  studyId?: string;
  /** Quantity */
  quantity: number;
  /** Unit */
  unit: string;
  /** Unit price */
  unitPrice: number;
  /** Total amount */
  amount: number;
}

/**
 * Cost rate configuration
 */
export interface CostRates {
  /** Proxy cost per GB */
  proxyPerGb: number;
  /** Proxy cost per request */
  proxyPerRequest: number;
  /** Compute cost per minute */
  computePerMinute: number;
  /** AI API cost per 1K tokens */
  aiPer1kTokens: number;
  /** Storage cost per GB per month */
  storagePerGbMonth: number;
  /** Captcha cost per solve */
  captchaPerSolve: number;
  /** Account cost per day */
  accountPerDay: number;
}

/**
 * Default cost rates
 */
export const DEFAULT_COST_RATES: CostRates = {
  proxyPerGb: 15.00,        // $15/GB for residential proxy
  proxyPerRequest: 0.001,   // $0.001 per request
  computePerMinute: 0.002,  // $0.002 per minute
  aiPer1kTokens: 0.01,      // $0.01 per 1K tokens
  storagePerGbMonth: 0.023, // $0.023/GB/month (S3 pricing)
  captchaPerSolve: 0.002,   // $0.002 per captcha
  accountPerDay: 0.10,      // $0.10 per account per day
};
