// Pagination — page + page-size controls using meta.pagination from the API.
//
// Spec §2.7. Renders numbered buttons with first/last/prev/next shortcuts.
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

const buildWindow = (current, total) => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push('…');
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push('…');
  out.push(total);
  return out;
};

const Pagination = ({
  pagination = {},
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [12, 24, 48],
  className = '',
}) => {
  const { page = 1, page_size = 12, total_pages = 1, total_count = 0 } = pagination;
  const window = buildWindow(page, total_pages);
  const start = total_count === 0 ? 0 : (page - 1) * page_size + 1;
  const end = Math.min(page * page_size, total_count);

  return (
    <div
      className={`flex flex-col items-center justify-between gap-3 sm:flex-row ${className}`}
    >
      <p className="text-xs text-text-secondary">
        Showing <span className="font-semibold">{start}</span>–<span className="font-semibold">{end}</span> of{' '}
        <span className="font-semibold">{total_count}</span>
      </p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange?.(1)}
          className="rounded-md border border-border p-2 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="First page"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange?.(page - 1)}
          className="rounded-md border border-border p-2 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {window.map((n, i) =>
          n === '…' ? (
            <span key={`ell-${i}`} className="px-2 text-text-secondary">
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => onPageChange?.(n)}
              className={`min-w-9 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                n === page
                  ? 'border-accent-500 bg-accent-500 text-white'
                  : 'border-border text-text-primary hover:border-accent-300'
              }`}
            >
              {n}
            </button>
          ),
        )}

        <button
          type="button"
          disabled={page >= total_pages}
          onClick={() => onPageChange?.(page + 1)}
          className="rounded-md border border-border p-2 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={page >= total_pages}
          onClick={() => onPageChange?.(total_pages)}
          className="rounded-md border border-border p-2 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Last page"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>

      {onPageSizeChange && (
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <label htmlFor="page-size">Per page:</label>
          <select
            id="page-size"
            value={page_size}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-md border border-border bg-surface px-2 py-1 text-sm focus:border-accent-500 focus:outline-none"
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};

export default Pagination;