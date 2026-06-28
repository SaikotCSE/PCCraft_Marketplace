// AdminReviewsPage — review moderation console (Module 6 admin surface).
//
// Spec §2.7:
//   - Filter bar: is_hidden, star rating (multi-select), product search,
//     vendor store-name search, date range
//   - Sort: newest | oldest | most helpful | lowest rating
//   - Table columns: product (thumbnail + name), reviewer name, rating
//     stars, excerpt (50 chars), verified badge, is_hidden chip, vendor
//     reply indicator (✓ if replied), date
//   - Row actions: Hide / Restore (PATCH /admin/reviews/{id}/moderate/
//     with {is_hidden}) and Remove Vendor Reply (DELETE /admin/reviews
//     /{id}/reply/) — only shown if a reply exists
//   - Hidden reviews: grey background row + strikethrough on text
//   - Bulk: select multiple → "Hide Selected" / "Restore Selected"
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EyeOff,
  Eye,
  MessageSquareOff,
  ShieldCheck,
  Star,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  MessageSquare,
  Filter,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { usePageTitle } from '@/hooks/usePageTitle';
import StarRating from '@/components/reviews/StarRating';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import Skeleton from '@/components/common/Skeleton';
import EmptyState from '@/components/common/EmptyState';
import { reviewService } from '@/services/reviewService';
import { paths } from '@/routes/routePaths';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/formatters';

const STAR_FILTERS = [1, 2, 3, 4, 5];
const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'helpful', label: 'Most helpful' },
  { value: 'rating_low', label: 'Lowest rating' },
];

const PAGE_SIZE = 25;
const EXCERPT_LIMIT = 50;

/** Stable id helper used for the checkbox state. */
const keyOf = (review) => review?.id;

/**
 * Build the query parameter object for /admin/reviews/. We keep the
 * keys identical to the backend so the URL stays bookmarkable and the
 * service stays a thin wrapper.
 */
function buildFilters({
  isHidden,
  ratingFilter,
  productQuery,
  vendorQuery,
  dateFrom,
  dateTo,
  ordering,
  page,
}) {
  const params = { ordering, page, page_size: PAGE_SIZE };
  if (isHidden !== 'all') params.is_hidden = isHidden === 'hidden';
  // Multi-select ratings → comma-separated.
  if (ratingFilter.length > 0) {
    params.rating = ratingFilter.join(',');
  }
  if (productQuery.trim()) params.product = productQuery.trim();
  if (vendorQuery.trim()) params.vendor = vendorQuery.trim();
  if (dateFrom) params.date_from = dateFrom;
  if (dateTo) params.date_to = dateTo;
  return params;
}

/** Build the sortable column config (label, key, currentSort, comparator). */
function SortHeader({ label, sortKey, current, onSort, align = 'left', className = '' }) {
  const active = current?.key === sortKey;
  const direction = active ? current.direction : null;
  const Icon = !active ? ChevronsUpDown : direction === 'asc' ? ChevronUp : ChevronDown;
  return (
    <th
      scope="col"
      className={cn(
        'px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-secondary',
        align === 'right' ? 'text-right' : 'text-left',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 rounded px-1 py-0.5 transition hover:bg-surface-100 hover:text-text-primary',
          active && 'text-accent-600',
        )}
        aria-label={`Sort by ${label}`}
      >
        {label}
        <Icon className="h-3 w-3" aria-hidden="true" />
      </button>
    </th>
  );
}

/** Sort direction map for the ordering API param. */
const ORDERING_FOR = {
  newest: '-created_at',
  oldest: 'created_at',
  helpful: '-helpful_count',
  rating_low: 'rating',
};

