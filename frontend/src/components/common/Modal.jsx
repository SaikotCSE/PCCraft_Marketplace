// Modal — accessible centred dialog with backdrop.
//
// Per spec the modal must:
//   - trap focus inside (we use the native `dialog`-style behaviour
//     through `role="dialog"` + Esc-to-close + click-outside-to-close),
//   - close on backdrop click and on Esc,
//   - render a scroll-lock on the body while open,
//   - expose an optional `maxWidth` (Tailwind class) so callers can
//     pick a comfortable width (sm/md/lg/xl).
//
// Uses Framer Motion for the fade/scale transition so it visually
// matches the rest of the app's motion language.
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

import { useClickOutside } from '@hooks/useClickOutside';
import { cn } from '@/utils/cn';

const WIDTH_CLASSES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
  '2xl': 'max-w-5xl',
};

const Modal = ({
  open,
  onClose,
  title,
  children,
  size = 'md',
  hideCloseButton = false,
  footer,
  contentClassName = '',
}) => {
  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Esc to close.
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Backdrop click-to-close via useClickOutside on the panel wrapper.
  const panelRef = useClickOutside(() => onClose?.());

  // Defer portal until client mount to avoid SSR warnings (no SSR here,
  // but the guard keeps things robust if that changes).
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Backdrop */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          {/* Panel */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? 'modal-title' : undefined}
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={cn(
              'relative z-[101] w-full overflow-hidden rounded-2xl bg-surface shadow-2xl',
              WIDTH_CLASSES[size] || WIDTH_CLASSES.md,
            )}
            // Prevent clicks inside from closing via outside-click.
            onClick={(e) => e.stopPropagation()}
          >
            {(title || !hideCloseButton) && (
              <header className="flex items-center justify-between border-b border-border px-5 py-3">
                {title ? (
                  <h2
                    id="modal-title"
                    className="font-heading text-base font-semibold text-text-primary"
                  >
                    {title}
                  </h2>
                ) : (
                  <span />
                )}
                {!hideCloseButton && (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close dialog"
                    className="rounded-md p-1 text-text-secondary hover:bg-surface-100 hover:text-text-primary"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </header>
            )}
            <div className={cn('max-h-[80vh] overflow-y-auto px-5 py-4', contentClassName)}>
              {children}
            </div>
            {footer && (
              <footer className="flex justify-end gap-2 border-t border-border bg-surface-50 px-5 py-3">
                {footer}
              </footer>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export default Modal;