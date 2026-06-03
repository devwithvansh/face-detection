import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, NavLink, Route, Routes, Navigate } from 'react-router-dom';
import { CssBaseline, ThemeProvider, createTheme, Button } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import BadgeIcon from '@mui/icons-material/Badge';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import HistoryIcon from '@mui/icons-material/History';
import ShieldIcon from '@mui/icons-material/Shield';
import LogoutIcon from '@mui/icons-material/Logout';
import { api, setAuthToken, setUnauthorizedHandler, buildWsUrl, isTokenExpired } from './services/api.js';
import LiveDashboard from './pages/LiveDashboard.jsx';
import PersonnelPage from './pages/PersonnelPage.jsx';
import UnknownQueuePage from './pages/UnknownQueuePage.jsx';
import AttendancePage from './pages/AttendancePage.jsx';
import UnknownRegistrationDialog from './components/UnknownRegistrationDialog.jsx';
import './styles.css';

const armyTheme = createTheme({
  palette: {
    mode: 'dark',
    primary:    { main: '#4caf50' },
    secondary:  { main: '#ffb300' },
    error:      { main: '#e53935' },
    background: { default: '#050705', paper: '#121812' },
    text:       { primary: '#e0e8e1', secondary: '#a0b0a1' },
  },
  shape: { borderRadius: 2 },
  typography: { fontFamily: "'Barlow', sans-serif" },
  components: {
    MuiCssBaseline: { styleOverrides: { body: { backgroundColor: '#050705' } } },
  },
});

/* ── Clock (Fixed Time Fetching) ── */
function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  
  // Format to local time string as requested
  const timeStr = time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).toUpperCase();
  const dateStr = time.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();

  return (
    <div className="topbarInfoGroup">
      <div className="topbarInfoItem">
        <div className="topbarInfoLabel">Local Time</div>
        <div className="topbarInfoValue" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          {timeStr}
        </div>
      </div>
      <div className="topbarInfoItem">
        <div className="topbarInfoLabel">Mission Date</div>
        <div className="topbarInfoValue">
          {dateStr}
        </div>
      </div>
    </div>
  );
}

