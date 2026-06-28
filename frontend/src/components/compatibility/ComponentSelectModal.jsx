// ComponentSelectModal.jsx — product picker for one PC Builder slot.
//
// Spec §2.10 frontend sub-spec lines 3031-3040:
//   * Header: "Select [category]" + close button
//   * Search bar (300ms debounce) — calls
//     `GET /api/v1/compatibility/products/{slot}/?search=...&{build_params}`
//     so only compatible products are shown
//   * Product list: image 48×48, name, brand, key spec preview, price, stock
//   * Compatibility indicator: green "✓ Compatible" when all checks pass
//   * Paginated scroll (20 per page, load-more button)
//   * Click product → fill slot → close modal → trigger re-check
//   * "Browse All [category]" link (ignores compatibility filter) —
//     for advanced users who want to pick an incompatible part anyway

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, X, Check, AlertCircle, ShoppingBag } from 'lucide-react';

import Modal from '@components/common/Modal';
import EmptyState from '@components/common/EmptyState';
import ErrorState from '@components/common/ErrorState';
import StockBadge from '@components/products/StockBadge';
import { useDebounce } from '@hooks/useDebounce';
import { compatibilityService } from '@services/compatibilityService';
import { cn } from '@utils/cn';
import { formatPrice } from '@utils/formatters';
import { PAGINATION_DEFAULTS } from '@utils/constants';

const PAGE_SIZE = PAGINATION_DEFAULTS.PAGE_SIZE; // 20

/**
 * Pick the first non-empty image URL out of the many field names the
 * ProductListSerializer has used over the spec versions. Mirrors the
 * logic in SlotCard.
 */
const pickImage = (product) =>
  product?.primary_image_url ||
  product?.thumbnail_url ||
  product?.primary_image?.url ||
  product?.primary_image ||
  product?.image ||
  product?.images?.[0]?.image ||
  product?.images?.[0]?.url ||
  null;

/**
 * Pick the most relevant spec key for the category so the row can show
 * "Socket: LGA1700" or "Wattage: 850W" next to the title. Slot
 * descriptors carry `specKeys[]` ordered by usefulness; the first one
 * present in the product's `specs` (or top-level) wins.
 */
const pickSpecPreview = (slot, product) => {
  if (!product) return null;
  const specs = product.specs || {};
  for (const k of slot.specKeys || []) {
    const v = specs[k] ?? product[k];
    if (v !== null && v !== undefined && v !== '') {
      // Humanise the key for display.
      const label = k
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      return `${label}: ${typeof v === 'boolean' ? (v ? 'Yes' : 'No') : v}`;
    }
  }
  return null;
};

