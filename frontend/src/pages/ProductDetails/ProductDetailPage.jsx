// ProductDetailPage — gallery, price, stock, specs, add-to-cart, reviews stub.
// Spec §2.7.
import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Heart, ShoppingCart, Minus, Plus, Store, Shield } from 'lucide-react';
import toast from 'react-hot-toast';

import { usePageTitle } from '@/hooks/usePageTitle';
import ImageGallery from '@/components/products/ImageGallery';
import PriceDisplay from '@/components/products/PriceDisplay';
import StockBadge from '@/components/products/StockBadge';
import ProductSpecsTable from '@/components/products/ProductSpecsTable';
import { productService } from '@/services/productService';
import { formatPrice } from '@/utils/formatters';

const ProductDetailPage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  usePageTitle(`Product · PCCraft`);

  const { data: product, isLoading, isError } = useQuery({
    queryKey: ['product', slug],
    queryFn: () => productService.detail(slug),
    enabled: Boolean(slug),
  });

  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState('specs');

  if (isLoading) {
    return (
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 py-8 lg:grid-cols-2">
        <div className="aspect-square animate-pulse rounded-xl bg-bg-muted" />
        <div className="flex flex-col gap-3">
          <div className="h-6 w-1/2 animate-pulse rounded bg-bg-muted" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-bg-muted" />
          <div className="h-10 w-1/3 animate-pulse rounded bg-bg-muted" />
        </div>
      </div>
    );
  }

  if (isError || !product) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-text-primary">Product not found</h1>
        <p className="mt-2 text-text-secondary">
          The product you are looking for may have been removed or is unavailable.
        </p>
        <button
          onClick={() => navigate('/products')}
          className="mt-6 rounded-lg bg-accent-500 px-5 py-2 text-white hover:bg-accent-600"
        >
          Back to shop
        </button>
      </div>
    );
  }

  const maxQty = Math.max(1, product.stock_quantity || 1);
  const clampedQty = Math.min(qty, maxQty);

  const handleAddToCart = () => {
    // Module 3 will wire this to useCartStore.addItem().
    toast.success(`${product.name} × ${clampedQty} added to cart`);
  };
  const handleWishlist = () => {
    toast.success(`${product.name} added to wishlist`);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <nav className="mb-4 text-sm text-text-secondary">
        <Link to="/products" className="hover:text-accent-500">
          Shop
        </Link>
        {product.category && (
          <>
            <span className="mx-2">/</span>
            <Link
              to={`/products?category=${product.category.slug}`}
              className="hover:text-accent-500"
            >
              {product.category.name}
            </Link>
          </>
        )}
        <span className="mx-2">/</span>
        <span className="text-text-primary">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <ImageGallery images={product.images || []} alt={product.name} />

        <div className="flex flex-col gap-4">
          {product.brand && (
            <Link
              to={`/products?brand=${product.brand.slug}`}
              className="text-sm font-medium text-text-secondary hover:text-accent-500"
            >
              {product.brand.name}
            </Link>
          )}

          <h1 className="text-2xl font-bold text-text-primary sm:text-3xl">{product.name}</h1>

          <div className="flex items-center gap-3">
            <StockBadge
              stock_status={product.stock_status}
              stock_quantity={product.stock_quantity}
            />
            {product.warranty_months > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
                <Shield className="h-3.5 w-3.5" />
                {product.warranty_months}-month warranty
              </span>
            )}
          </div>

          <PriceDisplay
            base_price={product.base_price}
            discounted_price={product.discounted_price}
            effective_price={product.effective_price}
            discount_percent={product.discount_percent}
            size="lg"
          />

          {product.short_description && (
            <p className="text-text-secondary">{product.short_description}</p>
          )}

          {product.vendor?.store_slug && (
            <Link
              to={`/vendors/${product.vendor.store_slug}`}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text-primary hover:border-accent-300"
            >
              <Store className="h-4 w-4" />
              Sold by {product.vendor.store_name}
            </Link>
          )}

          <div className="flex items-center gap-3 pt-2">
            <div className="flex items-center overflow-hidden rounded-lg border border-border">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="px-3 py-2 hover:bg-bg-muted"
                aria-label="Decrease quantity"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-12 border-x border-border px-4 py-2 text-center text-sm font-semibold">
                {clampedQty}
              </span>
              <button
                type="button"
                onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                className="px-3 py-2 hover:bg-bg-muted"
                aria-label="Increase quantity"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleAddToCart}
              disabled={product.stock_quantity <= 0}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ShoppingCart className="h-4 w-4" />
              {product.stock_quantity <= 0 ? 'Out of stock' : 'Add to cart'}
            </button>

            <button
              type="button"
              onClick={handleWishlist}
              aria-label="Add to wishlist"
              className="rounded-lg border border-border p-2.5 hover:border-danger hover:text-danger"
            >
              <Heart className="h-5 w-5" />
            </button>
          </div>

          {product.stock_quantity > 0 && (
            <p className="text-xs text-text-secondary">
              {product.stock_quantity} in stock · subtotal {formatPrice(product.effective_price * clampedQty)}
            </p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-10 border-b border-border">
        <nav className="flex gap-6">
          {['specs', 'reviews', 'compatibility'].map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`-mb-px border-b-2 px-1 pb-3 text-sm font-medium capitalize transition-colors ${
                tab === id
                  ? 'border-accent-500 text-accent-500'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              {id === 'specs'
                ? 'Specifications'
                : id === 'reviews'
                  ? 'Reviews'
                  : 'Compatibility'}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-6">
        {tab === 'specs' && (
          <ProductSpecsTable
            specs={product.specs || {}}
            specTemplate={product.category?.spec_template || null}
          />
        )}
        {tab === 'reviews' && (
          <p className="rounded-xl border border-dashed border-border bg-bg-muted p-6 text-center text-sm text-text-secondary">
            Reviews will appear here once Module 6 ships.
          </p>
        )}
        {tab === 'compatibility' && (
          <p className="rounded-xl border border-dashed border-border bg-bg-muted p-6 text-center text-sm text-text-secondary">
            Compatibility checker will appear here once Module 8 ships.
          </p>
        )}
      </div>
    </div>
  );
};

export default ProductDetailPage;