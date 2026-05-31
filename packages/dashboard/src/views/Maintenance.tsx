import React, { useState, useEffect, useCallback } from 'react';
import { useDashboardApi } from '../hooks/useApi';
import { useLiveEvent } from '../hooks/useLiveEvents';
import { useProject } from '../context/ProjectContext';
import { PageHeader, Card, EmptyState, LoadingSpinner, Button } from '../components/shared/PageHeader';
import type { MaintenanceRunSummary, MaintenanceFinding } from '../types';

const AGENT_SCHEDULES: Record<string, string> = {
  'drift-agent':     'daily 02:00 UTC',
  'alignment-agent': 'daily 03:00 UTC',
  'gc-agent':        'weekly Fri 04:00 UTC',
  'evaluation-agent':'continuous',
};

const ERROR_VISIBLE_MS = 5000;
const RELOAD_AFTER_TRIGGER_MS = 1000;
const MAX_FILES_SHOWN = 3;

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
  // Accordion state — set of expanded run ids. All data already in
  // the runs array, so no lazy fetch is needed.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  const toggleExpanded = (runId: string) => {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });
  };

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
              {runs.map((run) => {
                const isExpanded = expanded.has(run.id);
                return (
                  <Card key={run.id}>
                    {/* Header row — always visible, clickable */}
                    <div
                      style={{ ...runRow, cursor: 'pointer' }}
                      onClick={() => toggleExpanded(run.id)}
                    >
                      <StatusGlyph status={run.status} />
                      <span style={{ ...monoText, color: 'var(--text-secondary)', flex: 1 }}>
                        {run.agentRole}
                      </span>
                      <RunStats run={run} />
                      <span style={{ fontSize: '11px', color: 'var(--text-dim)',
                        fontFamily: 'var(--font-mono)' }}>
                        {new Date(run.runAt).toLocaleTimeString()}
                      </span>
                      <span style={{ color: 'var(--text-dim)', fontSize: '11px', marginLeft: '4px' }}>
                        {isExpanded ? '▲' : '▼'}
                      </span>
                    </div>

                    {/* Expanded panel */}
                    {isExpanded && (
                      <div style={panelOuter}>
                        <RunDetailPanel run={run} />
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ─── Run summary stats (header row, always visible) ─────────────────────────

function RunStats({ run }: { run: MaintenanceRunSummary }) {
  const findingCount = run.findings?.length ?? 0;
  return (
    <>
      <span style={{
        fontSize: '11px', fontFamily: 'var(--font-mono)',
        color: findingCount > 0 ? 'var(--amber)' : 'var(--text-dim)',
      }}>
        {findingCount} finding{findingCount !== 1 ? 's' : ''}
      </span>
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
      {run.durationMs !== null && (
        <span style={{ fontSize: '11px', color: 'var(--text-dim)',
          fontFamily: 'var(--font-mono)' }}>
          {formatDuration(run.durationMs)}
        </span>
      )}
    </>
  );
}

function StatusGlyph({ status }: { status: MaintenanceRunSummary['status'] }) {
  const color =
    status === 'completed'   ? 'var(--green)' :
    status === 'failed'      ? 'var(--red)'   :
    status === 'running'     ? 'var(--blue)'  :
                               'var(--text-dim)';
  const glyph =
    status === 'completed'   ? '●' :
    status === 'failed'      ? '✗' :
    status === 'running'     ? '◎' :
                               '–';
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color }}>
      {glyph}
    </span>
  );
}

// ─── Expanded panel — run summary + findings ────────────────────────────────

function RunDetailPanel({ run }: { run: MaintenanceRunSummary }) {
  const findings = run.findings ?? [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px 16px' }}>
      <Section title="Run summary">
        <KV label="Agent">{run.agentRole}</KV>
        <KV label="Status"><StatusGlyph status={run.status} /> {run.status}</KV>
        {run.durationMs !== null && <KV label="Duration">{run.durationMs}ms</KV>}
        <KV label="Direct fixes">{run.directFixes}</KV>
        <KV label="Intents queued">{run.intentsQueued}</KV>
        <KV label="Started">{new Date(run.runAt).toLocaleTimeString()}</KV>
        {run.completedAt && (
          <KV label="Completed">{new Date(run.completedAt).toLocaleTimeString()}</KV>
        )}
      </Section>

      {findings.length === 0 ? (
        <Section title="No findings">
          <span style={panelMutedInline}>Agent ran cleanly — nothing to report</span>
        </Section>
      ) : (
        <Section title={`Findings (${findings.length})`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {findings.map((f, i) => <FindingCard key={i} finding={f} />)}
          </div>
        </Section>
      )}
    </div>
  );
}

function FindingCard({ finding }: { finding: MaintenanceFinding }) {
  const severityColor =
    finding.severity === 'high'   ? 'var(--red)'   :
    finding.severity === 'medium' ? 'var(--amber)' :
                                    'var(--text-dim)';
  const files = finding.affectedFiles ?? [];
  const shown = files.slice(0, MAX_FILES_SHOWN);
  const rest = files.length - shown.length;

  return (
    <div style={findingCard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: '10px',
          color: severityColor, textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}>
          ⚠ {finding.severity}
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: '11px',
          color: 'var(--text-primary)',
          background: 'var(--bg-subtle)',
          padding: '1px 6px', borderRadius: '3px',
        }}>
          {finding.type}
        </span>
      </div>

      {shown.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 6px 0' }}>
          {shown.map((f) => (
            <li key={f} style={{
              fontFamily: 'var(--font-mono)', fontSize: '11px',
              color: 'var(--text-dim)', padding: '1px 0',
            }}>
              {f}
            </li>
          ))}
          {rest > 0 && (
            <li style={{
              fontFamily: 'var(--font-mono)', fontSize: '11px',
              color: 'var(--text-dim)', padding: '1px 0', fontStyle: 'italic',
            }}>
              and {rest} more
            </li>
          )}
        </ul>
      )}

      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 4px 0' }}>
        {finding.description}
      </p>

      {finding.suggestedAction && (
        <p style={{
          fontSize: '12px', color: 'var(--text-dim)', margin: 0,
          fontStyle: 'italic',
        }}>
          → {finding.suggestedAction}
        </p>
      )}
    </div>
  );
}

// ─── Layout helpers (match IntentDetail's accordion idiom) ──────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={section}>
      <div style={sectionHeader}>
        <span style={sectionLabelInner}>{title}</span>
      </div>
      <div style={sectionBody}>{children}</div>
    </div>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '3px' }}>
      <span style={{ ...monoText, color: 'var(--text-dim)', width: '110px', fontSize: '11px' }}>{label}:</span>
      <span style={{ ...monoText, fontSize: '12px' }}>{children}</span>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const sectionLabel: React.CSSProperties = {
  fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px',
};

const errorBox: React.CSSProperties = {
  borderTop: '1px solid var(--border)',
  padding: '8px 16px',
  background: 'rgba(220, 38, 38, 0.08)',
};

const runRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px',
};

const monoText: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: '12px',
};

const panelOuter: React.CSSProperties = {
  background: 'var(--bg-base)', borderTop: '1px solid var(--border)',
};

const panelMutedInline: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-dim)',
};

const section: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: '5px', overflow: 'hidden',
};

const sectionHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '8px',
  padding: '8px 12px', borderBottom: '1px solid var(--border)',
  background: 'var(--bg-subtle)',
};

const sectionLabelInner: React.CSSProperties = {
  fontSize: '10px', fontFamily: 'var(--font-mono)',
  color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em',
};

const sectionBody: React.CSSProperties = {
  padding: '10px 12px',
};

const findingCard: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: '4px',
  padding: '10px 12px', background: 'var(--bg-base)',
};
