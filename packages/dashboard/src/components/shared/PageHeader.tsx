import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div style={{
      padding: '24px 28px 20px',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
    }}>
      <div>
        <h1 style={{
          fontSize: '18px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          letterSpacing: '-0.01em',
        }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{
            marginTop: '3px',
            fontSize: '12px',
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono)',
          }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div style={{ display: 'flex', gap: '8px' }}>{actions}</div>}
    </div>
  );
}

interface CardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function Card({ children, style }: CardProps) {
  return (
    <div style={{
      background: 'var(--bg-raised)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      ...style,
    }}>
      {children}
    </div>
  );
}

export function EmptyState({ message, hint }: { message: string; hint?: string }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 20px',
      color: 'var(--text-dim)',
      gap: '8px',
    }}>
      <span style={{ fontSize: '28px', opacity: 0.3 }}>◈</span>
      <p style={{ fontSize: '13px' }}>{message}</p>
      {hint && <p style={{ fontSize: '11px', fontFamily: 'var(--font-mono)' }}>{hint}</p>}
    </div>
  );
}

export function LoadingSpinner() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px',
      color: 'var(--text-dim)',
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '12px',
        animation: 'pulse-dot 1.5s infinite',
      }}>
        ◎ loading...
      </span>
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      background: 'var(--accent)',
      color: '#000',
      fontWeight: 600,
    },
    secondary: {
      background: 'var(--bg-subtle)',
      color: 'var(--text-primary)',
      border: '1px solid var(--border-strong)',
    },
    danger: {
      background: 'var(--red-dim)',
      color: 'var(--red)',
      border: '1px solid var(--red)',
    },
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '6px 14px',
        borderRadius: '5px',
        fontSize: '12px',
        fontFamily: 'var(--font-mono)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'opacity 0.12s',
        ...variantStyles[variant],
      }}
    >
      {children}
    </button>
  );
}
