/**
 * Operator Alerting Service
 *
 * Provides incident tracking, impact assessment, and operator notifications
 * for surface adapter issues.
 */

/**
 * Incident severity levels
 */
export type IncidentSeverity = 'info' | 'warning' | 'critical' | 'outage';

/**
 * Incident status
 */
export type IncidentStatus = 'active' | 'acknowledged' | 'investigating' | 'resolved';

/**
 * Suggested remediation action
 */
export interface RemediationAction {
  /** Action identifier */
  id: string;
  /** Human-readable description */
  description: string;
  /** Whether this can be automated */
  automatable: boolean;
  /** Priority (1 = highest) */
  priority: number;
  /** Estimated impact if action is taken */
  estimatedImpact?: string;
}

/**
 * Impact assessment for an incident
 */
export interface ImpactAssessment {
  /** Number of queries currently blocked */
  queriesBlocked: number;
  /** Estimated cost impact per hour (USD) */
  costImpactPerHour: number;
  /** Affected study IDs */
  affectedStudies: string[];
  /** Affected surface IDs */
  affectedSurfaces: string[];
  /** Percentage of system capacity affected */
  capacityImpactPercent: number;
  /** User-facing impact description */
  userImpactDescription: string;
}

/**
 * Incident record
 */
export interface Incident {
  /** Unique incident ID */
  id: string;
  /** Surface ID where incident occurred */
  surfaceId: string;
  /** Specific adapter ID (if applicable) */
  adapterId?: string;
  /** Incident title */
  title: string;
  /** Detailed description */
  description: string;
  /** Severity level */
  severity: IncidentSeverity;
  /** Current status */
  status: IncidentStatus;
  /** Error code from adapter */
  errorCode: string;
  /** Error message */
  errorMessage: string;
  /** When incident first occurred */
  firstOccurredAt: Date;
  /** When incident last occurred */
  lastOccurredAt: Date;
  /** Number of occurrences */
  occurrenceCount: number;
  /** Impact assessment */
  impact: ImpactAssessment;
  /** Suggested remediation actions */
  suggestedActions: RemediationAction[];
  /** Link to runbook (if available) */
  runbookUrl?: string;
  /** Who acknowledged (if acknowledged) */
  acknowledgedBy?: string;
  /** When acknowledged */
  acknowledgedAt?: Date;
  /** Resolution notes */
  resolutionNotes?: string;
  /** When resolved */
  resolvedAt?: Date;
  /** Related incident IDs */
  relatedIncidents?: string[];
  /** Arbitrary metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Notification channel types
 */
export type NotificationChannel = 'dashboard' | 'webhook' | 'slack' | 'email' | 'pagerduty';

/**
 * Notification configuration
 */
export interface NotificationConfig {
  /** Channel type */
  channel: NotificationChannel;
  /** Whether channel is enabled */
  enabled: boolean;
  /** Minimum severity to notify */
  minSeverity: IncidentSeverity;
  /** Channel-specific configuration */
  config: Record<string, unknown>;
}

/**
 * Notification payload
 */
export interface NotificationPayload {
  /** Incident being notified about */
  incident: Incident;
  /** Type of notification */
  type: 'new' | 'updated' | 'escalated' | 'resolved';
  /** Summary text */
  summary: string;
  /** When notification was sent */
  sentAt: Date;
}

/**
 * Alert listener callback
 */
export type AlertListener = (incident: Incident, type: 'new' | 'updated' | 'escalated' | 'resolved') => void;

/**
 * Error code to remediation mapping
 */
const ERROR_REMEDIATIONS: Record<string, RemediationAction[]> = {
  'RATE_LIMITED': [
    {
      id: 'wait',
      description: 'Wait for rate limit window to reset',
      automatable: true,
      priority: 1,
      estimatedImpact: 'Queries will resume automatically after cooldown period',
    },
    {
      id: 'add-keys',
      description: 'Add additional API keys to the pool',
      automatable: false,
      priority: 2,
      estimatedImpact: 'Increases capacity and distributes rate limit burden',
    },
  ],
  'QUOTA_EXCEEDED': [
    {
      id: 'add-credits',
      description: 'Add credits or upgrade billing plan',
      automatable: false,
      priority: 1,
      estimatedImpact: 'Restores full service immediately after payment processes',
    },
    {
      id: 'use-backup',
      description: 'Switch to backup API provider',
      automatable: true,
      priority: 2,
      estimatedImpact: 'May have different pricing and capabilities',
    },
  ],
  'AUTH_FAILED': [
    {
      id: 'check-key',
      description: 'Verify API key is valid and not expired',
      automatable: false,
      priority: 1,
      estimatedImpact: 'May require generating new API key',
    },
    {
      id: 'rotate-key',
      description: 'Rotate to a backup API key',
      automatable: true,
      priority: 2,
      estimatedImpact: 'Restores service if current key is invalid',
    },
  ],
  'SERVICE_UNAVAILABLE': [
    {
      id: 'wait-recover',
      description: 'Wait for upstream service to recover',
      automatable: true,
      priority: 1,
      estimatedImpact: 'Service will resume automatically when upstream recovers',
    },
    {
      id: 'failover',
      description: 'Failover to alternative surface',
      automatable: true,
      priority: 2,
      estimatedImpact: 'May have different capabilities or pricing',
    },
  ],
  'NETWORK_ERROR': [
    {
      id: 'check-network',
      description: 'Check network connectivity and DNS',
      automatable: false,
      priority: 1,
      estimatedImpact: 'May identify infrastructure issues',
    },
    {
      id: 'retry',
      description: 'Retry with exponential backoff',
      automatable: true,
      priority: 2,
      estimatedImpact: 'Handles transient network issues',
    },
  ],
  'CAPTCHA_REQUIRED': [
    {
      id: 'manual-intervention',
      description: 'Manual browser session required to solve captcha',
      automatable: false,
      priority: 1,
      estimatedImpact: 'Web scraping will be blocked until captcha is solved',
    },
    {
      id: 'rotate-proxy',
      description: 'Rotate to a different proxy or IP',
      automatable: true,
      priority: 2,
      estimatedImpact: 'May avoid captcha with new identity',
    },
  ],
  'SESSION_EXPIRED': [
    {
      id: 'refresh-session',
      description: 'Refresh browser session cookies',
      automatable: true,
      priority: 1,
      estimatedImpact: 'Restores session if credentials are still valid',
    },
    {
      id: 'manual-login',
      description: 'Perform manual login to refresh session',
      automatable: false,
      priority: 2,
      estimatedImpact: 'Required if automated refresh fails',
    },
  ],
};

/**
 * Severity calculation based on error characteristics
 */
function calculateSeverity(
  errorCode: string,
  occurrenceCount: number,
  consecutiveErrors: number,
  impactPercent: number
): IncidentSeverity {
  // Outage conditions
  if (impactPercent >= 100 || consecutiveErrors >= 10) {
    return 'outage';
  }

  // Critical conditions
  if (
    errorCode === 'QUOTA_EXCEEDED' ||
    errorCode === 'AUTH_FAILED' ||
    impactPercent >= 50 ||
    consecutiveErrors >= 5
  ) {
    return 'critical';
  }

  // Warning conditions
  if (
    occurrenceCount >= 3 ||
    consecutiveErrors >= 2 ||
    impactPercent >= 20
  ) {
    return 'warning';
  }

  return 'info';
}

/**
 * Generate incident ID
 */
function generateIncidentId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `INC-${timestamp}-${random}`.toUpperCase();
}

