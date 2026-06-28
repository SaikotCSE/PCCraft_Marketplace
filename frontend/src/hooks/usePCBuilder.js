// usePCBuilder.js — Zustand store + imperative helpers for the PC Builder.
//
// Spec §2.10 "Build Persistence" + Module 8 frontend sub-spec lines 2993-3117:
//
//   * Anonymous builds live in localStorage under key `pccraft_build` as
//     `{ slots: { CPU: product_id, ... }, name: 'My Build' }`. Every
//     slot change is mirrored to localStorage via Zustand's `persist`
//     middleware (same pattern as `useCartStore`).
//   * On login (auth store flips `isAuthenticated` false → true) the
//     hook auto-POSTs to `POST /api/v1/builds/` (spec §2.10 alias path)
//     to migrate the anonymous build into a DB-persisted record.
//   * Every slot change debounces 500ms then calls `POST
//     /api/v1/compatibility/check/` with the current slots and stores
//     the resulting `{ results, wattage, total_price }` envelope so the
//     right-hand panel (CompatibilityReport, WattageDisplay, BuildSummary)
//     can render synchronously.
//   * The store exposes Save / Share / Add All to Cart actions the
//     page-level CTAs call.
//
// We intentionally do NOT use React Query here — the in-memory result
// envelope is tiny (≤ 11 rule rows) and the re-check cadence is fully
// driven by user actions, so a plain `set` on debounce is simpler than
// an `useQuery` cache.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { compatibilityService } from '@services/compatibilityService';
import { useAuthStore } from '@context/useAuthStore';
import { useCartStore } from '@context/useCartStore';
import {
  BUILD_STORAGE_KEY,
  EMPTY_BUILD,
  REQUIRED_SLOT_KEYS,
  SLOT_KEYS,
} from '@utils/pcSlots';

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit-testing in dev; the components import them
// from here too so there's one source of truth for the build-state rules).
// ---------------------------------------------------------------------------

/**
 * Return `true` when every required slot is filled and there are no
 * empty optional slots that the user has touched (i.e. a build is
 * "complete" iff every required key is non-null).
 */
export function isBuildComplete(slots) {
  if (!slots || typeof slots !== 'object') return false;
  return REQUIRED_SLOT_KEYS.every(
    (k) => slots[k] !== null && slots[k] !== undefined && slots[k] !== '',
  );
}

/**
 * Count how many slots are currently filled (non-null). Used by the
 * BuildSummary card's checklist.
 */
export function countFilled(slots) {
  if (!slots || typeof slots !== 'object') return 0;
  return SLOT_KEYS.reduce((n, k) => {
    const v = slots[k];
    return n + (v !== null && v !== undefined && v !== '' ? 1 : 0);
  }, 0);
}

/**
 * Return the slot keys that are still empty for the required-slot
 * checklist in BuildSummary.
 */
export function missingRequiredSlots(slots) {
  if (!slots) return [...REQUIRED_SLOT_KEYS];
  return REQUIRED_SLOT_KEYS.filter((k) => {
    const v = slots[k];
    return v === null || v === undefined || v === '';
  });
}

// ---------------------------------------------------------------------------
// Debounce primitive — kept module-local so the migration side-effect
// doesn't pull in lodash.
// ---------------------------------------------------------------------------

/**
 * Trailing-edge debounce that returns a function with a `.cancel()`
 * method. Caller is responsible for clearing pending timers on unmount
 * to avoid the classic "setState on unmounted component" warning when
 * the user navigates away mid-recheck.
 */
