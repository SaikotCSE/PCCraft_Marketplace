// ProtectedRoute — auth + role gate.
//
// Usage in the route tree:
//   <Route element={<ProtectedRoute roles={['customer']} />}>
//     <Route path={paths.checkout()} element={<CheckoutPage />} />
//   </Route>
//
// Behavior:
//   - Not logged in → redirect to /login with `next` query param so we
//     can come back here after login.
//   - Logged in but role not in `roles` → redirect to /403 (we use the
//     404 page until the spec adds a dedicated forbidden page).
//   - Vendor users whose account is `pending` → redirect to a holding
//     page so they can't sneak into the dashboard before approval.
//   - Otherwise render <Outlet />.
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuthStore } from '@context/useAuthStore';
import { ROUTE_PATHS } from '@routes/routePaths';

const ProtectedRoute = ({ roles, requireVerified = false }) => {
  const location = useLocation();
  const { isAuthenticated, role, user } = useAuthStore();

  if (!isAuthenticated) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`${ROUTE_PATHS.LOGIN}?next=${next}`} replace />;
  }

  if (roles && roles.length > 0 && !roles.includes(role)) {
    return <Navigate to={ROUTE_PATHS.HOME} replace />;
  }

  if (requireVerified && !user?.is_verified) {
    return <Navigate to={ROUTE_PATHS.PROFILE} replace />;
  }

  // Vendor holding page: pending vendors can't reach their dashboard.
  if (role === 'vendor' && user?.vendor_status === 'pending') {
    return <Navigate to={ROUTE_PATHS.HOME} replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
