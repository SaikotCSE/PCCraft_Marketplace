// useAuthStore — Zustand store for the authenticated user + JWT pair.
//
// Contract with axiosInstance:
//   - axiosInstance imports `getAccessToken`, `getRefreshToken`,
//     `setTokens`, `clearAuth` from this module.
//   - It does NOT subscribe to the store (no React re-renders for token
//     rotation). The store is updated whenever authService.login /
//     refresh / logout succeed, so the next request sees fresh tokens.
//
// Persistence:
//   - access_token + refresh_token live in localStorage under
//     STORAGE_KEYS.ACCESS_TOKEN / REFRESH_TOKEN.
//   - user is stored under STORAGE_KEYS.USER (so the navbar can render
//     a name before /profile loads).
//   - On store creation we hydrate from storage; if either token is
//     missing we treat the user as anonymous.
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import { authService } from '@services/authService';
import { tokenStorage } from '@services/tokenStorage';
import { STORAGE_KEYS } from '@utils/constants';

const initialTokens = tokenStorage.read();

export const useAuthStore = create(
  subscribeWithSelector((set, get) => ({
    // ----- state -----
    user: tokenStorage.readUser(),
    accessToken: initialTokens.accessToken || null,
    refreshToken: initialTokens.refreshToken || null,
    isAuthenticated: Boolean(initialTokens.accessToken),
    role: tokenStorage.readUser()?.role || null,
    isLoading: false,
    error: null,

    // ----- computed (selectors) -----
    isCustomer: () => get().role === 'customer',
    isVendor: () => get().role === 'vendor',
    isAdmin: () => get().role === 'admin',
    isVerified: () => Boolean(get().user?.is_verified),

    // ----- mutators -----
    /**
     * Persist a fresh token pair + user record.
     * Called by login, register, and refresh flows.
     */
    setAuth: ({ user, access, refresh }) => {
      tokenStorage.write({ accessToken: access, refreshToken: refresh });
      tokenStorage.writeUser(user);
      set({
        user,
        accessToken: access,
        refreshToken: refresh,
        isAuthenticated: Boolean(access),
        role: user?.role || null,
        error: null,
      });
    },

    /** Update only the user record (e.g. after /profile fetch). */
    setUser: (user) => {
      tokenStorage.writeUser(user);
      set({ user, role: user?.role || get().role });
    },

    /** Update tokens after a successful refresh. */
    setTokens: ({ access, refresh }) => {
      tokenStorage.write({ accessToken: access, refreshToken: refresh });
      set({
        accessToken: access,
        refreshToken: refresh || get().refreshToken,
        isAuthenticated: Boolean(access),
      });
    },

    /** Wipe tokens + user. Used on logout and unrecoverable refresh failure. */
    clearAuth: () => {
      tokenStorage.clear();
      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        role: null,
        error: null,
      });
    },

    setError: (error) => set({ error }),

    // ----- async actions (called from components) -----
    login: async (credentials) => {
      set({ isLoading: true, error: null });
      try {
        const data = await authService.login(credentials);
        // envelope shape: { data: { user, access, refresh } }
        const payload = data?.data || data;
        get().setAuth(payload);
        return payload.user;
      } catch (err) {
        const message = err.response?.data?.error?.message || err.message || 'Login failed';
        set({ error: message });
        throw err;
      } finally {
        set({ isLoading: false });
      }
    },

    register: async (role, form) => {
      set({ isLoading: true, error: null });
      try {
        const fn =
          role === 'vendor' ? authService.registerVendor : authService.registerCustomer;
        const data = await fn(form);
        const payload = data?.data || data;
        if (payload?.access) {
          get().setAuth(payload);
          return payload.user;
        }
        return payload; // registration without auto-login (e.g. vendor pending)
      } catch (err) {
        const message = err.response?.data?.error?.message || err.message || 'Registration failed';
        set({ error: message });
        throw err;
      } finally {
        set({ isLoading: false });
      }
    },

    logout: async () => {
      const { refreshToken } = get();
      // authService.logout is best-effort — never throws — so a flaky
      // backend can't keep the user stuck on a spinner.
      if (refreshToken) await authService.logout(refreshToken);
      get().clearAuth();
    },

    /**
     * Silent refresh on app init. Called from <App /> once on mount
     * when we have a refresh token in storage but no (or stale) access
     * token. Returns true if we recovered a usable access token.
     */
    silentRefresh: async () => {
      const { refreshToken } = get();
      if (!refreshToken) return false;
      try {
        const data = await authService.refreshToken(refreshToken);
        const payload = data?.data || data;
        get().setTokens({
          access: payload.access,
          refresh: payload.refresh ?? refreshToken,
        });
        if (payload.user) get().setUser(payload.user);
        return true;
      } catch {
        get().clearAuth();
        return false;
      }
    },

    refreshProfile: async () => {
      try {
        const data = await authService.fetchProfile();
        const user = data?.data || data;
        get().setUser(user);
        return user;
      } catch {
        // 401 here means the access token is dead AND refresh failed —
        // axiosInstance already redirected to /login. Nothing to do.
        return null;
      }
    },

    /**
     * PATCH /auth/profile/ with the supplied partial fields. Server
     * returns the full updated user record; we mirror it into local
     * state so the navbar reflects changes immediately.
     */
    updateProfile: async (patch) => {
      try {
        const data = await authService.updateProfile(patch);
        const updated = data?.data || data;
        get().setUser(updated);
        return updated;
      } catch (err) {
        const apiError = err.response?.data?.error;
        const message = apiError?.message || 'Profile update failed.';
        set({ error: message });
        throw err;
      }
    },
  }))
);

// ----- non-React accessors for axiosInstance -----
// These avoid the `useAuthStore.getState()` hop in the hot request path
// and keep the store import surface narrow for the HTTP layer.
export const getAccessToken = () => useAuthStore.getState().accessToken;
export const getRefreshToken = () => useAuthStore.getState().refreshToken;
export const getSessionUser = () => useAuthStore.getState().user;

export default useAuthStore;

// Re-export the storage key constants for convenience.
export { STORAGE_KEYS };
