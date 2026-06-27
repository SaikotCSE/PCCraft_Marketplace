/**
 * PCCraft Marketplace — pure formatting helpers.
 * All money goes through `formatPrice` so locale stays consistent (BD Taka).
 */

const BD_LOCALE = 'en-BD';
const BD_CURRENCY = 'BDT';

/**
 * Format a numeric amount as Bangladeshi Taka.
 * @param {number|string} amount  Decimal-friendly value.
 * @param {object} [opts]         Intl options overrides.
 * @returns {string}              e.g. "৳ 1,25,000.00"
 */
export function formatPrice(amount, opts = {}) {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (Number.isNaN(value)) return '৳ 0.00';

  const formatter = new Intl.NumberFormat(BD_LOCALE, {
    style: 'currency',
    currency: BD_CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...opts,
  });

  // Intl's BDT symbol is "BDT" in en-BD; we want the ৳ glyph for readability.
  return formatter.format(value).replace(/^BDT\s?/, '৳ ');
}

/**
 * ISO date string → "Jun 27, 2026"
 */
export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(BD_LOCALE, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * ISO datetime → "Jun 27, 2026 · 17:24"
 */
export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${formatDate(iso)} · ${d.toLocaleTimeString(BD_LOCALE, { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Order number normaliser — pads shorter numbers for visual consistency.
 */
export function formatOrderNumber(orderNumber) {
  if (!orderNumber) return '';
  return String(orderNumber).toUpperCase();
}

/**
 * Truncate text to a max length, adding an ellipsis if truncated.
 */
export function truncate(text, maxLength = 60) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}