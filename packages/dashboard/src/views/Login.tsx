import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDashboardApi } from '../hooks/useApi';

export function Login() {
  const api = useDashboardApi();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login(email, password);
      localStorage.setItem('gestalt_token', res.token);
      api.setToken(res.token);
      navigate('/');
    } catch {
      setError('Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.shell}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <span style={{ color: 'var(--accent)', fontSize: '32px' }}>◈</span>
          <span style={styles.logoText}>gestalt</span>
        </div>
        <p style={styles.tagline}>agent-first software development platform</p>

        <form onSubmit={(e) => { void handleLogin(e); }}>
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={styles.input}
              placeholder="you@company.com"
              autoFocus
              required
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={styles.input}
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <p style={{ fontSize: '12px', color: 'var(--red)', marginBottom: '12px',
              fontFamily: 'var(--font-mono)' }}>
              {error}
            </p>
          )}

          <button type="submit" style={styles.btn} disabled={loading}>
            {loading ? 'signing in...' : 'sign in'}
          </button>
        </form>

        <p style={styles.hint}>
          Corporate SSO available if configured in HARNESS.json
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-base)',
  },
  card: {
    width: '360px',
    background: 'var(--bg-raised)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '36px 32px',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '6px',
  },
  logoText: {
    fontFamily: 'var(--font-mono)',
    fontWeight: 500,
    fontSize: '22px',
    letterSpacing: '0.04em',
    color: 'var(--text-primary)',
  },
  tagline: {
    fontSize: '11px',
    color: 'var(--text-dim)',
    fontFamily: 'var(--font-mono)',
    marginBottom: '28px',
  },
  field: { marginBottom: '16px' },
  label: {
    display: 'block',
    fontSize: '11px',
    color: 'var(--text-secondary)',
    marginBottom: '5px',
    fontFamily: 'var(--font-mono)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  input: {
    width: '100%',
    background: 'var(--bg-base)',
    border: '1px solid var(--border-strong)',
    borderRadius: '6px',
    padding: '9px 12px',
    fontSize: '13px',
    color: 'var(--text-primary)',
    outline: 'none',
  },
  btn: {
    width: '100%',
    background: 'var(--accent)',
    color: '#000',
    fontWeight: 600,
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    padding: '10px',
    borderRadius: '6px',
    marginTop: '4px',
    cursor: 'pointer',
    transition: 'opacity 0.12s',
  },
  hint: {
    marginTop: '20px',
    fontSize: '11px',
    color: 'var(--text-dim)',
    fontFamily: 'var(--font-mono)',
    textAlign: 'center',
  },
};
