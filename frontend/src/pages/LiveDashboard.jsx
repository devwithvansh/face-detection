import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, NavLink, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { CssBaseline, ThemeProvider, createTheme, Button } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import BadgeIcon from '@mui/icons-material/Badge';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import HistoryIcon from '@mui/icons-material/History';
import ShieldIcon from '@mui/icons-material/Shield';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AssessmentIcon from '@mui/icons-material/Assessment';
import SettingsIcon from '@mui/icons-material/Settings';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import LogoutIcon from '@mui/icons-material/Logout';
import { api, setAuthToken, setUnauthorizedHandler, buildWsUrl, isTokenExpired } from '../services/api.js';

import '../styles.css';

const armyTheme = createTheme({
  palette: {
    mode: 'dark',
    primary:    { main: '#4caf50' },
    secondary:  { main: '#ffb300' },
    error:      { main: '#e53935' },
    background: { default: '#0f1410', paper: '#1e2820' },
    text:       { primary: '#d4ddd5', secondary: '#6b7d6c' },
  },
  shape: { borderRadius: 3 },
  typography: { fontFamily: "'Barlow', sans-serif" },
  components: {
    MuiCssBaseline: { styleOverrides: { body: { backgroundColor: '#0f1410' } } },
  },
});

/* ── Clock ── */
function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <>
      <div className="topbarMeta" style={{ alignItems: 'center' }}>
        <div className="topbarMetaLabel">Time</div>
        <div className="topbarMetaValue" style={{ fontSize: 16, fontFamily: "'JetBrains Mono', monospace" }}>
          {time.toUTCString().slice(17, 25)} UTC
        </div>
      </div>
      <div className="topbarMeta" style={{ alignItems: 'center' }}>
        <div className="topbarMetaLabel">Date</div>
        <div className="topbarMetaValue" style={{ fontSize: 14 }}>
          {time.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}
        </div>
      </div>
    </>
  );
}

