// CartSummary — totals + checkout CTA + clear-cart button.
//
// Two layouts:
//   - `compact` (default)   — used inside CartDrawer. Single column.
//   - `!compact`             — used inside CartPage. Sticky right column
//                             with the same content but more breathing room.
//
// Tax/shipping are read from the cart store when available; if the
// backend hasn't populated them yet we fall back to the placeholder
// math the store itself uses so the UI stays consistent.
import { Link } from 'react-router-dom';
import { ShoppingBag, Trash2, Lock } from 'lucide-react';

import { useCartStore } from '@context/useCartStore';
import { useAuthStore } from '@context/useAuthStore';
import { formatPrice } from '@utils/formatters';
import { paths } from '@routes/routePaths';
import toast from 'react-hot-toast';

const CartSummary = ({ compact = false }) => {
  const totals = useCartStore((s) => s.totals);
  const items = useCartStore((s) => s.items);
  const clear = useCartStore((s) => s.clear);
  const isLoading = useCartStore((s) => s.isLoading);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const itemCount = items.reduce((sum, i) => sum + Number(i.quantity || 0), 0);
  const hasUnavailable = items.some((i) => i.is_unavailable);
  const subtotal = Number(totals.subtotal ?? 0);
  const tax = Number(totals.tax ?? 0);
  const shipping = Number(totals.shipping ?? 0);
  const total = Number(totals.total ?? subtotal + tax + shipping);

  const onCheckout = () => {
    if (!isAuthenticated) {
      toast('Please log in to continue checkout.', { icon: '🔒' });
      return;
    }
    if (hasUnavailable || itemCount === 0) {
      toast.error('Remove unavailable items before checkout.');
      return;
    }
  };

  const onClear = async () => {
    if (!window.confirm('Clear all items from your cart?')) return;
    try {
      await clear();
      toast.success('Cart cleared.');
    } catch (err) {
      toast.error('Could not clear cart.');
    }
  };

  return (
    <aside
      className={`flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 shadow-sm ${
        compact ? '' : 'lg:sticky lg:top-20 lg:p-6'
      }`}
    >
      <div>
        <h2 className="font-heading text-lg font-semibold text-text-primary">Order summary</h2>
        <p className="mt-1 text-xs text-text-secondary">
          {itemCount} item{itemCount === 1 ? '' : 's'}
        </p>
      </div>

      <dl className="space-y-2 text-sm">
        <div className="flex justify-between text-text-secondary">
          <dt>Subtotal</dt>
          <dd className="font-medium text-text-primary">{formatPrice(subtotal)}</dd>
        </div>
        <div className="flex justify-between text-text-secondary">
          <dt>VAT (5%)</dt>
          <dd className="font-medium text-text-primary">{formatPrice(tax)}</dd>
        </div>
        <div className="flex justify-between text-text-secondary">
          <dt>Shipping</dt>
          <dd className="font-medium text-text-primary">{formatPrice(shipping)}</dd>
        </div>
        <div className="mt-2 flex justify-between border-t border-border pt-3 text-base">
          <dt className="font-semibold text-text-primary">Total</dt>
          <dd className="font-bold text-text-primary">{formatPrice(total)}</dd>
        </div>
      </dl>

      {hasUnavailable && (
        <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
          One or more items are out of stock. Please remove them before checkout.
        </p>
      )}

      <Link
        to={paths.checkout()}
        onClick={onCheckout}
        className={`flex items-center justify-center gap-2 rounded-md bg-accent-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-600 ${
          itemCount === 0 || hasUnavailable ? 'pointer-events-none opacity-60' : ''
        }`}
      >
        {!isAuthenticated ? <Lock className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}
        Proceed to checkout
      </Link>

      <button
        type="button"
        onClick={onClear}
        disabled={isLoading || itemCount === 0}
        className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-surface-50 px-3 py-2 text-xs font-medium text-text-secondary hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Clear cart
      </button>
    </aside>
  );
};

export default CartSummary;