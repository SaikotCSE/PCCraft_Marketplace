// HomeCategoryGrid — short list of category tiles on the HomePage.
//
// We render a curated set of PC-component categories that drive most
// of the catalogue. The category tree is fetched from
// categoryService.tree() with a graceful fallback when the API isn't
// available yet — the curated list keeps the page useful even on
// cold start.
//
// Each tile uses a lucide-react icon (per §1.2 icon rule) and links
// to the shop filtered by category slug.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Cpu,
  Monitor,
  MemoryStick,
  HardDrive,
  Zap,
  Box,
  Fan,
  Layers,
  ArrowRight,
} from 'lucide-react';

import Skeleton from '@components/common/Skeleton';
import { categoryService } from '@services/categoryService';
import { paths } from '@routes/routePaths';
import { cn } from '@utils/cn';

// Curated fallback — covers all spec PC builder slots so the homepage
// looks alive before the API returns its tree.
const FALLBACK = [
  { slug: 'cpu', name: 'Processors', icon: Cpu, accent: 'from-accent-500/15 to-accent-300/5' },
  { slug: 'motherboard', name: 'Motherboards', icon: Layers, accent: 'from-info/15 to-info/5' },
  { slug: 'ram', name: 'Memory', icon: MemoryStick, accent: 'from-warning/15 to-warning/5' },
  { slug: 'gpu', name: 'Graphics Cards', icon: Monitor, accent: 'from-danger/15 to-danger/5' },
  { slug: 'storage', name: 'Storage', icon: HardDrive, accent: 'from-success/15 to-success/5' },
  { slug: 'psu', name: 'Power Supplies', icon: Zap, accent: 'from-accent-500/15 to-accent-300/5' },
  { slug: 'case', name: 'PC Cases', icon: Box, accent: 'from-primary-900/15 to-primary-700/5' },
  { slug: 'cooler', name: 'CPU Coolers', icon: Fan, accent: 'from-info/15 to-info/5' },
];

const HomeCategoryGrid = () => {
  const [tree, setTree] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    categoryService
      .tree()
      .then((data) => {
        if (!mounted) return;
        setTree(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!mounted) return;
        setError(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Map the API tree → tile list. Match slug → icon, keep API order.
  const tiles = useMemo(() => {
    if (error || !tree || tree.length === 0) return FALLBACK;
    const seen = new Set();
    const out = [];
    tree.forEach((cat) => {
      if (!cat?.slug || seen.has(cat.slug)) return;
      const fallback = FALLBACK.find((f) => f.slug === cat.slug);
      out.push({
        slug: cat.slug,
        name: cat.name,
        icon: fallback?.icon ?? Layers,
        accent: fallback?.accent ?? 'from-surface-200 to-surface-100',
        productCount: cat.product_count ?? cat.children_count,
      });
      seen.add(cat.slug);
    });
    // Append curated categories that the API didn't include so the page
    // still feels complete for typical PC builder slots.
    FALLBACK.forEach((f) => {
      if (!seen.has(f.slug)) out.push(f);
    });
    return out;
  }, [tree, error]);

  const isLoading = !tree && !error;

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-heading text-2xl font-bold text-text-primary sm:text-3xl">
            Shop by category
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Jump straight into the parts you need for your next build.
          </p>
        </div>
        <Link
          to={paths.products()}
          className="hidden items-center gap-1 text-sm font-medium text-accent-700 hover:text-accent-500 sm:inline-flex"
        >
          All categories
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-28 w-full rounded-xl"
                rounded="rounded-xl"
              />
            ))
          : tiles.map((tile) => {
              const Icon = tile.icon;
              return (
                <Link
                  key={tile.slug}
                  to={`/products?category=${tile.slug}`}
                  className={cn(
                    'group relative flex h-28 flex-col justify-between overflow-hidden rounded-xl border border-surface-300 bg-surface-50 p-4 shadow-sm transition-all duration-200',
                    'hover:-translate-y-0.5 hover:border-accent-400 hover:shadow-md'
                  )}
                >
                  <div
                    className={cn(
                      'pointer-events-none absolute inset-0 bg-gradient-to-br opacity-70 transition-opacity group-hover:opacity-100',
                      tile.accent
                    )}
                  />
                  <div className="relative flex items-start justify-between">
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-surface-50 text-text-primary shadow-sm">
                      <Icon className="h-5 w-5" />
                    </span>
                    <ArrowRight className="h-4 w-4 text-text-secondary transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent-700" />
                  </div>
                  <div className="relative">
                    <p className="font-heading text-sm font-semibold text-text-primary">
                      {tile.name}
                    </p>
                    {tile.productCount != null && (
                      <p className="mt-0.5 text-[11px] text-text-secondary">
                        {tile.productCount} products
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
      </div>
    </section>
  );
};

export default HomeCategoryGrid;