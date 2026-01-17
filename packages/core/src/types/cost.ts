/**
 * Cost tracking types for Bentham
 */

/**
 * Cost categories for billing
 */
export type CostCategory =
  | 'proxy'
  | 'compute'
  | 'ai'
  | 'storage'
  | 'captcha'
  | 'account';

/**
 * Individual cost line item
 */
export interface CostLineItem {
  /** Category of cost */
  category: CostCategory;
  /** Description of the cost */
  description: string;
  /** Amount in USD */
  amount: number;
  /** Quantity (if applicable) */
  quantity?: number;
  /** Unit (if applicable, e.g., 'GB', 'requests') */
  unit?: string;
  /** Unit price (if applicable) */
  unitPrice?: number;
}

/**
 * Cost estimate before execution
 */
export interface CostEstimate {
  /** Total estimated cost in USD */
  total: number;
  /** Breakdown by category */
  breakdown: {
    /** Proxy bandwidth costs */
    proxy: number;
    /** Compute costs */
    compute: number;
    /** AI API costs */
    ai: number;
    /** Storage costs */
    storage: number;
    /** CAPTCHA solving costs */
    captcha: number;
    /** Account costs */
    account: number;
  };
  /** Confidence level (0-1) */
  confidence: number;
  /** Assumptions made */
  assumptions: string[];
  /** When estimate was calculated */
  calculatedAt: Date;
}

/**
 * Actual cost record during/after execution
 */
export interface CostRecord {
  /** Study ID */
  studyId: string;
  /** Tenant ID */
  tenantId: string;
  /** Total cost so far in USD */
  total: number;
  /** Breakdown by category */
  breakdown: {
    /** Proxy bandwidth costs */
    proxy: number;
    /** Compute costs */
    compute: number;
    /** AI API costs */
    ai: number;
    /** Storage costs */
    storage: number;
    /** CAPTCHA solving costs */
    captcha: number;
    /** Account costs */
    account: number;
  };
  /** Individual line items */
  lineItems: CostLineItem[];
  /** When record was last updated */
  updatedAt: Date;
}

/**
 * Create an empty cost estimate
 */
export function createEmptyCostEstimate(): CostEstimate {
  return {
    total: 0,
    breakdown: {
      proxy: 0,
      compute: 0,
      ai: 0,
      storage: 0,
      captcha: 0,
      account: 0,
    },
    confidence: 0,
    assumptions: [],
    calculatedAt: new Date(),
  };
}

/**
 * Create an empty cost record
 */
export function createEmptyCostRecord(studyId: string, tenantId: string): CostRecord {
  return {
    studyId,
    tenantId,
    total: 0,
    breakdown: {
      proxy: 0,
      compute: 0,
      ai: 0,
      storage: 0,
      captcha: 0,
      account: 0,
    },
    lineItems: [],
    updatedAt: new Date(),
  };
}

/**
 * Add a cost line item to a record
 */
export function addCostLineItem(record: CostRecord, item: CostLineItem): CostRecord {
  const newRecord = { ...record };
  newRecord.lineItems = [...record.lineItems, item];
  newRecord.breakdown[item.category] += item.amount;
  newRecord.total += item.amount;
  newRecord.updatedAt = new Date();
  return newRecord;
}
