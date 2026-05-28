import React from 'react';

const STATUS_CONFIG: Record<string, { label: string; color: string; symbol: string }> = {
  'pending':                   { label: 'pending',        color: 'var(--text-dim)', symbol: '○' },
  'generating':                { label: 'generating',     color: 'var(--blue)',     symbol: '◎' },
  'in-review':                 { label: 'in review',      color: 'var(--amber)',    symbol: '◉' },
  'approved':                  { label: 'approved',       color: 'var(--green)',    symbol: '●' },
  'deploying':                 { label: 'deploying',      color: 'var(--blue)',     symbol: '↑' },
  'deployed':                  { label: 'deployed',       color: 'var(--green)',    symbol: '✓' },
  'failed':                    { label: 'failed',         color: 'var(--red)',      symbol: '✗' },
  'escalated':                 { label: 'escalated',      color: 'var(--red)',      symbol: '!' },
  'waiting-for-clarification': { label: 'needs input',   color: 'var(--amber)',    symbol: '?' },
  // Gate verdicts
  'pass':     { label: 'pass',     color: 'var(--green)', symbol: '✓' },
  'fail':     { label: 'fail',     color: 'var(--red)',   symbol: '✗' },
  'escalate': { label: 'escalate', color: 'var(--red)',   symbol: '!' },
  // Agent statuses
  'running':  { label: 'running',  color: 'var(--blue)',  symbol: '◎' },
  'skipped':  { label: 'skipped',  color: 'var(--text-dim)', symbol: '–' },
  'queued':   { label: 'queued',   color: 'var(--text-dim)', symbol: '○' },
  'completed':{ label: 'done',     color: 'var(--green)', symbol: '●' },
};

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'var(--text-dim)', symbol: '·' };

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      color: cfg.color,
      fontFamily: 'var(--font-mono)',
      fontSize: size === 'sm' ? '11px' : '12px',
      whiteSpace: 'nowrap',
    }}>
      <span style={{ fontSize: size === 'sm' ? '10px' : '11px' }}>{cfg.symbol}</span>
      {cfg.label}
    </span>
  );
}

export function SignalBadge({ type, severity }: { type: string; severity: string }) {
  const colors: Record<string, string> = {
    'critical': 'var(--red)',
    'high':     'var(--red)',
    'medium':   'var(--amber)',
    'low':      'var(--text-dim)',
  };

  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 6px',
      borderRadius: '3px',
      fontFamily: 'var(--font-mono)',
      fontSize: '10px',
      fontWeight: 500,
      color: colors[severity] ?? 'var(--text-dim)',
      border: `1px solid ${colors[severity] ?? 'var(--border)'}`,
      letterSpacing: '0.03em',
    }}>
      {type}
    </span>
  );
}
