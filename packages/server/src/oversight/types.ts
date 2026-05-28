/**
 * Oversight types — alerts, interventions, live events.
 * These mirror the dashboard's public types so the server does not import from the dashboard package.
 */

// ─── Alerts ───────────────────────────────────────────────────────────────────

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';

export type AlertAction =
  | 'approve-promotion'
  | 'reject-promotion'
  | 'provide-clarification'
  | 'acknowledge-breach';

export interface Alert {
  id: string;
  correlationId: string;
  type: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  requiredAction: AlertAction;
  context: Record<string, unknown>;
  createdAt: string;
  acknowledgedAt: string | null;
}

// ─── Interventions ────────────────────────────────────────────────────────────

export type InterventionType =
  | 'approve-promotion'
  | 'reject-promotion'
  | 'provide-clarification'
  | 'acknowledge-breach';

export interface InterventionRequest {
  alertId: string;
  correlationId: string;
  type: InterventionType;
  payload: Record<string, unknown>;
}