/**
 * Operator Alerting Service
 */
export class OperatorAlertingService {
  private incidents: Map<string, Incident> = new Map();
  private listeners: AlertListener[] = [];
  private notificationConfigs: NotificationConfig[] = [];

  /** Active incidents keyed by surface+error for deduplication */
  private activeIncidentKeys: Map<string, string> = new Map();

  constructor() {}

  /**
   * Report an error and create/update incident
   */
  reportError(
    surfaceId: string,
    errorCode: string,
    errorMessage: string,
    options: {
      adapterId?: string;
      consecutiveErrors?: number;
      affectedStudies?: string[];
      metadata?: Record<string, unknown>;
    } = {}
  ): Incident {
    const incidentKey = `${surfaceId}:${errorCode}`;
    const existingIncidentId = this.activeIncidentKeys.get(incidentKey);

    if (existingIncidentId) {
      // Update existing incident
      const incident = this.incidents.get(existingIncidentId)!;
      incident.lastOccurredAt = new Date();
      incident.occurrenceCount++;
      incident.errorMessage = errorMessage; // Update with latest message

      // Re-calculate severity
      const newSeverity = calculateSeverity(
        errorCode,
        incident.occurrenceCount,
        options.consecutiveErrors ?? incident.occurrenceCount,
        incident.impact.capacityImpactPercent
      );

      // Check for escalation
      const severityOrder: IncidentSeverity[] = ['info', 'warning', 'critical', 'outage'];
      if (severityOrder.indexOf(newSeverity) > severityOrder.indexOf(incident.severity)) {
        incident.severity = newSeverity;
        this.notifyListeners(incident, 'escalated');
      } else {
        this.notifyListeners(incident, 'updated');
      }

      // Add affected studies
      if (options.affectedStudies) {
        for (const studyId of options.affectedStudies) {
          if (!incident.impact.affectedStudies.includes(studyId)) {
            incident.impact.affectedStudies.push(studyId);
          }
        }
      }

      return incident;
    }

    // Create new incident
    const impact = this.assessImpact(surfaceId, options.affectedStudies ?? []);
    const severity = calculateSeverity(
      errorCode,
      1,
      options.consecutiveErrors ?? 1,
      impact.capacityImpactPercent
    );

    const incident: Incident = {
      id: generateIncidentId(),
      surfaceId,
      adapterId: options.adapterId,
      title: this.generateIncidentTitle(surfaceId, errorCode),
      description: errorMessage,
      severity,
      status: 'active',
      errorCode,
      errorMessage,
      firstOccurredAt: new Date(),
      lastOccurredAt: new Date(),
      occurrenceCount: 1,
      impact,
      suggestedActions: ERROR_REMEDIATIONS[errorCode] ?? [],
      metadata: options.metadata,
    };

    this.incidents.set(incident.id, incident);
    this.activeIncidentKeys.set(incidentKey, incident.id);

    this.notifyListeners(incident, 'new');

    return incident;
  }

