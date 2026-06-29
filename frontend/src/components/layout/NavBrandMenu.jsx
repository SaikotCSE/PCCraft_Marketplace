// NavBrandMenu — brand mega-menu used by Navbar.jsx.
//
// Lazy-loads brand logos via the existing brandService.list endpoint,
// then renders a dense grid of monogram tiles. Falls back to placeholder
// letters from the brand name if no logo asset is available (CommonJS
// case for first-load sessions).
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

import { brandService } from '@services/brandService';
import { paths } from '@routes/routePaths';

const MAX_TILES = 12;

const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

const NavBrandMenu = ({ onClose }) => {
  const [brands, setBrands] = useState(null);

  useEffect(() => {
    let mounted = true;
    brandService
      .list({ page_size: MAX_TILES })
      .then((data) => {
        if (!mounted) return;
        const list = Array.isArray(data?.results)
          ? data.results
          : Array.isArray(data)
            ? data
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
  }, []);

  const tiles = useMemo(() => (brands ?? []).slice(0, MAX_TILES), [brands]);
  const isLoading = brands === null;

  return (
    <div
      role="menu"
      aria-label="Browse brands"
      className="absolute left-1/2 top-full z-50 mt-3 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-surface-300 bg-surface-50 shadow-2xl shadow-primary-900/20 ring-1 ring-primary-900/5"
    >
      <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-primary-900 via-primary-800 to-primary-700 px-5 py-3.5 text-text-inverse">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-300">
            Top vendors
          </p>
          <p className="mt-0.5 text-sm font-medium text-text-inverse/80">
            Shop your favourite manufacturers in one place.
          </p>
        </div>
        <Link
          to={paths.brands()}
          onClick={onClose}
          className="inline-flex items-center gap-1 rounded-md bg-accent-500 px-3 py-1.5 text-xs font-semibold text-primary-900 transition hover:bg-accent-400"
        >
          All brands
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2 p-4 sm:grid-cols-4">
        {isLoading &&
          Array.from({ length: 8 }).map((_, i) => (
            <div
              key={`skel-${i}`}
              className="h-16 animate-pulse rounded-lg bg-surface-100"
            />
          ))}

        {!isLoading && tiles.length === 0 && (
          <p className="col-span-full px-3 py-6 text-center text-sm text-text-secondary">
            Brands are being prepared — check back soon.
          </p>
        )}

        {!isLoading &&
          tiles.map((b) => (
            <Link
              key={b.id ?? b.slug}
              to={`/products?brand=${b.slug}`}
              onClick={onClose}
              className="group flex h-16 items-center justify-center gap-2 rounded-lg border border-surface-200 bg-surface-50 px-3 text-sm font-semibold text-text-primary transition hover:border-accent-400 hover:bg-surface-100"
            >
              {b.logo_url ? (
                <img
                  src={b.logo_url}
                  alt={b.name}
                  loading="lazy"
                  className="max-h-8 w-full object-contain opacity-80 transition group-hover:opacity-100"
                />
              ) : (
                <span className="grid h-8 w-8 place-items-center rounded-md bg-primary-900 text-xs font-bold text-accent-300">
                  {initials(b.name)}
                </span>
              )}
              <span className="truncate">{b.name}</span>
            </Link>
          ))}
      </div>
    </div>
  );
};

export default NavBrandMenu;