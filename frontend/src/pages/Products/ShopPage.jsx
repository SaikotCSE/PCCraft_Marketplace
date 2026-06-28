// ShopPage — paginated product list with filters + sort. Spec §2.7.
//
// All filter state syncs to URL search params via useSearchParams, so the
// page is bookmarkable + back/forward works.
import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usePageTitle } from '@/hooks/usePageTitle';
import ProductGrid from '@/components/products/ProductGrid';
import ProductFilters from '@/components/products/ProductFilters';
import Pagination from '@/components/products/Pagination';
import Skeleton from '@/components/common/Skeleton';
import { productService } from '@/services/productService';
import { categoryService } from '@/services/categoryService';
import { brandService } from '@/services/brandService';
import { PAGINATION_DEFAULTS } from '@/utils/constants';

const SORT_OPTIONS = [
  { value: '-created_at', label: 'Newest' },
  { value: 'effective_price', label: 'Price: low to high' },
  { value: '-effective_price', label: 'Price: high to low' },
  { value: '-avg_rating', label: 'Top rated' },
  { value: '-total_sold', label: 'Best selling' },
];

const pickFilter = (sp, key) => sp.get(key) ?? undefined;

const ShopPage = () => {
  usePageTitle('Shop · PCCraft');
  const [sp, setSp] = useSearchParams();

  const filters = useMemo(
    () => ({
      category: pickFilter(sp, 'category'),
      brand: pickFilter(sp, 'brand'),
      price_min: pickFilter(sp, 'price_min'),
      price_max: pickFilter(sp, 'price_max'),
      in_stock: pickFilter(sp, 'in_stock') === 'true' ? true : undefined,
      is_featured: pickFilter(sp, 'is_featured') === 'true' ? true : undefined,
      search: pickFilter(sp, 'q'),
    }),
    [sp],
  );

  const sort = sp.get('sort') || '-created_at';
  const page = Number(sp.get('page') || 1);
  const pageSize = Number(sp.get('page_size') || PAGINATION_DEFAULTS.PAGE_SIZE);

  const params = useMemo(
    () => ({
      ...filters,
      ordering: sort,
      page,
      page_size: pageSize,
    }),
    [filters, sort, page, pageSize],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['products', params],
    queryFn: () => productService.list(params),
    keepPreviousData: true,
  });

  const { data: cats } = useQuery({
    queryKey: ['categories-tree'],
    queryFn: () => categoryService.tree(),
  });
  const { data: brands } = useQuery({
    queryKey: ['brands-all'],
    queryFn: () => brandService.list({ page_size: 100 }),
  });

  const products = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
  const pagination = data?.pagination ?? {
    page,
    page_size: pageSize,
    total_pages: 1,
    total_count: products.length,
  };

  const patchSp = (patch) => {
    const next = new URLSearchParams(sp);
    Object.entries(patch).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '' || v === false) next.delete(k);
      else next.set(k, String(v));
    });
    next.set('page', '1');
    setSp(next, { replace: true });
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary sm:text-3xl">All products</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Browse, filter, and sort across every vendor.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        <ProductFilters
          categories={Array.isArray(cats) ? cats : cats?.results ?? []}
          brands={Array.isArray(brands) ? brands : brands?.results ?? []}
          filters={filters}
          onChange={patchSp}
          onReset={() => setSp(new URLSearchParams(), { replace: true })}
          className="lg:sticky lg:top-20 lg:self-start"
        />

        <section className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-sm text-text-secondary">
              {isLoading ? (
                <Skeleton className="inline-block h-4 w-24" />
              ) : (
                <>{pagination.total_count ?? products.length} result{(pagination.total_count ?? products.length) === 1 ? '' : 's'}</>
              )}
            </p>
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              Sort by
              <select
                value={sort}
                onChange={(e) => patchSp({ sort: e.target.value })}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm focus:border-accent-500 focus:outline-none"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {isLoading ? (
            <ProductGrid isLoading skeletonCount={8} SkeletonComponent={Skeleton} />
          ) : (
            <ProductGrid products={products} />
          )}

          <Pagination
            pagination={pagination}
            onPageChange={(p) => patchSp({ page: p })}
            onPageSizeChange={(n) => patchSp({ page_size: n, page: 1 })}
          />
        </section>
      </div>
    </div>
  );
};

export default ShopPage;