/* ── Login ── */
function LoginPage({ onLogin, externalError }) {
  const [creds, setCreds] = useState({ username: 'admin', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    const body = new URLSearchParams();
    body.set('username', creds.username);
    body.set('password', creds.password);
    try {
      const { data } = await api.post('/auth/login', body);
      localStorage.setItem('token', data.access_token);
      onLogin(data.access_token);
    } catch (err) {
      setError(err.response?.data?.detail || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="loginPage">
      <div className="loginCard">
        <div className="loginLogo">
          <div className="loginShield"><ShieldIcon fontSize="large" /></div>
          <div className="loginTitle">Army Surveillance</div>
          <div className="loginSubtitle">Face Recognition & Access Control</div>
        </div>
        <div className="loginClassification">⬛ Restricted Access — Authorised Personnel Only</div>
        <div className="loginFields">
          <div className="loginField">
            <label>Operator ID</label>
            <input
              type="text"
              value={creds.username}
              onChange={(e) => setCreds({ ...creds, username: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              autoComplete="username"
            />
          </div>
          <div className="loginField">
            <label>Passphrase</label>
            <input
              type="password"
              placeholder="Enter password"
              value={creds.password}
              onChange={(e) => setCreds({ ...creds, password: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              autoComplete="current-password"
            />
          </div>
          {(externalError || error) && (
            <div className="loginError">⚠ {externalError || error}</div>
          )}
          <Button className="loginBtn" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Authenticating…' : 'Authenticate'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Sidebar ── */
function Sidebar({ unknownCount }) {
  const location = useLocation();

  const nav = [
    { to: '/',          label: 'Live Surveillance', icon: <DashboardIcon fontSize="small" /> },
    { to: '/cameras',   label: 'Cameras',           icon: <CameraAltIcon fontSize="small" /> },
    { to: '/personnel', label: 'Personnel',          icon: <BadgeIcon fontSize="small" /> },
    { to: '/unknown',   label: 'Unknown Queue',      icon: <PersonSearchIcon fontSize="small" />, badge: unknownCount },
    { to: '/attendance',label: 'Access Logs',        icon: <HistoryIcon fontSize="small" /> },
    { to: '/alerts',    label: 'Alerts',             icon: <WarningAmberIcon fontSize="small" />, badge: 3 },
    { to: '/reports',   label: 'Reports',            icon: <AssessmentIcon fontSize="small" /> },
    { to: '/settings',  label: 'Settings',           icon: <SettingsIcon fontSize="small" /> },
  ];

  return (
    <div className="sidebar">
      <div className="sidebarLogo">
        <div className="sidebarLogoIcon">🎖️</div>
        <div className="sidebarLogoText">
          <div className="sidebarLogoTitle">Army<br />Surveillance</div>
          <div className="sidebarLogoSub">System v2.0</div>
        </div>
      </div>

      <nav className="sidebarNav">
        {nav.map(({ to, label, icon, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `navItem${isActive ? ' active' : ''}`}
          >
            <span className="navItemIcon">{icon}</span>
            {label}
            {badge > 0 && <span className="navBadge">{badge}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="sidebarMotto">
        <div className="sidebarMottoText">Service Before Self</div>
        <div className="sidebarMottoCap">Duty • Honor • Country</div>
      </div>
    </div>
  );
}

/* ── Topbar ── */
function Topbar({ token, onLogout, detections }) {
  const known   = detections.filter((d) => d.known).length;
  const unknown = detections.filter((d) => !d.known).length;

  return (
    <div className="topbar">
      <div className="topbarTitle">
        <div className="topbarTitleMain">Army Surveillance System</div>
        <div className="topbarTitleSub">Face Recognition &amp; Access Control</div>
      </div>

      {/* Stats */}
      <div className="topbarStats">
        <div className="topbarStat known">
          <div className="topbarStatLabel">Known</div>
          <div className="topbarStatValue">{known}</div>
          <div className="topbarStatIcon">👤</div>
        </div>
        <div className="topbarStat unknown">
          <div className="topbarStatLabel">Unknown</div>
          <div className="topbarStatValue">{unknown}</div>
          <div className="topbarStatIcon" style={{ color: 'var(--red)' }}>❓</div>
        </div>
        <div className="topbarStat detections">
          <div className="topbarStatLabel">Detections</div>
          <div className="topbarStatValue">{detections.length}</div>
          <div className="topbarStatIcon">🎯</div>
        </div>
      </div>

      {/* System status */}
      <div className="topbarStatus" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
        <div className="topbarMetaLabel">System Status</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <div className="topbarStatusDot" />
          <div className="topbarStatusText" style={{ fontSize: 12 }}>Operational</div>
        </div>
      </div>

      <LiveClock />

      {/* Operator */}
      <div className="topbarOperator" onClick={onLogout} title="Click to logout">
        <div className="topbarOperatorAvatar">🪖</div>
        <div className="topbarOperatorInfo">
          <div className="topbarOperatorRole">Operator</div>
          <div className="topbarOperatorUnit">Control Room 01</div>
        </div>
        <LogoutIcon style={{ fontSize: 14, color: 'var(--text-muted)', marginLeft: 4 }} />
      </div>
    </div>
  );
}

/* ── App ── */
function App() {
  const stored = localStorage.getItem('token') || '';
  const validToken = stored && !isTokenExpired(stored) ? stored : '';
  if (stored && !validToken) localStorage.removeItem('token');

  const [token, setToken]               = useState(validToken);
  const [sessionExpiredMsg, setSessionExpiredMsg] = useState('');
  const [activeUnknown, setActiveUnknown]   = useState(null);
  const [unknownQueue, setUnknownQueue]     = useState([]);
  const [liveDetections, setLiveDetections] = useState([]);
  const openedIds   = useRef(new Set());
  const queueRef    = useRef([]);

  useEffect(() => { queueRef.current = unknownQueue; }, [unknownQueue]);
  useEffect(() => { setAuthToken(token); }, [token]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      localStorage.removeItem('token');
      setToken('');
      setSessionExpiredMsg('Session expired. Please re-authenticate.');
    });
  }, []);

  useEffect(() => {
    if (!token) return;
    let ws, ping, reconnectTimer, destroyed = false;

    function connect() {
      if (destroyed) return;
      ws = new WebSocket(buildWsUrl('/live', token));

      ws.onmessage = (e) => {
        try {
          const p = JSON.parse(e.data);
          if (p.type === 'frame') {
            setLiveDetections(p.detections || []);
          }
          if (p.type === 'unknown_detected') {
            if (openedIds.current.has(p.unknown_id)) return;
            const pt = p.timestamp ? new Date(p.timestamp).getTime() : 0;
            const dup = queueRef.current.some((q) => {
              const qt = q.timestamp ? new Date(q.timestamp).getTime() : 0;
              return q.camera_id === p.camera_id && Math.abs(qt - pt) < 30000;
            });
            if (dup) return;
            openedIds.current.add(p.unknown_id);
            setActiveUnknown((cur) => {
              if (!cur) return p;
              setUnknownQueue((q) => { const u = [...q, p]; queueRef.current = u; return u; });
              return cur;
            });
          }
        } catch { /**/ }
      };

      ws.onclose = (evt) => {
        clearInterval(ping);
        if (!destroyed && evt.code !== 1000) reconnectTimer = setTimeout(connect, 3000);
      };

      ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('ping'), 15000);
    }

    connect();
    return () => {
      destroyed = true;
      clearInterval(ping);
      clearTimeout(reconnectTimer);
      if (ws) ws.close(1000, 'logout');
    };
  }, [token]);

  const handleLogin = (t) => { setToken(t); setSessionExpiredMsg(''); };
  const logout = () => { localStorage.removeItem('token'); setToken(''); setSessionExpiredMsg(''); };

  const showNext = () => setUnknownQueue((q) => { const [n, ...r] = q; queueRef.current = r; setActiveUnknown(n || null); return r; });
  const clearQueue = () => { setUnknownQueue([]); queueRef.current = []; setActiveUnknown(null); };

  const unknownCount = unknownQueue.length + (activeUnknown ? 1 : 0);

  if (!token) {
    return (
      <ThemeProvider theme={armyTheme}>
        <CssBaseline />
        <LoginPage onLogin={handleLogin} externalError={sessionExpiredMsg} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={armyTheme}>
      <CssBaseline />
      <BrowserRouter>
        <div className="appShell">
          <Sidebar unknownCount={unknownCount} />
          <Topbar token={token} onLogout={logout} detections={liveDetections} />
          <div className="mainContent">
            <div className="pageContent">
              <Routes>
                <Route path="/"           element={<LiveDashboard token={token} onDetections={setLiveDetections} />} />
                <Route path="/personnel"  element={<PersonnelPage />} />
                <Route path="/unknown"    element={<UnknownQueuePage />} />
                <Route path="/attendance" element={<AttendancePage />} />
                <Route path="/cameras"    element={<Navigate to="/" replace />} />
                <Route path="/alerts"     element={<PlaceholderPage title="Alerts" />} />
                <Route path="/reports"    element={<PlaceholderPage title="Reports" />} />
                <Route path="/settings"   element={<PlaceholderPage title="Settings" />} />
              </Routes>
            </div>
          </div>
          <UnknownRegistrationDialog
            unknown={activeUnknown}
            open={Boolean(activeUnknown)}
            onDismiss={showNext}
            onRegistered={showNext}
            onClearQueue={clearQueue}
          />
        </div>
      </BrowserRouter>
    </ThemeProvider>
  );
}

function PlaceholderPage({ title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 32, fontWeight: 800, letterSpacing: 2, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{title}</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--text-muted)', letterSpacing: 2 }}>// MODULE UNDER CONSTRUCTION</div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);