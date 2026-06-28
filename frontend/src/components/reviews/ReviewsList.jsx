// ReviewsList — public review feed for a product detail page.
//
// Combines:
//   - RatingSummary (overall average + star distribution bars)
//   - Sort + filter dropdown
//   - List of ReviewCards with pagination
//   - "Write a review" CTA gated by reviewService.canReviewGlobal()
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';

import RatingBreakdown from './RatingBreakdown';
import ReviewCard from './ReviewCard';
import WriteReviewModal from './WriteReviewModal';
import Skeleton from '@/components/common/Skeleton';
import EmptyState from '@/components/common/EmptyState';
import { useAuthStore } from '@/context/useAuthStore';
import { reviewService } from '@/services/reviewService';
import { cn } from '@/utils/cn';

const ORDERING_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'helpful', label: 'Most helpful' },
  { value: 'rating_high', label: 'Highest rating' },
  { value: 'rating_low', label: 'Lowest rating' },
];

const ReviewsList = ({ productSlug, productName }) => {
  const qc = useQueryClient();
  const isAuth = useAuthStore((s) => s.isAuthenticated);
  const meId = useAuthStore((s) => s.user?.id);

  const [ordering, setOrdering] = useState('newest');
  const [page, setPage] = useState(1);
  const [writeOpen, setWriteOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const listQuery = useQuery({
    queryKey: ['reviews', productSlug, ordering, page],
    queryFn: () => reviewService.forProduct(productSlug, { ordering, page }),
    enabled: Boolean(productSlug),
    keepPreviousData: true,
  });

  const breakdownQuery = useQuery({
    queryKey: ['rating-breakdown', productSlug],
    queryFn: () => reviewService.ratingBreakdown(productSlug),
    enabled: Boolean(productSlug),
    staleTime: 60_000,
  });

  const eligibility = useQuery({
    queryKey: ['review-can-review', productSlug],
    queryFn: () => reviewService.canReviewGlobal(productSlug),
    enabled: Boolean(productSlug) && isAuth,
    staleTime: 60_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (review) => reviewService.remove(review.id),
    onSuccess: () => {
      toast.success('Review deleted.');
      qc.invalidateQueries({ queryKey: ['reviews', productSlug] });
      qc.invalidateQueries({ queryKey: ['rating-breakdown', productSlug] });
    },
    onError: () => toast.error('Could not delete the review.'),
  });

  const results = listQuery.data?.results || [];
  const total = listQuery.data?.count || 0;
  const totalPages = Math.max(1, Math.ceil(total / (listQuery.data?.page_size || 10)));

  const breakdown = useMemo(
    () => breakdownQuery.data?.breakdown || {},
    [breakdownQuery.data],
  );
  // Backend currently emits raw per-star counts; the legacy component
  // computed `verified` client-side. With the new shape, we just trust
  // whatever the server returns.
  const verifiedCount = 0;

  const canWrite =
    isAuth && eligibility.data?.can_review === true;

  const handleWriteClick = () => {
    if (!isAuth) {
      toast.error('Please sign in to write a review.');
      return;
    }
    setEditing(null);
    setWriteOpen(true);
  };

  const handleEditClick = (review) => {
    setEditing(review);
    setWriteOpen(true);
  };

  const handleDeleteClick = (review) => {
    if (window.confirm('Delete your review? This cannot be undone.')) {
      deleteMutation.mutate(review);
    }
  };

  return (
    <section className="space-y-6">
      <RatingBreakdown
        breakdown={breakdown}
        // Backend (apps.reviews.views.ProductReviewViewSet.rating_breakdown)
        // returns {average, total, breakdown}; some legacy callers send
        // `avg_rating` / `verified_count` — accept both via fallbacks.
        avg={
          breakdownQuery.data?.average ??
          breakdownQuery.data?.avg_rating ??
          null
        }
        total={breakdownQuery.data?.total ?? total}
        verified={
          breakdownQuery.data?.verified_count ??
          breakdownQuery.data?.verified ??
          verifiedCount
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-heading text-lg font-semibold text-text-primary">
            Customer reviews
          </h3>
          <p className="text-xs text-text-secondary">
            {listQuery.isLoading
              ? 'Loading reviews…'
              : total > 0
                ? `${total} review${total === 1 ? '' : 's'}`
                : 'Be the first to share your experience.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={ordering}
            onChange={(e) => {
              setOrdering(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-text-primary shadow-sm focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
            aria-label="Sort reviews"
          >
            {ORDERING_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleWriteClick}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold shadow-sm transition',
              canWrite
                ? 'bg-accent-500 text-white hover:bg-accent-600'
                : 'border border-border bg-surface text-text-secondary hover:border-accent-400 hover:text-accent-500',
            )}
          >
            <Pencil className="h-3.5 w-3.5" />
            Write a review
          </button>
        </div>
      </div>

      {/* Eligibility hint for authenticated non-eligible users */}
      {isAuth && !eligibility.isLoading && !canWrite && (
        <p className="rounded-md border border-dashed border-border bg-surface-50 px-3 py-2 text-xs text-text-secondary">
          {eligibility.data?.reason ||
            'You can only review products you have purchased and received.'}
        </p>
      )}

      {/* Reviews */}
      {listQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" rounded="rounded-2xl" />
          ))}
        </div>
      ) : listQuery.isError ? (
        <EmptyState
          icon={MessageSquare}
          title="Could not load reviews"
          description="Please try again in a moment."
          actionLabel="Retry"
          onAction={() => listQuery.refetch()}
        />
      ) : results.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No reviews yet"
          description="Reviews appear here once customers share their experience."
        />
      ) : (
        <div className="space-y-3">
          {results.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              onEdit={review.user?.id === meId ? handleEditClick : undefined}
              onDelete={review.user?.id === meId ? handleDeleteClick : undefined}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
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

      <WriteReviewModal
        open={writeOpen}
        onClose={() => setWriteOpen(false)}
        productSlug={productSlug}
        productName={productName}
        existing={editing}
      />
    </section>
  );
};

export default ReviewsList;