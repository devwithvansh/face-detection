import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
export const WS_BASE = API_BASE.replace(/^http/, 'ws');

export const api = axios.create({ baseURL: API_BASE });

let unauthorizedHandler = null;
let refreshTimer = null;

// ── Token refresh helpers ─────────────────────────────────────────────────────

/**
 * Parse the expiry time from a JWT (without verifying signature).
 * Returns a Date or null.
 */
function getTokenExpiry(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ? new Date(payload.exp * 1000) : null;
  } catch {
    return null;
  }
}

/**
 * Schedule a token refresh ~5 minutes before expiry.
 * If the token expires in < 5 minutes, refresh immediately.
 */
function scheduleRefresh(token) {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  const expiry = getTokenExpiry(token);
  if (!expiry) return;

  const now = Date.now();
  const msUntilExpiry = expiry.getTime() - now;
  const refreshIn = Math.max(0, msUntilExpiry - 5 * 60 * 1000); // 5 min before expiry

  refreshTimer = setTimeout(async () => {
    try {
      const { data } = await api.post('/auth/refresh');
      const newToken = data.access_token;
      localStorage.setItem('token', newToken);
      setAuthToken(newToken);
      scheduleRefresh(newToken);
    } catch {
      // If refresh fails (token already expired), trigger logout
      if (unauthorizedHandler) unauthorizedHandler();
    }
  }, refreshIn);
}

// ── Interceptors ──────────────────────────────────────────────────────────────

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && unauthorizedHandler) {
      // Don't trigger logout for the refresh endpoint itself
      if (!error.config?.url?.includes('/auth/refresh')) {
        unauthorizedHandler();
      }
    }
    return Promise.reject(error);
  },
);

// ── Exports ───────────────────────────────────────────────────────────────────

export function setAuthToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    scheduleRefresh(token);
  } else {
    delete api.defaults.headers.common.Authorization;
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  }
}

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

export function storageUrl(path) {
  if (!path) return '';
  const normalized = path.replace(/\\/g, '/');
  const index = normalized.indexOf('storage/');
  return index >= 0 ? `${API_BASE}/${normalized.slice(index)}` : `${API_BASE}/${normalized}`;
}