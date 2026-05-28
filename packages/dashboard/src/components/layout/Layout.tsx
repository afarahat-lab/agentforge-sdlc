import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useDashboardApi } from '../../hooks/useApi';
import { useLiveEvent } from '../../hooks/useLiveEvents';

const NAV_ITEMS = [
  { path: '/',             label: 'Intents',     icon: '◈' },
  { path: '/agents',       label: 'Agents',      icon: '◎' },
  { path: '/gate',         label: 'Gate',        icon: '◉' },
  { path: '/deployments',  label: 'Deployments', icon: '↑' },
  { path: '/maintenance',  label: 'Maintenance', icon: '⟳' },
  { path: '/alerts',       label: 'Alerts',      icon: '!' },
];

export function Layout() {
  const api = useDashboardApi();
  const navigate = useNavigate();
  const [alertCount, setAlertCount] = useState(0);
  const [connected] = useState(true);

  // Track unacknowledged alerts
  useLiveEvent('alert.created', () => {
    setAlertCount(c => c + 1);
  });
  useLiveEvent('alert.acknowledged', () => {
    setAlertCount(c => Math.max(0, c - 1));
  });

  // Load initial alert count
  useEffect(() => {
    api.listAlerts({ acknowledged: false }).then(r => {
      setAlertCount(r.total);
    }).catch(() => {});
  }, [api]);

  function handleLogout() {
    localStorage.removeItem('gestalt_token');
    navigate('/login');
  }

  return (
    <div style={styles.shell}>
      {/* Sidebar */}
      <nav style={styles.sidebar}>
        {/* Logo */}
        <div style={styles.logo}>
          <span style={styles.logoMark}>◈</span>
          <span style={styles.logoText}>gestalt</span>
        </div>

        {/* Nav */}
        <ul style={styles.navList}>
          {NAV_ITEMS.map(item => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                end={item.path === '/'}
                style={({ isActive }) => ({
                  ...styles.navItem,
                  ...(isActive ? styles.navItemActive : {}),
                })}
              >
                <span style={styles.navIcon}>{item.icon}</span>
                <span>{item.label}</span>
                {item.path === '/alerts' && alertCount > 0 && (
                  <span style={styles.badge}>{alertCount}</span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>

        {/* Footer */}
        <div style={styles.sidebarFooter}>
          <div style={styles.connectionStatus}>
            <span style={{
              ...styles.dot,
              background: connected ? 'var(--green)' : 'var(--red)',
              animation: connected ? 'pulse-dot 2s infinite' : 'none',
            }} />
            <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>
              {connected ? 'connected' : 'disconnected'}
            </span>
          </div>
          <button style={styles.logoutBtn} onClick={handleLogout}>
            sign out
          </button>
        </div>
      </nav>

      {/* Main */}
      <main style={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: 'flex',
    height: '100vh',
    overflow: 'hidden',
  },
  sidebar: {
    width: 'var(--sidebar-w)',
    minWidth: 'var(--sidebar-w)',
    background: 'var(--bg-raised)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '20px 16px 16px',
    borderBottom: '1px solid var(--border)',
    marginBottom: '8px',
  },
  logoMark: {
    color: 'var(--accent)',
    fontSize: '20px',
    lineHeight: 1,
  },
  logoText: {
    fontFamily: 'var(--font-mono)',
    fontWeight: 500,
    fontSize: '15px',
    letterSpacing: '0.05em',
    color: 'var(--text-primary)',
  },
  navList: {
    listStyle: 'none',
    flex: 1,
    padding: '4px 8px',
    overflowY: 'auto',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 10px',
    borderRadius: '6px',
    color: 'var(--text-secondary)',
    fontSize: '13px',
    transition: 'all 0.12s',
    marginBottom: '2px',
    position: 'relative',
  },
  navItemActive: {
    color: 'var(--text-primary)',
    background: 'var(--bg-subtle)',
    borderLeft: '2px solid var(--accent)',
    paddingLeft: '8px',
  },
  navIcon: {
    fontFamily: 'var(--font-mono)',
    width: '16px',
    textAlign: 'center',
    color: 'var(--accent)',
  },
  badge: {
    marginLeft: 'auto',
    background: 'var(--red)',
    color: '#fff',
    fontSize: '10px',
    fontWeight: 600,
    padding: '1px 5px',
    borderRadius: '10px',
    fontFamily: 'var(--font-mono)',
  },
  sidebarFooter: {
    padding: '12px 16px',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  connectionStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
  },
  logoutBtn: {
    fontSize: '12px',
    color: 'var(--text-dim)',
    textAlign: 'left',
    padding: 0,
  },
  main: {
    flex: 1,
    overflow: 'auto',
    background: 'var(--bg-base)',
  },
};
