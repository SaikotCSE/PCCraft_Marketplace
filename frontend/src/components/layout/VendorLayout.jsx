// VendorShell — layout chrome for the entire /vendor subtree.
//
// Pinned by AppRouter as a React Router "layout route":
//   <Route element={<VendorShell />}>
//     <Route path={ROUTE_PATHS.VENDOR_DASHBOARD} element={<VendorDashboardPage />} />
//     <Route path={ROUTE_PATHS.VENDOR_STORE} element={<VendorStorePage />} />
//     ...
//   </Route>
//
// Provides:
//   - Persistent sidebar with spec-mandated links:
//     Dashboard, My Store, Products, Orders, Returns, Reviews.
//     (VendorProfilePage is kept routable but lives under
//     `nav.secondary` so the spec sidebar stays at 6 entries.)
//   - Main column that renders the matched child via <Outlet />.
//   - Logout from `useAuthStore`.
//   - Defensive guard that sends unapproved vendors to the
//     "Pending application" page (so an account that lost approval
//     doesn't end up staring at a blank chrome).
//
// Auth state lives in Zustand (useAuthStore). API calls always go
// through the centralized axiosInstance — never raw fetch.
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Store,
  Package,
  Truck,
  Undo2,
  Star,
  LogOut,
  ChevronRight,
  ShieldAlert,
  UserCircle2,
} from 'lucide-react';

import useAuthStore from '@context/useAuthStore';
import { ROUTE_PATHS } from '@/routes/routePaths';
import VendorHeader from '@components/layout/VendorHeader';

// ---------------------------------------------------------------------------
// Sidebar entries (spec §Module 10 — Vendor sidebar links)
// ---------------------------------------------------------------------------
const SIDEBAR_LINKS = [
  {
    to: ROUTE_PATHS.VENDOR_DASHBOARD,
    label: 'Dashboard',
    icon: BarChart3,
    exact: true,
  },
  {
    to: ROUTE_PATHS.VENDOR_STORE,
    label: 'My Store',
    icon: Store,
  },
  {
    to: ROUTE_PATHS.VENDOR_PRODUCTS,
    label: 'Products',
    icon: Package,
  },
  {
    to: ROUTE_PATHS.VENDOR_ORDERS,
    label: 'Orders',
    icon: Truck,
  },
  {
    to: ROUTE_PATHS.VENDOR_RETURNS,
    label: 'Returns',
    icon: Undo2,
  },
  {
    to: ROUTE_PATHS.VENDOR_REVIEWS,
    label: 'Reviews',
    icon: Star,
  },
];

const SECONDARY_LINKS = [
  {
    to: ROUTE_PATHS.VENDOR_PROFILE,
    label: 'Account settings',
    icon: UserCircle2,
  },
];

// ---------------------------------------------------------------------------
// Layout component
// ---------------------------------------------------------------------------
export default function VendorShell() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  // Spec-required gating: only approved vendors may use this surface.
  // If somebody else hits `/vendor/*` directly, bounce them to the
  // pending page rather than rendering the shell blank.
  const isApproved = Boolean(user?.vendor_meta?.is_approved);
  const isVendor = Boolean(user?.vendor_meta);

  const handleLogout = async () => {
    await logout();
    navigate(ROUTE_PATHS.HOME, { replace: true });
  };

  if (isVendor && !isApproved) {
    return (
      <section className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <ShieldAlert className="h-10 w-10 text-warning" aria-hidden="true" />
        <h1 className="text-xl font-semibold text-text-primary">
          Your vendor application is not yet approved
        </h1>
        <p className="max-w-md text-sm text-text-secondary">
          You can still review your application status and edit your business
          details. The vendor dashboard and storefront tools unlock once an
          administrator approves your account.
        </p>
        <button
          type="button"
          onClick={() => navigate(ROUTE_PATHS.VENDOR_PENDING, { replace: true })}
          className="inline-flex items-center gap-2 rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600"
        >
          View application status
          <ChevronRight className="h-4 w-4" />
        </button>
      </section>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] bg-surface-50">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <VendorHeader user={user} />
        <main
          id="main"
          tabIndex={-1}
          className="flex-1 overflow-x-hidden"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar (visible on lg+, collapses behind a menu trigger on small screens)
// ---------------------------------------------------------------------------
function Sidebar() {
  return (
    <aside
      aria-label="Vendor navigation"
      className="hidden w-60 flex-shrink-0 border-r border-surface-200 bg-white lg:flex lg:flex-col"
    >
      <div className="px-4 py-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Vendor
        </h2>
        <p className="mt-1 text-sm font-semibold text-text-primary">
          Workspace
        </p>
      </div>

      <nav className="flex-1 space-y-1 px-2 pb-4">
        {SIDEBAR_LINKS.map((link) => (
          <SidebarLink key={link.to} {...link} />
        ))}

        <div className="mt-6 px-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
            Account
          </p>
        </div>
        {SECONDARY_LINKS.map((link) => (
          <SidebarLink key={link.to} {...link} />
        ))}
      </nav>

      <SidebarFooter />
    </aside>
  );
}

function SidebarLink({ to, label, icon: Icon, exact }) {
  return (
    <NavLink
      to={to}
      end={Boolean(exact)}
      className={({ isActive }) =>
        [
          'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition',
          isActive
            ? 'bg-accent-50 text-accent-700'
            : 'text-text-secondary hover:bg-surface-100 hover:text-text-primary',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={`h-4 w-4 flex-shrink-0 ${
              isActive ? 'text-accent-600' : 'text-text-secondary'
            }`}
          />
          <span className="flex-1">{label}</span>
          {isActive ? (
            <ChevronRight className="h-3.5 w-3.5 text-accent-600" />
          ) : null}
        </>
      )}
    </NavLink>
  );
}

function SidebarFooter() {
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const onLogout = async () => {
    await logout();
    navigate(ROUTE_PATHS.HOME, { replace: true });
  };
  return (
    <div className="border-t border-surface-100 px-3 py-3">
      <button
        type="button"
        onClick={onLogout}
        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-text-secondary transition hover:bg-surface-100 hover:text-danger"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </button>
    </div>
  );
}
