import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
export const WS_BASE = API_BASE.replace(/^http/, 'ws');

export const api = axios.create({ baseURL: API_BASE });

let unauthorizedHandler = null;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && unauthorizedHandler) {
      unauthorizedHandler();
    }
    return Promise.reject(error);
  },
);

export function setAuthToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
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
