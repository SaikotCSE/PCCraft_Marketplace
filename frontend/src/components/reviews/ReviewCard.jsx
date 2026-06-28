// ReviewCard — single review with vendor reply, helpful vote, images.
//
// Spec §2.7 Module 6:
//   - avatar (initials fallback), display name, "Verified Purchase" green badge
//   - star display, date (relative), full date in title attribute
//   - body with 3-line clamp + "Read more"
//   - up to 4 image thumbnails, click → enlarge via Modal
//   - "Helpful (N)" button, optimistic toggle, accent ring when active
//   - vendor reply block with store logo + name, replied_at, "(edited)"
//   - Edit / Delete only visible to author
//   - Report icon visible to all authenticated non-authors
import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  Flag,
  ThumbsUp,
  Trash2,
  Pencil,
  Image as ImageIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';

import StarRating from './StarRating';
import Modal from '@/components/common/Modal';
import { useAuthStore } from '@/context/useAuthStore';
import { reviewService } from '@/services/reviewService';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/formatters';

const PLACEHOLDER_AVATAR =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="%23e5e7eb"/><text x="50%25" y="55%25" font-family="Arial" font-size="16" fill="%236b7280" text-anchor="middle">?</text></svg>';

/** Relative date: "2 days ago", "5 minutes ago", "just now". */
function relativeTime(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) {
    const n = Math.floor(diff / 60);
    return `${n} minute${n === 1 ? '' : 's'} ago`;
  }
  if (diff < 86400) {
    const n = Math.floor(diff / 3600);
    return `${n} hour${n === 1 ? '' : 's'} ago`;
  }
  if (diff < 86400 * 30) {
    const n = Math.floor(diff / 86400);
    return `${n} day${n === 1 ? '' : 's'} ago`;
  }
  return formatDate(iso);
}

/** Build initials fallback for missing avatar. */
function initialsFor(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || '?';
}