function debounce(fn, wait) {
  let timer = null;
  const debounced = (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  };
  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return debounced;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/**
 * Run the compatibility engine against the in-memory slot map and
 * store the result. Caller doesn't await — failures fall through to
 * `error` and the UI shows an ErrorState.
 */
async function runCheck(set, get, slots) {
  if (!slots) return;
  set({ isChecking: true, error: null });
  try {
    const data = await compatibilityService.checkBuild(slots);
    const payload = data?.data || data;
    set({
      results: payload?.results || [],
      wattage: payload?.wattage || null,
      totalPrice: payload?.total_price ?? '0',
      isChecking: false,
      lastCheckedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message =
      err?.response?.data?.error?.message ||
      err?.message ||
      'Compatibility check failed.';
    set({ isChecking: false, error: message, results: [], wattage: null });
  }
  // Silence the lint warning about unused get in some build configs.
  void get;
}

// 500 ms matches spec sub-spec line 3087 ("debounce 500ms then call
// check_build API"). A second store instance would share this timer
// because it's a module-level singleton — fine for our SPA scope.
const debouncedRunCheck = debounce((set, get, slots) => {
  runCheck(set, get, slots);
}, 500);

export const usePCBuilder = create(
  persist(
    (set, get) => ({
      // ----- persistent state -----
      /** Display name shown on Save / Share CTAs. */
      name: EMPTY_BUILD.name,
      /** `{ slotKey: productId | null }` — may be sparse. */
      slots: {},

      // ----- ephemeral (NOT persisted) -----
      /** Server build id once we've migrated the anonymous build. */
      buildId: null,
      /** Share token returned by POST /builds/ — needed for the public URL. */
      shareToken: null,
      /** Last compatibility check payload. */
      results: [],
      wattage: null,
      totalPrice: '0',
      isChecking: false,
      error: null,
      isSaving: false,
      isSharing: false,
      lastCheckedAt: null,
      lastSavedAt: null,
      /** True for one render after the localStorage build is migrated to the server. */
      migratedOnLogin: false,
      /**
       * In-memory cache of slot → product summary, kept alongside the
       * ids so the UI can render SlotCard (thumbnail + price + name)
       * without re-fetching. Cleared alongside the matching id when the
       * slot is cleared. NOT persisted — page refresh repopulates via
       * `hydrateFromBuild` (from server) or re-selections.
       */
      slotProducts: {},

      // ----- selectors -----
      isComplete: () => isBuildComplete(get().slots),
      filledCount: () => countFilled(get().slots),
      missingRequired: () => missingRequiredSlots(get().slots),
      getSlotProductId: (slotKey) => get().slots?.[slotKey] ?? null,
      getSlotProduct: (slotKey) => get().slotProducts?.[slotKey] ?? null,

      // ----- slot mutators -----
      /**
       * Fill (or replace) a slot. The 500ms debounced re-check fires
       * after this so the right-hand panel updates live. Pass `null`
       * to clear the slot. Pass an optional `product` snapshot to
       * populate the in-memory cache for SlotCard rendering.
       */
      setSlot: (slotKey, productId, product = null) => {
        if (!SLOT_KEYS.includes(slotKey)) return;
        const slots = { ...get().slots };
        const slotProducts = { ...(get().slotProducts || {}) };
        if (productId === null || productId === undefined || productId === '') {
          delete slots[slotKey];
          delete slotProducts[slotKey];
        } else {
          slots[slotKey] = String(productId);
          if (product && typeof product === 'object') {
            slotProducts[slotKey] = product;
          }
        }
        set({ slots, slotProducts, error: null });
        debouncedRunCheck(set, get, slots);
      },

      /**
       * Update only the cached product snapshot for a slot — used after
       * a server round-trip hydrates richer data than the picker had.
       */
      setSlotProduct: (slotKey, product) => {
        if (!SLOT_KEYS.includes(slotKey) || !product) return;
        const slotProducts = { ...(get().slotProducts || {}) };
        slotProducts[slotKey] = product;
        set({ slotProducts });
      },

      /**
       * Clear a single slot.
       */
      clearSlot: (slotKey) => get().setSlot(slotKey, null),

      /**
       * Wipe the entire build (local + server side effects are the
       * page's job; this method only resets local state).
       */
      clearAll: () => {
        debouncedRunCheck.cancel();
        set({
          slots: {},
          slotProducts: {},
          name: EMPTY_BUILD.name,
          buildId: null,
          shareToken: null,
          results: [],
          wattage: null,
          totalPrice: '0',
          isChecking: false,
          error: null,
          isSaving: false,
          isSharing: false,
          lastCheckedAt: null,
          lastSavedAt: null,
          migratedOnLogin: false,
        });
      },

      /** Rename the build (display + server). */
      setName: (name) => {
        const trimmed = (name || '').toString().slice(0, 120);
        set({ name: trimmed });
      },

      // ----- server actions -----

      /**
       * POST /api/v1/compatibility/builds/ (or /api/v1/builds/ for the
       * spec alias — we use the canonical path here because the alias
       * mounts the same viewset). On success the buildId + shareToken
       * are stored so subsequent Save / Share calls reuse the same row.
       */
      saveBuild: async (overrides = {}) => {
        const { isAuthenticated } = useAuthStore.getState();
        if (!isAuthenticated) {
          const err = new Error('Sign in to save your build.');
          err.code = 'UNAUTHENTICATED';
          throw err;
        }
        set({ isSaving: true, error: null });
        try {
          const payload = {
            name: overrides.name ?? get().name ?? EMPTY_BUILD.name,
            is_public: overrides.is_public ?? false,
            slots: get().slots,
          };
          let data;
          if (get().buildId) {
            data = await compatibilityService.updateBuild(get().buildId, payload);
          } else {
            data = await compatibilityService.createBuild(payload);
          }
          const result = data?.data || data;
          set({
            buildId: result?.id ?? get().buildId,
            shareToken: result?.share_token ?? get().shareToken,
            name: result?.name ?? payload.name,
            isSaving: false,
            lastSavedAt: new Date().toISOString(),
          });
          return result;
        } catch (err) {
          const message =
            err?.response?.data?.error?.message ||
            err?.message ||
            'Save failed.';
          set({ isSaving: false, error: message });
          throw err;
        }
      },

      /**
       * Save (if needed) then expose the share URL. Spec sub-spec:
       * "Only enabled after build has been saved at least once".
       * Returns `{ url, token }` for the caller to copy to clipboard.
       */
      shareBuild: async () => {
        if (!get().buildId) await get().saveBuild({ is_public: true });
        set({ isSharing: true });
        try {
          const token =
            get().shareToken ||
            (await get().saveBuild({ is_public: true }))?.share_token;
          if (!token) throw new Error('Share token unavailable.');
          const url = `${window.location.origin}/builds/share/${token}`;
          set({ isSharing: false });
          return { url, token };
        } catch (err) {
          set({ isSharing: false });
          throw err;
        }
      },

      /**
       * Sequentially `cartService.addItem` for every filled slot. Uses
       * `useCartStore.addItem` so the optimistic local update +
       * server reconcile flow is reused (avoids duplicating the
       * "add then fetch" logic). Surfaces a per-item error toast on
       * failure but does NOT roll back successful adds — the user
       * would rather keep what they got.
       */
      addAllToCart: async () => {
        const filled = Object.entries(get().slots || {})
          .filter(([, id]) => id !== null && id !== undefined && id !== '')
          .map(([slotKey, productId]) => ({ slotKey, productId }));
        if (filled.length === 0) return { added: 0, failed: 0 };
        const cart = useCartStore.getState();
        let added = 0;
        let failed = 0;
        for (const { productId } of filled) {
          try {
            await cart.addItem({ product_id: productId, quantity: 1 });
            added += 1;
          } catch {
            failed += 1;
          }
        }
        return { added, failed, total: filled.length };
      },

      /**
       * Load a build (from list / detail response) into local state.
       * Used by `SharedBuildPage` "Clone This Build" and by
       * `MyBuildsPage` "Load" actions.
       */
      hydrateFromBuild: (build) => {
        if (!build) return;
        // The backend serialises slots as `{ CPU: <product|null>, ... }`.
        // Reduce it back to `{ CPU: productId|null }` for the store AND
        // capture the product snapshot for SlotCard rendering.
        const slots = {};
        const slotProducts = {};
        for (const key of SLOT_KEYS) {
          const product = build.slots?.[key];
          if (product?.id) {
            slots[key] = String(product.id);
            slotProducts[key] = product;
          } else {
            slots[key] = null;
          }
        }
        set({
          buildId: build.id ?? get().buildId,
          shareToken: build.share_token ?? get().shareToken,
          name: build.name ?? get().name ?? EMPTY_BUILD.name,
          slots,
          slotProducts,
          results: build.compatibility_results ?? [],
          wattage: build.wattage ?? null,
          totalPrice: build.total_price ?? '0',
          isChecking: false,
          error: null,
          lastCheckedAt: new Date().toISOString(),
        });
      },

      /**
       * Force a fresh compatibility check (used when the page mounts
       * with slots already in storage).
       */
      recheckNow: () => {
        debouncedRunCheck.cancel();
        return runCheck(set, get, get().slots);
      },

      /**
       * Wipe server-side state but keep localStorage intact. Used by
       * the login-migration so we don't double-POST after a successful
       * migration.
       */
      detachFromServer: () =>
        set({ buildId: null, shareToken: null, migratedOnLogin: false }),

      /**
       * Mark that the localStorage build has been migrated. Called
       * by the `useAuthStore.subscribe` listener after a successful
       * POST so subsequent renders can flag the user.
       */
      markMigrated: () => set({ migratedOnLogin: true }),
    }),
    {
      name: BUILD_STORAGE_KEY, // 'pccraft_build'
      storage: createJSONStorage(() => localStorage),
      // Only persist the spec-mandated shape; everything else is recomputed.
      partialize: (state) => ({ slots: state.slots, name: state.name }),
      version: 1,
      // Forward-compatibility: when we add a new optional slot, drop
      // any keys the store doesn't know about rather than crashing.
      merge: (persisted, current) => {
        const safeSlots = {};
        if (persisted?.slots && typeof persisted.slots === 'object') {
          for (const key of SLOT_KEYS) {
            const v = persisted.slots[key];
            if (v !== null && v !== undefined && v !== '') {
              safeSlots[key] = String(v);
            }
          }
        }
        return {
          ...current,
          ...persisted,
          slots: safeSlots,
          name: persisted?.name || current.name || EMPTY_BUILD.name,
        };
      },
    },
  ),
);

// ---------------------------------------------------------------------------
// Login-migration side-effect.
//
// Spec §2.10 "On login: auto-POST to POST /api/v1/builds/ to create a
// DB-persisted record". We subscribe to `useAuthStore`'s `isAuthenticated`
// slice; when it flips false → true AND we have a non-empty local
// build AND no buildId yet, we POST it via `createBuildAlias`
// (targets the /api/v1/builds/ alias as a literal spec §2.10 reference).
//
// The subscription is registered exactly once at module load — repeated
// imports of this file (HMR, tests) are guarded by the `migratorInstalled`
// flag.
// ---------------------------------------------------------------------------

let migratorInstalled = false;

export function installLoginMigrator() {
  if (migratorInstalled) return;
  migratorInstalled = true;

  let prevAuthed = useAuthStore.getState().isAuthenticated;

  useAuthStore.subscribe(
    (state) => state.isAuthenticated,
    (isAuthed) => {
      const wasAnon = !prevAuthed;
      prevAuthed = isAuthed;

      // We only care about the false → true transition.
      if (!wasAnon || !isAuthed) return;

      const builder = usePCBuilder.getState();
      // Nothing to migrate if local storage is empty or we already
      // have a server build id.
      if (builder.buildId) return;
      const hasAnySlot = Object.values(builder.slots || {}).some(
        (v) => v !== null && v !== undefined && v !== '',
      );
      if (!hasAnySlot) return;

      // Fire-and-forget — the user shouldn't be blocked on this POST.
      (async () => {
        try {
          const result = await compatibilityService.createBuildAlias({
            name: builder.name || EMPTY_BUILD.name,
            is_public: false,
            slots: builder.slots,
          });
          const payload = result?.data || result;
          usePCBuilder.setState({
            buildId: payload?.id ?? null,
            shareToken: payload?.share_token ?? null,
            name: payload?.name ?? builder.name,
            migratedOnLogin: true,
            lastSavedAt: new Date().toISOString(),
          });
        } catch {
          // Leave local state alone — user can save manually.
        }
      })();
    },
  );
}

// Auto-install on first import. Components that want to opt out (e.g.
// tests) can guard with `if (typeof window !== 'undefined')`.
if (typeof window !== 'undefined') {
  installLoginMigrator();
}

export default usePCBuilder;