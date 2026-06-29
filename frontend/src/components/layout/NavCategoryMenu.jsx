// NavCategoryMenu — mega-menu panel that drops down from the navbar.
//
// Used by Navbar.jsx for the Categories and Brands triggers. The panel
// shows a curated grid of category tiles with lucide icons (per §1.2),
// plus a "Featured vendors" sidebar highlighting the trust story.
//
// Stays inside the spec design tokens — no third-party assets, lucide
// icons only, surface-50 background, indigo accent.
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
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';

import { categoryService } from '@services/categoryService';
import { paths } from '@routes/routePaths';
import { cn } from '@utils/cn';

const FALLBACK = [
  { slug: 'cpu', name: 'Processors', icon: Cpu, accent: 'text-accent-500' },
  { slug: 'motherboard', name: 'Motherboards', icon: Layers, accent: 'text-info' },
  { slug: 'ram', name: 'Memory', icon: MemoryStick, accent: 'text-warning' },
  { slug: 'gpu', name: 'Graphics Cards', icon: Monitor, accent: 'text-danger' },
  { slug: 'storage', name: 'Storage', icon: HardDrive, accent: 'text-success' },
  { slug: 'psu', name: 'Power Supplies', icon: Zap, accent: 'text-accent-500' },
  { slug: 'case', name: 'PC Cases', icon: Box, accent: 'text-primary-900' },
  { slug: 'cooler', name: 'CPU Coolers', icon: Fan, accent: 'text-info' },
];

const NavCategoryMenu = ({ onClose }) => {
  const [tree, setTree] = useState(null);

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
        setTree([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const tiles = useMemo(() => {
    const seen = new Set();
    const out = [];
    if (Array.isArray(tree)) {
      tree.forEach((cat) => {
        if (!cat?.slug || seen.has(cat.slug)) return;
        const fallback = FALLBACK.find((f) => f.slug === cat.slug);
        out.push({
          slug: cat.slug,
          name: cat.name,
          icon: fallback?.icon ?? Layers,
          accent: fallback?.accent ?? 'text-text-secondary',
        });
        seen.add(cat.slug);
      });
    }
    FALLBACK.forEach((f) => {
      if (!seen.has(f.slug)) out.push(f);
    });
    return out;
  }, [tree]);

  return (
    <div
      role="menu"
      aria-label="Browse categories"
      className="absolute left-1/2 top-full z-50 mt-3 w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-surface-300 bg-surface-50 shadow-2xl shadow-primary-900/20 ring-1 ring-primary-900/5"
    >
      {/* Soft accent header */}
      <div className="relative overflow-hidden bg-gradient-to-r from-primary-900 via-primary-800 to-primary-700 px-6 py-4">
        <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-accent-500/30 blur-2xl" />
        <div className="relative flex items-center justify-between gap-3 text-text-inverse">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-accent-300">
              Shop by category
            </p>
            <p className="mt-0.5 text-sm font-medium text-text-inverse/80">
              Hand-picked components for every PC builder slot.
            </p>
          </div>
          <Link
            to={paths.products()}
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-md bg-accent-500 px-3 py-1.5 text-xs font-semibold text-primary-900 transition hover:bg-accent-400"
          >
            View all
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.slug}
              to={`/products?category=${t.slug}`}
              role="menuitem"
              onClick={onClose}
              className="group flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-sm transition hover:border-accent-400 hover:bg-surface-100"
            >
              <span
                className={cn(
                  'grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-surface-100 transition group-hover:bg-surface-50',
                  t.accent
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="flex-1 font-medium text-text-primary">
                {t.name}
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-text-secondary opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
            </Link>
          );
        })}
      </div>

      <div className="flex items-center gap-3 border-t border-surface-200 bg-surface-100 px-5 py-3">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-success/15 text-success">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <p className="text-xs text-text-secondary">
          Every vendor is trade-licensed and verified by the PCCraft team.
        </p>
      </div>
    </div>
  );
};

export default NavCategoryMenu;