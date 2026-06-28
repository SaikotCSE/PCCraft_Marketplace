// WishlistCard — single product tile inside the wishlist grid.
//
// Shows product image, brand, name, price, stock state, and two
// actions: "Move to cart" and "Remove from wishlist". The Move-to-cart
// action calls the dedicated backend endpoint so the wishlist row and
// the cart line stay in sync server-side (we just refresh both stores
// locally afterwards).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingCart, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { useWishlistStore } from '@context/useWishlistStore';
import { useCartStore } from '@context/useCartStore';
import { useAuthStore } from '@context/useAuthStore';
import { formatPrice } from '@utils/formatters';
import { paths } from '@routes/routePaths';
import PriceDisplay from '@components/products/PriceDisplay';

const PLACEHOLDER_IMG =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="%23e5e7eb"/></svg>';

const WishlistCard = ({ item }) => {
  const product = item.product || {};
  const slug = product.slug;
  const productId = product.id || item.product_id;
  const name = product.name || 'Product';
  const brand = product.brand?.name;
  const img =
    product.primary_image ||
    product.primary_image_url ||
    (product.images && product.images[0]?.image) ||
    PLACEHOLDER_IMG;
  const inStock = product.in_stock !== false && Number(product.stock_quantity ?? 0) > 0;

  const [busy, setBusy] = useState(false);
  const moveToCart = useWishlistStore((s) => s.moveToCart);
  const remove = useWishlistStore((s) => s.remove);
  const cartFetch = useCartStore((s) => s.fetch);
  const cartAdd = useCartStore((s) => s.addItem);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const onMove = async () => {
    if (!isAuthenticated) {
      toast('Please log in to add items to your cart.', { icon: '🔒' });
      return;
    }
    setBusy(true);
    try {
      if (item.id && typeof item.id === 'string' && item.id.includes('-')) {
        // Server row UUID present → use the dedicated move endpoint.
        await moveToCart(item.id, 1);
      } else {
        // Anonymous local wishlist or missing UUID → manual path.
        await cartAdd({ product_id: productId, quantity: 1 });
        await remove(productId);
      }
      await cartFetch();
      toast.success(`Moved "${name}" to your cart.`);
    } catch (err) {
      const msg = err?.response?.data?.error?.message || 'Could not move item to cart.';
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    setBusy(true);
    try {
      if (item.id && typeof item.id === 'string' && item.id.includes('-')) {
        // Server row present → optimistic remove.
        const snapshot = { items: [], productIds: [] };
        // Easier path: use the store's optimistic remove via productId.
        await remove(productId);
      } else {
        await remove(productId);
      }
    } catch (err) {
      toast.error('Could not remove from wishlist.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition-shadow hover:shadow-lg"
      data-testid={`wishlist-item-${productId}`}
    >
      <Link
        to={slug ? paths.productDetail(slug) : paths.products()}
        className="block aspect-square overflow-hidden bg-surface-100"
      >
        <img
          src={img}
          alt={name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </Link>

      <button
        type="button"
        onClick={onRemove}
        disabled={busy}
        aria-label="Remove from wishlist"
        className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-surface/90 text-danger shadow-sm transition hover:bg-surface disabled:opacity-50"
      >
        <Heart className="h-4 w-4 fill-current" />
      </button>

      <div className="flex flex-1 flex-col gap-2 p-4">
        {brand && (
          <span className="truncate text-xs font-medium text-text-secondary">{brand}</span>
        )}
        <Link to={slug ? paths.productDetail(slug) : paths.products()} className="flex-1">
          <h3 className="line-clamp-2 text-sm font-semibold text-text-primary hover:text-accent-500">
            {name}
          </h3>
        </Link>

        <PriceDisplay
          base_price={product.base_price}
          discounted_price={product.discounted_price}
          effective_price={product.effective_price}
          discount_percent={product.discount_percent}
          size="md"
        />

        {!inStock && (
          <p className="rounded-md bg-warning/10 px-2 py-1 text-xs font-medium text-warning">
            Out of stock — save for later.
          </p>
        )}

        <div className="mt-auto flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onMove}
            disabled={busy || !inStock}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ShoppingCart className="h-4 w-4" />
            Move to cart
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            aria-label="Remove from wishlist"
            className="rounded-lg border border-border p-2 text-text-secondary transition-colors hover:border-danger hover:text-danger disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {product.effective_price && (
          <p className="text-xs text-text-secondary">{formatPrice(product.effective_price)}</p>
        )}
      </div>
    </article>
  );
};

export default WishlistCard;