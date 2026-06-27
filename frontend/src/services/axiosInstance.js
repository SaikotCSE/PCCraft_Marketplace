/**
 * PCCraft Marketplace — axios instance with JWT interceptors.
 *
 * Per spec §1.5 / Module 0 step 7:
 *   • baseURL is `import.meta.env.VITE_API_BASE_URL` (default `/api/v1`).
 *   • Request interceptor attaches `Authorization: Bearer <token>` from the
 *     auth store and `X-Session-Key: <session_key>` for anonymous tracking.
 *   • Response interceptor catches 401, calls `/auth/token/refresh/`, updates
 *     the store, and retries the original request. On refresh failure it
 *     clears auth and redirects to /login.
 *
 * Every backend endpoint returns the APIResponse envelope
 *   { success, data, meta, error }
 * so callers can `await api.get(...).then((r) => r.data.data)`.
 *
 * Avoids infinite refresh loops on the auth endpoints themselves — 401
 * on /auth/login/ is a *legitimate* bad-credentials response and must
 * bubble up untouched.
 */

import axios from 'axios';
import toast from 'react-hot-toast';

import { useAuthStore } from '@context/useAuthStore';
import { STORAGE_KEYS } from '@utils/constants';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const api = axios.create({
  baseURL,
  timeout: 30_000,
  withCredentials: false,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// ── Request interceptor ──────────────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    // Read directly from the store rather than passing the token through
    // every call site — keeps services clean.
    const { accessToken } = useAuthStore.getState();
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    const sessionKey = window.localStorage.getItem(STORAGE_KEYS.SESSION_KEY);
    if (sessionKey) {
      config.headers['X-Session-Key'] = sessionKey;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

// ── Response interceptor ─────────────────────────────────────────────
let isRefreshing = false;
let pendingQueue = [];

function flushQueue(error, token = null) {
  pendingQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  pendingQueue = [];
}

/** True for paths that should NEVER trigger the silent-refresh dance. */
const isAuthPath = (url = '') =>
  url.includes('/auth/login/') ||
  url.includes('/auth/register/') ||
  url.includes('/auth/logout/') ||
  url.includes('/auth/token/refresh/') ||
  url.includes('/auth/password/');

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config || {};
    const status = error.response?.status;

    // No response at all (network down, CORS preflight fail, etc.)
    if (!error.response) {
      toast.error('Network error — please check your connection.');
      return Promise.reject(error);
    }

    // 401 on a protected endpoint → try refresh once.
    if (status === 401 && !original._retry && !isAuthPath(original.url)) {
      if (isRefreshing) {
        // Another request is already refreshing; queue this one.
        return new Promise((resolve, reject) => {
          pendingQueue.push({ resolve, reject });
        }).then((token) => {
          original.headers = original.headers || {};
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        });
      }

      original._retry = true;
      isRefreshing = true;

      try {
        const { refreshToken } = useAuthStore.getState();
        if (!refreshToken) throw new Error('No refresh token');

        // Use a bare axios (not `api`) to avoid re-entering this interceptor.
        const { data } = await axios.post(`${baseURL}/auth/token/refresh/`, {
          refresh: refreshToken,
        });
        const tokens = data?.data || data; // envelope or bare
        useAuthStore.getState().setTokens({
          access: tokens.access,
          refresh: tokens.refresh ?? refreshToken,
        });

        flushQueue(null, tokens.access);
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${tokens.access}`;
        return api(original);
      } catch (refreshError) {
        flushQueue(refreshError, null);
        useAuthStore.getState().clearAuth();
        toast.error('Session expired — please sign in again.');
        if (
          typeof window !== 'undefined' &&
          !window.location.pathname.startsWith('/login')
        ) {
          window.location.assign('/login');
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Surface backend error messages when available.
    const envelope = error.response.data;
    if (envelope?.error?.message) {
      toast.error(envelope.error.message);
    } else if (typeof envelope === 'string') {
      toast.error(envelope);
    }

    return Promise.reject(error);
  },
);

export default api;