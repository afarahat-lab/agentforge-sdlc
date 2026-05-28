import React, { useState, useEffect } from 'react';
import { useDashboardApi } from '../hooks/useApi';
import { useLiveEvent } from '../hooks/useLiveEvents';
import { SignalBadge } from '../components/shared/StatusBadge';
import { PageHeader, Card, EmptyState, LoadingSpinner, Button } from '../components/shared/PageHeader';
import type { Alert } from '../types';

export function Alerts() {
  const api = useDashboardApi();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      const res = await api.listAlerts({ acknowledged: false });
      setAlerts(res.alerts ?? []);
    } catch { /* */ } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);
  useLiveEvent('alert.created', () => void load());
  useLiveEvent('alert.acknowledged', () => void load());

  const handleAcknowledge = async (alert: Alert, decision: 'resume' | 'abort') => {
    if (!notes.trim() && alert.requiredAction === 'acknowledge-breach') {
      alert_fn('Notes are required for GOLDEN_PRINCIPLE_BREACH acknowledgements.');
      return;
    }
    setSubmitting(true);
    try {
      await api.submitIntervention({
        alertId: alert.id,
        correlationId: alert.correlationId,
        type: alert.requiredAction,
        payload: { type: alert.requiredAction, decision, notes } as never,
      });
      setExpanded(null);
      setNotes('');
      await load();
    } finally { setSubmitting(false); }
  };

  const handleApprove = async (alert: Alert) => {
    setSubmitting(true);
    try {
      await api.submitIntervention({
        alertId: alert.id,
        correlationId: alert.correlationId,
        type: 'approve-promotion',
        payload: { type: 'approve-promotion', environment: String((alert.context as Record<string, unknown>)['environment'] ?? 'production') } as never,
      });
      await load();
    } finally { setSubmitting(false); }
  };

  if (loading) return <LoadingSpinner />;

  const alert_fn = window.alert;

  const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...alerts].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));

  return (
    <div>
      <PageHeader
        title="Alerts"
        subtitle={sorted.length === 0 ? 'platform running autonomously' : `${sorted.length} requiring attention`}
      />
      <div style={{ padding: '20px 28px' }}>
        {sorted.length === 0 ? (
          <EmptyState
            message="No alerts — platform running autonomously"
            hint="This is the ideal state ✓"
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sorted.map(alert => {
              const isExpanded = expanded === alert.id;
              const isBreach = alert.type === 'GOLDEN_PRINCIPLE_BREACH';

              return (
                <Card
                  key={alert.id}
                  style={{ borderColor: isBreach ? 'var(--red)' : alert.severity === 'high' ? 'var(--amber)' : undefined }}
                >
                  {/* Header */}
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', cursor: 'pointer' }}
                    onClick={() => setExpanded(isExpanded ? null : alert.id)}
                  >
                    {isBreach && (
                      <span style={{
                        background: 'var(--red)',
                        color: '#fff',
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '3px',
                        fontFamily: 'var(--font-mono)',
                        flexShrink: 0,
                      }}>
                        BREACH
                      </span>
                    )}
                    <SignalBadge type={alert.type} severity={alert.severity} />
                    <p style={{ flex: 1, fontSize: '13px', color: 'var(--text-primary)' }}>{alert.title}</p>
                    <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                      {new Date(alert.createdAt).toLocaleTimeString()}
                    </span>
                    <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px', background: 'var(--bg-base)' }}>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                        {alert.description}
                      </p>

                      {/* Breach acknowledgement */}
                      {alert.requiredAction === 'acknowledge-breach' && (
                        <div style={{ marginBottom: '12px' }}>
                          <p style={{ fontSize: '11px', color: 'var(--red)', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>
                            Notes required (mandatory for breach acknowledgement)
                          </p>
                          <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Explain your decision..."
                            style={notesStyle}
                          />
                          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                            <Button variant="danger" onClick={() => handleAcknowledge(alert, 'abort')} disabled={submitting}>
                              abort cycle
                            </Button>
                            <Button onClick={() => handleAcknowledge(alert, 'resume')} disabled={submitting || !notes.trim()}>
                              resume cycle
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Promotion approval */}
                      {alert.requiredAction === 'approve-promotion' && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <Button variant="primary" onClick={() => handleApprove(alert)} disabled={submitting}>
                            approve promotion
                          </Button>
                          <Button variant="danger" disabled={submitting}>
                            reject
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const notesStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '70px',
  background: 'var(--bg-raised)',
  border: '1px solid var(--border)',
  borderRadius: '5px',
  padding: '8px',
  fontSize: '12px',
  color: 'var(--text-primary)',
  outline: 'none',
  resize: 'vertical',
};
