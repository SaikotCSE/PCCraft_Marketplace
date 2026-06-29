// AdminShell — shared chrome for every /admin/* route.
//
// Mounted by AppRouter as the layout route for the admin section; renders
// a persistent sidebar with nav links to every admin surface and an
// <Outlet /> on the right for the active page. Auth is already enforced
// by ProtectedRoute; this layer focuses on navigation + visual frame.
//
// Sidebar link groups:
//   - Overview : Dashboard
//   - Catalog  : Products · Brands · Categories
//   - People   : Users · Vendors
//   - Commerce : Orders · Returns · Reviews
import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  Tags,
  FolderTree,
  Users,
  Store,
  ShoppingBag,
  Undo2,
  Star,
} from 'lucide-react';

import { cn } from '@/utils/cn';
import { paths, ROUTES } from '@/routes/routePaths';

/**
 * Single source of truth for the sidebar. Each entry renders an icon,
 * label, and the path helper that resolves the URL — keeping the
 * router-driven paths and the visual nav in lockstep.
 */
const NAV_GROUPS = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, to: paths.adminDashboard() },
    ],
  },
  {
    title: 'Catalog',
    items: [
      { label: 'Products', icon: Package, to: paths.adminProducts() },
      { label: 'Brands', icon: Tags, to: paths.adminBrands() },
      { label: 'Categories', icon: FolderTree, to: paths.adminCategories() },
    ],
  },
  {
    title: 'People',
    items: [
      { label: 'Users', icon: Users, to: paths.adminUsers() },
      { label: 'Vendors', icon: Store, to: paths.adminVendors() },
    ],
  },
  {
    title: 'Commerce',
    items: [
      { label: 'Orders', icon: ShoppingBag, to: paths.adminOrders() },
      { label: 'Returns', icon: Undo2, to: paths.adminReturns() },
      { label: 'Reviews', icon: Star, to: paths.adminReviews() },
    ],
  },
];

/** Sidebar link — NavLink with active-state styling. */
const SidebarLink = ({ to, label, icon: Icon }) => (
  <NavLink
    to={to}
    end={to === ROUTES.ADMIN.DASHBOARD}
    className={({ isActive }) =>
      cn(
        'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        isActive
          ? 'bg-accent-500/15 text-accent-700'
          : 'text-text-secondary hover:bg-surface-100 hover:text-text-primary',
      )
    }
  >
    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
    <span className="truncate">{label}</span>
  </NavLink>
);

const AdminShell = () => (
  <div className="mx-auto flex w-full max-w-screen-2xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
    {/* Sidebar */}
    <aside className="sticky top-20 hidden h-[calc(100vh-6rem)] w-60 shrink-0 overflow-y-auto rounded-xl border border-surface-200 bg-surface-50 p-4 shadow-sm md:block">
      <div className="mb-4 px-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-text-secondary">
          Admin console
        </p>
        <h2 className="mt-1 font-heading text-base font-semibold text-text-primary">
          Operations
        </h2>
      </div>
      <nav className="space-y-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-text-secondary">
              {group.title}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <SidebarLink key={item.to} {...item} />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>

    {/* Mobile horizontal nav — visible only on small screens */}
    <div className="mb-4 flex w-full gap-1.5 overflow-x-auto rounded-xl border border-surface-200 bg-surface-50 p-2 md:hidden">
      {NAV_GROUPS.flatMap((g) => g.items).map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === ROUTES.ADMIN.DASHBOARD}
          className={({ isActive }) =>
            cn(
              'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              isActive
                ? 'bg-accent-500/15 text-accent-700'
                : 'text-text-secondary hover:bg-surface-100 hover:text-text-primary',
            )
          }
        >
          <item.icon className="h-3.5 w-3.5" aria-hidden="true" />
          {item.label}
        </NavLink>
      ))}
    </div>

    {/* Page area */}
    <section className="min-w-0 flex-1">
      <Outlet />
    </section>
  </div>
);

export default AdminShell;
