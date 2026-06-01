import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, NavLink, Route, Routes, Navigate } from 'react-router-dom';
import {
  AppBar,
  Alert,
  Box,
  Button,
  CssBaseline,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ThemeProvider,
  Toolbar,
  Typography,
  createTheme,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import BadgeIcon from '@mui/icons-material/Badge';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import HistoryIcon from '@mui/icons-material/History';
import LogoutIcon from '@mui/icons-material/Logout';
import ShieldIcon from '@mui/icons-material/Shield';
import { api, setAuthToken, setUnauthorizedHandler, WS_BASE } from './services/api.js';
import LiveDashboard from './pages/LiveDashboard.jsx';
import PersonnelPage from './pages/PersonnelPage.jsx';
import UnknownQueuePage from './pages/UnknownQueuePage.jsx';
import AttendancePage from './pages/AttendancePage.jsx';
import UnknownRegistrationDialog from './components/UnknownRegistrationDialog.jsx';
import './styles.css';

const drawerWidth = 260;

/* ── Army dark theme ───────────────────────────────────────── */
const armyTheme = createTheme({
  palette: {
    mode: 'dark',
    primary:    { main: '#3dff7a' },
    secondary:  { main: '#f0b429' },
    error:      { main: '#ff3b3b' },
    background: { default: '#0b0e0c', paper: '#111714' },
    text:       { primary: '#c8d4c0', secondary: '#5e7060' },
  },
  shape: { borderRadius: 4 },
  typography: { fontFamily: "'Exo 2', sans-serif" },
  components: {
    MuiCssBaseline: { styleOverrides: { body: { backgroundColor: '#0b0e0c' } } },
  },
});

/* ── Clock component ─────────────────────────────────────── */
function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: '#5e7060', letterSpacing: 1 }}>
      {time.toUTCString().slice(17, 25)} UTC
    </span>
  );
}

