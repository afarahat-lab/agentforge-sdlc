import React, { useState, useEffect } from 'react';
import { useDashboardApi } from '../hooks/useApi';
import { useLiveEvent } from '../hooks/useLiveEvents';
import { StatusBadge } from '../components/shared/StatusBadge';
import { PageHeader, Card, EmptyState, LoadingSpinner, Button } from '../components/shared/PageHeader';
import type { IntentSummary } from '../types';

export function Deployments() {
  const api = useDashboardApi();
  const [deployed, setDeployed] = useState<IntentSummary[]>([]);
  const [deploying, setDeploying] = useState<IntentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const projectId = localStorage.getItem('gestalt_project') ?? 'default';
    try {
      const [deployedRes, deployingRes] = await Promise.all([
        api.listIntents({ projectId, status: 'deployed', limit: 20 }),
        api.listIntents({ projectId, status: 'deploying', limit: 5 }),
      ]);
      setDeployed(deployedRes.data ?? []);
      setDeploying(deployingRes.data ?? []);
    } catch { /* */ } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);
  useLiveEvent('deployment.updated', () => void load());
  useLiveEvent('intent.status-changed', () => void load());

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        title="Deployments"
        subtitle={`${deployed.length} deployed · ${deploying.length} in progress`}
      />

      <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* In progress */}
        {deploying.length > 0 && (
          <section>
            <p style={sectionLabel}>In progress</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {deploying.map(intent => (
                <Card key={intent.id} style={{ borderColor: 'var(--blue-dim)' }}>
                  <div style={rowStyle}>
                    <StatusBadge status="deploying" />
                    <span style={textStyle}>{intent.text.slice(0, 60)}</span>
                    <span style={monoStyle}>{intent.correlationId.slice(0, 8)}</span>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Deployment history */}
        <section>
          <p style={sectionLabel}>Deployed</p>
          {deployed.length === 0 ? (
            <EmptyState message="No deployments yet" hint="Intents move here after deploying" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {deployed.map(intent => (
                <Card key={intent.id}>
                  <div style={rowStyle}>
                    <StatusBadge status="deployed" />
                    <span style={textStyle}>{intent.text.slice(0, 60)}</span>
                    <span style={monoStyle}>
                      {new Date(intent.updatedAt).toLocaleDateString()}
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
const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
};
const textStyle: React.CSSProperties = {
  flex: 1, fontSize: '13px', color: 'var(--text-primary)',
};
const monoStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-dim)',
};
