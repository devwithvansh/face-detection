import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
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
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import BadgeIcon from '@mui/icons-material/Badge';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import HistoryIcon from '@mui/icons-material/History';
import LoginIcon from '@mui/icons-material/Login';
import { api, setAuthToken, setUnauthorizedHandler, WS_BASE } from './services/api.js';
import LiveDashboard from './pages/LiveDashboard.jsx';
import PersonnelPage from './pages/PersonnelPage.jsx';
import UnknownQueuePage from './pages/UnknownQueuePage.jsx';
import AttendancePage from './pages/AttendancePage.jsx';
import CameraPage from './pages/CameraPage.jsx';
import UnknownRegistrationDialog from './components/UnknownRegistrationDialog.jsx';
import './styles.css';

const drawerWidth = 264;

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [login, setLogin] = useState({ username: 'admin', password: '' });
  const [authMessage, setAuthMessage] = useState('');
  const [activeUnknown, setActiveUnknown] = useState(null);
  const [unknownQueue, setUnknownQueue] = useState([]);
  const openedUnknownIds = useRef(new Set());

  // NEW: ref mirror of unknownQueue so the WebSocket handler can read it
  // without a stale closure (useState value is stale inside useEffect callbacks)
  const unknownQueueRef = useRef([]);

  // Keep the ref in sync whenever the queue state changes
  useEffect(() => {
    unknownQueueRef.current = unknownQueue;
  }, [unknownQueue]);

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      localStorage.removeItem('token');
      setToken('');
      setAuthMessage('Login required. Your session is missing or expired.');
    });
  }, []);

  useEffect(() => {
    if (!token) return undefined;
    const ws = new WebSocket(`${WS_BASE}/live`);
    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);

      // Only care about unknown_detected events
      if (payload.type !== 'unknown_detected') return;

      // Skip if we already opened a popup for this exact unknown_id
      if (openedUnknownIds.current.has(payload.unknown_id)) return;

      // NEW: skip if we already have a pending popup from the same camera
      // within the last 30 seconds — avoids flooding when backend fires
      // multiple events for the same physical person before dedup kicks in
      const payloadTime = payload.timestamp ? new Date(payload.timestamp).getTime() : 0;
      const isDuplicate = unknownQueueRef.current.some((queued) => {
        const queuedTime = queued.timestamp ? new Date(queued.timestamp).getTime() : 0;
        return (
          queued.camera_id === payload.camera_id &&
          Math.abs(queuedTime - payloadTime) < 30000
        );
      });
      if (isDuplicate) return;

      openedUnknownIds.current.add(payload.unknown_id);
      setActiveUnknown((current) => {
        if (!current) return payload;
        setUnknownQueue((queue) => {
          const updated = [...queue, payload];
          unknownQueueRef.current = updated; // keep ref in sync immediately
          return updated;
        });
        return current;
      });
    };
    const ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('ping'), 15000);
    return () => {
      clearInterval(ping);
      ws.close();
    };
  }, [token]);

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: 'light',
          primary: { main: '#2f5d50' },
          secondary: { main: '#b58b2a' },
          background: { default: '#f4f6f2' },
        },
        shape: { borderRadius: 8 },
        typography: { fontFamily: 'Inter, Arial, sans-serif' },
      }),
    [],
  );

  const doLogin = async () => {
    setAuthMessage('');
    const body = new URLSearchParams();
    body.set('username', login.username);
    body.set('password', login.password);
    try {
      const { data } = await api.post('/auth/login', body);
      localStorage.setItem('token', data.access_token);
      setToken(data.access_token);
    } catch (error) {
      setAuthMessage(error.response?.data?.detail || 'Login failed. Check ADMIN_USERNAME and ADMIN_PASSWORD in .env.');
    }
  };

  const nav = [
    ['/', 'Live Feed', <DashboardIcon />],
    ['/cameras', 'Cameras', <CameraAltIcon />],
    ['/personnel', 'Personnel', <BadgeIcon />],
    ['/unknown', 'Unknown Queue', <PersonSearchIcon />],
    ['/attendance', 'Attendance', <HistoryIcon />],
  ];

  const logout = () => {
    localStorage.removeItem('token');
    setToken('');
  };

  const requireLogin = (page) => (
    token ? page : <Alert severity="info">Login with the admin account from your .env file to use this page.</Alert>
  );

  const showNextUnknown = () => {
    setUnknownQueue((queue) => {
      const [next, ...rest] = queue;
      unknownQueueRef.current = rest; // keep ref in sync
      setActiveUnknown(next || null);
      return rest;
    });
  };

  const clearPopupQueue = () => {
    setUnknownQueue([]);
    unknownQueueRef.current = []; // keep ref in sync
    setActiveUnknown(null);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Box className="appShell">
          <AppBar position="fixed" elevation={0} sx={{ zIndex: 1300 }}>
            <Toolbar>
              <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 800 }}>
                Army Entry/Exit Recognition
              </Typography>
              {!token ? (
                <Box className="loginStrip">
                  <input placeholder="Username" value={login.username} onChange={(e) => setLogin({ ...login, username: e.target.value })} />
                  <input placeholder="Password" type="password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} />
                  <Button color="inherit" startIcon={<LoginIcon />} onClick={doLogin}>Login</Button>
                </Box>
              ) : (
                <Button color="inherit" onClick={logout}>Logout</Button>
              )}
            </Toolbar>
          </AppBar>
          <Drawer variant="permanent" sx={{ width: drawerWidth, '& .MuiDrawer-paper': { width: drawerWidth, pt: 8 } }}>
            <List>
              {nav.map(([to, label, icon]) => (
                <ListItemButton key={to} component={NavLink} to={to}>
                  <ListItemIcon>{icon}</ListItemIcon>
                  <ListItemText primary={label} />
                </ListItemButton>
              ))}
            </List>
          </Drawer>
          <Box component="main" className="content">
            {authMessage ? <Alert severity="warning" sx={{ mb: 2 }}>{authMessage}</Alert> : null}
            <Routes>
              <Route path="/" element={<LiveDashboard token={token} />} />
              <Route path="/cameras" element={requireLogin(<CameraPage />)} />
              <Route path="/personnel" element={requireLogin(<PersonnelPage />)} />
              <Route path="/unknown" element={requireLogin(<UnknownQueuePage />)} />
              <Route path="/attendance" element={requireLogin(<AttendancePage />)} />
            </Routes>
          </Box>
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