const ProductRow = ({ product, slot, onPick, isSelected }) => {
  const img = pickImage(product);
  const spec = pickSpecPreview(slot, product);
  const price = product.effective_price ?? product.price;
  const brandName = product.brand?.name || product.brand_name || '';
  const compatible = product.is_compatible !== false; // default to true
  const inStock = product.stock_status !== 'OUT_OF_STOCK';

  return (
    <button
      type="button"
      onClick={() => onPick(product)}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border border-transparent bg-surface-50 p-3 text-left transition',
        'hover:border-accent-500 hover:bg-surface-100',
        'focus:outline-none focus:ring-2 focus:ring-accent-500',
        isSelected && 'border-accent-500 bg-surface-100',
        !inStock && 'opacity-60',
      )}
    >
      {img ? (
        <img
          src={img}
          alt=""
          className="h-12 w-12 shrink-0 rounded-md object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-surface-200 text-text-secondary">
          <ShoppingBag className="h-5 w-5" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {brandName && (
            <span className="truncate text-xs font-medium uppercase tracking-wide text-text-secondary">
              {brandName}
            </span>
          )}
          {compatible ? (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success">
              <Check className="h-2.5 w-2.5" /> Compatible
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
              <AlertCircle className="h-2.5 w-2.5" /> Check needed
            </span>
          )}
        </div>
        <div className="mt-0.5 line-clamp-1 font-heading text-sm font-semibold text-text-primary">
          {product.name}
        </div>
        {spec && (
          <div className="mt-0.5 line-clamp-1 text-xs text-text-secondary">
            {spec}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {price !== null && price !== undefined && (
          <span className="font-heading text-sm font-bold text-accent-500">
            {formatPrice(price)}
          </span>
        )}
        <StockBadge
          stock_status={product.stock_status}
          stock_quantity={product.stock_quantity}
        />
      </div>
    </button>
  );
};

const ComponentSelectModal = ({
  open,
  onClose,
  slot,
  slots: currentSlots = {},
  currentSelectionId = null,
  onPick,
}) => {
  // ----- local state -----
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [browseAll, setBrowseAll] = useState(false);

  const debouncedSearch = useDebounce(search, 300);

  // Reset on open / slot change.
  useEffect(() => {
    if (!open) return;
    setSearch('');
    setPage(1);
    setBrowseAll(false);
    setError(null);
  }, [open, slot?.key]);

  // ---- fetch ----
  const fetchPage = useCallback(
    async (nextPage = 1) => {
      if (!slot?.key) return;
      setIsLoading(true);
      setError(null);
      try {
        // When "browse all" is on, the spec says ignore the
        // compatibility filter. We model this as an empty slots map
        // so the backend's get_compatible_products doesn't apply any
        // constraints. (Pure search-by-category still uses the
        // compatibleFor endpoint because it shares the URL.)
        const slotsForQuery = browseAll ? {} : currentSlots;
        const data = await compatibilityService.compatibleFor(slot.key, {
          slots: slotsForQuery,
          search: debouncedSearch || undefined,
          page: nextPage,
          pageSize: PAGE_SIZE,
        });
        const list = data?.results || data?.items || data || [];
        const meta = data?.meta || data;
        if (nextPage === 1) {
          setProducts(Array.isArray(list) ? list : []);
        } else {
          setProducts((prev) => [...prev, ...(Array.isArray(list) ? list : [])]);
        }
        setTotalCount(
          meta?.total_count ?? meta?.count ?? (Array.isArray(list) ? list.length : 0),
        );
        const tp = meta?.total_pages ?? meta?.totalPages;
        if (typeof tp === 'number' && tp > 0) {
          setTotalPages(tp);
        } else {
          setTotalPages(1);
        }
        setPage(nextPage);
      } catch (err) {
        const message =
          err?.response?.data?.error?.message ||
          err?.message ||
          'Failed to load products.';
        setError(message);
        if (nextPage === 1) setProducts([]);
      } finally {
        setIsLoading(false);
      }
    },
    [slot?.key, browseAll, currentSlots, debouncedSearch],
  );

  // Refetch when search/slot/browseAll changes.
  useEffect(() => {
    if (!open) return;
    fetchPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, slot?.key, debouncedSearch, browseAll]);

  const handlePick = (product) => {
    onPick?.(slot, product);
    onClose?.();
  };

  const hasMore = page < totalPages;
  const headerTitle = useMemo(
    () => (slot ? `Select ${slot.label}` : 'Select component'),
    [slot],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={headerTitle}
      size="xl"
      contentClassName="p-0"
    >
      <div className="flex flex-col">
        {/* ---- search bar ---- */}
        <div className="border-b border-surface-200 p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${slot?.label || 'products'}…`}
              className={cn(
                'w-full rounded-md border border-surface-200 bg-white py-2 pl-9 pr-9 text-sm text-text-primary',
                'placeholder:text-text-secondary focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500',
              )}
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* ---- product list ---- */}
        <div className="max-h-[55vh] overflow-y-auto p-4">
          {error ? (
            <ErrorState
              title="Could not load products"
              description={error}
              onRetry={() => fetchPage(1)}
            />
          ) : isLoading && products.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-lg bg-surface-100"
                />
              ))}
            </div>
          ) : products.length === 0 ? (
            <EmptyState
              title={`No ${slot?.label?.toLowerCase() || 'products'} found`}
              description={
                debouncedSearch
                  ? `No results for "${debouncedSearch}".`
                  : 'Try changing your search or browse all products.'
              }
            />
          ) : (
            <div className="space-y-2">
              {products.map((p) => (
                <ProductRow
                  key={p.id}
                  product={p}
                  slot={slot}
                  onPick={handlePick}
                  isSelected={currentSelectionId === p.id}
                />
              ))}
            </div>
          )}
        </div>

        {/* ---- footer ---- */}
        <div className="flex items-center justify-between gap-3 border-t border-surface-200 bg-surface-50 px-4 py-3">
          <div className="text-xs text-text-secondary">
            {totalCount > 0 && (
              <>
                Showing {products.length} of {totalCount}
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setBrowseAll((b) => !b)}
              className={cn(
                'text-xs font-semibold transition',
                browseAll
                  ? 'text-accent-600 underline'
                  : 'text-text-secondary hover:text-accent-500',
              )}
            >
              {browseAll
                ? `Showing all ${slot?.label || ''} (compatibility filter off)`
                : `Browse All ${slot?.label || ''}`}
            </button>
            {hasMore && !error && (
              <button
                type="button"
                onClick={() => fetchPage(page + 1)}
                disabled={isLoading}
                className="rounded-md bg-accent-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-accent-400 disabled:opacity-60"
              >
                {isLoading ? 'Loading…' : 'Load more'}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default ComponentSelectModal;