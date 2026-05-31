import React, { useState, useEffect, useCallback } from 'react';
import { useDashboardApi } from '../hooks/useApi';
import { useLiveEvent } from '../hooks/useLiveEvents';
import { useProject } from '../context/ProjectContext';
import { PageHeader, Card, EmptyState, LoadingSpinner, Button } from '../components/shared/PageHeader';
import type { MaintenanceRunSummary } from '../types';

const AGENT_SCHEDULES: Record<string, string> = {
  'drift-agent':     'daily 02:00 UTC',
  'alignment-agent': 'daily 03:00 UTC',
  'gc-agent':        'weekly Fri 04:00 UTC',
  'evaluation-agent':'continuous',
};

const ERROR_VISIBLE_MS = 5000;
const RELOAD_AFTER_TRIGGER_MS = 1000;

export function Maintenance() {
  const api = useDashboardApi();
  const { currentProjectId } = useProject();
  const [runs, setRuns] = useState<MaintenanceRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);
  // Per-agent error state. Keyed by agentRole so triggering one agent
  // while another is in error doesn't clear the other's message.
  // Auto-cleared after ERROR_VISIBLE_MS so a stale failure doesn't
  // linger forever.
  const [triggerErrors, setTriggerErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!currentProjectId) { setRuns([]); setLoading(false); return; }
    try {
      // Server returns { data: MaintenanceRunRecord[] } — the previous
      // `res.runs` read produced undefined and the Recent runs list
      // was always empty.
      const res = await api.listMaintenanceRuns({ projectId: currentProjectId, limit: 20 });
      setRuns(res.data ?? []);
    } catch { /* */ } finally { setLoading(false); }
  }, [api, currentProjectId]);

  useEffect(() => { void load(); }, [load]);
  useLiveEvent('maintenance.run-completed', () => void load());

  const handleTrigger = async (agentRole: string) => {
    if (!currentProjectId) return;
    setTriggering(agentRole);
    // Clear any prior error for this agent so the retry-after-failure
    // case doesn't briefly show stale red text.
    setTriggerErrors((cur) => {
      const { [agentRole]: _drop, ...rest } = cur;
      return rest;
    });
    try {
      await api.triggerMaintenanceAgent(agentRole, currentProjectId);
      // Runner is in-process — the row exists by the time the HTTP
      // response lands. Brief reload still helps cover the SSE event
      // path in case the in-process bus is slow.
      setTimeout(() => void load(), RELOAD_AFTER_TRIGGER_MS);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setTriggerErrors((cur) => ({ ...cur, [agentRole]: message }));
      setTimeout(() => {
        setTriggerErrors((cur) => {
          if (cur[agentRole] !== message) return cur;  // user retried, don't blow away their new error
          const { [agentRole]: _drop, ...rest } = cur;
          return rest;
        });
      }, ERROR_VISIBLE_MS);
    } finally {
      setTriggering(null);
    }
  };

  const STATUS_COLOR: Record<string, string> = {
    'completed':     'var(--green)',
    'nothing-to-do': 'var(--text-dim)',
    'failed':        'var(--red)',
  };

  if (loading) return <LoadingSpinner />;
  if (!currentProjectId) {
    return (
      <div>
        <PageHeader title="Maintenance" subtitle="no project selected" />
        <div style={{ padding: '20px 28px' }}>
          <EmptyState
            message="No projects yet"
            hint={'Run `gestalt init` on the CLI to register a project.'}
          />
        </div>
      </div>
    );
  }

  const agents = ['drift-agent', 'alignment-agent', 'gc-agent', 'evaluation-agent'];

  return (
    <div>
      <PageHeader title="Maintenance" subtitle="background agents" />

      <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Scheduled agents */}
        <section>
          <p style={sectionLabel}>Scheduled agents</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {agents.map(agent => {
              const errorMsg = triggerErrors[agent];
              return (
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
                  {errorMsg && (
                    <div style={errorBox}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px',
                        color: 'var(--red)' }}>
                        ✗ Failed to trigger: {errorMsg}
                      </span>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </section>

        {/* Run history */}
        <section>
          <p style={sectionLabel}>Recent runs</p>
          {runs.length === 0 ? (
            <EmptyState message="No maintenance runs yet" hint="Agents run on their configured schedule or via 'run now' above" />
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

const errorBox: React.CSSProperties = {
  borderTop: '1px solid var(--border)',
  padding: '8px 16px',
  background: 'rgba(220, 38, 38, 0.08)',
};
