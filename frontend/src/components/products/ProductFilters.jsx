// ProductFilters — sidebar filter panel. Spec §2.7.
//
// Controlled component. Calls `onChange({...filters})` whenever the user
// toggles a field. Parent component (ShopPage) maps those to URL search
// params and re-fetches.
import { useState, useEffect } from 'react';
import { Filter, X } from 'lucide-react';

const ProductFilters = ({
  categories = [],
  brands = [],
  filters = {},
  onChange,
  onReset,
  className = '',
}) => {
  const [priceMin, setPriceMin] = useState(filters.price_min ?? '');
  const [priceMax, setPriceMax] = useState(filters.price_max ?? '');
  const [category, setCategory] = useState(filters.category ?? '');
  const [brand, setBrand] = useState(filters.brand ?? '');
  const [inStockOnly, setInStockOnly] = useState(Boolean(filters.in_stock));
  const [featuredOnly, setFeaturedOnly] = useState(Boolean(filters.is_featured));

  useEffect(() => {
    setPriceMin(filters.price_min ?? '');
    setPriceMax(filters.price_max ?? '');
    setCategory(filters.category ?? '');
    setBrand(filters.brand ?? '');
    setInStockOnly(Boolean(filters.in_stock));
    setFeaturedOnly(Boolean(filters.is_featured));
  }, [filters]);

  const emit = (patch) => onChange({ ...filters, ...patch });

  const handlePriceBlur = () => {
    emit({
      price_min: priceMin === '' ? undefined : Number(priceMin),
      price_max: priceMax === '' ? undefined : Number(priceMax),
    });
  };

  const activeCount =
    (filters.category ? 1 : 0) +
    (filters.brand ? 1 : 0) +
    (filters.price_min || filters.price_max ? 1 : 0) +
    (filters.in_stock ? 1 : 0) +
    (filters.is_featured ? 1 : 0);

  return (
    <aside
      className={`flex flex-col gap-5 rounded-xl border border-border bg-surface p-5 ${className}`}
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

      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Category
        </label>
        <select
          value={category}
          onChange={(e) => emit({ category: e.target.value || undefined })}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Brand
        </label>
        <select
          value={brand}
          onChange={(e) => emit({ brand: e.target.value || undefined })}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
        >
          <option value="">All brands</option>
          {brands.map((b) => (
            <option key={b.slug} value={b.slug}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

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
            onBlur={handlePriceBlur}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
          />
          <input
            type="number"
            min="0"
            placeholder="Max"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            onBlur={handlePriceBlur}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-text-primary">
        <input
          type="checkbox"
          checked={inStockOnly}
          onChange={(e) => emit({ in_stock: e.target.checked || undefined })}
          className="h-4 w-4 rounded border-border text-accent-500 focus:ring-accent-500"
        />
        In stock only
      </label>

      <label className="flex items-center gap-2 text-sm text-text-primary">
        <input
          type="checkbox"
          checked={featuredOnly}
          onChange={(e) => emit({ is_featured: e.target.checked || undefined })}
          className="h-4 w-4 rounded border-border text-accent-500 focus:ring-accent-500"
        />
        Featured only
      </label>
    </aside>
  );
};

export default ProductFilters;