// CartDrawer — slide-over panel mounted in AppLayout.
//
// Opens from the right when useUIStore.isCartDrawerOpen is true.
// Closes on backdrop click, ESC key, or the explicit close button.
//
// Renders the same <CartItem> rows + <CartSummary> the CartPage uses;
// the summary is in `compact` mode so it fits the drawer width.
//
// Auth flow: anonymous users see a friendly login CTA instead of items.
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X, ShoppingBag } from 'lucide-react';

import { useUIStore } from '@context/useUIStore';
import { useCartStore } from '@context/useCartStore';
import { useAuthStore } from '@context/useAuthStore';
import CartItem from '@components/cart/CartItem';
import CartSummary from '@components/cart/CartSummary';
import Skeleton from '@components/common/Skeleton';
import EmptyState from '@components/common/EmptyState';
import { paths } from '@routes/routePaths';

const CartDrawer = () => {
  const isOpen = useUIStore((s) => s.isCartDrawerOpen);
  const close = useUIStore((s) => s.closeCartDrawer);
  const items = useCartStore((s) => s.items);
  const isLoading = useCartStore((s) => s.isLoading);
  const fetch = useCartStore((s) => s.fetch);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Pull fresh cart whenever the drawer opens (server is source of truth).
  useEffect(() => {
    if (isOpen && isAuthenticated) {
      fetch().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isAuthenticated]);

  // ESC closes the drawer.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, close]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!isOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  return (
    <>
      <div
        onClick={close}
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${
          isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden="true"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-surface shadow-2xl transition-transform duration-300 sm:max-w-lg ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-accent-500" />
            <h2 className="font-heading text-lg font-semibold text-text-primary">Your cart</h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close cart"
            className="rounded-md p-2 text-text-secondary hover:bg-surface-100 hover:text-text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!isAuthenticated ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <EmptyState
                icon={ShoppingBag}
                title="Sign in to see your cart"
                description="Log in or create an account to start shopping — your items will sync across devices."
                actionLabel="Log in"
                onAction={close}
              />
              <Link
                to={paths.login()}
                onClick={close}
                className="mt-3 text-sm text-text-secondary underline hover:text-accent-500"
              >
                Don't have an account? Register →
              </Link>
            </div>
          ) : isLoading && items.length === 0 ? (
            <ul className="space-y-3">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex gap-3 rounded-lg border border-border p-3">
                  <Skeleton className="h-20 w-20" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-8 w-1/2" />
                  </div>
                </li>
              ))}
            </ul>
          ) : items.length === 0 ? (
            <EmptyState
              icon={ShoppingBag}
              title="Your cart is empty"
              description="Add some products to get started."
              actionLabel="Browse products"
              onAction={() => {
                close();
              }}
            />
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <CartItem key={item.id} item={item} compact />
              ))}
            </ul>
          )}
        </div>

        {isAuthenticated && items.length > 0 && (
          <div className="border-t border-border bg-surface-50 px-5 py-4">
            <CartSummary compact />
            <Link
              to={paths.cart()}
              onClick={close}
              className="mt-3 block text-center text-xs font-medium text-accent-500 hover:text-accent-600"
            >
              View full cart →
            </Link>
          </div>
        )}
      </aside>
    </>
  );
};

export default CartDrawer;