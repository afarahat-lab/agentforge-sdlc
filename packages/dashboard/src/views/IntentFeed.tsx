import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDashboardApi } from '../hooks/useApi';
import { useLiveEvent } from '../hooks/useLiveEvents';
import { StatusBadge } from '../components/shared/StatusBadge';
import { PageHeader, Card, EmptyState, LoadingSpinner } from '../components/shared/PageHeader';
import type { IntentSummary } from '../types';

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'var(--red)',
  high:     'var(--amber)',
  normal:   'var(--text-dim)',
  low:      'var(--text-dim)',
};

export function IntentFeed() {
  const api = useDashboardApi();
  const navigate = useNavigate();
  const [intents, setIntents] = useState<IntentSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const projectId = localStorage.getItem('gestalt_project') ?? 'default';

  const load = useCallback(async () => {
    try {
      const res = await api.listIntents({ projectId, limit: 50 });
      setIntents(res.data ?? []);
      setTotal(res.total ?? 0);
    } catch { /* handled */ } finally {
      setLoading(false);
    }
  }, [api, projectId]);

  useEffect(() => { void load(); }, [load]);

  useLiveEvent('intent.created', () => { void load(); });
  useLiveEvent('intent.status-changed', () => { void load(); });

  const filtered = filter
    ? intents.filter(i =>
        i.status === filter ||
        i.text.toLowerCase().includes(filter.toLowerCase())
      )
    : intents;

  return (
    <div>
      <PageHeader
        title="Intents"
        subtitle={`${total} total`}
        actions={
          <input
            placeholder="filter..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={filterInputStyle}
          />
        }
      />

      <div style={{ padding: '20px 28px' }}>
        {loading ? (
          <LoadingSpinner />
        ) : filtered.length === 0 ? (
          <EmptyState
            message="No intents yet"
            hint="gestalt run &quot;describe what you want to build&quot;"
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {filtered.map(intent => (
              <Card
                key={intent.id}
                style={{ cursor: 'pointer', transition: 'border-color 0.12s' }}
              >
                <div
                  style={intentRowStyle}
                  onClick={() => navigate(`/intents/${intent.id}`)}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
                >
                  {/* Priority stripe */}
                  <div style={{
                    width: '3px',
                    borderRadius: '2px',
                    background: PRIORITY_COLORS[intent.priority] ?? 'var(--border)',
                    alignSelf: 'stretch',
                    marginRight: '14px',
                    flexShrink: 0,
                  }} />

                  {/* Intent text */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '4px' }}
                       className="truncate">
                      {intent.text}
                    </p>
                    <p style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                      {intent.correlationId.slice(0, 8)}
                      {' · '}
                      {new Date(intent.createdAt).toLocaleString()}
                    </p>
                  </div>

                  {/* Status */}
                  <div style={{ flexShrink: 0, marginLeft: '16px' }}>
                    <StatusBadge status={intent.status} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const intentRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '14px 16px',
};

const filterInputStyle: React.CSSProperties = {
  background: 'var(--bg-subtle)',
  border: '1px solid var(--border)',
  borderRadius: '5px',
  padding: '5px 10px',
  fontSize: '12px',
  color: 'var(--text-primary)',
  outline: 'none',
  width: '180px',
};
