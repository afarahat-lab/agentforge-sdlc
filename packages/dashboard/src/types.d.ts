/**
 * @gestalt/dashboard
 * All types for the oversight dashboard.
 */
export type IntentStatus = 'pending' | 'generating' | 'in-review' | 'approved' | 'deploying' | 'deployed' | 'failed' | 'escalated' | 'waiting-for-clarification';
export interface IntentSummary {
    id: string;
    correlationId: string;
    text: string;
    status: IntentStatus;
    source: 'human' | 'maintenance-agent';
    priority: 'critical' | 'high' | 'normal' | 'low';
    createdAt: string;
    updatedAt: string;
    agentCount: number;
    signalCount: number;
}
export interface AgentExecutionSummary {
    id: string;
    agentRole: string;
    status: 'queued' | 'running' | 'completed' | 'skipped' | 'failed';
    durationMs: number | null;
    signalCount: number;
    startedAt: string | null;
    completedAt: string | null;
}
export interface IntentDetail extends IntentSummary {
    agentExecutions: AgentExecutionSummary[];
    signals: SignalSummary[];
    artifacts: ArtifactSummary[];
    gateResult: GateResultSummary | null;
    deploymentStatus: DeploymentStatus | null;
}
export interface SignalSummary {
    id: string;
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    sourceAgent: string;
    message: string;
    autoResolvable: boolean;
    resolvedAt: string | null;
    createdAt: string;
}
export interface GateResultSummary {
    verdict: 'pass' | 'fail' | 'escalate';
    signalCount: number;
    durationMs: number;
    completedAt: string;
}
export interface ArtifactSummary {
    id: string;
    type: string;
    path: string;
    producedBy: string;
    createdAt: string;
}
export interface DeploymentStatus {
    currentEnvironment: string;
    pendingPromotion: PendingPromotion | null;
    history: PromotionHistoryItem[];
}
export interface PendingPromotion {
    id: string;
    to: string;
    requiresApproval: boolean;
    triggeredAt: string;
}
export interface PromotionHistoryItem {
    id: string;
    from: string | null;
    to: string;
    status: string;
    triggeredBy: string;
    completedAt: string | null;
}
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';
export type AlertAction = 'approve-promotion' | 'reject-promotion' | 'provide-clarification' | 'acknowledge-breach';
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
export type InterventionType = 'approve-promotion' | 'reject-promotion' | 'provide-clarification' | 'acknowledge-breach';
export interface InterventionRequest {
    alertId: string;
    correlationId: string;
    type: InterventionType;
    payload: InterventionPayload;
}
export type InterventionPayload = {
    type: 'approve-promotion';
    environment: string;
} | {
    type: 'reject-promotion';
    environment: string;
    reason: string;
} | {
    type: 'provide-clarification';
    clarification: string;
    ambiguityId: string;
} | {
    type: 'acknowledge-breach';
    decision: 'resume' | 'abort';
    notes: string;
};
export interface InterventionRecord {
    id: string;
    alertId: string;
    correlationId: string;
    type: InterventionType;
    performedBy: string;
    payload: InterventionPayload;
    createdAt: string;
}
export interface MaintenanceRunSummary {
    id: string;
    agentRole: string;
    status: 'completed' | 'failed' | 'nothing-to-do';
    intentsQueued: number;
    directFixes: number;
    durationMs: number;
    runAt: string;
}
export type LiveEventType = 'intent.created' | 'intent.status-changed' | 'agent.started' | 'agent.completed' | 'signal.emitted' | 'gate.completed' | 'deployment.updated' | 'alert.created' | 'maintenance.run-completed';
export interface LiveEvent {
    type: LiveEventType;
    correlationId: string;
    payload: unknown;
    timestamp: string;
}
export type UserRole = 'admin' | 'operator' | 'viewer';
export interface DashboardUser {
    id: string;
    email: string;
    role: UserRole;
}
//# sourceMappingURL=types.d.ts.map