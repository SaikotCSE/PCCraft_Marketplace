// Navbar — top navigation bar.
//
// Module 11 chrome polished in the "cool header" pass:
//   • gradient primary chrome (primary-900 → primary-800 → primary-700)
//     with a soft accent-500 glow on the bottom edge
//   • taller h-20 chrome + a Newegg-style quick-category strip below
//     (one-click browse for the 8 PC builder slots)
//   • scroll-progress gradient bar driven by useScrollProgress
//   • mega-menu hover dropdowns for Categories and Brands (a top-level
//     Products link is intentionally absent — Categories already points
//     to the products list inside its mega-menu, so a second route in
//     the main row would be redundant)
//   • animated logo (gradient ring + pulsing online dot)
//   • ⌘K hint on the search button
//   • role badge (C/V/A) on the account avatar
//   • pulsing accent badges on cart/wishlist counts
//
// All existing behaviours preserved verbatim (debounced SearchBar,
// mobile drawer, role-aware account menu, mobile search toggle,
// cart-drawer trigger, route-aware closing).
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ShoppingCart,
  Heart,
  User,
  Menu,
  LogOut,
  Package,
  Search as SearchIcon,
  Shield,
  Store,
  Undo2,
  Star,
  X,
  Command,
  Cpu,
  Flame,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { paths } from '@routes/routePaths';
import { useAuthStore } from '@context/useAuthStore';
import { useCartStore } from '@context/useCartStore';
import { useWishlistStore } from '@context/useWishlistStore';
import { useUIStore } from '@context/useUIStore';
import { PCCRAFT_LOGO_TEXT } from '@assets/logos';
import { useScrollProgress } from '@hooks/useScrollProgress';
import SearchBar from './SearchBar';
import NavCategoryMenu from './NavCategoryMenu';
import NavBrandMenu from './NavBrandMenu';
import NavPromoStrip from './NavPromoStrip';
import { cn } from '@utils/cn';

// Detect macOS once at module scope so the keyboard hint reads `⌘K`,
// not `Ctrl K`. Falls back to a generic label for other platforms.
const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');

// Main row keeps only the mega-menu triggers + the flagship builder
// route — Categories already links to the products list inside its
// mega-menu, so a separate top-level Products link would be redundant.
const navItems = [
  { to: null, label: 'Categories', mega: 'categories' },
  { to: null, label: 'Brands', mega: 'brands' },
  { to: paths.pcBuilder(), label: 'PC Builder' },
];

