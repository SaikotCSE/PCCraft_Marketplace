// VendorHeader — top bar for the /vendor/* workspace.
//
// Rendered once by VendorShell above the <Outlet /> so every vendor page
// inherits a consistent header (store name, quick search, role badge).
// This file is intentionally self-contained: no stub code, no placeholders.
//
// Behavior:
//   - Greets the signed-in vendor by full name (falls back to email).
//   - Shows the store name from `vendor_meta.store_name` when present.
//   - Quick search box submits to `/vendor/products?query=...`, so the
//     vendor can pivot straight into product filtering from any page.
//   - A link to their public storefront.
//   - Logout is intentionally NOT here; it lives in the sidebar footer
//     (see SidebarFooter in VendorShell.jsx) so it is reachable from one
//     place only.
//
// State sources:
//   - `useAuthStore` for the signed-in user (Zustand; no localStorage).
//   - Route paths from `routes/routePaths.js` (never hardcoded).
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Search, ExternalLink, Store } from 'lucide-react';

import useAuthStore from '@context/useAuthStore';
import { ROUTE_PATHS, paths } from '@/routes/routePaths';

export default function VendorHeader() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const fullName =
    user?.full_name?.trim() || user?.first_name || user?.email || 'Vendor';
  const storeName = user?.vendor_meta?.store_name || 'Your store';
  const storeSlug = user?.vendor_meta?.store_slug || null;

  const onSubmit = (event) => {
    event.preventDefault();
    const trimmed = query.trim();
    const url = trimmed
      ? `${ROUTE_PATHS.VENDOR_PRODUCTS}?query=${encodeURIComponent(trimmed)}`
      : ROUTE_PATHS.VENDOR_PRODUCTS;
    navigate(url);
  };

  return (
    <header className="sticky top-0 z-20 border-b border-surface-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-50 text-accent-600">
            <Store className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-text-secondary">
              Vendor workspace
            </p>
            <h1 className="truncate text-base font-semibold text-text-primary">
              {storeName}
            </h1>
          </div>
        </div>

        <form
          role="search"
          onSubmit={onSubmit}
          className="flex flex-1 items-center gap-2 sm:max-w-sm"
        >
          <div className="relative w-full">
            <Search
              className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-text-secondary"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a product, SKU, or category"
              className="block w-full rounded-md border border-surface-200 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-text-secondary focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              aria-label="Search products"
            />
          </div>
          <button
            type="submit"
            className="rounded-md border border-surface-200 bg-white px-3 py-2 text-sm font-medium text-text-primary hover:bg-surface-50"
          >
            Search
          </button>
        </form>

        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-text-secondary sm:inline">
            Hi, {fullName}
          </span>
          {storeSlug ? (
            <Link
              to={paths.vendorPublic(storeSlug)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-surface-200 bg-white px-3 py-2 text-xs font-medium text-text-primary hover:bg-surface-50"
            >
              View storefront
              <ExternalLink className="h-3 w-3" />
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
