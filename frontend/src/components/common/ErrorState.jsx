// ErrorState — inline error display with optional Retry button.
//
// Used wherever a fetch can fail: recommendation carousels, product grid,
// compatibility report, etc. The "Retry" affordance re-invokes the
// parent's fetcher without forcing the user to reload the page.
//
//   <ErrorState
//     title="Could not load recommendations"
//     onRetry={() => refetch()}
//   />
//
import { AlertTriangle } from 'lucide-react';

const ErrorState = ({
  title = 'Something went wrong',
  description,
  icon: Icon = AlertTriangle,
  retryLabel = 'Retry',
  onRetry,
  className = '',
  children,
}) => (
  <div
    role="alert"
    className={`flex flex-col items-center justify-center rounded-xl border border-danger/30 bg-danger/5 px-6 py-10 text-center ${className}`}
  >
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
      <Icon className="h-6 w-6" aria-hidden="true" />
    </div>
    <h3 className="mt-3 font-heading text-base font-semibold text-text-primary">
      {title}
    </h3>
    {description && (
      <p className="mt-1 max-w-md text-sm text-text-secondary">{description}</p>
    )}
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-md border border-danger/40 bg-surface px-4 py-2 text-sm font-semibold text-danger shadow-sm transition hover:bg-danger hover:text-white"
      >
        {retryLabel}
      </button>
    )}
    {children}
  </div>
);

export default ErrorState;