const ROLE_BADGE = {
  customer: { letter: 'C', className: 'bg-success text-surface-50' },
  vendor: { letter: 'V', className: 'bg-warning text-primary-900' },
  admin: { letter: 'A', className: 'bg-danger text-surface-50' },
};

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isSearchRoute = location.pathname.startsWith(paths.search());
  const activeQuery = isSearchRoute ? searchParams.get('q') || '' : '';

  const { isAuthenticated, role, user, logout } = useAuthStore();
  const cartCount = useCartStore((s) => s.itemCount());
  const wishlistCount = useWishlistStore((s) => s.count());
  const { isMobileNavOpen, toggleMobileNav, closeMobileNav, toggleCartDrawer } =
    useUIStore();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [openMega, setOpenMega] = useState(null); // 'categories' | 'brands' | null

  const accountRef = useRef(null);
  const closeTimer = useRef(null);

  const scrollProgress = useScrollProgress();

  useEffect(() => {
    closeMobileNav();
    setOpenMega(null);
    setAccountMenuOpen(false);
    setMobileSearchOpen(false);
  }, [location.pathname, closeMobileNav]);

  // Click-outside to dismiss the account dropdown.
  useEffect(() => {
    if (!accountMenuOpen) return undefined;
    const onDocClick = (e) => {
      if (accountRef.current && !accountRef.current.contains(e.target)) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [accountMenuOpen]);

  // ⌘K / Ctrl+K focuses the search bar.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.getElementById('navbar-search-input')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openMegaDebounced = (kind) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpenMega(kind);
  };
  const scheduleMegaClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpenMega(null), 120);
  };

  const onLogout = async () => {
    await logout();
    setAccountMenuOpen(false);
    navigate(paths.home());
  };

  const roleBadge = ROLE_BADGE[role];

  return (
    <header
      className={cn(
        'sticky top-0 z-40 text-text-inverse shadow-sm',
        'bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700',
        // Subtle accent halo on the bottom edge — keeps the chrome
        // on-brand without screaming.
        'ring-1 ring-inset ring-accent-500/20'
      )}
    >
      <div className="mx-auto flex h-20 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:gap-4 lg:px-8">
        <button
          type="button"
          className="rounded-md p-2 text-text-inverse/80 hover:bg-primary-700/60 hover:text-text-inverse md:hidden"
          onClick={toggleMobileNav}
          aria-label="Toggle navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Logo — gradient ring + animated online dot */}
        <Link
          to={paths.home()}
          className="group flex items-center gap-2.5 font-heading text-xl font-bold tracking-tight text-text-inverse"
        >
          <span className="relative grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-accent-500 to-accent-700 text-primary-900 shadow-md shadow-accent-500/30 transition group-hover:shadow-lg group-hover:shadow-accent-500/40">
            <Cpu className="h-4 w-4" />
            <span
              aria-hidden="true"
              className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-success ring-2 ring-primary-800"
            />
          </span>
          <span className="bg-gradient-to-r from-text-inverse to-accent-300 bg-clip-text text-transparent">
            {PCCRAFT_LOGO_TEXT}
          </span>
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-1 md:flex">
          {navItems.map((item) => {
            if (item.mega) {
              const isOpen = openMega === item.mega;
              return (
                <div
                  key={item.label}
                  className="relative"
                  onMouseEnter={() => openMegaDebounced(item.mega)}
                  onMouseLeave={scheduleMegaClose}
                  onFocus={() => openMegaDebounced(item.mega)}
                  onBlur={scheduleMegaClose}
                >
                  <button
                    type="button"
                    aria-haspopup="true"
                    aria-expanded={isOpen}
                    className={cn(
                      'flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition',
                      isOpen
                        ? 'bg-primary-700/60 text-accent-300'
                        : 'text-text-inverse/80 hover:bg-primary-700/40 hover:text-text-inverse'
                    )}
                  >
                    {item.label}
                    <Flame
                      className={cn(
                        'h-3.5 w-3.5 transition',
                        isOpen ? 'rotate-180 text-accent-300' : 'text-text-inverse/60'
                      )}
                    />
                  </button>
                  {isOpen && item.mega === 'categories' && (
                    <NavCategoryMenu onClose={() => setOpenMega(null)} />
                  )}
                  {isOpen && item.mega === 'brands' && (
                    <NavBrandMenu onClose={() => setOpenMega(null)} />
                  )}
                </div>
              );
            }
            return (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.to === paths.home()}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-2 text-sm font-medium transition',
                    isActive
                      ? 'bg-primary-700/60 text-accent-300'
                      : 'text-text-inverse/80 hover:bg-primary-700/40 hover:text-text-inverse'
                  )
                }
              >
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        {/* Search bar — slightly wider so the submit button never gets
            clipped, with the keyboard hint rendered as a sibling chip
            so it never overlaps the form. */}
        <div className="ml-auto hidden w-80 items-center gap-2 lg:flex xl:w-[26rem]">
          <div className="flex-1">
            <SearchBar initialQuery={activeQuery} />
          </div>
          <kbd
            aria-hidden="true"
            className="hidden select-none items-center gap-0.5 rounded border border-accent-500/30 bg-primary-900/50 px-1.5 py-1 text-[10px] font-semibold text-text-inverse/70 xl:inline-flex"
          >
            <Command className="h-3 w-3" />
            {IS_MAC ? 'K' : 'K'}
          </kbd>
        </div>

        <div className="ml-auto flex items-center gap-1 sm:gap-2 lg:ml-2">
          <button
            type="button"
            onClick={() => setMobileSearchOpen((v) => !v)}
            className="grid h-9 w-9 place-items-center rounded-md text-text-inverse/80 hover:bg-primary-700/60 hover:text-text-inverse lg:hidden"
            aria-label="Toggle search"
            aria-expanded={mobileSearchOpen}
          >
            {mobileSearchOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <SearchIcon className="h-5 w-5" />
            )}
          </button>

          {isAuthenticated && (
            <Link
              to={paths.wishlist()}
              className="relative rounded-md p-2 text-text-inverse/80 transition hover:bg-primary-700/60 hover:text-text-inverse"
              aria-label="Wishlist"
            >
              <Heart className="h-5 w-5" />
              {wishlistCount > 0 && (
                <span
                  className={cn(
                    'absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold text-primary-900',
                    'bg-accent-500 shadow shadow-accent-500/40',
                    wishlistCount > 0 && 'animate-pulse'
                  )}
                >
                  {wishlistCount}
                </span>
              )}
            </Link>
          )}

          <button
            type="button"
            onClick={toggleCartDrawer}
            className="relative rounded-md p-2 text-text-inverse/80 transition hover:bg-primary-700/60 hover:text-text-inverse"
            aria-label="Open cart"
          >
            <ShoppingCart className="h-5 w-5" />
            {cartCount > 0 && (
              <span
                className={cn(
                  'absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold text-primary-900',
                  'bg-accent-500 shadow shadow-accent-500/40',
                  cartCount > 0 && 'animate-pulse'
                )}
              >
                {cartCount}
              </span>
            )}
          </button>

          {isAuthenticated ? (
            <div className="relative" ref={accountRef}>
              <button
                type="button"
                onClick={() => setAccountMenuOpen((v) => !v)}
                aria-haspopup="true"
                aria-expanded={accountMenuOpen}
                className="flex items-center gap-2 rounded-md bg-primary-700/70 px-2 py-1.5 text-sm font-medium text-text-inverse transition hover:bg-primary-700"
              >
                <span className="relative grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-accent-500 to-accent-700 text-xs font-bold text-primary-900">
                  {(user?.full_name?.[0] || user?.username?.[0] || 'U').toUpperCase()}
                  {roleBadge && (
                    <span
                      title={role}
                      className={cn(
                        'absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full text-[9px] font-extrabold ring-2 ring-primary-800',
                        roleBadge.className
                      )}
                    >
                      {roleBadge.letter}
                    </span>
                  )}
                </span>
                <span className="hidden sm:inline">
                  {user?.full_name?.split(' ')[0] || 'Account'}
                </span>
              </button>
              {accountMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-surface-200 bg-surface-50 text-text-primary shadow-2xl shadow-primary-900/30 ring-1 ring-primary-900/5"
                >
                  <div className="border-b border-surface-200 bg-gradient-to-br from-surface-50 to-surface-100 px-4 py-3">
                    <p className="truncate text-sm font-semibold">
                      {user?.full_name || user?.username || 'Account'}
                    </p>
                    <p className="truncate text-xs text-text-secondary">
                      {user?.email}
                    </p>
                  </div>
                  {role === 'customer' && (
                    <>
                      <Link
                        to={paths.profile()}
                        className="flex items-center gap-2 px-4 py-2 text-sm transition hover:bg-surface-100"
                        onClick={() => setAccountMenuOpen(false)}
                      >
                        <User className="h-4 w-4" /> Profile
                      </Link>
                      <Link
                        to={paths.orders()}
                        className="flex items-center gap-2 px-4 py-2 text-sm transition hover:bg-surface-100"
                        onClick={() => setAccountMenuOpen(false)}
                      >
                        <Package className="h-4 w-4" /> My Orders
                      </Link>
                    </>
                  )}
                  {role === 'vendor' && (
                    <>
                      <Link
                        to={paths.vendorDashboard()}
                        className="flex items-center gap-2 px-4 py-2 text-sm transition hover:bg-surface-100"
                        onClick={() => setAccountMenuOpen(false)}
                      >
                        <Store className="h-4 w-4" /> Vendor Dashboard
                      </Link>
                      <Link
                        to={paths.vendorReturns()}
                        className="flex items-center gap-2 px-4 py-2 text-sm transition hover:bg-surface-100"
                        onClick={() => setAccountMenuOpen(false)}
                      >
                        <Undo2 className="h-4 w-4" /> Vendor Returns
                      </Link>
                    </>
                  )}
                  {role === 'admin' && (
                    <>
                      <Link
                        to={paths.adminDashboard()}
                        className="flex items-center gap-2 px-4 py-2 text-sm transition hover:bg-surface-100"
                        onClick={() => setAccountMenuOpen(false)}
                      >
                        <Shield className="h-4 w-4" /> Admin Panel
                      </Link>
                      <Link
                        to={paths.adminReviews()}
                        className="flex items-center gap-2 px-4 py-2 text-sm transition hover:bg-surface-100"
                        onClick={() => setAccountMenuOpen(false)}
                      >
                        <Star className="h-4 w-4" /> Review moderation
                      </Link>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={onLogout}
                    className="flex w-full items-center gap-2 border-t border-surface-200 px-4 py-2 text-left text-sm text-danger transition hover:bg-danger/5"
                  >
                    <LogOut className="h-4 w-4" /> Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to={paths.login()}
                className="hidden rounded-md px-3 py-2 text-sm font-medium text-text-inverse/80 transition hover:text-text-inverse sm:block"
              >
                Login
              </Link>
              <Link
                to={paths.register()}
                className="rounded-md bg-accent-500 px-3 py-2 text-sm font-semibold text-primary-900 shadow-sm shadow-accent-500/30 transition hover:bg-accent-400 hover:shadow-md hover:shadow-accent-500/40"
              >
                Sign up
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Moving news strip — replaces the duplicated category quick-bar.
          Live deals + rotating promos + trust stats. See NavPromoStrip.jsx. */}
      <NavPromoStrip />

      {mobileSearchOpen && (
        <div className="border-t border-accent-500/10 bg-primary-900/40 px-4 py-3 lg:hidden">
          <SearchBar
            initialQuery={activeQuery}
            onSubmit={() => setMobileSearchOpen(false)}
            autoFocus
          />
        </div>
      )}

      {isMobileNavOpen && (
        <nav className="border-t border-accent-500/10 bg-primary-900/60 md:hidden">
          <div className="space-y-1 px-4 py-3">
            {navItems.map((item) => (
              <NavLink
                key={item.label}
                to={item.to ?? paths.products()}
                className={({ isActive }) =>
                  cn(
                    'block rounded-md px-3 py-2 text-sm font-medium transition',
                    isActive
                      ? 'bg-primary-700/60 text-accent-300'
                      : 'text-text-inverse/80 hover:bg-primary-700/40 hover:text-text-inverse'
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}

      {/* Scroll-progress gradient bar */}
      <div
        aria-hidden="true"
        className="pointer-events-none h-0.5 w-full overflow-hidden bg-accent-500/0"
      >
        <div
          className="h-full origin-left bg-gradient-to-r from-accent-400 via-accent-500 to-accent-300 shadow-[0_0_8px_rgba(99,102,241,0.6)] transition-[width] duration-100 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, scrollProgress * 100))}%` }}
        />
      </div>
    </header>
  );
};

export default Navbar;
