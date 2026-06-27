// Navbar — top navigation bar.
//
// Per spec §1.4: chrome on primary-800, accent CTA on accent-500,
// sticky on scroll. Logo on the left, category nav in the middle,
// search + cart + auth menu on the right. Collapses to a hamburger on
// <md.
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  ShoppingCart,
  Heart,
  User,
  Search,
  Menu,
  LogOut,
  Package,
  Shield,
  Store,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { paths } from '@routes/routePaths';
import { useAuthStore } from '@context/useAuthStore';
import { useCartStore } from '@context/useCartStore';
import { useWishlistStore } from '@context/useWishlistStore';
import { useUIStore } from '@context/useUIStore';
import { PCCRAFT_LOGO_TEXT } from '@assets/logos';

const navItems = [
  { to: paths.products(), label: 'Products' },
  { to: paths.categories(), label: 'Categories' },
  { to: paths.brands(), label: 'Brands' },
  { to: paths.pcBuilder(), label: 'PC Builder' },
];

const Navbar = () => {
  const navigate = useNavigate();
  const { isAuthenticated, role, user, logout } = useAuthStore();
  const cartCount = useCartStore((s) => s.itemCount());
  const wishlistCount = useWishlistStore((s) => s.count());
  const { isMobileNavOpen, toggleMobileNav, closeMobileNav, toggleSearch } = useUIStore();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  // Close the mobile nav whenever the route changes.
  useEffect(() => {
    closeMobileNav();
  }, [navigate, closeMobileNav]);

  const onLogout = async () => {
    await logout();
    setAccountMenuOpen(false);
    navigate(paths.home());
  };

  return (
    <header className="sticky top-0 z-40 border-b border-primary-900/10 bg-primary-800 text-text-inverse shadow-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          className="rounded-md p-2 text-text-inverse hover:bg-primary-700 md:hidden"
          onClick={toggleMobileNav}
          aria-label="Toggle navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        <Link to={paths.home()} className="flex items-center gap-2 font-heading text-xl font-bold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-accent-500 text-primary-900">
            PC
          </span>
          <span>{PCCRAFT_LOGO_TEXT}</span>
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-6 md:flex">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-primary-700 text-accent-300'
                    : 'text-text-inverse/80 hover:text-text-inverse'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={toggleSearch}
            className="rounded-md p-2 text-text-inverse/80 hover:text-text-inverse"
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
          </button>

          {isAuthenticated && (
            <Link
              to={paths.wishlist()}
              className="relative rounded-md p-2 text-text-inverse/80 hover:text-text-inverse"
              aria-label="Wishlist"
            >
              <Heart className="h-5 w-5" />
              {wishlistCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent-500 px-1 text-[10px] font-bold text-primary-900">
                  {wishlistCount}
                </span>
              )}
            </Link>
          )}

          <Link
            to={paths.cart()}
            className="relative rounded-md p-2 text-text-inverse/80 hover:text-text-inverse"
            aria-label="Cart"
          >
            <ShoppingCart className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent-500 px-1 text-[10px] font-bold text-primary-900">
                {cartCount}
              </span>
            )}
          </Link>

          {isAuthenticated ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setAccountMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-md bg-primary-700 px-3 py-2 text-sm font-medium text-text-inverse hover:bg-primary-900"
              >
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">{user?.full_name?.split(' ')[0] || 'Account'}</span>
              </button>
              {accountMenuOpen && (
                <div
                  className="absolute right-0 mt-2 w-48 overflow-hidden rounded-md border border-surface-200 bg-surface-50 text-text-primary shadow-lg"
                  onMouseLeave={() => setAccountMenuOpen(false)}
                >
                  {role === 'customer' && (
                    <>
                      <Link
                        to={paths.profile()}
                        className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-surface-100"
                        onClick={() => setAccountMenuOpen(false)}
                      >
                        <User className="h-4 w-4" /> Profile
                      </Link>
                      <Link
                        to={paths.orders()}
                        className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-surface-100"
                        onClick={() => setAccountMenuOpen(false)}
                      >
                        <Package className="h-4 w-4" /> My Orders
                      </Link>
                    </>
                  )}
                  {role === 'vendor' && (
                    <Link
                      to={paths.vendorDashboard()}
                      className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-surface-100"
                      onClick={() => setAccountMenuOpen(false)}
                    >
                      <Store className="h-4 w-4" /> Vendor Dashboard
                    </Link>
                  )}
                  {role === 'admin' && (
                    <Link
                      to={paths.adminDashboard()}
                      className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-surface-100"
                      onClick={() => setAccountMenuOpen(false)}
                    >
                      <Shield className="h-4 w-4" /> Admin Panel
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={onLogout}
                    className="flex w-full items-center gap-2 border-t border-surface-200 px-4 py-2 text-left text-sm text-danger hover:bg-surface-100"
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
                className="hidden rounded-md px-3 py-2 text-sm font-medium text-text-inverse/80 hover:text-text-inverse sm:block"
              >
                Login
              </Link>
              <Link
                to={paths.register()}
                className="rounded-md bg-accent-500 px-3 py-2 text-sm font-semibold text-primary-900 hover:bg-accent-400"
              >
                Sign up
              </Link>
            </div>
          )}
        </div>
      </div>

      {isMobileNavOpen && (
        <nav className="border-t border-primary-900/10 bg-primary-800 md:hidden">
          <div className="space-y-1 px-4 py-3">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `block rounded-md px-3 py-2 text-sm font-medium ${
                    isActive ? 'bg-primary-700 text-accent-300' : 'text-text-inverse/80'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
};

export default Navbar;
