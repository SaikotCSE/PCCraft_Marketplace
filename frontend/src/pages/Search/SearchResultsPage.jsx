// SearchResultsPage — Module 11 §11.1 (frontend).
//
// All filter state lives in the URL via useSearchParams, so the page is
// bookmarkable and back/forward works. Active filter chips row sits
// below the header — clicking × removes that single filter from the URL.
// Header echoes the query (highlighted) and total result count.
//
//   /search?q=ryzen+5&category=cpu&brand=amd&min_price=15000&max_price=50000
//   &in_stock=true&discount=true&min_rating=4&vendor=42&ordering=price
//
// No-results state shows the search icon, a helpful "No results for
// '<query>'" message, and a row of trending queries from the
// `/search/trending/` endpoint.
import { useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search as SearchIcon, X, TrendingUp } from 'lucide-react';

import { usePageTitle } from '@/hooks/usePageTitle';
import ProductGrid from '@/components/products/ProductGrid';
import Pagination from '@/components/products/Pagination';
import SearchFilters from '@/components/products/SearchFilters';
import SearchBar from '@/components/layout/SearchBar';
import Skeleton from '@/components/common/Skeleton';
import ErrorState from '@/components/common/ErrorState';
import { searchService } from '@/services/searchService';
import { categoryService } from '@/services/categoryService';
import { brandService } from '@/services/brandService';
import { PAGINATION_DEFAULTS } from '@/utils/constants';
import { cn } from '@/utils/cn';
import { paths } from '@/routes/routePaths';

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Best match' },
  { value: '-created_at', label: 'Newest' },
  { value: 'effective_price', label: 'Price: low to high' },
  { value: '-effective_price', label: 'Price: high to low' },
  { value: '-avg_rating', label: 'Top rated' },
  { value: '-total_sold', label: 'Best selling' },
];

const SORT_VALUE_SET = new Set(SORT_OPTIONS.map((o) => o.value));

const pickParam = (sp, key) => {
  const v = sp.get(key);
  return v === null || v === '' ? undefined : v;
};