const ReviewCard = ({
  review,
  onEdit,
  onDelete,
  showProductLink = false,
  vendorReplySlot = null, // optional React node rendered under the body
  className = '',
}) => {
  const qc = useQueryClient();
  const isAuth = useAuthStore((s) => s.isAuthenticated);
  const meId = useAuthStore((s) => s.user?.id);

  const [expanded, setExpanded] = useState(false);
  const [zoomedImage, setZoomedImage] = useState(null);

  // Local optimistic state for helpful vote so the button reflects
  // the next server value immediately.
  const [optimistic, setOptimistic] = useState({
    is_helpful_by_me: Boolean(review?.is_helpful_by_me),
    helpful_count: Number(review?.helpful_count || 0),
  });

  const isAuthor = isAuth && meId && review?.user?.id === meId;

  const helpfulMutation = useMutation({
    mutationFn: () => reviewService.toggleHelpful(review.id),
    onMutate: () => {
      // Optimistic flip.
      setOptimistic((prev) => ({
        is_helpful_by_me: !prev.is_helpful_by_me,
        helpful_count: prev.helpful_count + (prev.is_helpful_by_me ? -1 : 1),
      }));
    },
    onError: () => {
      // Revert.
      setOptimistic((prev) => ({
        is_helpful_by_me: !prev.is_helpful_by_me,
        helpful_count: prev.helpful_count + (prev.is_helpful_by_me ? -1 : 1),
      }));
      toast.error('Could not record your vote.');
    },
    onSuccess: (data) => {
      // Server has the truth — sync.
      if (data) {
        setOptimistic({
          is_helpful_by_me: Boolean(data.helpful),
          helpful_count: Number(data.count || 0),
        });
      }
      // Invalidate any open list so other cards re-render in step.
      qc.invalidateQueries({ queryKey: ['reviews'] });
    },
  });

  const handleHelpful = () => {
    if (!isAuth) {
      toast.error('Please sign in to mark reviews helpful.');
      return;
    }
    helpfulMutation.mutate();
  };

  const handleReport = () => {
    // Placeholder per spec; wire to a real moderation endpoint later.
    toast.success('Thanks — our team will review this.');
  };

  return (
    <article
      className={cn(
        'rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5',
        review?.is_hidden && 'bg-surface-100 text-text-secondary line-through',
        className,
      )}
    >
      <header className="flex items-start gap-3">
        <img
          src={review?.user?.avatar_url || PLACEHOLDER_AVATAR}
          alt={review?.user?.full_name || 'Customer avatar'}
          className="h-10 w-10 shrink-0 rounded-full bg-surface-200 object-cover"
          onError={(e) => {
            e.currentTarget.src = PLACEHOLDER_AVATAR;
          }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-text-primary">
              {review?.user?.full_name || 'Customer'}
            </span>
            {review?.is_verified_purchase && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                <BadgeCheck className="h-3 w-3" aria-hidden="true" />
                Verified Purchase
              </span>
            )}
            {review?.is_hidden && (
              <span className="inline-flex items-center rounded-full bg-surface-300 px-2 py-0.5 text-[10px] font-bold uppercase text-text-secondary">
                Hidden
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <StarRating value={Number(review?.rating || 0)} size="sm" readOnly />
            <span
              className="text-xs text-text-secondary"
              title={formatDate(review?.created_at)}
            >
              {relativeTime(review?.created_at)}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {isAuthor && (
            <>
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(review)}
                  className="rounded p-1.5 text-text-secondary hover:bg-surface-100 hover:text-accent-500"
                  aria-label="Edit your review"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(review)}
                  className="rounded p-1.5 text-text-secondary hover:bg-surface-100 hover:text-danger"
                  aria-label="Delete your review"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </>
          )}
          {isAuth && !isAuthor && (
            <button
              type="button"
              onClick={handleReport}
              className="rounded p-1.5 text-text-secondary hover:bg-surface-100 hover:text-danger"
              aria-label="Report this review"
            >
              <Flag className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {review?.title && (
        <h4 className="mt-3 text-sm font-semibold text-text-primary">{review.title}</h4>
      )}

      <p
        className={cn(
          'mt-2 text-sm leading-relaxed text-text-primary',
          !expanded && 'line-clamp-3',
        )}
      >
        {review?.body}
      </p>
      {review?.body && review.body.length > 200 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 text-xs font-medium text-accent-500 hover:underline"
        >
          {expanded ? 'Read less' : 'Read more'}
        </button>
      )}

      {/* Images */}
      {Array.isArray(review?.images) && review.images.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {review.images.slice(0, 4).map((img) => (
            <li key={img.id || img.image}>
              <button
                type="button"
                onClick={() => setZoomedImage(img)}
                className="block h-16 w-16 overflow-hidden rounded-md border border-border bg-surface-200 transition hover:opacity-80"
                aria-label="View larger image"
              >
                <img
                  src={img.image || img.url}
                  alt={img.alt_text || 'Review image'}
                  className="h-full w-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Vendor reply slot (page passes its own block, or we render the embedded one) */}
      {vendorReplySlot}
      {!vendorReplySlot && review?.vendor_reply && (
        <VendorReplyBlock reply={review} />
      )}

      <footer className="mt-4 flex items-center gap-2 border-t border-border pt-3">
        <button
          type="button"
          onClick={handleHelpful}
          disabled={helpfulMutation.isPending}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition',
            optimistic.is_helpful_by_me
              ? 'border-accent-500 bg-accent-50 text-accent-700 ring-1 ring-accent-500'
              : 'border-border bg-surface text-text-secondary hover:border-accent-400 hover:text-accent-500',
          )}
          aria-pressed={optimistic.is_helpful_by_me}
        >
          <ThumbsUp
            className={cn(
              'h-3.5 w-3.5',
              optimistic.is_helpful_by_me && 'fill-accent-500 text-accent-500',
            )}
            aria-hidden="true"
          />
          Helpful ({optimistic.helpful_count})
        </button>
      </footer>

      <Modal
        open={Boolean(zoomedImage)}
        onClose={() => setZoomedImage(null)}
        size="lg"
        title="Review image"
      >
        {zoomedImage && (
          <img
            src={zoomedImage.image || zoomedImage.url}
            alt={zoomedImage.alt_text || 'Review image'}
            className="mx-auto max-h-[70vh] w-auto rounded-lg object-contain"
          />
        )}
      </Modal>
    </article>
  );
};

/**
 * VendorReplyBlock — read-only display of a vendor's reply, used inline
 * inside ReviewCard when the page doesn't supply its own reply slot.
 */
export const VendorReplyBlock = ({ reply }) => {
  if (!reply?.vendor_reply) return null;
  return (
    <aside className="mt-4 rounded-xl border border-primary-200 bg-primary-50 p-4">
      <div className="flex items-center gap-2">
        <ImageIcon className="h-3.5 w-3.5 text-primary-700" aria-hidden="true" />
        <span className="text-xs font-semibold uppercase tracking-wide text-primary-700">
          {reply?.vendor?.store_name || 'Vendor'} replied
        </span>
      </div>
      <p className="mt-2 whitespace-pre-line text-sm text-text-primary">
        {reply.vendor_reply}
      </p>
      <p
        className="mt-2 text-xs text-text-secondary"
        title={formatDate(reply?.vendor_replied_at)}
      >
        {formatDate(reply?.vendor_replied_at)}
        {reply?.vendor_reply_edited_at && (
          <span className="ml-1 italic text-text-secondary">(edited)</span>
        )}
      </p>
    </aside>
  );
};

export default ReviewCard;