// compatibilityService.js — frontend API client for Module 8 (PC Builder &
// Compatibility). Implements spec §2.10 wire contract.
//
// All methods are thin wrappers over `api.get/post/patch/delete` from
// axiosInstance so JWT rotation, error envelope normalisation, and the
// session-key header are handled in one place. Each method unwraps the
// `{success, data, ...}` envelope via the local `unwrap` helper.
//
// Endpoints (matches backend `apps/compatibility/urls.py`):
//   POST   /api/v1/compatibility/check/              -- run engine on in-memory slots
//   GET    /api/v1/compatibility/products/<slot>/    -- list compatible products
//   GET    /api/v1/compatibility/rules/              -- admin: rule CRUD (list)
//   POST   /api/v1/compatibility/rules/              -- admin: rule CRUD (create)
//   GET    /api/v1/compatibility/rules/<uuid>/       -- admin: rule CRUD (retrieve)
//   PATCH  /api/v1/compatibility/rules/<uuid>/       -- admin: rule CRUD (update)
//   DELETE /api/v1/compatibility/rules/<uuid>/       -- admin: rule CRUD (delete)
//   GET    /api/v1/compatibility/attributes/         -- admin: attribute CRUD (list)
//   POST   /api/v1/compatibility/attributes/         -- admin: attribute CRUD (create)
//   GET    /api/v1/compatibility/attributes/<uuid>/  -- admin: attribute CRUD (retrieve)
//   PATCH  /api/v1/compatibility/attributes/<uuid>/  -- admin: attribute CRUD (update)
//   DELETE /api/v1/compatibility/attributes/<uuid>/  -- admin: attribute CRUD (delete)
//   GET    /api/v1/compatibility/builds/             -- user: list own builds
//   POST   /api/v1/compatibility/builds/             -- user: create build
//   GET    /api/v1/compatibility/builds/<int:pk>/    -- user: retrieve own build
//   PATCH  /api/v1/compatibility/builds/<int:pk>/    -- user: update own build
//   DELETE /api/v1/compatibility/builds/<int:pk>/    -- user: delete own build
//   GET    /api/v1/builds/                           -- alias for /compatibility/builds/
//                                                       (spec §2.10: "On login: auto-POST")
//   GET    /api/v1/builds/share/<uuid:token>/        -- public share link

import api from '@services/axiosInstance';
import { buildSelectionQuery, getQueryKey } from '@utils/pcSlots';

const unwrap = (response) => response?.data?.data ?? response?.data;

