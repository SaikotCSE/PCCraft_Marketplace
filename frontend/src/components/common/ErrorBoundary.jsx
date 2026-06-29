// ErrorBoundary — catches render-time errors in child components.
//
// React Suspense only catches promise rejections from `lazy(...)`. Render
// exceptions (e.g. a thrown `TypeError` inside a page component, or a
// malformed API payload that crashes a memoized selector) would otherwise
// unmount the entire React tree. This boundary localizes the blast radius
// to the nearest fallback so the chrome (Navbar/Footer) keeps working.
//
// We support two placements:
//
//   1. Per-page — wired through `withSuspense` in AppRouter.jsx. Each
//      lazy page renders inside its own boundary, so a single broken
//      page only kills itself, not the shell.
//
//   2. Top-level — wrapped around <RouterProvider> in App.jsx as a
//      safety net for anything above the router (auth context, layout
//      shell, error in <ProtectedRoute>).
//
// The fallback uses the shared ErrorState so visuals stay consistent
// with inline fetch-error states. The "Reload" affordance does a hard
// page reload — the only way to reset internal React state after a
// render crash without a manual remount.
import { Component } from 'react';

import ErrorState from '@components/common/ErrorState';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.handleReload = this.handleReload.bind(this);
    this.handleReset = this.handleReset.bind(this);
  }

  static getDerivedStateFromError(error) {
    // Surface the error to the next render and stop the tree from
    // continuing to commit on top of a broken subtree.
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // In a production build this is where we would ship to Sentry /
    // LogRocket / etc. console.error keeps it visible in dev.
    if (typeof console !== 'undefined' && console.error) {
      console.error('[ErrorBoundary]', error, info?.componentStack);
    }
  }

  handleReset() {
    // Reset only this boundary; useful when `resetKeys` change (route
    // navigation, retry button on child fetch error, etc.).
    this.setState({ hasError: false, error: null });
  }

  handleReload() {
    if (typeof window !== 'undefined' && typeof window.location?.reload === 'function') {
      window.location.reload();
    }
  }

  componentDidUpdate(prevProps) {
    // If a parent passed new `resetKeys` (e.g. the route path), clear
    // the error so the user can try again without a hard reload.
    const { resetKeys = [] } = this.props;
    if (this.state.hasError && resetKeys.length > 0) {
      const changed = resetKeys.some((key, i) => key !== prevProps.resetKeys?.[i]);
      if (changed) this.handleReset();
    }
  }

  render() {
    const { hasError, error } = this.state;
    const {
      children,
      fallbackTitle = 'Something went wrong',
      fallbackDescription,
      showReload = true,
      // Scope 'page' = inside withSuspense (default), 'app' = top-level
      // around the router. Slight UX difference: 'app' emphasizes
      // reload because there is no parent chrome to fall back on.
      scope = 'page',
    } = this.props;

    if (!hasError) return children;

    const description =
      fallbackDescription ||
      (scope === 'app'
        ? 'A critical error stopped the app from rendering. Reload to recover.'
        : 'This page could not be displayed. Try again, or reload if the problem persists.');

    return (
      <ErrorState
        title={fallbackTitle}
        description={description}
        onRetry={scope === 'app' ? this.handleReload : this.handleReset}
        retryLabel={scope === 'app' ? 'Reload page' : 'Try again'}
      >
        {/* Hidden in production but useful for developers in dev. */}
        {import.meta.env?.DEV && error?.message ? (
          <pre className="mt-4 max-w-xl overflow-auto rounded-md bg-surface px-3 py-2 text-left text-xs text-text-secondary">
            {error.message}
          </pre>
        ) : null}
      </ErrorState>
    );
  }
}

export default ErrorBoundary;