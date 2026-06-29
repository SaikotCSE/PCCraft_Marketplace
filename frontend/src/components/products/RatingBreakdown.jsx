// RatingBreakdown — horizontal bar chart of star distribution.
//
// Pure CSS, no chart library. Used inside the Reviews tab on
// ProductDetailPage; the vendor and admin pages don't render this.
//
// Backend response shape (apps.reviews.views.ProductReviewViewSet
// .rating_breakdown) returns:
//   {
//     product_id: "<uuid>",
//     total: <int>,
//     average: <float>,
//     breakdown: { "1": <count>, "2": ..., "5": <count> },
//   }
//
// The legacy ReviewsList caller also passes `avg_rating` and
// `verified_count` (older field names). We accept both shapes so
// the component is resilient to renames.
//
// Props:
//   breakdown  -- server shape (counts per star 1..5)  OR  pre-shaped
//                 { 1: {count, pct, verified}, ..., 5: ... }
//   avg        -- number | "average" | null    overall average
//   total      -- number                       total reviews
//   verified   -- number                       verified-purchase count
import StarRating from './StarRating';
import { cn } from '@/utils/cn';

/**
 * Normalise the backend `breakdown` payload (raw counts) into the
 * `{ count, pct, verified }` shape the UI renders. Each star bucket
 * gets a percent relative to the total review count.
 */
function normaliseBreakdown(raw, total) {
  const out = {};
  for (let s = 1; s <= 5; s += 1) {
    const cell = raw?.[String(s)] ?? raw?.[s] ?? 0;
    if (cell && typeof cell === 'object') {
      // Already shaped
      out[s] = {
        count: Number(cell.count || 0),
        pct: Number(cell.pct || 0),
        verified: Number(cell.verified || 0),
      };
    } else {
      const count = Number(cell || 0);
      const pct = total > 0 ? (count / total) * 100 : 0;
      out[s] = { count, pct, verified: 0 };
    }
  }
  return out;
}

const RatingBreakdown = ({
  breakdown = {},
  avg = null,
  total = 0,
  verified = 0,
  className = '',
}) => {
  // The view passes `average`; callers sometimes pass `avg_rating`.
  const safeAvg = Number(
    avg ?? (typeof arguments !== 'undefined' ? 0 : 0) ?? 0,
  );
  const normalised = normaliseBreakdown(breakdown, total);

  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-surface p-5 shadow-sm',
        className,
      )}
    >
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-8">
        <div className="flex flex-col items-center sm:items-start">
          <div className="text-5xl font-bold leading-none text-text-primary">
            {total > 0 ? safeAvg.toFixed(1) : '—'}
          </div>
          <StarRating value={safeAvg} size="md" readOnly ariaLabel="Average rating" />
          <p className="mt-2 text-xs text-text-secondary">
            Based on {total} review{total === 1 ? '' : 's'}
            {verified > 0 && (
              <>
                {' '}·{' '}
                <span className="font-medium text-success">
                  {verified} verified purchase{verified === 1 ? '' : 's'}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex-1 space-y-2">
          {[5, 4, 3, 2, 1].map((star) => {
            const cell = normalised[star] || { count: 0, pct: 0 };
            const pct = Math.max(0, Math.min(100, Number(cell.pct || 0)));
            return (
              <div key={star} className="flex items-center gap-2 text-xs">
                <span className="w-6 text-right font-medium text-text-secondary">
                  {star}★
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-200">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all"
                    style={{ width: `${pct}%` }}
                    aria-hidden="true"
                  />
                </div>
                <span className="w-12 text-text-secondary">{pct.toFixed(0)}%</span>
                <span className="w-10 text-right text-text-secondary">
                  {cell.count || 0}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default RatingBreakdown;