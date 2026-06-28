// pcSlots.js — canonical PC Builder slot definitions (spec §2.10).
//
// This is the single source of truth for the 11 builder slots. Every other
// frontend file (SlotCard, ComponentSelectModal, usePCBuilder, compatibility
// service, PCBuilderPage, SharedBuildPage, WattageDisplay, ...) reads from
// here. Renaming or reshuffling a slot is a breaking change — keep the keys
// aligned with the backend `SLOT_QUERY_KEYS` map in
// `apps/compatibility/views.py` and the seeded compatibility rules.
//
// Each slot entry carries:
//   key           — builder-slot identifier used in slot maps and URLs
//                   (matches the `PCBuildItem.slot` enum on the backend).
//   label         — human-readable name shown in SlotCard / modal header.
//   categoryName  — exact `Category.name` (display, also matches the
//                   `category_a` / `category_b` strings emitted in
//                   `CompatibilityResult` rows).
//   categorySlug  — exact `Category.slug` used by the product-search filter
//                   in ComponentSelectModal.
//   queryKey      — URL query parameter name expected by the backend
//                   `GET /api/v1/compatibility/products/{slot}/` endpoint.
//   specKeys      — spec field names this slot cares about (used by
//                   WattageDisplay / summary chips; keep aligned with the
//                   per-category `spec_template` JSON).
//   icon          — Lucide icon name (string, not a component) so the file
//                   stays free of JSX — components import the icon map
//                   themselves and look up by name. Avoids circular imports.
//   required      — true if the slot must be filled for a build to be
//                   considered COMPLETE (see spec §2.10 "Required for
//                   Completion" column).
//
// Order here = display order in PCBuilderPage / SharedBuildPage.

export const SLOT_KEYS = Object.freeze([
  'CPU',
  'MOBO',
  'RAM_1',
  'RAM_2',
  'GPU',
  'PSU',
  'CASE',
  'COOLER',
  'SSD_1',
  'SSD_2',
  'HDD',
]);

export const SLOTS = Object.freeze([
  Object.freeze({
    key: 'CPU',
    label: 'Processor',
    categoryName: 'CPU',
    categorySlug: 'cpus',
    queryKey: 'cpu_id',
    specKeys: Object.freeze(['socket', 'tdp_w', 'cores', 'igpu']),
    icon: 'Cpu',
    required: true,
  }),
  Object.freeze({
    key: 'MOBO',
    label: 'Motherboard',
    categoryName: 'Motherboard',
    categorySlug: 'motherboards',
    queryKey: 'mobo_id',
    specKeys: Object.freeze(['socket', 'ram_type', 'max_ram_speed_mhz', 'max_ram_gb', 'form_factor']),
    icon: 'CircuitBoard',
    required: true,
  }),
  Object.freeze({
    key: 'RAM_1',
    label: 'Memory (Slot 1)',
    categoryName: 'RAM',
    categorySlug: 'ram',
    queryKey: 'ram1_id',
    specKeys: Object.freeze(['type', 'speed_mhz', 'capacity_gb']),
    icon: 'MemoryStick',
    required: true,
  }),
  Object.freeze({
    key: 'RAM_2',
    label: 'Memory (Slot 2)',
    categoryName: 'RAM',
    categorySlug: 'ram',
    queryKey: 'ram2_id',
    specKeys: Object.freeze(['type', 'speed_mhz', 'capacity_gb']),
    icon: 'MemoryStick',
    required: false,
  }),
  Object.freeze({
    key: 'GPU',
    label: 'Graphics Card',
    categoryName: 'GPU',
    categorySlug: 'gpus',
    queryKey: 'gpu_id',
    specKeys: Object.freeze(['length_mm', 'tdp_w']),
    icon: 'Monitor',
    required: false,
  }),
  Object.freeze({
    key: 'PSU',
    label: 'Power Supply',
    categoryName: 'Power Supply',
    categorySlug: 'power-supplies',
    queryKey: 'psu_id',
    specKeys: Object.freeze(['wattage', 'efficiency_rating']),
    icon: 'Zap',
    required: true,
  }),
  Object.freeze({
    key: 'CASE',
    label: 'PC Case',
    categoryName: 'PC Case',
    categorySlug: 'pc-cases',
    queryKey: 'case_id',
    specKeys: Object.freeze(['form_factors_supported', 'max_gpu_length_mm', 'max_cooler_height_mm']),
    icon: 'Box',
    required: true,
  }),
  Object.freeze({
    key: 'COOLER',
    label: 'CPU Cooler',
    categoryName: 'CPU Cooler',
    categorySlug: 'cpu-coolers',
    queryKey: 'cooler_id',
    specKeys: Object.freeze(['socket_support', 'height_mm', 'tdp_rating_w']),
    icon: 'Wind',
    required: false,
  }),
  Object.freeze({
    key: 'SSD_1',
    label: 'Storage (SSD 1)',
    categoryName: 'SSD',
    categorySlug: 'ssd',
    queryKey: 'ssd1_id',
    specKeys: Object.freeze(['capacity_gb', 'interface']),
    icon: 'HardDrive',
    required: false,
  }),
  Object.freeze({
    key: 'SSD_2',
    label: 'Storage (SSD 2)',
    categoryName: 'SSD',
    categorySlug: 'ssd',
    queryKey: 'ssd2_id',
    specKeys: Object.freeze(['capacity_gb', 'interface']),
    icon: 'HardDrive',
    required: false,
  }),
  Object.freeze({
    key: 'HDD',
    label: 'Storage (HDD)',
    categoryName: 'HDD',
    categorySlug: 'hdd',
    queryKey: 'hdd_id',
    specKeys: Object.freeze(['capacity_gb', 'rpm']),
    icon: 'Database',
    required: false,
  }),
]);

