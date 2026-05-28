import React, { useState, useEffect } from 'react';
import { useDashboardApi } from '../hooks/useApi';
import { useLiveEvent } from '../hooks/useLiveEvents';
import { PageHeader, Card, EmptyState, LoadingSpinner, Button } from '../components/shared/PageHeader';
import type { MaintenanceRunSummary } from '../types';

const AGENT_SCHEDULES: Record<string, string> = {
  'drift-agent':     'daily 02:00 UTC',
  'alignment-agent': 'daily 03:00 UTC',
  'gc-agent':        'weekly Fri 04:00 UTC',
  'evaluation-agent':'continuous',
};

export function Maintenance() {
  const api = useDashboardApi();
  const [runs, setRuns] = useState<MaintenanceRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await api.listMaintenanceRuns({ limit: 20 });
      setRuns(res.runs ?? []);
    } catch { /* */ } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);
  useLiveEvent('maintenance.run-completed', () => void load());

  const handleTrigger = async (agentRole: string) => {
    setTriggering(agentRole);
    try {
      await api.triggerMaintenanceAgent(agentRole);
      setTimeout(() => void load(), 2000);
    } finally { setTriggering(null); }
  };

  const STATUS_COLOR: Record<string, string> = {
    'completed':     'var(--green)',
    'nothing-to-do': 'var(--text-dim)',
    'failed':        'var(--red)',
  };

  if (loading) return <LoadingSpinner />;

  const agents = ['drift-agent', 'alignment-agent', 'gc-agent', 'evaluation-agent'];

  return (
    <div>
      <PageHeader title="Maintenance" subtitle="background agents" />

      <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Scheduled agents */}
        <section>
          <p style={sectionLabel}>Scheduled agents</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {agents.map(agent => (
              <Card key={agent}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 16px' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '13px',
                      color: 'var(--text-primary)' }}>{agent}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text-dim)',
                      fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                      {AGENT_SCHEDULES[agent] ?? '—'}
                    </p>
                  </div>
                  <Button
                    onClick={() => { void handleTrigger(agent); }}
                    disabled={triggering === agent}
                  >
                    {triggering === agent ? 'triggering...' : 'run now'}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* Run history */}
        <section>
          <p style={sectionLabel}>Recent runs</p>
          {runs.length === 0 ? (
            <EmptyState message="No maintenance runs yet" hint="Agents run on their configured schedule" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {runs.map((run, i) => (
                <Card key={i}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '10px 16px' }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: '12px',
                      color: STATUS_COLOR[run.status] ?? 'var(--text-dim)',
                    }}>
                      {run.status === 'completed' ? '●'
                        : run.status === 'failed' ? '✗' : '–'}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px',
                      color: 'var(--text-secondary)', flex: 1 }}>{run.agentRole}</span>
                    {run.intentsQueued > 0 && (
                      <span style={{ fontSize: '11px', color: 'var(--amber)',
                        fontFamily: 'var(--font-mono)' }}>
                        {run.intentsQueued} intent{run.intentsQueued !== 1 ? 's' : ''} queued
                      </span>
                    )}
                    {run.directFixes > 0 && (
                      <span style={{ fontSize: '11px', color: 'var(--green)',
                        fontFamily: 'var(--font-mono)' }}>
                        {run.directFixes} fix{run.directFixes !== 1 ? 'es' : ''} applied
                      </span>
                    )}
                    <span style={{ fontSize: '11px', color: 'var(--text-dim)',
                      fontFamily: 'var(--font-mono)' }}>
                      {new Date(run.runAt).toLocaleTimeString()}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const sectionLabel: React.CSSProperties = {
  fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px',
};
