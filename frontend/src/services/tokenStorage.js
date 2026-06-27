// tokenStorage — thin localStorage wrapper for JWT pair + user record.
//
// SECURITY NOTE
// ============
// This module stores JWT access + refresh tokens in plain localStorage.
// That is a deliberate trade-off for this app (single-tenant, B2C,
// short token TTLs, refresh rotation on). The risks are:
//   1. localStorage is readable by any JS running on the page (XSS).
//   2. Tokens survive across tabs and browser restarts.
// The mitigations we rely on:
//   - CSP forbids inline scripts + untrusted origins.
//   - refresh-token rotation (refresh is single-use).
//   - 15-minute access TTL limits the blast radius if leaked.
// If the spec ever requires HTTP-only cookie auth, swap this module's
// implementation and nothing else changes.
import { STORAGE_KEYS } from '@/utils/constants';

const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

const safeGet = (key) => {
  if (!isBrowser) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSet = (key, value) => {
  if (!isBrowser) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // quota exceeded / private mode — fall through silently
  }
};

const safeRemove = (key) => {
  if (!isBrowser) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
};

const safeParse = (json, fallback) => {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
};

export const tokenStorage = {
  read() {
    return {
      accessToken: safeGet(STORAGE_KEYS.ACCESS_TOKEN),
      refreshToken: safeGet(STORAGE_KEYS.REFRESH_TOKEN),
    };
  },

  write({ accessToken, refreshToken }) {
    if (accessToken !== undefined) safeSet(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
    if (refreshToken !== undefined) safeSet(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
  },

  clear() {
    safeRemove(STORAGE_KEYS.ACCESS_TOKEN);
    safeRemove(STORAGE_KEYS.REFRESH_TOKEN);
    safeRemove(STORAGE_KEYS.USER);
  },

  readUser() {
    return safeParse(safeGet(STORAGE_KEYS.USER), null);
  },

  writeUser(user) {
    if (user === null || user === undefined) {
      safeRemove(STORAGE_KEYS.USER);
      return;
    }
    safeSet(STORAGE_KEYS.USER, JSON.stringify(user));
  },

  /** Read the anonymous session key (separate from auth). */
  readSessionKey() {
    return safeGet(STORAGE_KEYS.SESSION_KEY);
  },

  /** Lazily create + persist an anonymous session key. */
  ensureSessionKey() {
    let key = safeGet(STORAGE_KEYS.SESSION_KEY);
    if (!key) {
      key =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      safeSet(STORAGE_KEYS.SESSION_KEY, key);
    }
    return key;
  },
};

export default tokenStorage;