  /**
   * Acknowledge an incident
   */
  acknowledgeIncident(incidentId: string, acknowledgedBy: string): Incident | null {
    const incident = this.incidents.get(incidentId);
    if (!incident) return null;

    incident.status = 'acknowledged';
    incident.acknowledgedBy = acknowledgedBy;
    incident.acknowledgedAt = new Date();

    this.notifyListeners(incident, 'updated');

    return incident;
  }

  /**
   * Mark incident as investigating
   */
  investigateIncident(incidentId: string): Incident | null {
    const incident = this.incidents.get(incidentId);
    if (!incident) return null;

    incident.status = 'investigating';

    this.notifyListeners(incident, 'updated');

    return incident;
  }

  /**
   * Resolve an incident
   */
  resolveIncident(incidentId: string, resolutionNotes?: string): Incident | null {
    const incident = this.incidents.get(incidentId);
    if (!incident) return null;

    incident.status = 'resolved';
    incident.resolvedAt = new Date();
    incident.resolutionNotes = resolutionNotes;

    // Remove from active keys
    const incidentKey = `${incident.surfaceId}:${incident.errorCode}`;
    this.activeIncidentKeys.delete(incidentKey);

    this.notifyListeners(incident, 'resolved');

    return incident;
  }

  /**
   * Get all active incidents
   */
  getActiveIncidents(): Incident[] {
    return Array.from(this.incidents.values())
      .filter(i => i.status !== 'resolved')
      .sort((a, b) => {
        // Sort by severity (outage first), then by last occurrence
        const severityOrder: IncidentSeverity[] = ['info', 'warning', 'critical', 'outage'];
        const severityDiff = severityOrder.indexOf(b.severity) - severityOrder.indexOf(a.severity);
        if (severityDiff !== 0) return severityDiff;
        return b.lastOccurredAt.getTime() - a.lastOccurredAt.getTime();
      });
  }

  /**
   * Get incident by ID
   */
  getIncident(incidentId: string): Incident | null {
    return this.incidents.get(incidentId) ?? null;
  }

