// App — the top-level component.
//
// Composition order matters:
//   QueryClientProvider — every component below may issue React Query
//                          requests; place it as close to the leaves
//                          as possible but above the router.
//   BrowserRouter       — provided implicitly by AppRouter via
//                          createBrowserRouter; we don't double-wrap.
//   AppRouter           — the route tree itself.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';

import AppRouter from '@/routes/AppRouter';
import ErrorBoundary from '@components/common/ErrorBoundary';
import { useAuthStore } from '@/context/useAuthStore';
import { useCartStore } from '@/context/useCartStore';
import { useWishlistStore } from '@/context/useWishlistStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
    mutations: {
      retry: 0,
    },
  },
});

const App = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const silentRefresh = useAuthStore((s) => s.silentRefresh);
  const syncCart = useCartStore((s) => s.syncAnonymousToServer);
  const syncWishlist = useWishlistStore((s) => s.syncAnonymousToServer);

  // On mount:
  //   1. silently refresh the access token from the persisted refresh
  //      token (keeps the user logged in across page reloads);
  //   2. once we (re)have a session, hydrate /profile;
  //   3. push any anonymous cart/wishlist into the server-side copy.
  // Idempotent across hot reloads — each step is safe to retry.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await silentRefresh();
      if (cancelled) return;
      if (useAuthStore.getState().isAuthenticated) {
        refreshProfile();
        syncCart();
        syncWishlist();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [silentRefresh, refreshProfile, syncCart, syncWishlist]);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Top-level safety net: catches render errors anywhere above
          the router (auth context, layout chrome, query client) so
          the page never goes fully blank. Per-page boundaries inside
          AppRouter handle errors that originate inside a page. */}
      <ErrorBoundary scope="app">
        <AppRouter />
      </ErrorBoundary>
    </QueryClientProvider>
  );
};

export default App;
