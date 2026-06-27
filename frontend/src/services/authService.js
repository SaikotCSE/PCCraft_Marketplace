/**
 * authService — thin axios wrappers for the PCCraft auth endpoints.
 *
 * All endpoints live under `/api/v1/auth/` per `backend/apps/accounts/urls.py`
 * and the master spec §Module 1. Business logic stays in the calling
 * component / hook; this module only handles URL shape, payload assembly,
 * and envelope unwrapping.
 *
 * The backend wraps every response in `{success, data, meta, error}` —
 * `unwrap` peels that envelope so callers receive the `data` payload.
 */

import api from '@services/axiosInstance';

const unwrap = (response) => response.data?.data ?? response.data;

export const authService = {
  // ─── Authentication ──────────────────────────────────────────────
  /**
   * Authenticate against the role-aware login endpoint.
   * @param {{ email: string, password: string, role: 'customer'|'vendor'|'admin' }} payload
   * @returns {Promise<{access: string, refresh: string, user: object}>}
   */
  login(payload) {
    return api.post('/auth/login/', payload).then(unwrap);
  },

  /**
   * Exchange a refresh token for a new access+refresh pair (rotation on).
   * @param {string} refreshToken
   * @returns {Promise<{access: string, refresh: string, user: object}>}
   */
  refreshToken(refreshToken) {
    return api.post('/auth/token/refresh/', { refresh: refreshToken }).then(unwrap);
  },

  /**
   * Blacklist the supplied refresh token. Never throws — failures are
   * logged inside the interceptor so a flaky backend can't keep the user
   * stuck in a "trying to log out" loop.
   * @param {string} refreshToken
   */
  async logout(refreshToken) {
    if (!refreshToken) return undefined;
    try {
      return await api.post('/auth/logout/', { refresh: refreshToken }).then(unwrap);
    } catch (err) {
      // The 401 interceptor already cleared auth if the token was bad.
      // Swallow here so the caller doesn't need a try/catch.
      return undefined;
    }
  },

  // ─── Registration ────────────────────────────────────────────────
  /**
   * Customer self-registration — JSON body, returns {user, message}.
   * @param {{
   *   full_name: string,
   *   email: string,
   *   phone: string,
   *   password: string,
   *   confirm_password: string,
   *   date_of_birth?: string,
   *   gender?: 'MALE'|'FEMALE'|'PREFER_NOT_TO_SAY',
   *   accept_terms: boolean,
   * }} payload
   */
  registerCustomer(payload) {
    return api.post('/auth/register/customer/', payload).then(unwrap);
  },

  /**
   * Vendor application — multipart form because it carries two PDFs.
   * @param {FormData} formData
   */
  registerVendor(formData) {
    return api
      .post('/auth/register/vendor/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then(unwrap);
  },

  /**
   * Vendor resubmission of trade-license / NID after INFO_REQUESTED.
   * @param {FormData} formData — must contain at least one of `trade_license_doc`, `nid_doc`.
   */
  uploadVendorDocuments(formData) {
    return api
      .patch('/auth/vendor/documents/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then(unwrap);
  },

  // ─── Profile ─────────────────────────────────────────────────────
  /**
   * GET /auth/profile/ → customer or vendor payload (server routes by role).
   * @returns {Promise<object>}
   */
  fetchProfile() {
    return api.get('/auth/profile/').then(unwrap);
  },

  /**
   * PATCH /auth/profile/ — body shape depends on role; customer fields
   * are passed as plain JSON (avatar is uploaded separately if needed).
   * @param {object} patch
   */
  updateProfile(patch) {
    return api.patch('/auth/profile/', patch).then(unwrap);
  },

  // ─── Password reset (stub endpoints — wired once the backend adds
  //     dedicated `password_reset_confirm` views). For now we keep the
  //     same shape so swapping the URLs is a one-line change.
  // ─────────────────────────────────────────────────────────────────
  requestPasswordReset(email) {
    return api.post('/auth/password/reset/', { email }).then(unwrap);
  },

  confirmPasswordReset(payload) {
    return api.post('/auth/password/reset/confirm/', payload).then(unwrap);
  },
};

export default authService;