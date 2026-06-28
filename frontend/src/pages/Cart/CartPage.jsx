// CartPage — full-page view of the user's cart.
//
// Two-column layout on lg+ (items left, summary right). On mobile it
// collapses to a single column with the summary at the bottom.
//
// Hydrates from the server on mount and on auth changes; shows a
// loading skeleton while the first fetch is in flight.
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';

import { usePageTitle } from '@/hooks/usePageTitle';
import { useCartStore } from '@context/useCartStore';
import { useAuthStore } from '@context/useAuthStore';
import CartItem from '@components/cart/CartItem';
import CartSummary from '@components/cart/CartSummary';
import Skeleton from '@components/common/Skeleton';
import EmptyState from '@components/common/EmptyState';
import { paths } from '@routes/routePaths';

const CartPage = () => {
  usePageTitle('Cart · PCCraft');

  const items = useCartStore((s) => s.items);
  const isLoading = useCartStore((s) => s.isLoading);
  const fetch = useCartStore((s) => s.fetch);
  const error = useCartStore((s) => s.error);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) fetch().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <EmptyState
          icon={ShoppingBag}
          title="Sign in to see your cart"
          description="Your cart syncs across devices once you're logged in."
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

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-text-primary sm:text-3xl">Your cart</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Review items, adjust quantities, and continue to checkout.
          </p>
        </div>
        <Link
          to={paths.products()}
          className="hidden text-sm font-medium text-accent-500 hover:text-accent-600 sm:block"
        >
          ← Continue shopping
        </Link>
      </div>

      {error && (
        <p className="mb-4 rounded-md border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div>
          {isLoading && items.length === 0 ? (
            <ul className="space-y-3">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex gap-4 rounded-lg border border-border p-4">
                  <Skeleton className="h-24 w-24" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-1/2" />
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-8 w-1/3" />
                  </div>
                </li>
              ))}
            </ul>
          ) : items.length === 0 ? (
            <EmptyState
              icon={ShoppingBag}
              title="Your cart is empty"
              description="Find something you love in the catalog."
              actionLabel="Browse products"
              onAction={() => {
                window.location.assign(paths.products());
              }}
            />
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <CartItem key={item.id} item={item} />
              ))}
            </ul>
          )}
        </div>

        <div>
          {items.length > 0 && <CartSummary />}
        </div>
      </div>
    </section>
  );
};

export default CartPage;