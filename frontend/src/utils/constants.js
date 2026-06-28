/**
 * PCCraft Marketplace — frontend constants.
 *
 * These enums are mirrored from the backend's `apps.accounts.models.UserRole`
 * and other TextChoices fields. Never hardcode status/role strings anywhere
 * else in the codebase — import from here instead.
 */

export const ROLES = Object.freeze({
  CUSTOMER: 'customer',
  VENDOR: 'vendor',
  ADMIN: 'admin',
});

export const ROLE_LABELS = Object.freeze({
  [ROLES.CUSTOMER]: 'Customer',
  [ROLES.VENDOR]: 'Vendor',
  [ROLES.ADMIN]: 'Administrator',
});

export const VENDOR_APPROVAL_STATUSES = Object.freeze({
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
});

export const ORDER_STATUSES = Object.freeze({
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  PROCESSING: 'PROCESSING',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
});

export const RETURN_REASONS = Object.freeze({
  DAMAGED: 'DAMAGED',
  NOT_AS_DESCRIBED: 'NOT_AS_DESCRIBED',
  WRONG_ITEM: 'WRONG_ITEM',
  DEFECTIVE: 'DEFECTIVE',
  MISSING_PARTS: 'MISSING_PARTS',
});

export const RETURN_STATUSES = Object.freeze({
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SHIPPED_BACK: 'SHIPPED_BACK',
  RECEIVED: 'RECEIVED',
  REFUND_INITIATED: 'REFUND_INITIATED',
  REFUNDED: 'REFUNDED',
});

// Mirrors apps.orders.services.MAX_RETURN_EVIDENCE in the backend.
export const MAX_RETURN_EVIDENCE = 4;

export const PRODUCT_CONDITION = Object.freeze({
  NEW: 'NEW',
  REFURBISHED: 'REFURBISHED',
  USED: 'USED',
});

export const STOCK_STATUS = Object.freeze({
  IN_STOCK: 'IN_STOCK',
  LOW_STOCK: 'LOW_STOCK',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
});

export const PAGINATION_DEFAULTS = Object.freeze({
  PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
});

// Mirrors ProductService.MAX_PRODUCT_IMAGES in the backend.
export const MAX_PRODUCT_IMAGES = 8;

// Mirrors Product.ProductStatus in the backend.
export const PRODUCT_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  ARCHIVED: 'ARCHIVED',
  HIDDEN: 'HIDDEN',
});

// localStorage keys — keep these here so the rest of the app doesn't sprinkle
// magic strings (Frontend Standards rule #12 — sensitive data never in
// localStorage; only the session key for anonymous view tracking lives there).
export const STORAGE_KEYS = Object.freeze({
  SESSION_KEY: 'pccraft.session_key',
  ACCESS_TOKEN: 'pccraft.access_token',
  REFRESH_TOKEN: 'pccraft.refresh_token',
  USER: 'pccraft.user',
  CART_BACKUP: 'pccraft.cart_backup',
  WISHLIST_BACKUP: 'pccraft.wishlist_backup',
  UI_PREFS: 'pccraft.ui_prefs',
  RECENT_SEARCHES: 'pccraft.recent_searches',
});