/* ── Login ── */
function LoginPage({ onLogin, externalError }) {
  const [creds, setCreds] = useState({ username: 'admin', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

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

  const timeStr = time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).toUpperCase();
  const dateStr = time.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();

  return (
    <div className="loginPage2">
      {/* Animated grid lines */}
      <div className="loginGrid"></div>

      {/* Top system bar */}
      <div className="loginSysBar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green-bright)', boxShadow: '0 0 10px var(--green-bright)', animation: 'pulse 1.5s infinite' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green-bright)', letterSpacing: 3 }}>SYSTEM ONLINE</span>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: 2 }}>{timeStr} · {dateStr}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: 3 }}>ENCRYPTION: AES-256</span>
      </div>

      {/* Main card */}
      <div className="loginCard2">
        {/* Left panel — branding */}
        <div className="loginLeft">
          <div className="loginLeftInner">
            <div className="loginShieldLarge">
              <ShieldIcon sx={{ fontSize: 100, color: 'var(--green-bright)', filter: 'drop-shadow(0 0 30px rgba(105,240,117,0.4))' }} />
            </div>
            <div className="loginBrandTitle">ARMY<br/>COMMAND</div>
            <div className="loginBrandSub">ADVANCED SURVEILLANCE<br/>& ACCESS CONTROL</div>
            <div className="loginDivider" />
            <div className="loginCredentials">
              <div className="loginCredRow">
                <span className="loginCredLabel">CLEARANCE</span>
                <span className="loginCredVal" style={{ color: 'var(--amber)' }}>TOP SECRET</span>
              </div>
              <div className="loginCredRow">
                <span className="loginCredLabel">SYSTEM</span>
                <span className="loginCredVal">BIOMETRIC GATE</span>
              </div>
              <div className="loginCredRow">
                <span className="loginCredLabel">VERSION</span>
                <span className="loginCredVal">v4.2.1</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right panel — form */}
        <div className="loginRight">
          <div className="loginAlertBanner">
            <span style={{ color: 'var(--red-bright)', marginRight: 10, fontSize: 14 }}>⬛</span>
            RESTRICTED ACCESS — AUTHORISED PERSONNEL ONLY
          </div>

          <div className="loginFormHeader">
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 900, letterSpacing: 3, color: 'var(--text)', lineHeight: 1 }}>AUTHENTICATE</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: 3, marginTop: 8 }}>ENTER CREDENTIALS TO PROCEED</div>
          </div>

          <div className="loginFields2">
            <div className="loginField2">
              <label>OPERATOR ID</label>
              <input
                type="text"
                value={creds.username}
                onChange={(e) => setCreds({ ...creds, username: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                autoComplete="username"
                placeholder="Enter operator ID"
              />
            </div>
            <div className="loginField2">
              <label>PASSPHRASE</label>
              <input
                type="password"
                placeholder="••••••••••••"
                value={creds.password}
                onChange={(e) => setCreds({ ...creds, password: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                autoComplete="current-password"
              />
            </div>

            {(externalError || error) && (
              <div className="loginError2">
                ⚠ {externalError || error}
              </div>
            )}

            <button
              className={`loginBtn2 ${loading ? 'loading' : ''}`}
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                  <span className="loginSpinner" /> AUTHENTICATING...
                </span>
              ) : 'AUTHENTICATE'}
            </button>
          </div>

          <div className="loginFooter2">
            <span>SECURE MILITARY SYSTEM</span>
            <span>© COMMAND CENTER</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Sidebar (Removed redundant Cameras option) ── */
function Sidebar({ unknownCount }) {
  const nav = [
    { to: '/',          label: 'Live Surveillance', icon: <DashboardIcon /> },
    { to: '/personnel', label: 'Personnel Roster',  icon: <BadgeIcon /> },
    { to: '/unknown',   label: 'Unknown Queue',      icon: <PersonSearchIcon />, badge: unknownCount },
    { to: '/attendance',label: 'Access Logs',        icon: <HistoryIcon /> },
  ];

  return (
    <div className="sidebar">
      <div className="sidebarLogo">
        <div style={{ fontSize: 60, filter: 'drop-shadow(0 0 10px var(--green-glow))' }}>🎖️</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 900, marginTop: 10, letterSpacing: 4 }}>HQ COMMAND</div>
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
        <div className="sidebarMottoText">SERVICE BEFORE SELF</div>
        <div className="sidebarMottoCap">Duty • Honor • Country</div>
      </div>
    </div>
  );
}

/* ── Topbar ── */
function Topbar({ onLogout }) {
  return (
    <div className="topbar">
      <div className="topbarTitle">
        <div className="topbarTitleMain">ARMY SURVEILLANCE SYSTEM</div>
        <div className="topbarTitleSub">Advanced Face Recognition & Access Management</div>
      </div>

      <div className="topbarInfoGroup">
        <div className="topbarInfoItem">
          <div className="topbarInfoLabel">System Status</div>
          <div className="topbarStatus">
            <div className="topbarStatusDot" />
            <div style={{ color: 'var(--green-bright)', fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-display)', letterSpacing: 2 }}>OPERATIONAL</div>
          </div>
        </div>
      </div>

      <LiveClock />

      <div className="topbarOperator" onClick={onLogout} title="Click to logout">
        <div className="topbarOperatorAvatar">🪖</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, letterSpacing: 3, color: 'var(--text)', textTransform: 'uppercase' }}>ADMIN</div>
        <LogoutIcon style={{ fontSize: 20, color: 'var(--text-muted)', marginLeft: 8 }} />
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
  const [saveUnknownToQueue, setSaveUnknownToQueue] = useState(() => {
    const stored = localStorage.getItem('saveUnknownToQueue');
    return stored === null ? true : stored === 'true';
  });
  const openedIds   = useRef(new Set());
  const queueRef    = useRef([]);

  useEffect(() => { queueRef.current = unknownQueue; }, [unknownQueue]);
  useEffect(() => { setAuthToken(token); }, [token]);
  const saveUnknownRef = useRef(saveUnknownToQueue);
  useEffect(() => {
    saveUnknownRef.current = saveUnknownToQueue;
    localStorage.setItem('saveUnknownToQueue', saveUnknownToQueue);
  }, [saveUnknownToQueue]);

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
            if (!saveUnknownRef.current) return;
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
          <div className="mainWrapper">
            <Topbar onLogout={logout} />
            <div className="mainContent">
              <Routes>
                <Route path="/" element={
                  <div className="pageContentFull">
                    <LiveDashboard token={token} onDetections={setLiveDetections} saveUnknownToQueue={saveUnknownToQueue} onToggleSaveUnknown={setSaveUnknownToQueue} />
                  </div>
                } />
                <Route path="/personnel"  element={<PersonnelPage />} />
                <Route path="/unknown"    element={<UnknownQueuePage />} />
                <Route path="/attendance" element={<AttendancePage />} />
                <Route path="/cameras"    element={<Navigate to="/" replace />} />
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

createRoot(document.getElementById('root')).render(<App />);