// ProductCard — single product tile used in ProductGrid (Shop, Category, Search).
//
// Per spec §2.7. Image + PriceDisplay + StockBadge + brand badge + title.
import { Link } from 'react-router-dom';
import { ShoppingCart, Heart } from 'lucide-react';
import PriceDisplay from './PriceDisplay';
import StockBadge from './StockBadge';

const PLACEHOLDER_IMG =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="%23e5e7eb"/></svg>';

const ProductCard = ({ product, onAddToCart, onToggleWishlist }) => {
  if (!product) return null;

  const {
    slug,
    name,
    primary_image,
    primary_image_url,
    brand,
    category,
    base_price,
    discounted_price,
    effective_price,
    discount_percent = 0,
    stock_status,
    stock_quantity = 0,
    is_featured,
    avg_rating = 0,
    review_count = 0,
  } = product;

  const img = primary_image_url || primary_image?.url || PLACEHOLDER_IMG;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition-shadow hover:shadow-lg">
      <Link to={`/products/${slug}`} className="block aspect-square overflow-hidden bg-bg-muted">
        <img
          src={img}
          alt={primary_image?.alt_text || name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </Link>

      {is_featured && (
        <span className="absolute left-2 top-2 rounded-full bg-accent-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          Featured
        </span>
      )}

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          {brand?.slug ? (
            <Link
              to={`/products?brand=${brand.slug}`}
              className="truncate text-xs font-medium text-text-secondary hover:text-accent-500"
            >
              {brand.name}
            </Link>
          ) : (
            <span />
          )}
          <StockBadge stock_status={stock_status} stock_quantity={stock_quantity} />
        </div>

        <Link to={`/products/${slug}`} className="flex-1">
          <h3 className="line-clamp-2 text-sm font-semibold text-text-primary hover:text-accent-500">
            {name}
          </h3>
        </Link>

        {category?.name && (
          <span className="text-xs text-text-secondary">in {category.name}</span>
        )}

        <PriceDisplay
          base_price={base_price}
          discounted_price={discounted_price}
          effective_price={effective_price}
          discount_percent={discount_percent}
          size="md"
        />

        <div className="mt-auto flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onAddToCart?.(product);
            }}
            disabled={stock_status === 'OUT_OF_STOCK' || stock_quantity <= 0}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ShoppingCart className="h-4 w-4" />
            Add to cart
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onToggleWishlist?.(product);
            }}
            aria-label="Add to wishlist"
            className="rounded-lg border border-border p-2 text-text-secondary transition-colors hover:border-danger hover:text-danger"
          >
            <Heart className="h-4 w-4" />
          </button>
        </div>

        {review_count > 0 && (
          <p className="text-xs text-text-secondary">
            ★ {Number(avg_rating).toFixed(1)} · {review_count} review{review_count === 1 ? '' : 's'}
          </p>
        )}
      </div>
    </article>
  );
};

export default ProductCard;