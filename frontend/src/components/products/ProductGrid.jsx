// ProductGrid — responsive grid of ProductCard tiles.
// Spec §2.7 — used by ShopPage, category pages, vendor dashboard, search.
import ProductCard from './ProductCard';
import EmptyState from '@/components/common/EmptyState';

const ProductGrid = ({
  products = [],
  isLoading = false,
  skeletonCount = 8,
  onAddToCart,
  onToggleWishlist,
  emptyTitle = 'No products found',
  emptyDescription = 'Try adjusting your filters or check back later.',
  SkeletonComponent,
}) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: skeletonCount }).map((_, i) =>
          SkeletonComponent ? (
            <SkeletonComponent key={i} />
          ) : (
            <div
              key={i}
              className="h-96 animate-pulse rounded-xl border border-border bg-bg-muted"
            />
          ),
        )}
      </div>
    );
  }

  if (!products.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((p) => (
        <ProductCard
          key={p.id ?? p.slug}
          product={p}
          onAddToCart={onAddToCart}
          onToggleWishlist={onToggleWishlist}
        />
      ))}
    </div>
  );
};

export default ProductGrid;