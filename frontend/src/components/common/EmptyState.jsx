// EmptyState — friendly illustration + heading + CTA when a list has no items.
//
// Per spec §2.7 the product grid renders this when productService.list()
// returns an empty `data` array.
import { Inbox } from 'lucide-react';

const EmptyState = ({
  title = 'Nothing here yet',
  description,
  icon: Icon = Inbox,
  actionLabel,
  onAction,
  className = '',
}) => (
  <div
    className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-surface-300 bg-surface-50 px-6 py-16 text-center ${className}`}
  >
    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-100 text-text-secondary">
      <Icon className="h-7 w-7" aria-hidden="true" />
    </div>
    <h3 className="mt-4 font-heading text-lg font-semibold text-text-primary">
      {title}
    </h3>
    {description && (
      <p className="mt-2 max-w-md text-sm text-text-secondary">{description}</p>
    )}
    {actionLabel && onAction && (
      <button
        type="button"
        onClick={onAction}
        className="mt-6 rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-400"
      >
        {actionLabel}
      </button>
    )}
  </div>
);

export default EmptyState;