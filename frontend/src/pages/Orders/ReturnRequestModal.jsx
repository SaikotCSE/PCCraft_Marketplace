// ReturnRequestModal — Module 5 customer-facing return request form.
//
// Per spec §5:
//   - Reason select (one of RETURN_REASONS)
//   - Description textarea (min 20 chars, max 2000)
//   - Up to MAX_RETURN_EVIDENCE image uploads
//   - Submits via returnService.initiateReturn(itemId, payload)
//   - On success, calls onCreated(returnId) so the parent can navigate
//
// The modal is rendered inline by OrderDetailPage for delivered items
// within the 7-day window.
import { useEffect, useState } from 'react';
import { Loader2, Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { returnService } from '@services/returnService';
import Modal from '@components/common/Modal';
import FileUpload from '@components/common/FileUpload';
import {
  MAX_RETURN_EVIDENCE,
  RETURN_REASONS,
} from '@utils/constants';

const REASON_LABELS = {
  [RETURN_REASONS.DAMAGED]: 'Damaged in transit',
  [RETURN_REASONS.NOT_AS_DESCRIBED]: 'Not as described',
  [RETURN_REASONS.WRONG_ITEM]: 'Wrong item received',
  [RETURN_REASONS.DEFECTIVE]: 'Defective / not working',
  [RETURN_REASONS.MISSING_PARTS]: 'Missing parts or accessories',
};

const MIN_DESCRIPTION = 20;
const MAX_DESCRIPTION = 2000;

const ReturnRequestModal = ({ open, item, onClose, onCreated }) => {
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  // Reset form whenever the modal opens for a new item.
  useEffect(() => {
    if (open) {
      setReason('');
      setDescription('');
      setImages([]);
      setErrors({});
    }
  }, [open, item?.id]);

  if (!item) return null;

  const descLen = description.length;
  const descOk = descLen >= MIN_DESCRIPTION && descLen <= MAX_DESCRIPTION;
  const canSubmit =
    !!reason && descOk && (images?.length ?? 0) <= MAX_RETURN_EVIDENCE && !submitting;

  const validate = () => {
    const next = {};
    if (!reason) next.reason = 'Please choose a reason.';
    if (descLen < MIN_DESCRIPTION) {
      next.description = `Please describe the issue (at least ${MIN_DESCRIPTION} characters).`;
    } else if (descLen > MAX_DESCRIPTION) {
      next.description = `Please keep your description under ${MAX_DESCRIPTION} characters.`;
    }
    if ((images?.length ?? 0) > MAX_RETURN_EVIDENCE) {
      next.images = `Up to ${MAX_RETURN_EVIDENCE} images allowed.`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const result = await returnService.initiateReturn(item.id, {
        reason,
        description: description.trim(),
        images,
      });
      const returnId =
        result?.id || result?.return_id || result?.return_request_id || null;
      toast.success('Return request submitted.');
      onCreated?.(returnId);
    } catch (err) {
      // axios interceptor already surfaces server-side validation errors
      // via toast; nothing else to do here.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        <header className="flex items-start gap-3 border-b border-border pb-4">
          <div className="rounded-md bg-accent-50 p-2 text-accent-600">
            <Undo2 className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="font-heading text-lg font-semibold text-text-primary">
              Request a return
            </h2>
            <p className="mt-0.5 text-xs text-text-secondary">
              {item.product_name_snapshot || 'Item'} ·{' '}
              <span className="font-mono">{item.product_sku_snapshot || item.id}</span>
            </p>
          </div>
        </header>

        {/* Reason */}
        <div>
          <label
            htmlFor="return-reason"
            className="block text-xs font-semibold uppercase tracking-wide text-text-secondary"
          >
            Reason
          </label>
          <select
            id="return-reason"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (errors.reason) setErrors((p) => ({ ...p, reason: null }));
            }}
            className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
          >
            <option value="">Select a reason…</option>
            {Object.values(RETURN_REASONS).map((r) => (
              <option key={r} value={r}>
                {REASON_LABELS[r] || r}
              </option>
            ))}
          </select>
          {errors.reason && (
            <p className="mt-1 text-xs text-red-600">{errors.reason}</p>
          )}
        </div>

        {/* Description */}
        <div>
          <label
            htmlFor="return-description"
            className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-text-secondary"
          >
            <span>Describe the issue</span>
            <span
              className={
                descOk
                  ? 'text-text-secondary'
                  : 'text-red-600'
              }
            >
              {descLen}/{MAX_DESCRIPTION}
            </span>
          </label>
          <textarea
            id="return-description"
            rows={5}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              if (errors.description) setErrors((p) => ({ ...p, description: null }));
            }}
            placeholder="What went wrong? Include any details the vendor will need to assess this return."
            className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
          />
          {errors.description ? (
            <p className="mt-1 text-xs text-red-600">{errors.description}</p>
          ) : (
            <p className="mt-1 text-xs text-text-secondary">
              Minimum {MIN_DESCRIPTION} characters.
            </p>
          )}
        </div>

        {/* Evidence */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Evidence ({images?.length ?? 0}/{MAX_RETURN_EVIDENCE})
          </label>
          <div className="mt-1.5">
            <FileUpload
              value={images}
              onChange={(files) => {
                setImages(files);
                if (errors.images) setErrors((p) => ({ ...p, images: null }));
              }}
              maxFiles={MAX_RETURN_EVIDENCE}
              accept="image/*"
              multiple
            />
          </div>
          {errors.images && (
            <p className="mt-1 text-xs text-red-600">{errors.images}</p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary hover:border-accent-500 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Submit return request
          </button>
        </footer>
      </form>
    </Modal>
  );
};

export default ReturnRequestModal;