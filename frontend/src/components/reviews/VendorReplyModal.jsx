// VendorReplyModal — vendor's reply editor.
//
// Spec §2.7 Module 6:
//   - textarea min 10, max 1000 chars with live counter
//   - if existing reply: pre-fill, show "Edit Reply", show original replied_at
//   - submit POSTs /vendor/reviews/<id>/reply/
//   - on success: reply section updates inline (parent refetches)
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import Modal from '@/components/common/Modal';
import { reviewService } from '@/services/reviewService';
import { cn } from '@/utils/cn';
import { formatDateTime } from '@/utils/formatters';

const REPLY_MIN = 10;
const REPLY_MAX = 1000;

const VendorReplyModal = ({ open, onClose, review }) => {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);

  const isEdit = Boolean(review?.vendor_reply);

  useEffect(() => {
    if (!open) return;
    setText(review?.vendor_reply || '');
    setTouched(false);
  }, [open, review]);

  const tooShort = text.trim().length < REPLY_MIN;
  const tooLong = text.length > REPLY_MAX;
  const showError = touched && (tooShort || tooLong);

  const submit = useMutation({
    mutationFn: () => reviewService.vendorReply(review.id, text.trim()),
    onSuccess: () => {
      toast.success(isEdit ? 'Reply updated.' : 'Reply posted.');
      // Invalidate all the queries that show this reply so the parent
      // card re-renders with the new content.
      qc.invalidateQueries({ queryKey: ['reviews'] });
      qc.invalidateQueries({ queryKey: ['vendor-reviews'] });
      qc.invalidateQueries({ queryKey: ['admin-reviews'] });
      onClose?.();
    },
    onError: (err) => {
      const detail =
        err?.response?.data?.error?.message ||
        err?.response?.data?.detail ||
        'Could not save your reply.';
      toast.error(detail);
    },
  });

  return (
    <Modal
      open={open}
      onClose={submit.isPending ? undefined : onClose}
      size="lg"
      title={isEdit ? 'Edit Reply' : 'Reply to this review'}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submit.isPending}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setTouched(true);
              if (!tooShort && !tooLong) submit.mutate();
            }}
            disabled={submit.isPending || tooShort || tooLong}
            className="inline-flex items-center justify-center rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submit.isPending
              ? 'Saving…'
              : isEdit
                ? 'Save reply'
                : 'Post reply'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-surface-50 p-3 text-xs text-text-secondary">
          <p className="font-medium text-text-primary">
            {review?.user?.full_name || 'Customer'} — {review?.title}
          </p>
          <p className="mt-1 line-clamp-3">{review?.body}</p>
        </div>

        <div>
          <label
            htmlFor="vendor-reply"
            className="mb-1.5 block text-sm font-medium text-text-primary"
          >
            Your reply
          </label>
          <textarea
            id="vendor-reply"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            maxLength={REPLY_MAX}
            placeholder="Address the customer's feedback. Stay factual and helpful."
            className={cn(
              'w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-sm focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400',
              showError && 'border-danger',
            )}
          />
          <div className="mt-1 flex justify-between text-xs text-text-secondary">
            <span>
              {showError && tooShort && `Reply must be at least ${REPLY_MIN} characters.`}
              {showError && tooLong && `Reply cannot exceed ${REPLY_MAX} characters.`}
            </span>
            <span>
              {text.length}/{REPLY_MAX}
            </span>
          </div>
        </div>

        {isEdit && review?.vendor_replied_at && (
          <p className="text-xs text-text-secondary">
            Originally posted on {formatDateTime(review.vendor_replied_at)}.
          </p>
        )}
        {isEdit && (
          <p className="rounded-md bg-surface-100 px-3 py-2 text-xs text-text-secondary">
            Your previous reply is replaced when you save. Vendor replies can&apos;t
            be deleted — only updated.
          </p>
        )}
      </div>
    </Modal>
  );
};

export default VendorReplyModal;