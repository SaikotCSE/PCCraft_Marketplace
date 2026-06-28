// StatusBadge — small coloured pill for order/return/payment status enums.
//
// Centralised so the colour palette for each status is defined ONCE —
// every page that shows a status badge uses this component and we can
// recolour the whole app by editing one file.
//
// Colour families:
//   - neutral   → PENDING
//   - blue      → CONFIRMED, PROCESSING
//   - amber     → SHIPPED (in transit)
//   - green     → DELIVERED, REFUNDED, APPROVED, COMPLETED
//   - red       → CANCELLED, REJECTED
//   - violet    → return-flow statuses (PENDING, SHIPPED_BACK, RECEIVED, etc.)
//   - slate     → fallback / unknown
import { ORDER_STATUSES, RETURN_STATUSES } from '@utils/constants';

const TONE_MAP = {
  // orders
  [ORDER_STATUSES.PENDING]: 'neutral',
  [ORDER_STATUSES.CONFIRMED]: 'blue',
  [ORDER_STATUSES.PROCESSING]: 'blue',
  [ORDER_STATUSES.SHIPPED]: 'amber',
  [ORDER_STATUSES.DELIVERED]: 'green',
  [ORDER_STATUSES.CANCELLED]: 'red',
  [ORDER_STATUSES.REFUNDED]: 'green',

  // returns -- 7-step lifecycle per Module 5 spec
  [RETURN_STATUSES.PENDING]: 'violet',
  [RETURN_STATUSES.APPROVED]: 'green',
  [RETURN_STATUSES.REJECTED]: 'red',
  [RETURN_STATUSES.SHIPPED_BACK]: 'amber',
  [RETURN_STATUSES.RECEIVED]: 'amber',
  [RETURN_STATUSES.REFUND_INITIATED]: 'blue',
  [RETURN_STATUSES.REFUNDED]: 'green',
};

const TONE_CLASSES = {
  neutral: 'bg-surface-200 text-text-secondary',
  blue: 'bg-blue-100 text-blue-700',
  amber: 'bg-amber-100 text-amber-700',
  green: 'bg-emerald-100 text-emerald-700',
  red: 'bg-red-100 text-red-700',
  violet: 'bg-violet-100 text-violet-700',
  slate: 'bg-slate-100 text-slate-700',
};

/** Humanise UPPER_CASE enum values into Title Case labels. */
const humanise = (raw) =>
  String(raw || '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const StatusBadge = ({ status, className = '', size = 'md' }) => {
  const tone = TONE_MAP[status] || 'slate';
  const classes = TONE_CLASSES[tone];
  const sizeCls =
    size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold uppercase tracking-wide ${classes} ${sizeCls} ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {humanise(status)}
    </span>
  );
};

export default StatusBadge;