// Fast lookup tables — built once at module load.
const SLOT_BY_KEY = Object.freeze(
  SLOTS.reduce((acc, slot) => {
    acc[slot.key] = slot;
    return acc;
  }, {}),
);

const SLOT_QUERY_KEYS = Object.freeze(
  SLOTS.reduce((acc, slot) => {
    acc[slot.key] = slot.queryKey;
    return acc;
  }, {}),
);

/**
 * Return the slot descriptor for a given key.
 * Returns `undefined` if the key is not one of the 11 canonical slots —
 * callers must handle that case (e.g. when hydrating a stale build from
 * localStorage that pre-dates a schema change).
 */
export function getSlot(key) {
  return SLOT_BY_KEY[key];
}

/**
 * Map slot key → URL query parameter name (e.g. `CPU` → `cpu_id`).
 * Mirrors `CompatibleProductsView.SLOT_QUERY_KEYS` on the backend.
 */
export function getQueryKey(slotKey) {
  return SLOT_QUERY_KEYS[slotKey];
}

/**
 * Convert a `{ slotKey: productId, ... }` map to the URL query string the
 * compatible-products endpoint expects (e.g. `cpu_id=1&mobo_id=2&...`).
 * Skips empty / nullish values — backend treats missing keys as "slot
 * unfilled, do not constrain".
 */
export function buildSelectionQuery(slots = {}) {
  const params = new URLSearchParams();
  for (const slot of SLOTS) {
    const id = slots[slot.key];
    if (id !== null && id !== undefined && id !== '') {
      params.set(slot.queryKey, String(id));
    }
  }
  return params.toString();
}

/**
 * Inverse of `buildSelectionQuery`: take `{ cpu_id: '1', mobo_id: '2', ... }`
 * and produce `{ CPU: '1', MOBO: '2', ... }`. Used when hydrating from
 * query-string driven flows (deep links, share URLs).
 */
export function parseSelectionQuery(params = {}) {
  const out = {};
  for (const slot of SLOTS) {
    const value = params[slot.queryKey];
    if (value !== undefined && value !== null && value !== '') {
      out[slot.key] = String(value);
    }
  }
  return out;
}

/**
 * The four required slots — completion gate for a build (see spec §2.10
 * "Required for Completion" column). Empty required slots → build is
 * flagged INCOMPLETE in BuildSummary.
 */
export const REQUIRED_SLOT_KEYS = Object.freeze(
  SLOTS.filter((s) => s.required).map((s) => s.key),
);

/**
 * localStorage key for the anonymous-build record. Spec §2.10 "Build
 * Persistence": "Anonymous builds: full build state stored in localStorage
 * under key `pccraft_build` as `{ slots: { CPU: product_id, ... }, name }`".
 */
export const BUILD_STORAGE_KEY = 'pccraft_build';

/**
 * Initial state for an empty anonymous build. Centralised so PCBuilderPage
 * and usePCBuilder agree on the shape — adding a field (e.g. `notes`) only
 * requires editing one place.
 */
export const EMPTY_BUILD = Object.freeze({
  slots: {},
  name: 'My Build',
});

export default SLOTS;