  /**
   * Get incidents by surface
   */
  getIncidentsBySurface(surfaceId: string): Incident[] {
    return Array.from(this.incidents.values())
      .filter(i => i.surfaceId === surfaceId)
      .sort((a, b) => b.lastOccurredAt.getTime() - a.lastOccurredAt.getTime());
  }

  /**
   * Get incidents by severity
   */
  getIncidentsBySeverity(severity: IncidentSeverity): Incident[] {
    return Array.from(this.incidents.values())
      .filter(i => i.severity === severity && i.status !== 'resolved')
      .sort((a, b) => b.lastOccurredAt.getTime() - a.lastOccurredAt.getTime());
  }

  /**
   * Add an alert listener
   */
  onAlert(listener: AlertListener): void {
    this.listeners.push(listener);
  }

  /**
   * Remove an alert listener
   */
  offAlert(listener: AlertListener): void {
    const index = this.listeners.indexOf(listener);
    if (index >= 0) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Configure notification channel
   */
  configureNotification(config: NotificationConfig): void {
    const existing = this.notificationConfigs.findIndex(
      c => c.channel === config.channel
    );
    if (existing >= 0) {
      this.notificationConfigs[existing] = config;
    } else {
      this.notificationConfigs.push(config);
    }
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    total: number;
    active: number;
    acknowledged: number;
    investigating: number;
    resolved: number;
    bySeverity: Record<IncidentSeverity, number>;
    bySurface: Record<string, number>;
  } {
    const incidents = Array.from(this.incidents.values());

    const bySeverity: Record<IncidentSeverity, number> = {
      info: 0,
      warning: 0,
      critical: 0,
      outage: 0,
    };

    const bySurface: Record<string, number> = {};
    let active = 0;
    let acknowledged = 0;
    let investigating = 0;
    let resolved = 0;

    for (const incident of incidents) {
      bySeverity[incident.severity]++;
      bySurface[incident.surfaceId] = (bySurface[incident.surfaceId] ?? 0) + 1;

      switch (incident.status) {
        case 'active':
          active++;
          break;
        case 'acknowledged':
          acknowledged++;
          break;
        case 'investigating':
          investigating++;
          break;
        case 'resolved':
          resolved++;
          break;
      }
    }

    return {
      total: incidents.length,
      active,
      acknowledged,
      investigating,
      resolved,
      bySeverity,
      bySurface,
    };
  }

  /**
   * Generate incident title
   */
  private generateIncidentTitle(surfaceId: string, errorCode: string): string {
    const errorTitles: Record<string, string> = {
      'RATE_LIMITED': 'Rate Limit Exceeded',
      'QUOTA_EXCEEDED': 'API Quota Exhausted',
      'AUTH_FAILED': 'Authentication Failed',
      'SERVICE_UNAVAILABLE': 'Service Unavailable',
      'NETWORK_ERROR': 'Network Error',
      'TIMEOUT': 'Request Timeout',
      'CAPTCHA_REQUIRED': 'Captcha Required',
      'SESSION_EXPIRED': 'Session Expired',
      'CONTENT_BLOCKED': 'Content Blocked',
      'INVALID_RESPONSE': 'Invalid Response',
    };

    const title = errorTitles[errorCode] ?? 'Unknown Error';
    return `${surfaceId}: ${title}`;
  }

  /**
   * Assess impact of an incident
   */
  private assessImpact(surfaceId: string, affectedStudies: string[]): ImpactAssessment {
    // Basic impact assessment - would be enhanced with real system metrics
    return {
      queriesBlocked: 0,
      costImpactPerHour: 0,
      affectedStudies,
      affectedSurfaces: [surfaceId],
      capacityImpactPercent: affectedStudies.length > 0 ? 20 : 10,
      userImpactDescription: `Queries to ${surfaceId} may fail or be delayed`,
    };
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(incident: Incident, type: 'new' | 'updated' | 'escalated' | 'resolved'): void {
    for (const listener of this.listeners) {
      try {
        listener(incident, type);
      } catch (error) {
        console.error('Error in alert listener:', error);
      }
    }
  }
}

/**
 * Create an operator alerting service
 */
export function createOperatorAlertingService(): OperatorAlertingService {
  return new OperatorAlertingService();
}
