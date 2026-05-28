import React, { useState, useEffect } from 'react';
import { useDashboardApi } from '../hooks/useApi';
import { useLiveEvent } from '../hooks/useLiveEvents';
import { StatusBadge, SignalBadge } from '../components/shared/StatusBadge';
import { PageHeader, Card, EmptyState, LoadingSpinner } from '../components/shared/PageHeader';

interface GateEntry {
  correlationId: string;
  verdict: 'pass' | 'fail' | 'escalate';
  signals: Array<{ id: string; type: string; severity: string; message: string; sourceAgent: string }>;
  durationMs: number;
  completedAt: string;
}

export function QualityGate() {
  const api = useDashboardApi();
  const [gates, setGates] = useState<GateEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('');

  const load = async () => {
    try {
      // Fetch recent intents and show their gate results
      const projectId = localStorage.getItem('gestalt_project') ?? 'default';
      const res = await api.listIntents({ projectId, limit: 30 });
      // Build gate entries from intents that have been through the gate
      const gateIntents = (res.data ?? []).filter(i =>
        ['approved', 'deploying', 'deployed', 'failed', 'escalated'].includes(i.status)
      );
      // Fetch signal details for each
      const entries = await Promise.all(
        gateIntents.slice(0, 10).map(async (intent) => {
          const detail = await api.getIntent(intent.id).catch(() => null);
          const signals = detail?.data.signals ?? [];
          const hasEscalate = signals.some(s => s.type === 'GOLDEN_PRINCIPLE_BREACH');
          const hasFail = signals.some(s => ['CONSTRAINT_VIOLATION', 'TEST_FAILURE', 'LINT_FAILURE'].includes(s.type));
          const verdict: GateEntry['verdict'] = hasEscalate ? 'escalate' : hasFail ? 'fail' : 'pass';
          return {
            correlationId: intent.correlationId,
            verdict,
            signals: signals.map(s => ({
              id: s.id, type: s.type, severity: s.severity,
              message: s.message, sourceAgent: s.sourceAgent,
            })),
            durationMs: 0,
            completedAt: intent.updatedAt,
          } as GateEntry;
        })
      );
      setGates(entries);
    } catch { /* */ } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);
  useLiveEvent('gate.completed', () => void load());

  const filtered = filter ? gates.filter(g => g.verdict === filter) : gates;

  if (loading) return <LoadingSpinner />;

  const counts = { pass: 0, fail: 0, escalate: 0 };
  gates.forEach(g => counts[g.verdict]++);

  return (
    <div>
      <PageHeader
        title="Quality gate"
        subtitle={`${gates.length} recent — ${counts.pass} pass · ${counts.fail} fail · ${counts.escalate} escalate`}
        actions={
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)',
              borderRadius: '5px', padding: '5px 8px', fontSize: '12px',
              color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font-mono)' }}
          >
            <option value="">all verdicts</option>
            <option value="pass">pass</option>
            <option value="fail">fail</option>
            <option value="escalate">escalate</option>
          </select>
        }
      />

      <div style={{ padding: '20px 28px' }}>
        {filtered.length === 0 ? (
          <EmptyState message="No gate results yet" hint="Submit an intent to see results here" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {filtered.map(gate => (
              <Card
                key={gate.correlationId}
                style={{
                  borderColor: gate.verdict === 'pass' ? 'var(--green-dim)'
                    : gate.verdict === 'escalate' ? 'var(--red)' : undefined,
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '12px 16px', cursor: gate.signals.length ? 'pointer' : 'default' }}
                  onClick={() => gate.signals.length && setExpanded(
                    expanded === gate.correlationId ? null : gate.correlationId
                  )}
                >
                  <StatusBadge status={gate.verdict} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px',
                    color: 'var(--text-dim)', flex: 1 }}>
                    {gate.correlationId.slice(0, 8)}
                  </span>
                  {gate.signals.length > 0 && (
                    <span style={{ fontSize: '11px', color: 'var(--text-dim)',
                      fontFamily: 'var(--font-mono)' }}>
                      {gate.signals.length} signal{gate.signals.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)',
                    fontFamily: 'var(--font-mono)' }}>
                    {new Date(gate.completedAt).toLocaleTimeString()}
                  </span>
                  {gate.signals.length > 0 && (
                    <span style={{ color: 'var(--text-dim)', fontSize: '11px' }}>
                      {expanded === gate.correlationId ? '▲' : '▼'}
                    </span>
                  )}
                </div>

                {expanded === gate.correlationId && gate.signals.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--border)' }}>
                    {gate.signals.map(sig => (
                      <div key={sig.id} style={{ padding: '10px 16px',
                        borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center',
                          marginBottom: '4px' }}>
                          <SignalBadge type={sig.type} severity={sig.severity} />
                          <span style={{ fontSize: '11px', color: 'var(--text-dim)',
                            fontFamily: 'var(--font-mono)' }}>{sig.sourceAgent}</span>
                        </div>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {sig.message}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