const AdminReviewsPage = () => {
  usePageTitle('Reviews · Admin · PCCraft');
  const qc = useQueryClient();

  // Filter / sort / pagination state
  const [isHidden, setIsHidden] = useState('all'); // 'all' | 'visible' | 'hidden'
  const [ratingFilter, setRatingFilter] = useState([]); // [1..5]
  const [productQuery, setProductQuery] = useState('');
  const [vendorQuery, setVendorQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [ordering, setOrdering] = useState('newest');
  const [page, setPage] = useState(1);

  // Bulk selection
  const [selected, setSelected] = useState(new Set());

  // Confirm dialog state
  const [confirm, setConfirm] = useState(null);
  // { tone, title, description, action: 'hide'|'restore'|'removeReply',
  //   reviewIds: string[], loading: bool }

  const params = buildFilters({
    isHidden,
    ratingFilter,
    productQuery,
    vendorQuery,
    dateFrom,
    dateTo,
    ordering,
    page,
  });

  const query = useQuery({
    queryKey: ['admin-reviews', params],
    queryFn: () => reviewService.adminList(params),
    keepPreviousData: true,
  });

  const results = query.data?.results || [];
  const total = query.data?.count || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Mutations ------------------------------------------------------------
  const moderate = useMutation({
    mutationFn: async ({ reviewIds, isHidden: hide }) => {
      // Backend has no bulk endpoint — fan out client-side. The
      // reviews list is already paginated to 25 rows so the worst-case
      // fanout is small.
      await Promise.all(
        reviewIds.map((id) => reviewService.adminModerate(id, hide)),
      );
    },
    onSuccess: (_data, vars) => {
      toast.success(
        vars.isHidden
          ? `${vars.reviewIds.length} review${vars.reviewIds.length === 1 ? '' : 's'} hidden.`
          : `${vars.reviewIds.length} review${vars.reviewIds.length === 1 ? '' : 's'} restored.`,
      );
      qc.invalidateQueries({ queryKey: ['admin-reviews'] });
      qc.invalidateQueries({ queryKey: ['rating-breakdown'] });
      qc.invalidateQueries({ queryKey: ['reviews'] });
      setSelected(new Set());
    },
    onError: () => toast.error('Moderation failed. Please retry.'),
  });

  const removeReply = useMutation({
    mutationFn: async (reviewIds) => {
      await Promise.all(reviewIds.map((id) => reviewService.adminRemoveReply(id)));
    },
    onSuccess: (_data, reviewIds) => {
      toast.success(
        `Vendor reply removed from ${reviewIds.length} review${reviewIds.length === 1 ? '' : 's'}.`,
      );
      qc.invalidateQueries({ queryKey: ['admin-reviews'] });
      qc.invalidateQueries({ queryKey: ['vendor-reviews'] });
    },
    onError: () => toast.error('Could not remove the vendor reply.'),
  });

  // Helpers --------------------------------------------------------------
  const toggleRating = (star) => {
    setRatingFilter((prev) =>
      prev.includes(star) ? prev.filter((s) => s !== star) : [...prev, star],
    );
    setPage(1);
  };

  const clearFilters = () => {
    setIsHidden('all');
    setRatingFilter([]);
    setProductQuery('');
    setVendorQuery('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const hasActiveFilters =
    isHidden !== 'all' ||
    ratingFilter.length > 0 ||
    Boolean(productQuery.trim()) ||
    Boolean(vendorQuery.trim()) ||
    Boolean(dateFrom) ||
    Boolean(dateTo);

  const onSort = (sortKey) => {
    setOrdering((prev) => {
      // Map the column key back to the API ordering key.
      const map = {
        created_at: prev === 'newest' ? 'oldest' : 'newest',
        helpful_count: prev === 'helpful' ? 'oldest' : 'helpful',
        rating: prev === 'rating_low' ? 'newest' : 'rating_low',
      };
      return map[sortKey] || 'newest';
    });
    setPage(1);
  };

  // Selection helpers -----------------------------------------------------
  const allOnPageSelected =
    results.length > 0 && results.every((r) => selected.has(keyOf(r)));
  const someOnPageSelected =
    results.some((r) => selected.has(keyOf(r))) && !allOnPageSelected;

  const toggleAllOnPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        results.forEach((r) => next.delete(keyOf(r)));
      } else {
        results.forEach((r) => next.add(keyOf(r)));
      }
      return next;
    });
  };

  const toggleOne = (review) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const k = keyOf(review);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  // Confirm handlers ------------------------------------------------------
  const requestBulk = (action) => {
    if (selected.size === 0) {
      toast.error('Select at least one review first.');
      return;
    }
    const ids = Array.from(selected);
    if (action === 'hide') {
      setConfirm({
        tone: 'danger',
        title: `Hide ${ids.length} review${ids.length === 1 ? '' : 's'}?`,
        description:
          'Hidden reviews no longer appear on product pages and are excluded from rating averages.',
        action: 'hide',
        reviewIds: ids,
      });
    } else if (action === 'restore') {
      setConfirm({
        tone: 'warning',
        title: `Restore ${ids.length} review${ids.length === 1 ? '' : 's'}?`,
        description: 'Restored reviews become visible again on product pages.',
        action: 'restore',
        reviewIds: ids,
      });
    } else if (action === 'removeReply') {
      setConfirm({
        tone: 'danger',
        title: `Remove vendor reply from ${ids.length} review${ids.length === 1 ? '' : 's'}?`,
        description:
          'Use this when a vendor reply violates community guidelines. The original review remains.',
        action: 'removeReply',
        reviewIds: ids,
      });
    }
  };

  const requestSingle = (action, review) => {
    const ids = [keyOf(review)];
    if (action === 'hide') {
      setConfirm({
        tone: 'danger',
        title: 'Hide this review?',
        description: 'Hidden reviews are excluded from rating averages.',
        action: 'hide',
        reviewIds: ids,
      });
    } else if (action === 'restore') {
      setConfirm({
        tone: 'warning',
        title: 'Restore this review?',
        description: 'The review becomes visible again on the product page.',
        action: 'restore',
        reviewIds: ids,
      });
    } else if (action === 'removeReply') {
      setConfirm({
        tone: 'danger',
        title: 'Remove the vendor reply?',
        description: 'The original review remains intact.',
        action: 'removeReply',
        reviewIds: ids,
      });
    }
  };

  const runConfirm = async () => {
    if (!confirm) return;
    try {
      if (confirm.action === 'hide') {
        await moderate.mutateAsync({ reviewIds: confirm.reviewIds, isHidden: true });
      } else if (confirm.action === 'restore') {
        await moderate.mutateAsync({ reviewIds: confirm.reviewIds, isHidden: false });
      } else if (confirm.action === 'removeReply') {
        await removeReply.mutateAsync(confirm.reviewIds);
      }
      setConfirm(null);
    } catch {
      // onError already toasted.
      setConfirm(null);
    }
  };

  const confirmLoading =
    moderate.isPending || removeReply.isPending;

  const allSelectedHidden = useMemo(() => {
    if (selected.size === 0) return false;
    return results.some(
      (r) => selected.has(keyOf(r)) && !r.is_hidden,
    );
  }, [selected, results]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary sm:text-3xl">
            Review moderation
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">
            Hide reviews that violate policies, restore reviews you
            previously hid, or remove vendor replies that don't meet
            community guidelines.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full bg-surface-100 px-3 py-1 font-semibold text-text-secondary">
            Total: {query.isLoading ? '…' : total}
          </span>
          {selected.size > 0 && (
            <span className="rounded-full bg-accent-50 px-3 py-1 font-semibold text-accent-700">
              Selected: {selected.size}
            </span>
          )}
        </div>
      </header>

      {/* Filter bar */}
      <section className="mb-6 space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
            <Filter className="h-3.5 w-3.5" /> Filters
          </div>

          {/* Visibility filter */}
          <label className="flex items-center gap-2 text-xs">
            <span className="text-text-secondary">Status</span>
            <select
              value={isHidden}
              onChange={(e) => {
                setIsHidden(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-xs font-medium text-text-primary focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
            >
              <option value="all">All</option>
              <option value="visible">Visible only</option>
              <option value="hidden">Hidden only</option>
            </select>
          </label>

          {/* Star filter (multi-select chips) */}
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-xs text-text-secondary">Rating</span>
            {STAR_FILTERS.map((star) => {
              const active = ratingFilter.includes(star);
              return (
                <button
                  key={star}
                  type="button"
                  onClick={() => toggleRating(star)}
                  aria-pressed={active}
                  className={cn(
                    'inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-xs font-semibold transition',
                    active
                      ? 'bg-accent-500 text-white shadow'
                      : 'bg-surface-100 text-text-secondary hover:bg-surface-200',
                  )}
                >
                  {star}
                  <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                </button>
              );
            })}
            {ratingFilter.length > 0 && (
              <button
                type="button"
                onClick={() => setRatingFilter([])}
                className="ml-1 inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-[10px] font-semibold text-text-secondary hover:text-danger"
              >
                <X className="h-3 w-3" /> clear
              </button>
            )}
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-text-secondary hover:text-danger"
            >
              <X className="h-3 w-3" /> Clear all
            </button>
          )}
        </div>

        {/* Text + date filters */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs">
            <span className="mb-1 block text-text-secondary">Product name</span>
            <input
              type="search"
              value={productQuery}
              onChange={(e) => {
                setProductQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search products…"
              className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-text-secondary">Vendor store name</span>
            <input
              type="search"
              value={vendorQuery}
              onChange={(e) => {
                setVendorQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search vendors…"
              className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-text-secondary">From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-text-secondary">To</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
            />
          </label>
        </div>

        {/* Sort + bulk action row */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <label className="flex items-center gap-2 text-xs">
            <span className="text-text-secondary">Sort</span>
            <select
              value={ordering}
              onChange={(e) => {
                setOrdering(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-xs font-medium text-text-primary focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {selected.size > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => requestBulk(allSelectedHidden ? 'hide' : 'restore')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm transition',
                    allSelectedHidden
                      ? 'bg-amber-500 text-white hover:bg-amber-600'
                      : 'bg-emerald-500 text-white hover:bg-emerald-600',
                  )}
                >
                  {allSelectedHidden ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                  {allSelectedHidden ? 'Restore selected' : 'Hide selected'}
                </button>
                <button
                  type="button"
                  onClick={() => requestBulk('removeReply')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-danger bg-surface px-3 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger hover:text-white"
                >
                  <MessageSquareOff className="h-3.5 w-3.5" />
                  Remove vendor replies
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-text-secondary hover:text-text-primary"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear selection
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Table */}
      {query.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" rounded="rounded-xl" />
          ))}
        </div>
      ) : query.isError ? (
        <EmptyState
          icon={MessageSquare}
          title="Could not load reviews"
          description="Please try again in a moment."
          actionLabel="Retry"
          onAction={() => query.refetch()}
        />
      ) : results.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No reviews match your filters"
          description={
            hasActiveFilters
              ? 'Try widening the date range or removing a filter.'
              : 'Reviews appear here once customers submit them.'
          }
          actionLabel={hasActiveFilters ? 'Clear filters' : undefined}
          onAction={hasActiveFilters ? clearFilters : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-50">
              <tr>
                <th scope="col" className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    checked={allOnPageSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someOnPageSelected;
                    }}
                    onChange={toggleAllOnPage}
                    className="h-4 w-4 rounded border-border text-accent-500 focus:ring-accent-400"
                  />
                </th>
                <SortHeader label="Product" sortKey="product" current={null} onSort={() => {}} />
                <SortHeader
                  label="Reviewer"
                  sortKey="reviewer"
                  current={null}
                  onSort={() => {}}
                />
                <SortHeader
                  label="Rating"
                  sortKey="rating"
                  current={{ key: ordering === 'rating_low' ? 'rating' : null }}
                  onSort={onSort}
                />
                <th
                  scope="col"
                  className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-secondary"
                >
                  Excerpt
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-secondary"
                >
                  Flags
                </th>
                <SortHeader
                  label="Date"
                  sortKey="created_at"
                  current={{
                    key:
                      ordering === 'newest' || ordering === 'oldest'
                        ? 'created_at'
                        : null,
                    direction: ordering === 'oldest' ? 'asc' : 'desc',
                  }}
                  onSort={onSort}
                />
                <SortHeader
                  label="Helpful"
                  sortKey="helpful_count"
                  current={{
                    key: ordering === 'helpful' ? 'helpful_count' : null,
                  }}
                  onSort={onSort}
                />
                <th
                  scope="col"
                  className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-text-secondary"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {results.map((review) => {
                const isHidden = Boolean(review.is_hidden);
                const checked = selected.has(keyOf(review));
                const excerpt = (review.body || '').slice(0, EXCERPT_LIMIT);
                const hasReply = Boolean(review.vendor_reply);
                const productName = review.product?.name || 'Product';
                const productSlug = review.product?.slug;
                const productImage = review.product?.primary_image || null;

                return (
                  <tr
                    key={review.id}
                    className={cn(
                      'align-middle transition-colors',
                      isHidden
                        ? 'bg-surface-100 text-text-secondary'
                        : 'hover:bg-surface-50',
                    )}
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select review by ${review.user?.full_name || 'customer'}`}
                        checked={checked}
                        onChange={() => toggleOne(review)}
                        className="h-4 w-4 rounded border-border text-accent-500 focus:ring-accent-400"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <img
                          src={
                            productImage ||
                            'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="%23e5e7eb"/></svg>'
                          }
                          alt=""
                          className={cn(
                            'h-9 w-9 shrink-0 rounded-md border border-border object-cover',
                            isHidden && 'opacity-50',
                          )}
                        />
                        <div className="min-w-0">
                          {productSlug ? (
                            <Link
                              to={paths.productDetail(productSlug)}
                              className={cn(
                                'block max-w-[180px] truncate text-xs font-semibold text-text-primary hover:text-accent-500',
                                isHidden && 'line-through',
                              )}
                            >
                              {productName}
                            </Link>
                          ) : (
                            <span
                              className={cn(
                                'block max-w-[180px] truncate text-xs font-semibold text-text-primary',
                                isHidden && 'line-through',
                              )}
                            >
                              {productName}
                            </span>
                          )}
                          {review.vendor?.store_name && (
                            <p
                              className={cn(
                                'truncate text-[10px] text-text-secondary',
                                isHidden && 'line-through',
                              )}
                            >
                              {review.vendor.store_name}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          'block max-w-[140px] truncate text-xs font-medium text-text-primary',
                          isHidden && 'line-through',
                        )}
                      >
                        {review.user?.full_name || 'Customer'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <StarRating
                        value={Number(review.rating || 0)}
                        size="xs"
                        readOnly
                        ariaLabel={`Rated ${review.rating} of 5`}
                      />
                    </td>
                    <td className="max-w-[260px] px-3 py-3">
                      <p
                        className={cn(
                          'text-xs text-text-primary',
                          isHidden && 'line-through',
                        )}
                        title={review.body}
                      >
                        {excerpt}
                        {review.body && review.body.length > EXCERPT_LIMIT && '…'}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        {review.is_verified_purchase && (
                          <span
                            className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700"
                            title="Verified purchase"
                          >
                            <ShieldCheck className="h-2.5 w-2.5" />
                            Verified
                          </span>
                        )}
                        {isHidden ? (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700">
                            Hidden
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                            Visible
                          </span>
                        )}
                        {hasReply && (
                          <span
                            className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700"
                            title="Vendor has replied"
                          >
                            ✓ Replied
                          </span>
                        )}
                      </div>
                    </td>
                    <td
                      className={cn(
                        'whitespace-nowrap px-3 py-3 text-xs text-text-secondary',
                        isHidden && 'line-through',
                      )}
                    >
                      {formatDate(review.created_at)}
                    </td>
                    <td
                      className={cn(
                        'whitespace-nowrap px-3 py-3 text-xs font-semibold text-text-primary',
                        isHidden && 'line-through',
                      )}
                    >
                      {review.helpful_count ?? 0}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {isHidden ? (
                          <button
                            type="button"
                            onClick={() => requestSingle('restore', review)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"
                            title="Restore review"
                          >
                            <Eye className="h-3.5 w-3.5" /> Restore
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => requestSingle('hide', review)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50"
                            title="Hide review"
                          >
                            <EyeOff className="h-3.5 w-3.5" /> Hide
                          </button>
                        )}
                        {hasReply && (
                          <button
                            type="button"
                            onClick={() => requestSingle('removeReply', review)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-danger hover:bg-red-50"
                            title="Remove vendor reply"
                          >
                            <MessageSquareOff className="h-3.5 w-3.5" /> Remove reply
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-accent-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-xs text-text-secondary">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-accent-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      {/* Confirm dialog */}
      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        title={confirm?.title}
        description={confirm?.description}
        confirmLabel={
          confirm?.action === 'hide'
            ? 'Hide'
            : confirm?.action === 'restore'
              ? 'Restore'
              : confirm?.action === 'removeReply'
                ? 'Remove reply'
                : 'Confirm'
        }
        tone={confirm?.tone || 'danger'}
        loading={confirmLoading}
      />
    </div>
  );
};

export default AdminReviewsPage;
