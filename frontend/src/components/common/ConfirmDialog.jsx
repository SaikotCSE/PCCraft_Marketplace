// ConfirmDialog — destructive / irreversible confirmation modal.
//
// Spec §2.7 Module 6 admin moderation uses this for:
//   - "Hide" / "Restore" bulk actions
//   - "Remove Vendor Reply"
//   - future "Delete review" admin actions
//
// It's a thin wrapper over <Modal/> that renders a title, optional
// description body, and Cancel / Confirm buttons. The Confirm button
// can render in `primary`, `danger`, or `warning` tone.
//
// Usage:
//   <ConfirmDialog
//     open={open}
//     onClose={...}
//     onConfirm={async () => { await mutate(); }}
//     title="Hide selected reviews?"
//     description="They'll no longer appear on product pages or affect ratings."
//     confirmLabel="Hide reviews"
//     tone="danger"
//     loading={mutation.isPending}
//   />
import { AlertTriangle } from 'lucide-react';

import Modal from './Modal';
import { cn } from '@/utils/cn';

const TONE_CLASSES = {
  primary: 'bg-accent-500 text-white hover:bg-accent-600 focus:ring-accent-400',
  danger: 'bg-danger text-white hover:bg-danger/90 focus:ring-danger/40',
  warning: 'bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-400',
};

const ConfirmDialog = ({
  open,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  description,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  loading = false,
  hideIcon = false,
}) => {
  const toneClass = TONE_CLASSES[tone] || TONE_CLASSES.danger;

  return (
    <Modal
      open={open}
      onClose={loading ? undefined : onClose}
      size="sm"
      title={title}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-100 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60',
              toneClass,
            )}
          >
            {loading ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex gap-3">
        {!hideIcon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
        )}
        <div className="space-y-2 text-sm text-text-secondary">
          {description && <p>{description}</p>}
          {body}
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmDialog;
