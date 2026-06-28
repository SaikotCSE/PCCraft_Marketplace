// CartItem — one line item in the cart (drawer + page).
//
// Renders product thumbnail + name + brand + price + quantity stepper +
// remove button. Shows an "unavailable" banner when the backend flagged
// the row as out-of-stock after a stock sync.
//
// All mutations go through useCartStore which keeps the server as the
// source of truth and handles optimistic updates + rollback.
import { Minus, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useCartStore } from '@context/useCartStore';
import { formatPrice } from '@utils/formatters';
import { paths } from '@routes/routePaths';

const PLACEHOLDER_IMG =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="%23e5e7eb"/></svg>';

const CartItem = ({ item, compact = false }) => {
  const updateQty = useCartStore((s) => s.updateQty);
  const removeItem = useCartStore((s) => s.removeItem);
  const isLoading = useCartStore((s) => s.isLoading);

  if (!item) return null;
  const product = item.product || {};
  const productId = product.id || item.product_id;
  const slug = product.slug;
  const name = product.name || item.name || 'Product';
  const brand = product.brand?.name;
  const img =
    product.primary_image ||
    product.primary_image_url ||
    (product.images && product.images[0]?.image) ||
    PLACEHOLDER_IMG;
  const unitPrice = Number(
    product.effective_price ?? product.discounted_price ?? product.base_price ?? 0,
  );
  const lineTotal =
    item.item_total != null ? Number(item.item_total) : unitPrice * Number(item.quantity || 1);
  const isUnavailable = Boolean(item.is_unavailable);
  const stockQty = product.stock_quantity ?? 0;
  const stockCap = stockQty > 0 ? stockQty : 99;

  const dec = () => {
    const next = Number(item.quantity || 1) - 1;
    updateQty(item.id, Math.max(0, next));
  };
  const inc = () => {
    const next = Number(item.quantity || 1) + 1;
    if (next > stockCap) return;
    updateQty(item.id, next);
  };

  const onRemove = () => removeItem(item.id);

  return (
    <li
      className={`flex gap-3 rounded-lg border border-border bg-surface p-3 ${
        isUnavailable ? 'border-warning/50 bg-warning/5' : ''
      } ${compact ? '' : 'sm:gap-4 sm:p-4'}`}
      data-testid={`cart-item-${productId}`}
    >
      <Link
        to={slug ? paths.productDetail(slug) : paths.products()}
        className="block h-20 w-20 flex-shrink-0 overflow-hidden rounded-md bg-surface-100 sm:h-24 sm:w-24"
      >
        <img src={img} alt={name} className="h-full w-full object-cover" loading="lazy" />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              to={slug ? paths.productDetail(slug) : paths.products()}
              className="line-clamp-2 text-sm font-semibold text-text-primary hover:text-accent-500 sm:text-base"
            >
              {name}
            </Link>
            {brand && (
              <p className="mt-0.5 truncate text-xs text-text-secondary">{brand}</p>
            )}
            <p className="mt-1 text-xs text-text-secondary">
              {formatPrice(unitPrice)}
              <span className="mx-1 text-text-secondary/60">×</span>
              <span className="font-medium text-text-primary">{item.quantity}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onRemove}
            disabled={isLoading}
            aria-label="Remove from cart"
            className="rounded-md p-1.5 text-text-secondary hover:bg-danger/10 hover:text-danger disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {isUnavailable && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-warning/10 px-2 py-1 text-xs font-medium text-warning">
            <AlertTriangle className="h-3.5 w-3.5" />
            Out of stock — please remove or reduce quantity.
          </p>
        )}

        <div className="mt-auto flex items-center justify-between pt-2">
          <div className="inline-flex items-center overflow-hidden rounded-md border border-border bg-surface-50">
            <button
              type="button"
              onClick={dec}
              disabled={isLoading || isUnavailable}
              aria-label="Decrease quantity"
              className="grid h-8 w-8 place-items-center text-text-secondary hover:bg-surface-100 disabled:opacity-50"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="grid h-8 min-w-[2.25rem] place-items-center px-1 text-sm font-semibold text-text-primary">
              {item.quantity}
            </span>
            <button
              type="button"
              onClick={inc}
              disabled={isLoading || isUnavailable || Number(item.quantity || 1) >= stockCap}
              aria-label="Increase quantity"
              className="grid h-8 w-8 place-items-center text-text-secondary hover:bg-surface-100 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-sm font-bold text-text-primary sm:text-base">
            {formatPrice(lineTotal)}
          </p>
        </div>
      </div>
    </li>
  );
};

export default CartItem;