/* ── Login Page ──────────────────────────────────────────── */
function LoginPage({ onLogin }) {
  const [creds, setCreds] = useState({ username: 'admin', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e?.preventDefault();
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
      setError(err.response?.data?.detail || 'Authentication failed. Check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => { if (e.key === 'Enter') handleSubmit(); };

  return (
    <div className="loginPage">
      <div className="loginCard">
        <div className="loginLogo">
          <div className="loginShield">
            <ShieldIcon fontSize="large" />
          </div>
          <div className="loginTitle">Sentinel</div>
          <div className="loginSubtitle">Defence Surveillance System</div>
        </div>

        <div className="loginClassification">
          ⬛ RESTRICTED ACCESS — AUTHORISED PERSONNEL ONLY
        </div>

        <div className="loginFields">
          <div className="loginField">
            <label>Operator ID</label>
            <input
              type="text"
              placeholder="Enter username"
              value={creds.username}
              onChange={(e) => setCreds({ ...creds, username: e.target.value })}
              onKeyDown={handleKey}
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
              onKeyDown={handleKey}
              autoComplete="current-password"
            />
          </div>

          {error && <div className="loginError">⚠ {error}</div>}

          <Button className="loginBtn" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Authenticating…' : 'Authenticate'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Main App ────────────────────────────────────────────── */
function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [authMessage, setAuthMessage] = useState('');
  const [activeUnknown, setActiveUnknown] = useState(null);
  const [unknownQueue, setUnknownQueue] = useState([]);
  const openedUnknownIds = useRef(new Set());
  const unknownQueueRef = useRef([]);

  useEffect(() => { unknownQueueRef.current = unknownQueue; }, [unknownQueue]);

  useEffect(() => { setAuthToken(token); }, [token]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      localStorage.removeItem('token');
      setToken('');
      setAuthMessage('Session expired. Please re-authenticate.');
    });
  }, []);

  /* WebSocket for live unknown detections */
  useEffect(() => {
    if (!token) return undefined;
    const ws = new WebSocket(`${WS_BASE}/live`);
    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type !== 'unknown_detected') return;
      if (openedUnknownIds.current.has(payload.unknown_id)) return;
      const payloadTime = payload.timestamp ? new Date(payload.timestamp).getTime() : 0;
      const isDuplicate = unknownQueueRef.current.some((q) => {
        const qt = q.timestamp ? new Date(q.timestamp).getTime() : 0;
        return q.camera_id === payload.camera_id && Math.abs(qt - payloadTime) < 30000;
      });
      if (isDuplicate) return;
      openedUnknownIds.current.add(payload.unknown_id);
      setActiveUnknown((current) => {
        if (!current) return payload;
        setUnknownQueue((queue) => {
          const updated = [...queue, payload];
          unknownQueueRef.current = updated;
          return updated;
        });
        return current;
      });
    };
    const ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('ping'), 15000);
    return () => { clearInterval(ping); ws.close(); };
  }, [token]);

  const handleLogin = (newToken) => {
    setToken(newToken);
    setAuthMessage('');
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken('');
  };

  const showNextUnknown = () => {
    setUnknownQueue((queue) => {
      const [next, ...rest] = queue;
      unknownQueueRef.current = rest;
      setActiveUnknown(next || null);
      return rest;
    });
  };

  const clearPopupQueue = () => {
    setUnknownQueue([]);
    unknownQueueRef.current = [];
    setActiveUnknown(null);
  };

  /* Show login page when unauthenticated */
  if (!token) {
    return (
      <ThemeProvider theme={armyTheme}>
        <CssBaseline />
        {authMessage && (
          <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, minWidth: 340 }}>
            <Alert severity="warning" onClose={() => setAuthMessage('')}>{authMessage}</Alert>
          </div>
        )}
        <LoginPage onLogin={handleLogin} />
      </ThemeProvider>
    );
  }

  const nav = [
    ['/', 'Live Surveillance', <DashboardIcon />],
    ['/personnel', 'Personnel', <BadgeIcon />],
    ['/unknown', 'Unknown Queue', <PersonSearchIcon />],
    ['/attendance', 'Access Logs', <HistoryIcon />],
  ];

  return (
    <ThemeProvider theme={armyTheme}>
      <CssBaseline />
      <BrowserRouter>
        <Box className="appShell">
          {/* ── Topbar ── */}
          <AppBar position="fixed" elevation={0}>
            <Toolbar>
              <Typography className="appTitle" sx={{ flexGrow: 1 }}>
                <span className="titleShield">
                  <ShieldIcon style={{ fontSize: 14 }} />
                </span>
                Sentinel
                <span style={{ fontWeight: 300, opacity: 0.5, fontSize: 14, letterSpacing: 4 }}>|</span>
                <span style={{ fontSize: 12, fontWeight: 400, letterSpacing: 3, opacity: 0.7 }}>DEFENCE SURVEILLANCE</span>
              </Typography>

              <div className="systemStatus" style={{ marginRight: 20 }}>
                <div className="statusDot" />
                SYSTEM ACTIVE
              </div>

              <LiveClock />

              <Button
                className="logoutBtn"
                startIcon={<LogoutIcon style={{ fontSize: 14 }} />}
                onClick={logout}
                sx={{ ml: 2 }}
              >
                Logout
              </Button>
            </Toolbar>
          </AppBar>

          {/* ── Sidebar ── */}
          <Drawer variant="permanent">
            <div className="sidebarClassification">// SENTINEL OPS</div>
            <List>
              {nav.map(([to, label, icon]) => (
                <ListItemButton
                  key={to}
                  component={NavLink}
                  to={to}
                  end={to === '/'}
                >
                  <ListItemIcon>{icon}</ListItemIcon>
                  <ListItemText primary={label} />
                </ListItemButton>
              ))}
            </List>
            <div className="sidebarFooter">
              VER 2.0 // CLASSIFIED
            </div>
          </Drawer>

          {/* ── Main content ── */}
          <Box component="main" className="content">
            {authMessage && (
              <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setAuthMessage('')}>
                {authMessage}
              </Alert>
            )}
            <Routes>
              <Route path="/"           element={<LiveDashboard token={token} />} />
              <Route path="/personnel"  element={<PersonnelPage />} />
              <Route path="/unknown"    element={<UnknownQueuePage />} />
              <Route path="/attendance" element={<AttendancePage />} />
              {/* redirect old /cameras route */}
              <Route path="/cameras"    element={<Navigate to="/" replace />} />
            </Routes>
          </Box>

          {/* ── Unknown registration popup ── */}
          <UnknownRegistrationDialog
            unknown={activeUnknown}
            open={Boolean(activeUnknown)}
            onDismiss={showNextUnknown}
            onRegistered={showNextUnknown}
            onClearQueue={clearPopupQueue}
          />
        </Box>
      </BrowserRouter>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')).render(<App />);