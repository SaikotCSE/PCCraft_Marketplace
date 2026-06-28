// VendorReviewsPage — customer reviews across all of the vendor's products.
//
// Spec §2.7 Module 6:
//   - Header "Customer Reviews" + total count badge
//   - Filter bar:
//       * Star tabs: All ★ | 5★ | 4★ | 3★ | 2★ | 1★
//       * Reply status: All | Replied | Unreplied
//       * Sort: Newest | Oldest | Highest rating | Lowest rating
//   - Card layout (not table) — product thumbnail + name at top, then ReviewCard
//   - "Reply" / "Edit Reply" opens VendorReplyModal
//   - Pagination 20 per page
//   - Empty state: "No reviews yet for your products."
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MessageSquare, Reply } from 'lucide-react';
import toast from 'react-hot-toast';

import { usePageTitle } from '@/hooks/usePageTitle';
import StarRating from '@/components/reviews/StarRating';
import { VendorReplyBlock } from '@/components/reviews/ReviewCard';
import VendorReplyModal from '@/components/reviews/VendorReplyModal';
import Skeleton from '@/components/common/Skeleton';
import EmptyState from '@/components/common/EmptyState';
import { reviewService } from '@/services/reviewService';
import { paths } from '@/routes/routePaths';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/formatters';

const PAGE_SIZE = 20;
const STAR_TABS = [
  { value: 'all', label: 'All' },
  { value: 5, label: '5★' },
  { value: 4, label: '4★' },
  { value: 3, label: '3★' },
  { value: 2, label: '2★' },
  { value: 1, label: '1★' },
];
const REPLY_OPTIONS = [
  { value: 'all', label: 'All replies' },
  { value: true, label: 'Replied' },
  { value: false, label: 'Unreplied' },
];
const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'rating_high', label: 'Highest rating' },
  { value: 'rating_low', label: 'Lowest rating' },
];

const VendorReviewsPage = () => {
  usePageTitle('Customer reviews · Vendor · PCCraft');
  const qc = useQueryClient();

  const [star, setStar] = useState('all');
  const [reply, setReply] = useState('all');
  const [ordering, setOrdering] = useState('newest');
  const [page, setPage] = useState(1);
  const [replyTarget, setReplyTarget] = useState(null);

  const params = {
    ordering,
    page,
    page_size: PAGE_SIZE,
  };
  if (star !== 'all') params.rating = star;
  if (reply !== 'all') params.replied = reply;

  const query = useQuery({
    queryKey: ['vendor-reviews', params],
    queryFn: () => reviewService.vendorList(params),
    keepPreviousData: true,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['vendor-reviews'] });
  };

  const results = query.data?.results || [];
  const total = query.data?.count || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary sm:text-3xl">
            Customer reviews
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Reviews for all of your products. Reply to thank customers or
            address concerns — one reply per review.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-50 px-3 py-1 text-xs font-bold uppercase text-accent-700">
          <MessageSquare className="h-3.5 w-3.5" />
          {query.isLoading ? '…' : `${total} total`}
        </span>
      </header>

      {/* Filter bar */}
      <div className="mb-6 space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
        {/* Star tabs */}
        <div className="flex flex-wrap gap-1">
          {STAR_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => {
                setStar(tab.value);
                setPage(1);
              }}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                star === tab.value
                  ? 'bg-accent-500 text-white shadow'
                  : 'bg-surface-100 text-text-secondary hover:bg-surface-200',
              )}
              aria-pressed={star === tab.value}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Reply + Sort */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-text-secondary">
            <span>Reply</span>
            <select
              value={String(reply)}
              onChange={(e) => {
                const v = e.target.value;
                setReply(v === 'all' ? 'all' : v === 'true');
                setPage(1);
              }}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
            >
              {REPLY_OPTIONS.map((o) => (
                <option key={String(o.value)} value={String(o.value)}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="ml-auto flex items-center gap-2 text-xs text-text-secondary">
            <span>Sort</span>
            <select
              value={ordering}
              onChange={(e) => {
                setOrdering(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* List */}
      {query.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" rounded="rounded-2xl" />
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
          title="No reviews yet for your products."
          description="Reviews appear here once customers receive their orders and submit feedback."
        />
      ) : (
        <ul className="space-y-4">
          {results.map((review) => (
            <li
              key={review.id}
              className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
            >
              <div className="flex items-center gap-3 border-b border-border bg-surface-50 px-4 py-3">
                <img
                  src={
                    review.product?.primary_image_url ||
                    review.product?.primary_image?.url ||
                    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="%23e5e7eb"/></svg>'
                  }
                  alt={review.product?.name || 'Product'}
                  className="h-10 w-10 rounded-md border border-border object-cover"
                />
                <div className="min-w-0 flex-1">
                  {review.product?.slug ? (
                    <Link
                      to={paths.productDetail(review.product.slug)}
                      className="truncate text-sm font-semibold text-text-primary hover:text-accent-500"
                    >
                      {review.product?.name}
                    </Link>
                  ) : (
                    <span className="truncate text-sm font-semibold text-text-primary">
                      {review.product?.name || 'Product'}
                    </span>
                  )}
                  <div className="mt-0.5 flex items-center gap-2">
                    <StarRating value={Number(review.rating || 0)} size="xs" readOnly />
                    <span className="text-xs text-text-secondary">
                      {formatDate(review.created_at)}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTarget(review)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                    review.vendor_reply
                      ? 'border border-accent-300 bg-accent-50 text-accent-700 hover:bg-accent-100'
                      : 'bg-accent-500 text-white hover:bg-accent-600',
                  )}
                >
                  <Reply className="h-3.5 w-3.5" />
                  {review.vendor_reply ? 'Edit Reply' : 'Reply'}
                </button>
              </div>

              <div className="px-4 py-4">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold text-text-primary">
                    {review.user?.full_name || 'Customer'}
                  </span>
                  {review.is_verified_purchase && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                      Verified
                    </span>
                  )}
                  <span
                    className="ml-auto text-xs text-text-secondary"
                    title={formatDate(review.created_at)}
                  >
                    {formatDate(review.created_at)}
                  </span>
                </div>
                {review.title && (
                  <h4 className="mt-2 text-sm font-semibold text-text-primary">
                    {review.title}
                  </h4>
                )}
                <p className="mt-1 whitespace-pre-line text-sm text-text-primary">
                  {review.body}
                </p>

                <VendorReplyBlock reply={review} />
              </div>
            </li>
          ))}
        </ul>
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

      <VendorReplyModal
        open={Boolean(replyTarget)}
        onClose={() => {
          setReplyTarget(null);
          refresh();
        }}
        review={replyTarget || {}}
      />
    </div>
  );
};

export default VendorReviewsPage;