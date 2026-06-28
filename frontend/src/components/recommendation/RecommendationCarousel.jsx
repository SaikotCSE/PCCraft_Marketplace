// RecommendationCarousel — Module 7
// -----------------------------------------------------------------------------
// Reusable horizontal carousel that lazy-loads when scrolled into the
// viewport. Used by HomePage (Trending, Recommended For You, Recently
// Viewed), CategoryPage (Trending in <category>), ProductDetailPage
// (Similar, Frequently Bought Together), CartPage + OrderConfirmPage
// (You Might Also Need / Other Customers Also Bought).
//
// Behavior contract (PCCraft_Master_Spec_v4.md §7.4):
//   - Lazy-load via useIntersectionObserver with 100px root margin.
//   - Loading state: 6 skeleton cards with same aspect ratio as ProductCard.
//   - Empty state: hide entire section (including the title).
//   - Error state: ErrorState with Retry that re-invokes fetchFn.
//   - Scroll: CSS scroll-snap-x mandatory on the track, start on cards.
//   - Desktop: ←/→ buttons on edges (hidden when at start/end).
//   - Mobile: native touch swipe; show scroll-indicator dots.
//   - `hidden` prop: skip render entirely.
// -----------------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import Skeleton from '@components/common/Skeleton';
import ErrorState from '@components/common/ErrorState';
import ProductCard from '@components/products/ProductCard';
import { useIntersectionObserver } from '@hooks/useIntersectionObserver';

const SKELETON_COUNT = 6;

const RecommendationCarousel = ({
  title,
  fetchFn,
  emptyMessage = 'No recommendations available right now.',
  hidden = false,
  // The following are forwarded to ProductCard but are optional.
  onAddToCart,
  onToggleWishlist,
}) => {
  // ---- lazy-load trigger ----------------------------------------------------
  const { ref: sentinelRef, isIntersecting } = useIntersectionObserver({
    rootMargin: '100px',
    threshold: 0,
  });

  // ---- state ---------------------------------------------------------------
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | loading | ready | empty | error
  const [error, setError] = useState(null);
  const [retryIndex, setRetryIndex] = useState(0);

  const load = useCallback(async () => {
    if (!fetchFn) return;
    setStatus('loading');
    setError(null);
    try {
      const data = await fetchFn();
      const list = Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data)
          ? data
          : [];
      if (list.length === 0) {
        setResults([]);
        setStatus('empty');
      } else {
        setResults(list);
        setStatus('ready');
      }
    } catch (err) {
      setError(err);
      setStatus('error');
    }
  }, [fetchFn]);

  // First fetch only happens after intersection. Re-fetch only on explicit retry.
  useEffect(() => {
    if (!isIntersecting) return;
    if (status === 'idle' || (status === 'error' && retryIndex > 0)) {
      load();
    }
    // we intentionally depend on retryIndex so manual retries re-run
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIntersecting, retryIndex]);

  const handleRetry = () => {
    setRetryIndex((n) => n + 1);
  };

  // ---- scroll controls -----------------------------------------------------
  const trackRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const recomputeScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 4);

    // active dot = nearest card to left edge
    if (el.children.length === 0) {
      setActiveIndex(0);
      return;
    }
    let nearest = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < el.children.length; i += 1) {
      const child = el.children[i];
      const dist = Math.abs(child.offsetLeft - scrollLeft);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    }
    setActiveIndex(nearest);
  }, []);

  useEffect(() => {
    if (status !== 'ready') return undefined;
    const el = trackRef.current;
    if (!el) return undefined;
    recomputeScroll();
    el.addEventListener('scroll', recomputeScroll, { passive: true });
    window.addEventListener('resize', recomputeScroll);
    return () => {
      el.removeEventListener('scroll', recomputeScroll);
      window.removeEventListener('resize', recomputeScroll);
    };
  }, [status, results, recomputeScroll]);

  const scrollByPage = (direction) => {
    const el = trackRef.current;
    if (!el) return;
    const cardWidth = el.children[0]?.offsetWidth || el.clientWidth;
    const delta = (cardWidth + 16) * 2 * direction; // 2 cards per click
    el.scrollBy({ left: delta, behavior: 'smooth' });
  };

  // ---- render --------------------------------------------------------------
  if (hidden) return null;
  if (status === 'empty') return null;

  return (
    <section
      ref={sentinelRef}
      className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8"
      aria-labelledby={`rec-${title?.replace(/\s+/g, '-').toLowerCase() || 'carousel'}`}
    >
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2
          id={`rec-${title?.replace(/\s+/g, '-').toLowerCase() || 'carousel'}`}
          className="font-heading text-xl font-bold text-text-primary sm:text-2xl"
        >
          {title}
        </h2>
      </div>

      <div className="relative">
        {/* Loading skeleton */}
        {status === 'idle' || status === 'loading' ? (
          <div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
              <div
                key={i}
                className="w-56 flex-shrink-0 sm:w-64"
                aria-hidden="true"
              >
                <div className="overflow-hidden rounded-xl border border-border bg-surface">
                  <Skeleton className="aspect-square w-full rounded-none" />
                  <div className="space-y-2 p-4">
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-5 w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* Error */}
        {status === 'error' ? (
          <ErrorState
            title={emptyMessage || 'Could not load recommendations'}
            description="Check your connection and try again."
            onRetry={handleRetry}
          />
        ) : null}

        {/* Results */}
        {status === 'ready' ? (
          <>
            <div
              ref={trackRef}
              className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              data-testid="recommendation-track"
            >
              {results.map((product) => (
                <div
                  key={product.id || product.slug}
                  className="w-56 flex-shrink-0 snap-start sm:w-64"
                >
                  <ProductCard
                    product={product}
                    onAddToCart={onAddToCart}
                    onToggleWishlist={onToggleWishlist}
                  />
                </div>
              ))}
            </div>

            {/* Desktop ←/→ buttons (≥md) */}
            {canScrollLeft ? (
              <button
                type="button"
                onClick={() => scrollByPage(-1)}
                aria-label="Scroll left"
                className="absolute -left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-text-secondary shadow-md transition hover:bg-bg-muted md:flex"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            ) : null}
            {canScrollRight ? (
              <button
                type="button"
                onClick={() => scrollByPage(1)}
                aria-label="Scroll right"
                className="absolute -right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-text-secondary shadow-md transition hover:bg-bg-muted md:flex"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            ) : null}

            {/* Mobile dots (<md) */}
            {results.length > 1 ? (
              <div className="mt-2 flex justify-center gap-1.5 md:hidden">
                {results.map((p, i) => (
                  <span
                    key={p.id || p.slug || i}
                    aria-hidden="true"
                    className={`h-1.5 rounded-full transition-all ${
                      i === activeIndex
                        ? 'w-4 bg-accent-500'
                        : 'w-1.5 bg-surface-300'
                    }`}
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
};

export default RecommendationCarousel;