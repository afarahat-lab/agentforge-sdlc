import { useState, useEffect } from 'react';
import { useDashboardApi } from '../hooks/useApi';
import { useLiveEvent } from '../hooks/useLiveEvents';
import { PageHeader, Card, EmptyState } from '../components/shared/PageHeader';
import type { AgentExecutionSummary } from '../types';

export function ActiveAgents() {
  const api = useDashboardApi();
  const [agents, setAgents] = useState<AgentExecutionSummary[]>([]);

  const load = async () => {
    try {
      const res = await api.getActiveAgents();
      setAgents(res.data ?? []);
    } catch { /* */ }
  };

  useEffect(() => { void load(); }, []);
  useLiveEvent('agent.started', () => void load());
  useLiveEvent('agent.completed', () => void load());

  // Auto-refresh every 5s
  useEffect(() => {
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, []);

  const ROLE_COLOR: Record<string, string> = {
    'intent-agent':     'var(--blue)',
    'design-agent':     'var(--purple)',
    'code-agent':       'var(--accent)',
    'test-agent':       'var(--amber)',
    'context-agent':    'var(--blue)',
    'review-agent':     'var(--amber)',
    'security-agent':   'var(--red)',
    'pipeline-agent':   'var(--blue)',
  };

  return (
    <div>
      <PageHeader
        title="Active agents"
        subtitle={agents.length > 0 ? `${agents.length} running` : 'idle'}
      />
      <div style={{ padding: '20px 28px' }}>
        {agents.length === 0 ? (
          <EmptyState message="No agents running" hint="platform is idle" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {agents.map(agent => {
              const elapsed = agent.startedAt
                ? Math.round((Date.now() - new Date(agent.startedAt).getTime()) / 1000)
                : null;
              const color = ROLE_COLOR[agent.agentRole] ?? 'var(--text-secondary)';

              return (
                <Card key={agent.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 16px' }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: '16px',
                      color, animation: 'pulse-dot 1.5s infinite',
                    }}>◎</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '13px',
                        color: 'var(--text-primary)' }}>{agent.agentRole}</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-dim)',
                        fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                        {agent.correlationId?.slice(0, 8) ?? '—'}
                      </p>
                    </div>
                    {elapsed !== null && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px',
                        color: elapsed > 60 ? 'var(--amber)' : 'var(--text-dim)' }}>
                        {elapsed}s
                      </span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
