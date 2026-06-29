// SearchFilters — Module 11 sidebar filter panel.
//
// Per spec §11.1 (frontend) the search results page exposes the same
// filters as ShopPage plus the Module 11 additions:
//   • Discount toggle
//   • Min-rating slider
//   • Multi-select category + brand (CSV slugs in the URL)
//   • Vendor (profile id)
//
// The component is fully controlled by the parent — it never holds
// filter state of its own. The parent (SearchResultsPage) maps every
// emit to URL search params via useSearchParams.
import { useEffect, useState } from 'react';
import { Filter, X, Star } from 'lucide-react';

import { cn } from '@utils/cn';

const RATING_OPTIONS = [
  { value: 0, label: 'Any' },
  { value: 1, label: '1★+' },
  { value: 2, label: '2★+' },
  { value: 3, label: '3★+' },
  { value: 4, label: '4★+' },
  { value: 4.5, label: '4.5★+' },
];

const SearchFilters = ({
  categories = [],
  brands = [],
  filters = {},
  onChange,
  onReset,
  className = '',
}) => {
  // Local mirror state so users can type freely without emitting a URL
  // patch per keystroke. Numeric inputs commit on blur.
  const [priceMin, setPriceMin] = useState(filters.min_price ?? '');
  const [priceMax, setPriceMax] = useState(filters.max_price ?? '');
  const [selectedCategories, setSelectedCategories] = useState(
    parseCsv(filters.category)
  );
  const [selectedBrands, setSelectedBrands] = useState(parseCsv(filters.brand));

  useEffect(() => {
    setPriceMin(filters.min_price ?? '');
    setPriceMax(filters.max_price ?? '');
  }, [filters.min_price, filters.max_price]);

  useEffect(() => {
    setSelectedCategories(parseCsv(filters.category));
  }, [filters.category]);

  useEffect(() => {
    setSelectedBrands(parseCsv(filters.brand));
  }, [filters.brand]);

  const emit = (patch) => onChange({ ...filters, ...patch });

  const toggleMulti = (key, slug) => {
    const current = key === 'category' ? selectedCategories : selectedBrands;
    const next = current.includes(slug)
      ? current.filter((s) => s !== slug)
      : [...current, slug];
    emit({ [key]: next.length ? next.join(',') : undefined, page: 1 });
  };

  const commitPrice = () => {
    emit({
      min_price: priceMin === '' ? undefined : Number(priceMin),
      max_price: priceMax === '' ? undefined : Number(priceMax),
      page: 1,
    });
  };

  const setRating = (val) => emit({ min_rating: val > 0 ? val : undefined, page: 1 });
  const setDiscount = (val) => emit({ discount: val || undefined, page: 1 });
  const setInStock = (val) => emit({ in_stock: val || undefined, page: 1 });
  const setVendor = (val) => emit({ vendor: val || undefined, page: 1 });

  const activeCount =
    (filters.category ? 1 : 0) +
    (filters.brand ? 1 : 0) +
    (filters.min_price || filters.max_price ? 1 : 0) +
    (filters.in_stock ? 1 : 0) +
    (filters.discount ? 1 : 0) +
    (filters.min_rating ? 1 : 0) +
    (filters.vendor ? 1 : 0);

  return (
    <aside
      className={cn(
        'flex flex-col gap-5 rounded-xl border border-border bg-surface p-5',
        className
      )}
    >
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
          <Filter className="h-4 w-4" />
          Filters
          {activeCount > 0 && (
            <span className="rounded-full bg-accent-500 px-2 py-0.5 text-[10px] font-bold text-white">
              {activeCount}
            </span>
          )}
        </h2>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-danger"
          >
            <X className="h-3 w-3" />
            Reset
          </button>
        )}
      </div>

      {/* Categories (multi-select) */}
      <fieldset>
        <legend className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Categories
        </legend>
        <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
          {categories.length === 0 ? (
            <p className="text-xs text-text-secondary">No categories loaded.</p>
          ) : (
            categories.map((c) => {
              const checked = selectedCategories.includes(c.slug);
              return (
                <label
                  key={c.slug}
                  className="flex cursor-pointer items-center gap-2 text-sm text-text-primary hover:text-accent-500"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleMulti('category', c.slug)}
                    className="h-4 w-4 rounded border-border text-accent-500 focus:ring-accent-500"
                  />
                  <span className="truncate">{c.name}</span>
                  {c.product_count != null && (
                    <span className="ml-auto text-[11px] text-text-secondary">
                      {c.product_count}
                    </span>
                  )}
                </label>
              );
            })
          )}
        </div>
      </fieldset>

      {/* Brands (multi-select) */}
      <fieldset>
        <legend className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Brands
        </legend>
        <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
          {brands.length === 0 ? (
            <p className="text-xs text-text-secondary">No brands loaded.</p>
          ) : (
            brands.map((b) => {
              const checked = selectedBrands.includes(b.slug);
              return (
                <label
                  key={b.slug}
                  className="flex cursor-pointer items-center gap-2 text-sm text-text-primary hover:text-accent-500"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleMulti('brand', b.slug)}
                    className="h-4 w-4 rounded border-border text-accent-500 focus:ring-accent-500"
                  />
                  <span className="truncate">{b.name}</span>
                </label>
              );
            })
          )}
        </div>
      </fieldset>

      {/* Price */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Price (BDT)
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            min="0"
            placeholder="Min"
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            onBlur={commitPrice}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitPrice();
              }
            }}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
          />
          <input
            type="number"
            min="0"
            placeholder="Max"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            onBlur={commitPrice}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitPrice();
              }
            }}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
          />
        </div>
      </div>

      {/* In stock */}
      <label className="flex items-center gap-2 text-sm text-text-primary">
        <input
          type="checkbox"
          checked={Boolean(filters.in_stock)}
          onChange={(e) => setInStock(e.target.checked)}
          className="h-4 w-4 rounded border-border text-accent-500 focus:ring-accent-500"
        />
        In stock only
      </label>

      {/* Discount */}
      <label className="flex items-center gap-2 text-sm text-text-primary">
        <input
          type="checkbox"
          checked={Boolean(filters.discount)}
          onChange={(e) => setDiscount(e.target.checked)}
          className="h-4 w-4 rounded border-border text-accent-500 focus:ring-accent-500"
        />
        On sale
      </label>

      {/* Min rating */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Minimum rating
        </label>
        <div className="flex flex-wrap gap-1.5">
          {RATING_OPTIONS.map((opt) => {
            const active = Number(filters.min_rating || 0) === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRating(opt.value)}
                className={cn(
                  'flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition',
                  active
                    ? 'border-accent-500 bg-accent-500 text-white'
                    : 'border-border bg-surface text-text-secondary hover:border-accent-300 hover:text-text-primary'
                )}
              >
                {opt.value > 0 && <Star className="h-3 w-3 fill-current" />}
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Vendor (optional text input — backend takes profile id) */}
      <div>
        <label
          htmlFor="filter-vendor"
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary"
        >
          Vendor ID
        </label>
        <input
          id="filter-vendor"
          type="text"
          inputMode="numeric"
          placeholder="e.g. 42"
          value={filters.vendor ?? ''}
          onChange={(e) => setVendor(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
        />
      </div>
    </aside>
  );
};

const parseCsv = (raw) => {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

export default SearchFilters;