export const compatibilityService = {
  // ------------------------------------------------------------------
  // Compatibility engine
  // ------------------------------------------------------------------

  /**
   * Run the compatibility engine on an in-memory slot map (no DB write).
   *
   * @param {{ [slotKey: string]: string|null|undefined }} slots
   *   e.g. `{ CPU: 'uuid', MOBO: 'uuid', PSU: 'uuid' }`.
   *
   * @returns {Promise<{
   *   results: Array<{
   *     rule_name: string,
   *     status: 'OK'|'WARNING'|'ERROR'|'INFO',
   *     message: string,
   *     category_a: string,
   *     category_b: string,
   *   }>,
   *   wattage: {
   *     estimated_tdp: number,
   *     psu_wattage: number|null,
   *     psu_headroom: number|null,
   *     status: 'OK'|'WARNING'|'ERROR',
   *     message: string,
   *   },
   *   total_price: string,
   * }>}
   */
  checkBuild: (slots) =>
    api.post('/compatibility/check/', { slots: slots || {} }).then(unwrap),

  /**
   * List products compatible with the current build for one slot.
   * Per spec §2.10, query keys are slot-specific (`cpu_id`, `mobo_id`,
   * ...). The caller may also pass `search`, `page`, `page_size`.
   *
   * @param {string} slotKey     one of the 11 PCBuildSlot values.
   * @param {object} [options]
   * @param {{ [slotKey: string]: string }} [options.slots]   current build.
   * @param {string} [options.search]                         name/brand filter.
   * @param {number} [options.page]
   * @param {number} [options.pageSize]
   */
  compatibleFor: (slotKey, options = {}) => {
    const { slots = {}, search, page, pageSize } = options;
    const params = {};
    const selection = buildSelectionQuery(slots);
    if (selection) {
      // URLSearchParams → flat object so axios serialises it as `?cpu_id=...&...`
      for (const [k, v] of new URLSearchParams(selection)) {
        params[k] = v;
      }
    }
    if (search) params.search = search;
    if (page) params.page = page;
    if (pageSize) params.page_size = pageSize;
    return api
      .get(`/compatibility/products/${encodeURIComponent(slotKey)}/`, { params })
      .then(unwrap);
  },

  // ------------------------------------------------------------------
  // Admin: compatibility rules
  // ------------------------------------------------------------------

  /** GET /compatibility/rules/ -- paginated list. */
  listRules: (params = {}) =>
    api.get('/compatibility/rules/', { params }).then(unwrap),

  /** POST /compatibility/rules/ -- create. */
  createRule: (payload) =>
    api.post('/compatibility/rules/', payload).then(unwrap),

  /** GET /compatibility/rules/<uuid>/ -- retrieve one. */
  getRule: (id) =>
    api.get(`/compatibility/rules/${encodeURIComponent(id)}/`).then(unwrap),

  /** PATCH /compatibility/rules/<uuid>/ -- partial update. */
  updateRule: (id, patch) =>
    api
      .patch(`/compatibility/rules/${encodeURIComponent(id)}/`, patch)
      .then(unwrap),

  /** DELETE /compatibility/rules/<uuid>/ -- delete (soft-delete on backend). */
  deleteRule: (id) =>
    api.delete(`/compatibility/rules/${encodeURIComponent(id)}/`).then(unwrap),

  // ------------------------------------------------------------------
  // Admin: compatibility attributes
  // ------------------------------------------------------------------

  listAttributes: (params = {}) =>
    api.get('/compatibility/attributes/', { params }).then(unwrap),

  createAttribute: (payload) =>
    api.post('/compatibility/attributes/', payload).then(unwrap),

  getAttribute: (id) =>
    api
      .get(`/compatibility/attributes/${encodeURIComponent(id)}/`)
      .then(unwrap),

  updateAttribute: (id, patch) =>
    api
      .patch(`/compatibility/attributes/${encodeURIComponent(id)}/`, patch)
      .then(unwrap),

  deleteAttribute: (id) =>
    api
      .delete(`/compatibility/attributes/${encodeURIComponent(id)}/`)
      .then(unwrap),

  // ------------------------------------------------------------------
  // User: PC build CRUD (canonical /compatibility/builds/ prefix)
  // ------------------------------------------------------------------

  /** GET /compatibility/builds/ -- paginated list of own builds. */
  listBuilds: (params = {}) =>
    api.get('/compatibility/builds/', { params }).then(unwrap),

  /**
   * POST /compatibility/builds/ -- create a new build.
   * @param {object} payload
   * @param {string} payload.name
   * @param {boolean} [payload.is_public]
   * @param {{ [slotKey: string]: string|null }} payload.slots
   */
  createBuild: (payload) =>
    api.post('/compatibility/builds/', payload).then(unwrap),

  /** GET /compatibility/builds/<id>/ -- retrieve one (owner / admin). */
  getBuild: (id) =>
    api.get(`/compatibility/builds/${encodeURIComponent(id)}/`).then(unwrap),

  /** PATCH /compatibility/builds/<id>/ -- partial update. */
  updateBuild: (id, patch) =>
    api.patch(`/compatibility/builds/${encodeURIComponent(id)}/`, patch).then(unwrap),

  /** DELETE /compatibility/builds/<id>/ -- delete (soft). */
  deleteBuild: (id) =>
    api.delete(`/compatibility/builds/${encodeURIComponent(id)}/`).then(unwrap),

  // ------------------------------------------------------------------
  // Public share endpoint
  // ------------------------------------------------------------------

  /**
   * GET /compatibility/builds/share/<token>/ -- public read-only when the
   * build has `is_public=True`. Returns the same shape as `getBuild`.
   */
  getSharedBuild: (token) =>
    api
      .get(`/compatibility/builds/share/${encodeURIComponent(token)}/`)
      .then(unwrap),

  // ------------------------------------------------------------------
  // Spec §2.10 alias: /api/v1/builds/ (auto-POST on login)
  // ------------------------------------------------------------------
  // The backend mounts the same build-CRUD views at `/api/v1/builds/` so
  // the spec-mandated auto-POST on login doesn't have to traverse the
  // `/compatibility/` prefix. `createBuildAlias` exists so `usePCBuilder`
  // can target it directly when migrating anonymous localStorage builds.

  /** POST /builds/ -- alias for POST /compatibility/builds/. */
  createBuildAlias: (payload) =>
    api.post('/builds/', payload).then(unwrap),

  /** GET /builds/ -- alias for GET /compatibility/builds/. */
  listBuildsAlias: (params = {}) =>
    api.get('/builds/', { params }).then(unwrap),
};

// ----------------------------------------------------------------------
// Helpers (kept off the namespace object so they don't trigger the
// React-query-style refetch when callers spread the service).
// ----------------------------------------------------------------------

/**
 * Build the slot-key → query-key mapping for any caller that wants to
 * write the URL by hand (e.g. deep links). Mirrors the backend
 * `CompatibleProductsView.SLOT_QUERY_KEYS`.
 *
 * @deprecated prefer `buildSelectionQuery` from `@utils/pcSlots`.
 */
export const SLOT_QUERY_KEYS = new Proxy(
  {},
  {
    get: (_target, prop) => getQueryKey(prop),
  },
);

export default compatibilityService;
