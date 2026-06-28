// WriteReviewModal — customer's create/edit review form.
//
// Per spec §2.7 Module 6:
//   - On open, GET /reviews/can-review/?product=<slug>.
//     If false → show locked state with reason, disable form.
//   - Star selector: hover preview, click to set, click same star to deselect.
//   - Title input min 5 chars; body textarea min 30 chars w/ live counter.
//   - Up to 4 images via FileUpload.
//   - Submit disabled when can_review=false OR form invalid.
//   - On success: invalidate ['products','reviews', slug] → list refreshes.
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import toast from 'react-hot-toast';

import StarRating from './StarRating';
import Modal from '@/components/common/Modal';
import FileUpload from '@/components/common/FileUpload';
import { reviewService } from '@/services/reviewService';
import { cn } from '@/utils/cn';

const TITLE_MIN = 5;
const BODY_MIN = 30;
const BODY_MAX = 4000;
const MAX_IMAGES = 4;

const WriteReviewModal = ({
  open,
  onClose,
  productSlug,
  productName,
  // When editing an existing review, the page passes it in.
  // In create mode this is null.
  existing = null,
}) => {
  const qc = useQueryClient();
  const isEdit = Boolean(existing?.id);

  // Form state
  const [rating, setRating] = useState(existing?.rating || 0);
  const [title, setTitle] = useState(existing?.title || '');
  const [body, setBody] = useState(existing?.body || '');
  const [images, setImages] = useState([]); // FileUpload draft items
  const [touched, setTouched] = useState(false);

  // Eligibility probe — only run in create mode.
  const eligibility = useQuery({
    queryKey: ['review-can-review', productSlug],
    queryFn: () => reviewService.canReviewGlobal(productSlug),
    enabled: open && !isEdit && Boolean(productSlug),
    staleTime: 60_000,
  });

  // Reset state every time the modal re-opens.
  useEffect(() => {
    if (!open) return;
    setRating(existing?.rating || 0);
    setTitle(existing?.title || '');
    setBody(existing?.body || '');
    setImages([]);
    setTouched(false);
  }, [open, existing]);

  const canReview = isEdit ? true : eligibility.data?.can_review === true;
  const reason = isEdit ? null : eligibility.data?.reason;

  // Client-side validity mirrors the backend serializer rules.
  const errors = useMemo(() => {
    const e = {};
    if (rating < 1 || rating > 5) e.rating = 'Please select a star rating.';
    if (title.trim().length < TITLE_MIN) {
      e.title = `Title must be at least ${TITLE_MIN} characters.`;
    }
    if (body.trim().length < BODY_MIN) {
      e.body = `Review must be at least ${BODY_MIN} characters.`;
    }
    if (body.length > BODY_MAX) {
      e.body = `Review cannot exceed ${BODY_MAX} characters.`;
    }
    return e;
  }, [rating, title, body]);

  const submit = useMutation({
    mutationFn: async () => {
      // The spec: rating is immutable after creation — but when editing
      // we may want to send the original rating unchanged. The serializer
      // excludes the field, so we send it harmlessly only on create.
      const payload = {
        rating,
        title: title.trim(),
        body: body.trim(),
        images: images.map((i) => i.file).filter(Boolean),
      };
      if (isEdit) {
        // Editing — drop rating to satisfy "immutable" rule on backend.
        delete payload.rating;
        return reviewService.update(existing.id, payload);
      }
      return reviewService.create(productSlug, payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Review updated.' : 'Thanks — your review is live.');
      qc.invalidateQueries({ queryKey: ['reviews', productSlug] });
      qc.invalidateQueries({ queryKey: ['product', productSlug] });
      qc.invalidateQueries({ queryKey: ['rating-breakdown', productSlug] });
      onClose?.();
    },
    onError: (err) => {
      const detail =
        err?.response?.data?.error?.message ||
        err?.response?.data?.detail ||
        'Could not save your review.';
      toast.error(detail);
    },
  });

  const submitting = submit.isPending;
  const showErrors = touched;
  const titleInvalid = showErrors && errors.title;
  const bodyInvalid = showErrors && errors.body;
  const ratingInvalid = showErrors && errors.rating;
  const submitDisabled =
    !canReview || Object.keys(errors).length > 0 || submitting;

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      size="lg"
      title={isEdit ? 'Edit your review' : `Write a review${productName ? ` · ${productName}` : ''}`}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setTouched(true);
              if (Object.keys(errors).length === 0 && canReview) {
                submit.mutate();
              }
            }}
            disabled={submitDisabled}
            className="inline-flex items-center justify-center rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting
              ? 'Submitting…'
              : isEdit
                ? 'Save changes'
                : 'Submit review'}
          </button>
        </>
      }
    >
      {/* Locked state for ineligible users */}
      {!isEdit && eligibility.isLoading && (
        <div className="space-y-3">
          <div className="h-5 w-1/3 animate-pulse rounded bg-surface-200" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-surface-200" />
          <div className="h-24 w-full animate-pulse rounded bg-surface-200" />
        </div>
      )}

      {!isEdit && !eligibility.isLoading && !canReview && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-100 text-text-secondary">
            <Lock className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium text-text-primary">
            You can&apos;t review this product yet
          </p>
          <p className="max-w-md text-xs text-text-secondary">
            {reason ||
              'You can only review products you have purchased and received.'}
          </p>
        </div>
      )}

      {(isEdit || canReview) && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (Object.keys(errors).length === 0) submit.mutate();
          }}
          className="space-y-5"
        >
          {/* Star selector */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-primary">
              Your rating
            </label>
            <div className="flex items-center gap-3">
              <StarRating value={rating} onChange={setRating} size="lg" />
              {rating > 0 && (
                <span className="text-xs text-text-secondary">
                  {rating} of 5 stars
                </span>
              )}
            </div>
            {ratingInvalid && (
              <p className="mt-1 text-xs text-danger">{errors.rating}</p>
            )}
          </div>

          {/* Title */}
          <div>
            <label
              htmlFor="review-title"
              className="mb-1.5 block text-sm font-medium text-text-primary"
            >
              Title
            </label>
            <input
              id="review-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Summarise your experience"
              className={cn(
                'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-sm focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400',
                titleInvalid && 'border-danger',
              )}
              disabled={!isEdit && !canReview}
            />
            <div className="mt-1 flex justify-between text-xs text-text-secondary">
              <span>{titleInvalid && errors.title}</span>
              <span>{title.length}/200</span>
            </div>
          </div>

          {/* Body */}
          <div>
            <label
              htmlFor="review-body"
              className="mb-1.5 block text-sm font-medium text-text-primary"
            >
              Your review
            </label>
            <textarea
              id="review-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              maxLength={BODY_MAX}
              placeholder="What did you like or dislike? How did you use it?"
              className={cn(
                'w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-sm focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400',
                bodyInvalid && 'border-danger',
              )}
              disabled={!isEdit && !canReview}
            />
            <div className="mt-1 flex justify-between text-xs text-text-secondary">
              <span>{bodyInvalid && errors.body}</span>
              <span>
                {body.length}/{BODY_MAX}
              </span>
            </div>
          </div>

          {/* Images */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-primary">
              Photos <span className="font-normal text-text-secondary">(optional, up to {MAX_IMAGES})</span>
            </label>
            <FileUpload value={images} onChange={setImages} max={MAX_IMAGES} disabled={!isEdit && !canReview} />
          </div>

          {/* Submit helper text for edit mode — rating immutable */}
          {isEdit && (
            <p className="rounded-md bg-surface-100 px-3 py-2 text-xs text-text-secondary">
              Your star rating is locked once a review is submitted.
            </p>
          )}
        </form>
      )}
    </Modal>
  );
};

export default WriteReviewModal;