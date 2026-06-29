// HomeBrandStrip — horizontal list of brand tiles on the HomePage.
//
// Fetches from brandService.list(), lazy-loads via useIntersectionObserver,
// and shows up to N featured brands as round logo tiles linking to the
// brand detail page. Falls back gracefully if the API is empty.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

import Skeleton from '@components/common/Skeleton';
import { useIntersectionObserver } from '@hooks/useIntersectionObserver';
import { brandService } from '@services/brandService';
import { paths } from '@routes/routePaths';

const HomeBrandStrip = () => {
  const { ref: sentinelRef, isIntersecting } = useIntersectionObserver({
    rootMargin: '200px',
    threshold: 0,
  });
  const [brands, setBrands] = useState(null);

  useEffect(() => {
    if (!isIntersecting || brands !== null) return undefined;
    let mounted = true;
    brandService
      .list()
      .then((data) => {
        if (!mounted) return;
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.results)
            ? data.results
            : [];
        setBrands(list);
      })
      .catch(() => {
        if (!mounted) return;
        setBrands([]);
      });
    return () => {
      mounted = false;
    };
  }, [isIntersecting, brands]);

  const featured = useMemo(() => {
    if (!Array.isArray(brands)) return [];
    return brands.filter((b) => b.is_active !== false).slice(0, 16);
  }, [brands]);

  return (
    <section
      ref={sentinelRef}
      className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8"
      aria-labelledby="home-brands-heading"
    >
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2
            id="home-brands-heading"
            className="font-heading text-2xl font-bold text-text-primary sm:text-3xl"
          >
            Trusted brands
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            From household names to boutique builders — all verified vendors.
          </p>
        </div>
        <Link
          to={paths.brands()}
          className="hidden items-center gap-1 text-sm font-medium text-accent-700 hover:text-accent-500 sm:inline-flex"
        >
          All brands
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {brands === null ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" rounded="rounded-xl" />
          ))}
        </div>
      ) : featured.length === 0 ? (
        <p className="rounded-xl border border-dashed border-surface-300 bg-surface-50 px-4 py-8 text-center text-sm text-text-secondary">
          Brands will appear here once vendors are approved.
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
          {featured.map((brand) => (
            <li key={brand.id || brand.slug}>
              <Link
                to={paths.brandDetail(brand.slug)}
                className="group flex h-20 items-center justify-center rounded-xl border border-surface-300 bg-surface-50 px-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-accent-400 hover:shadow-md"
                title={brand.name}
              >
                {brand.logo || brand.logo_url ? (
                  <img
                    src={brand.logo || brand.logo_url}
                    alt={brand.name}
                    loading="lazy"
                    className="max-h-12 max-w-full object-contain transition-transform group-hover:scale-105"
                  />
                ) : (
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-200 text-xs font-bold uppercase text-text-secondary">
                    {brand.name?.slice(0, 2) ?? '??'}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default HomeBrandStrip;