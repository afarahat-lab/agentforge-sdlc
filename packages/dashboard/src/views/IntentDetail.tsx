import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDashboardApi } from '../hooks/useApi';
import { useLiveEvent } from '../hooks/useLiveEvents';
import { StatusBadge, SignalBadge } from '../components/shared/StatusBadge';
import { PageHeader, Card, LoadingSpinner, Button } from '../components/shared/PageHeader';
import type { IntentDetail as IntentDetailType } from '../types';

export function IntentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const api = useDashboardApi();
  const [intent, setIntent] = useState<IntentDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [clarification, setClarification] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    if (!id) return;
    try {
      const res = await api.getIntent(id);
      setIntent(res.data);
    } catch { /* */ } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [id]);
  useLiveEvent('agent.completed', () => void load());
  useLiveEvent('gate.completed', () => void load());
  useLiveEvent('intent.status-changed', () => void load());

  const handleClarify = async () => {
    if (!intent || !clarification.trim()) return;
    setSubmitting(true);
    try {
      await api.clarifyIntent(intent.id, { clarification, ambiguityId: 'amb-001' });
      setClarification('');
      await load();
    } finally { setSubmitting(false); }
  };

  if (loading) return <LoadingSpinner />;
  if (!intent) return <div style={{ padding: '28px', color: 'var(--text-dim)' }}>Intent not found</div>;

  const needsClarification = intent.status === 'waiting-for-clarification';

  return (
    <div>
      <PageHeader
        title="Intent detail"
        subtitle={intent.correlationId.slice(0, 8)}
        actions={
          <Button onClick={() => navigate(-1)}>← back</Button>
        }
      />

      <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Intent summary */}
        <Card>
          <div style={{ padding: '16px' }}>
            <p style={{ fontSize: '14px', color: 'var(--text-primary)', marginBottom: '12px' }}>
              {intent.text}
            </p>
            <div style={metaRow}>
              <StatusBadge status={intent.status} />
              <span style={metaVal}>{intent.priority}</span>
              <span style={metaVal}>{new Date(intent.createdAt).toLocaleString()}</span>
            </div>
          </div>
        </Card>

        {/* Clarification input */}
        {needsClarification && (
          <Card style={{ borderColor: 'var(--amber)' }}>
            <div style={{ padding: '16px' }}>
              <p style={{ fontSize: '12px', color: 'var(--amber)', fontFamily: 'var(--font-mono)',
                marginBottom: '10px' }}>
                ? Intent is ambiguous — your clarification is needed to continue
              </p>
              <textarea
                value={clarification}
                onChange={e => setClarification(e.target.value)}
                placeholder="Provide clarification..."
                style={textareaStyle}
              />
              <Button
                variant="primary"
                onClick={() => { void handleClarify(); }}
                disabled={submitting || !clarification.trim()}
              >
                resume cycle
              </Button>
            </div>
          </Card>
        )}

        {/* Agent timeline */}
        {intent.agentExecutions?.length > 0 && (
          <Card>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <p style={sectionTitle}>Agent executions</p>
            </div>
            <div style={{ padding: '8px 0' }}>
              {intent.agentExecutions.map((exec) => (
                <div key={exec.id} style={execRow}>
                  <StatusBadge status={exec.status} size="sm" />
                  <span style={monoText}>{exec.agentRole}</span>
                  {exec.durationMs && (
                    <span style={{ ...monoText, marginLeft: 'auto', color: 'var(--text-dim)' }}>
                      {exec.durationMs}ms
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Signals */}
        {intent.signals?.length > 0 && (
          <Card>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <p style={sectionTitle}>Signals ({intent.signals.length})</p>
            </div>
            <div style={{ padding: '8px 0' }}>
              {intent.signals.map((sig) => (
                <div key={sig.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                    <SignalBadge type={sig.type} severity={sig.severity} />
                    <span style={{ ...monoText, color: 'var(--text-dim)' }}>{sig.sourceAgent}</span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{sig.message}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Artifacts */}
        {intent.artifacts?.length > 0 && (
          <Card>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <p style={sectionTitle}>Artifacts ({intent.artifacts.length})</p>
            </div>
            <div style={{ padding: '8px 0' }}>
              {intent.artifacts.map((a) => (
                <div key={a.id} style={execRow}>
                  <span style={{ ...monoText, color: 'var(--text-dim)', fontSize: '10px',
                    background: 'var(--bg-subtle)', padding: '1px 5px', borderRadius: '3px' }}>
                    {a.type}
                  </span>
                  <span style={{ ...monoText, fontSize: '12px' }}>{a.path}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

const metaRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap',
};
const metaVal: React.CSSProperties = {
  fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)',
};
const sectionTitle: React.CSSProperties = {
  fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)',
  textTransform: 'uppercase', letterSpacing: '0.06em',
};
const execRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '10px',
  padding: '8px 16px', borderBottom: '1px solid var(--border)',
};
const monoText: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)',
};
const textareaStyle: React.CSSProperties = {
  width: '100%', minHeight: '60px', marginBottom: '10px',
  background: 'var(--bg-base)', border: '1px solid var(--border-strong)',
  borderRadius: '5px', padding: '8px', fontSize: '12px',
  color: 'var(--text-primary)', outline: 'none', resize: 'vertical',
  fontFamily: 'var(--font-mono)',
};