const SearchResultsPage = () => {
  const [sp, setSp] = useSearchParams();

  const query = sp.get('q') || '';

  usePageTitle(
    query ? `Search "${query}" · PCCraft` : 'Search · PCCraft'
  );

  // Pull filters out of the URL once per render.
  const filters = useMemo(
    () => ({
      category: pickParam(sp, 'category'),
      brand: pickParam(sp, 'brand'),
      min_price: pickParam(sp, 'min_price'),
      max_price: pickParam(sp, 'max_price'),
      in_stock: pickParam(sp, 'in_stock') === 'true' ? true : undefined,
      discount: pickParam(sp, 'discount') === 'true' ? true : undefined,
      min_rating: pickParam(sp, 'min_rating'),
      vendor: pickParam(sp, 'vendor'),
    }),
    [sp]
  );

  const sortParam = sp.get('ordering') || 'relevance';
  const sort = SORT_VALUE_SET.has(sortParam) ? sortParam : 'relevance';
  const page = Number(sp.get('page') || 1);
  const pageSize = Number(
    sp.get('page_size') || PAGINATION_DEFAULTS.PAGE_SIZE
  );

  const params = useMemo(
    () => ({
      ...filters,
      ordering: sort,
      page,
      page_size: pageSize,
    }),
    [filters, sort, page, pageSize]
  );

  // Main product search — Module 11 endpoint.
  const {
    data: searchData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['search', 'products', { q: query, ...params }],
    queryFn: () => searchService.products(query, params),
    enabled: query.length > 0,
    keepPreviousData: true,
  });

  // Trending queries — used in the no-results empty state.
  const { data: trendingData } = useQuery({
    queryKey: ['search', 'trending'],
    queryFn: () => searchService.trending(),
    staleTime: 60_000 * 60,
  });

  // Trending products — shown as a "you might like" row in the empty
  // state (spec §11.1 frontend).
  const { data: trendingProductsData } = useQuery({
    queryKey: ['search', 'trending-products'],
    queryFn: () => searchService.trendingProducts(8),
    staleTime: 60_000 * 5,
  });

  // Categories tree + flat brand list for the sidebar filters.
  const { data: catsData } = useQuery({
    queryKey: ['categories-tree'],
    queryFn: () => categoryService.tree(),
  });
  const { data: brandsData } = useQuery({
    queryKey: ['brands-all'],
    queryFn: () => brandService.list(),
  });

  const flatCategories = useMemo(() => flattenCategories(catsData), [catsData]);
  const brandList = useMemo(() => {
    if (Array.isArray(brandsData)) return brandsData;
    if (brandsData?.results) return brandsData.results;
    return [];
  }, [brandsData]);

  const results = useMemo(() => {
    if (Array.isArray(searchData?.results)) return searchData.results;
    if (Array.isArray(searchData)) return searchData;
    return [];
  }, [searchData]);

  const pagination = searchData?.pagination ?? {
    page,
    page_size: pageSize,
    total_pages: 1,
    total_count: results.length,
  };

  const trendingQueries = useMemo(() => {
    const raw = trendingData?.results ?? trendingData ?? [];
    if (!Array.isArray(raw)) return [];
    return raw.filter((r) => r && r.query).slice(0, 8);
  }, [trendingData]);

  const trendingProducts = useMemo(() => {
    const raw = trendingProductsData?.results ?? trendingProductsData ?? [];
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, 8);
  }, [trendingProductsData]);

  const patchSp = (patch) => {
    const next = new URLSearchParams(sp);
    Object.entries(patch).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '' || v === false) {
        next.delete(k);
      } else {
        next.set(k, String(v));
      }
    });
    if (Object.prototype.hasOwnProperty.call(patch, 'q') === false) {
      // Filter changes reset to page 1 unless the patch already sets page.
      if (!Object.prototype.hasOwnProperty.call(patch, 'page')) {
        next.set('page', '1');
      }
    }
    setSp(next, { replace: true });
  };

  const removeFilter = (key) => patchSp({ [key]: undefined });
  const removeCategory = (slug) => {
    const next = (filters.category || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && s !== slug);
    patchSp({ category: next.length ? next.join(',') : undefined });
  };
  const removeBrand = (slug) => {
    const next = (filters.brand || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && s !== slug);
    patchSp({ brand: next.length ? next.join(',') : undefined });
  };
  const clearAll = () =>
    setSp(new URLSearchParams(query ? { q: query } : {}), { replace: true });

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page]);

  // Active chips — one per applied filter, plus the visual highlight.
  const chips = useMemo(() => buildChips(filters, flatCategories, brandList), [
    filters,
    flatCategories,
    brandList,
  ]);

  const hasQuery = query.trim().length > 0;
  const showEmpty =
    hasQuery && !isLoading && !isError && results.length === 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Search header */}
      <div className="mb-6 flex flex-col gap-3">
        <div className="md:hidden">
          <SearchBar initialQuery={query} />
        </div>
        <h1 className="text-2xl font-bold text-text-primary sm:text-3xl">
          {hasQuery ? (
            <>
              {pagination.total_count ?? results.length} result
              {(pagination.total_count ?? results.length) === 1 ? '' : 's'} for{' '}
              <span className="rounded bg-accent-300/30 px-1.5 py-0.5 text-accent-500">
                “{query}”
              </span>
            </>
          ) : (
            'Search PCCraft'
          )}
        </h1>
        {hasQuery && (
          <p className="text-sm text-text-secondary">
            Showing full-text matches from every active vendor. Refine with the
            filters on the left, or change your query above.
          </p>
        )}
      </div>

      {/* Active filter chips */}
      {chips.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Active filters
          </span>
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() =>
                chip.kind === 'category'
                  ? removeCategory(chip.value)
                  : chip.kind === 'brand'
                    ? removeBrand(chip.value)
                    : removeFilter(chip.key)
              }
              className="group flex items-center gap-1.5 rounded-full border border-accent-300 bg-accent-300/20 px-3 py-1 text-xs font-medium text-accent-500 transition hover:border-danger hover:bg-danger/5 hover:text-danger"
              aria-label={`Remove filter ${chip.label}`}
            >
              {chip.label}
              <X className="h-3 w-3" />
            </button>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="ml-auto text-xs font-medium text-text-secondary hover:text-danger"
          >
            Clear all
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        <SearchFilters
          categories={flatCategories}
          brands={brandList}
          filters={filters}
          onChange={patchSp}
          onReset={clearAll}
          className="lg:sticky lg:top-20 lg:self-start"
        />

        <section className="flex flex-col gap-5">
          {/* Result meta + sort */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-sm text-text-secondary">
              {isLoading ? (
                <Skeleton className="inline-block h-4 w-32" />
              ) : hasQuery ? (
                <>
                  <span className="font-semibold text-text-primary">
                    {pagination.total_count ?? results.length}
                  </span>{' '}
                  match
                  {(pagination.total_count ?? results.length) === 1 ? '' : 'es'}
                </>
              ) : (
                'Type a query in the search bar above to begin.'
              )}
            </p>
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              Sort by
              <select
                value={sort}
                onChange={(e) => patchSp({ ordering: e.target.value })}
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

          {/* Error */}
          {isError ? (
            <ErrorState
              title="Could not load search results"
              description="Check your connection and try again."
              onRetry={() => refetch()}
            />
          ) : !hasQuery ? (
            <div className="rounded-xl border border-dashed border-surface-300 bg-surface-50 px-6 py-16 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-surface-100 text-text-secondary">
                <SearchIcon className="h-7 w-7" aria-hidden="true" />
              </div>
              <h2 className="mt-4 font-heading text-lg font-semibold text-text-primary">
                Start a search
              </h2>
              <p className="mt-2 max-w-md text-sm text-text-secondary">
                Type a product, category, or brand name into the search bar to
                see full-text results.
              </p>
              {trendingQueries.length > 0 && (
                <div className="mt-6">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    Trending searches
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {trendingQueries.map((t) => (
                      <Link
                        key={t.query}
                        to={`${paths.search()}?q=${encodeURIComponent(t.query)}`}
                        className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-primary hover:border-accent-300 hover:text-accent-500"
                      >
                        {t.query}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : isLoading ? (
            <ProductGrid isLoading skeletonCount={8} SkeletonComponent={Skeleton} />
          ) : showEmpty ? (
            <SearchEmptyState
              query={query}
              trending={trendingQueries}
              products={trendingProducts}
            />
          ) : (
            <ProductGrid products={results} />
          )}

          {hasQuery && results.length > 0 && (
            <Pagination
              pagination={pagination}
              onPageChange={(p) => patchSp({ page: p })}
              onPageSizeChange={(n) => patchSp({ page_size: n, page: 1 })}
            />
          )}
        </section>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------
// Empty state — shown when the query returns 0 products. Spec §11.1
// frontend: "search icon, 'No results for ...', suggested categories or
// trending products below". We render trending queries as clickable
// chips AND a row of trending product cards so the dead-end has at
// least two recovery paths.
// ---------------------------------------------------------------------
const SearchEmptyState = ({ query, trending = [], products = [] }) => (
  <div className="space-y-8">
    <div className="rounded-xl border border-dashed border-surface-300 bg-surface-50 px-6 py-12 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-surface-100 text-text-secondary">
        <SearchIcon className="h-7 w-7" aria-hidden="true" />
      </div>
      <h2 className="mt-4 font-heading text-lg font-semibold text-text-primary">
        No results for “{query}”
      </h2>
      <p className="mt-2 max-w-md text-sm text-text-secondary">
        Check your spelling, broaden your filters, or try one of the trending
        searches below.
      </p>
      {trending.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
            <TrendingUp className="h-3.5 w-3.5" /> Trending right now
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {trending.map((t) => (
              <Link
                key={t.query}
                to={`${paths.search()}?q=${encodeURIComponent(t.query)}`}
                className={cn(
                  'rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-primary',
                  'hover:border-accent-300 hover:text-accent-500'
                )}
              >
                {t.query}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>

    {products.length > 0 && (
      <section>
        <header className="mb-4 flex items-center justify-between">
          <h3 className="font-heading text-base font-semibold text-text-primary">
            Popular on PCCraft
          </h3>
          <Link
            to={paths.products()}
            className="text-xs font-medium text-text-secondary hover:text-accent-500"
          >
            Browse all products →
          </Link>
        </header>
        <ProductGrid products={products} />
      </section>
    )}
  </div>
);

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
const buildChips = (filters, categories, brands) => {
  const chips = [];
  const labelFor = (list, slug, fallbackKey) => {
    const found = list.find((x) => x.slug === slug);
    return found?.name || slug;
  };

  (filters.category || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((slug) => {
      chips.push({
        id: `cat-${slug}`,
        kind: 'category',
        value: slug,
        key: 'category',
        label: `Category: ${labelFor(categories, slug)}`,
      });
    });

  (filters.brand || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((slug) => {
      chips.push({
        id: `brand-${slug}`,
        kind: 'brand',
        value: slug,
        key: 'brand',
        label: `Brand: ${labelFor(brands, slug)}`,
      });
    });

  if (filters.min_price || filters.max_price) {
    const lo = filters.min_price ? `৳ ${filters.min_price}` : 'any';
    const hi = filters.max_price ? `৳ ${filters.max_price}` : 'any';
    chips.push({
      id: 'price',
      kind: 'plain',
      key: 'min_price',
      label: `Price: ${lo} – ${hi}`,
    });
  }
  if (filters.in_stock) {
    chips.push({ id: 'stock', kind: 'plain', key: 'in_stock', label: 'In stock' });
  }
  if (filters.discount) {
    chips.push({ id: 'discount', kind: 'plain', key: 'discount', label: 'On sale' });
  }
  if (filters.min_rating) {
    chips.push({
      id: 'rating',
      kind: 'plain',
      key: 'min_rating',
      label: `${filters.min_rating}★ & up`,
    });
  }
  if (filters.vendor) {
    chips.push({
      id: 'vendor',
      kind: 'plain',
      key: 'vendor',
      label: `Vendor: ${filters.vendor}`,
    });
  }
  return chips;
};

const flattenCategories = (data) => {
  if (!data) return [];
  // The tree endpoint may return either a flat list OR a tree with children.
  const root = Array.isArray(data) ? data : data?.results ?? [];
  const out = [];
  const walk = (node) => {
    if (!node) return;
    if (node.slug && node.name) {
      out.push({
        slug: node.slug,
        name: node.name,
        product_count: node.product_count,
      });
    }
    (node.children || []).forEach(walk);
  };
  root.forEach(walk);
  return out;
};

export default SearchResultsPage;
