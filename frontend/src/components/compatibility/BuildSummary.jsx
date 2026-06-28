// BuildSummary — right-rail card on PCBuilderPage.
//
// Renders:
//   1. Completion checklist (required slots, filled vs missing).
//   2. Total price (formatted as BDT).
//   3. Action buttons:
//        - Add All to Cart  (always enabled when ≥1 slot filled)
//        - Save Build       (auth-gated)
//        - Share Build      (auth-gated, disabled until first save)
//        - Clear All        (with ConfirmDialog)
//
// Toasts use `react-hot-toast` for feedback (already a dependency).
// The "Save" CTA creates or updates the same row so re-saving the same
// session doesn't spawn duplicates.

import { useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Loader2,
  Save,
  Share2,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';

import ConfirmDialog from '@components/common/ConfirmDialog';
import { usePCBuilder } from '@hooks/usePCBuilder';
import { useAuthStore } from '@context/useAuthStore';
import { cn } from '@utils/cn';
import { formatPrice } from '@utils/formatters';
import { REQUIRED_SLOT_KEYS, SLOTS, getSlot } from '@utils/pcSlots';

const SlotChecklist = ({ slots }) => {
  const required = SLOTS.filter((s) => s.required);
  return (
    <ul className="space-y-1.5" aria-label="Slot completion">
      {required.map((slot) => {
        const filled = Boolean(slots?.[slot.key]);
        return (
          <li key={slot.key} className="flex items-center gap-2 text-sm">
            {filled ? (
              <CheckCircle2
                className="h-4 w-4 text-emerald-400"
                aria-hidden="true"
              />
            ) : (
              <Circle className="h-4 w-4 text-text-secondary" aria-hidden="true" />
            )}
            <span className={cn(filled ? 'text-text-primary' : 'text-text-secondary')}>
              {slot.label}
            </span>
            {!filled && (
              <span className="ml-auto text-[11px] font-semibold uppercase tracking-wide text-danger">
                Required
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
};

/**
 * @param {object} props
 * @param {(options?: {isPublic?: boolean}) => Promise<object>} [props.onShare]
 *   Optional override for share (used by MyBuildsPage so it can pass a
 *   custom is_public flag). Defaults to usePCBuilder.shareBuild().
 * @param {boolean} [props.compact]
 *   Hide the action buttons (used by SharedBuildPage).
 */
const BuildSummary = ({ onShare, compact = false, className = '' }) => {
  const slots = usePCBuilder((s) => s.slots);
  const totalPrice = usePCBuilder((s) => s.totalPrice);
  const isChecking = usePCBuilder((s) => s.isChecking);
  const buildId = usePCBuilder((s) => s.buildId);
  const isSaving = usePCBuilder((s) => s.isSaving);
  const isSharing = usePCBuilder((s) => s.isSharing);
  const lastSavedAt = usePCBuilder((s) => s.lastSavedAt);

  const clearAll = usePCBuilder((s) => s.clearAll);
  const addAllToCart = usePCBuilder((s) => s.addAllToCart);
  const saveBuild = usePCBuilder((s) => s.saveBuild);

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [confirmClear, setConfirmClear] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);

  const filledCount = Object.values(slots || {}).filter(
    (v) => v !== null && v !== undefined && v !== '',
  ).length;
  const requiredCount = REQUIRED_SLOT_KEYS.length;
  const completedRequired = REQUIRED_SLOT_KEYS.filter((k) => slots?.[k]).length;
  const allRequiredDone = completedRequired === requiredCount;

  const handleAddAll = async () => {
    setAddingToCart(true);
    try {
      const { added, failed, total } = await addAllToCart();
      if (added === total && failed === 0) {
        toast.success(`Added ${added} item${added === 1 ? '' : 's'} to cart`);
      } else if (added > 0) {
        toast(`Added ${added} of ${total} items (${failed} failed)`, {
          icon: '⚠️',
        });
      } else {
        toast.error('Could not add items to cart.');
      }
    } catch (err) {
      toast.error(err?.message || 'Add to cart failed.');
    } finally {
      setAddingToCart(false);
    }
  };

  const handleSave = async () => {
    if (!isAuthenticated) {
      toast.error('Sign in to save your build.');
      return;
    }
    try {
      await saveBuild();
      toast.success(buildId ? 'Build updated.' : 'Build saved.');
    } catch (err) {
      const msg =
        err?.response?.data?.error?.message || err?.message || 'Save failed.';
      toast.error(msg);
    }
  };

  const handleShare = async () => {
    if (!isAuthenticated) {
      toast.error('Sign in to share your build.');
      return;
    }
    try {
      await (onShare ? onShare({ isPublic: true }) : null);
      // shareBuild is owned by the parent (it owns the modal). We just
      // confirm the action succeeded — the parent will surface the URL.
      toast.success('Build shared.');
    } catch (err) {
      toast.error(err?.message || 'Share failed.');
    }
  };

  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-surface p-5 shadow-sm',
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold text-text-primary">
          Build Summary
        </h2>
        {isChecking && (
          <Loader2
            className="h-4 w-4 animate-spin text-text-secondary"
            aria-label="Checking compatibility"
          />
        )}
      </div>

      {/* Checklist */}
      <SlotChecklist slots={slots} />

      {/* Totals */}
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-text-secondary">
            Slots filled
          </div>
          <div className="font-heading text-xl font-semibold text-text-primary">
            {filledCount} <span className="text-sm font-normal text-text-secondary">/ {SLOTS.length}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wide text-text-secondary">
            Estimated total
          </div>
          <div className="font-heading text-xl font-semibold text-accent-500">
            {formatPrice(totalPrice || '0')}
          </div>
        </div>
      </div>

      {/* Hint when not all required slots are filled */}
      {!allRequiredDone && (
        <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
          Finish the {requiredCount - completedRequired} required slot
          {requiredCount - completedRequired === 1 ? '' : 's'} above to unlock
          Save and Share.
        </p>
      )}

      {/* Action buttons */}
      {!compact && (
        <div className="mt-5 grid gap-2">
          <button
            type="button"
            onClick={handleAddAll}
            disabled={filledCount === 0 || addingToCart}
            className="flex items-center justify-center gap-2 rounded-md bg-accent-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-400 disabled:cursor-not-allowed disabled:bg-surface-200 disabled:text-text-secondary"
          >
            {addingToCart ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShoppingCart className="h-4 w-4" />
            )}
            Add All to Cart
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!allRequiredDone || isSaving || !isAuthenticated}
              title={
                !isAuthenticated
                  ? 'Sign in to save'
                  : !allRequiredDone
                    ? 'Fill required slots first'
                    : ''
              }
              className="flex items-center justify-center gap-2 rounded-md border border-accent-500 bg-surface px-3 py-2 text-sm font-semibold text-accent-500 transition hover:bg-accent-500 hover:text-white disabled:cursor-not-allowed disabled:border-surface-300 disabled:bg-surface-50 disabled:text-text-secondary"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {buildId ? 'Update' : 'Save'}
            </button>

            <button
              type="button"
              onClick={handleShare}
              disabled={!buildId || isSharing || !isAuthenticated}
              title={
                !buildId
                  ? 'Save the build first'
                  : !isAuthenticated
                    ? 'Sign in to share'
                    : ''
              }
              className="flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-semibold text-text-primary transition hover:bg-surface-50 disabled:cursor-not-allowed disabled:bg-surface-50 disabled:text-text-secondary"
            >
              {isSharing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Share2 className="h-4 w-4" />
              )}
              Share
            </button>
          </div>

          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            disabled={filledCount === 0}
            className="mt-1 flex items-center justify-center gap-2 rounded-md border border-transparent bg-surface-100 px-3 py-2 text-xs font-semibold text-text-secondary transition hover:border-danger/40 hover:text-danger disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear build
          </button>

          {lastSavedAt && (
            <p className="text-center text-[11px] text-text-secondary">
              Last saved {new Date(lastSavedAt).toLocaleTimeString()}
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => {
          clearAll();
          setConfirmClear(false);
          toast.success('Build cleared.');
        }}
        title="Clear this build?"
        description="All selected components will be removed from the builder."
        confirmLabel="Clear"
        tone="danger"
      />
    </div>
  );
};

export default BuildSummary;