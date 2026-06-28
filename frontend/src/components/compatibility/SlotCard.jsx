// SlotCard.jsx — one of the 11 PC Builder slots.
//
// Two visual states (spec §2.10 frontend sub-spec lines 3016-3030):
//
//   * EMPTY   — dashed `primary-700` border, `primary-800` background,
//              24px icon, "+ Select [label]" CTA. Required slots show a
//              red `*` indicator.
//
//   * FILLED  — solid `accent-500` border, 60×60 product thumbnail,
//              name (1-line clamp), effective price in `accent-400`.
//              Top-right `×` button clears the slot.
//
// Click opens `ComponentSelectModal` to either pick a component (empty)
// or swap the current one (filled). The `×` button is the only way to
// clear a slot from this card — the page-level CTA is `clearAll`.

import { X } from 'lucide-react';

import { cn } from '@utils/cn';
import { formatPrice } from '@utils/formatters';

// Lucide icon name → component map. Kept module-local so this file is
// the single source of truth for the slot icons (slot defs in
// pcSlots.js only carry the icon name string).
import * as Icons from 'lucide-react';

const Icon = ({ name, className }) => {
  const Component = Icons[name];
  if (!Component) return null;
  return <Component className={className} aria-hidden="true" />;
};

/**
 * @param {object} props
 * @param {import('@utils/pcSlots').SLOTS[number]} props.slot
 *   Slot descriptor from `SLOTS` (pcSlots.js).
 * @param {object|null} [props.product]
 *   Filled product from the backend (ProductListSerializer shape). Null
 *   when the slot is empty.
 * @param {() => void} props.onSelect
 *   Open `ComponentSelectModal` — called for both empty + filled (swap).
 * @param {() => void} props.onClear
 *   Remove the product from the slot. Only rendered when filled.
 * @param {boolean} [props.readOnly]
 *   Hide clear + select handlers (used by SharedBuildPage).
 * @param {string} [props.className]
 */
const SlotCard = ({
  slot,
  product,
  onSelect,
  onClear,
  readOnly = false,
  className = '',
}) => {
  const isFilled = Boolean(product?.id);
  const price = product?.effective_price ?? product?.price ?? null;

  const handleClick = () => {
    if (readOnly) return;
    onSelect?.(slot);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    if (readOnly) return;
    onClear?.(slot);
  };

  if (!isFilled) {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          'group relative flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-primary-700 bg-primary-800 px-4 py-4 text-left transition',
          'hover:border-accent-500 hover:bg-primary-700/60',
          'focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 focus:ring-offset-primary-900',
          className,
        )}
      >
        <Icon
          name={slot.icon}
          className="h-6 w-6 shrink-0 text-text-secondary group-hover:text-accent-400"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-heading text-sm font-medium text-text-secondary">
              {slot.label}
            </span>
            {slot.required && (
              <span
                className="text-xs font-bold text-danger"
                aria-label="required"
                title="Required slot"
              >
                *
              </span>
            )}
          </div>
          <div className="mt-0.5 text-sm font-semibold text-accent-500">
            + Select {slot.label}
          </div>
        </div>
      </button>
    );
  }

  // ----- filled -----
  const thumbnail =
    product?.thumbnail_url ||
    product?.primary_image ||
    product?.image ||
    product?.images?.[0]?.image ||
    null;

  return (
    <div
      role={readOnly ? undefined : 'button'}
      tabIndex={readOnly ? -1 : 0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (readOnly) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      className={cn(
        'group relative flex w-full cursor-pointer items-center gap-3 rounded-xl border-2 border-accent-500 bg-primary-800 px-4 py-3 text-left transition',
        'hover:border-accent-400 hover:bg-primary-700/40',
        'focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 focus:ring-offset-primary-900',
        readOnly && 'cursor-default hover:border-accent-500 hover:bg-primary-800',
        className,
      )}
    >
      {thumbnail ? (
        <img
          src={thumbnail}
          alt=""
          className="h-[60px] w-[60px] shrink-0 rounded-md object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-md bg-surface-200">
          <Icon name={slot.icon} className="h-7 w-7 text-text-secondary" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs uppercase tracking-wide text-text-secondary">
            {slot.label}
          </span>
          {slot.required && (
            <span
              className="text-xs font-bold text-danger"
              aria-label="required"
              title="Required slot"
            >
              *
            </span>
          )}
        </div>
        <div className="mt-0.5 line-clamp-1 font-heading text-sm font-semibold text-text-primary">
          {product?.name || 'Unnamed product'}
        </div>
        {price !== null && price !== undefined && (
          <div className="mt-0.5 text-sm font-semibold text-accent-400">
            {formatPrice(price)}
          </div>
        )}
      </div>
      {!readOnly && (
        <button
          type="button"
          onClick={handleClear}
          aria-label={`Remove ${slot.label}`}
          className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-surface-200/70 text-text-secondary transition hover:bg-danger hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
};

export default SlotCard;