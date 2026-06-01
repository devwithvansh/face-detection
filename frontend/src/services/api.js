import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
export const WS_BASE = API_BASE.replace(/^http/, 'ws');

export const api = axios.create({ baseURL: API_BASE });

let unauthorizedHandler = null;
let refreshTimer = null;

function getTokenExpiry(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ? new Date(payload.exp * 1000) : null;
  } catch {
    return null;
  }
}

export function isTokenExpired(token) {
  const expiry = getTokenExpiry(token);
  if (!expiry) return true;
  return Date.now() > expiry.getTime() - 10_000;
}

function scheduleRefresh(token) {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  const expiry = getTokenExpiry(token);
  if (!expiry) return;

  const msUntilExpiry = expiry.getTime() - Date.now();

  if (msUntilExpiry < 10_000) {
    if (unauthorizedHandler) unauthorizedHandler();
    return;
  }

  const refreshIn = Math.max(0, msUntilExpiry - 5 * 60 * 1000);

  refreshTimer = setTimeout(async () => {
    try {
      const { data } = await api.post('/auth/refresh');
      const newToken = data.access_token;
      localStorage.setItem('token', newToken);
      setAuthToken(newToken);
      scheduleRefresh(newToken);
    } catch {
      if (unauthorizedHandler) unauthorizedHandler();
    }
  }, refreshIn);
}

// Track in-flight refresh to avoid parallel logouts
let isRefreshing = false;
let failedQueue = [];

function processQueue(error, token = null) {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await api.post('/auth/refresh');
        const newToken = data.access_token;
        localStorage.setItem('token', newToken);
        setAuthToken(newToken);
        processQueue(null, newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        if (unauthorizedHandler) unauthorizedHandler();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

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

/**
 * Build a WebSocket URL with the auth token as a query param.
 * WS connections cannot send Authorization headers, so token goes in the URL.
 */
export function buildWsUrl(path, token) {
  const base = `${WS_BASE}${path}`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

export function storageUrl(path) {
  if (!path) return '';
  const normalized = path.replace(/\\/g, '/');
  const index = normalized.indexOf('storage/');
  return index >= 0 ? `${API_BASE}/${normalized.slice(index)}` : `${API_BASE}/${normalized}`;
}