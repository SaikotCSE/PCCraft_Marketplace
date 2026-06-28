// WishlistPage — saved products in a responsive grid.
//
// Hydrates from the server on mount + auth changes. Anonymous users
// see a friendly login CTA. Empty authenticated lists see the empty
// state with a CTA to the catalog.
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';

import { usePageTitle } from '@/hooks/usePageTitle';
import { useWishlistStore } from '@context/useWishlistStore';
import { useAuthStore } from '@context/useAuthStore';
import WishlistCard from '@components/wishlist/WishlistCard';
import Skeleton from '@components/common/Skeleton';
import EmptyState from '@components/common/EmptyState';
import { paths } from '@routes/routePaths';

const WishlistPage = () => {
  usePageTitle('Wishlist · PCCraft');

  const items = useWishlistStore((s) => s.items);
  const productIds = useWishlistStore((s) => s.productIds);
  const isLoading = useWishlistStore((s) => s.isLoading);
  const fetch = useWishlistStore((s) => s.fetch);
  const error = useWishlistStore((s) => s.error);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) fetch().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <EmptyState
          icon={Heart}
          title="Sign in to see your wishlist"
          description="Save products you love and pick up where you left off on any device."
          actionLabel="Log in"
          onAction={() => {
            window.location.assign(paths.login());
          }}
        />
        <p className="mt-6 text-center text-sm text-text-secondary">
          New here?{' '}
          <Link to={paths.register()} className="text-accent-500 hover:text-accent-600">
            Create an account
          </Link>
        </p>
      </section>
    );
  }

  const isEmpty = !isLoading && items.length === 0 && productIds.length === 0;

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-text-primary sm:text-3xl">
            Your wishlist
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            {productIds.length || items.length} saved product
            {(productIds.length || items.length) === 1 ? '' : 's'}.
          </p>
        </div>
        <Link
          to={paths.products()}
          className="hidden text-sm font-medium text-accent-500 hover:text-accent-600 sm:block"
        >
          ← Keep browsing
        </Link>
      </div>

      {error && (
        <p className="mb-4 rounded-md border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {isLoading && items.length === 0 ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="space-y-3 rounded-xl border border-border p-4">
              <Skeleton className="aspect-square w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-9 w-full" />
            </li>
          ))}
        </ul>
      ) : isEmpty ? (
        <EmptyState
          icon={Heart}
          title="Nothing saved yet"
          description="Tap the heart icon on any product to save it for later."
          actionLabel="Find products you love"
          onAction={() => {
            window.location.assign(paths.products());
          }}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <li key={item.id || item.product?.id || item.product_id}>
              <WishlistCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default WishlistPage;