// AppRouter — React Router v7 route definitions for the whole app.
//
// We use `createBrowserRouter` + `<RouterProvider>` (the data-router API)
// because:
//   1. react-router v7 (which is what we installed) treats this as the
//      default. The legacy `<BrowserRouter><Routes>...` form still
//      works but loses future-loader / lazy-route support.
//   2. Lazy chunking per route keeps the initial JS bundle small.
//
// Each route element is wrapped in <AppLayout> so Navbar/Footer wrap
// every page. Auth-only routes sit behind <ProtectedRoute roles=...>.
import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import AppLayout from '@components/layout/AppLayout';
import AdminShell from '@components/layout/AdminLayout';
import VendorShell from '@components/layout/VendorLayout';
import ErrorBoundary from '@components/common/ErrorBoundary';
import ProtectedRoute from '@routes/ProtectedRoute';
import { ROUTE_PATHS } from '@routes/routePaths';

// Lazy-loaded pages. Each is in its own chunk; the placeholder pages
// only ship once the user navigates to them.
const HomePage = lazy(() => import('@pages/Home/HomePage'));
const LoginPage = lazy(() => import('@pages/Login/LoginPage'));
const RegisterPage = lazy(() => import('@pages/Register/RegisterPage'));
const CustomerRegisterPage = lazy(() => import('@pages/Register/CustomerRegisterPage'));
const VendorRegisterPage = lazy(() => import('@pages/Vendor/VendorRegisterPage'));
const VendorPendingPage = lazy(() => import('@pages/Vendor/VendorPendingPage'));
const ForgotPasswordPage = lazy(() => import('@pages/Login/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@pages/Login/ResetPasswordPage'));

const ShopPage = lazy(() => import('@pages/Products/ShopPage'));
const ProductDetailPage = lazy(() => import('@pages/ProductDetails/ProductDetailPage'));
const CategoriesPage = lazy(() => import('@pages/Categories/CategoriesPage'));
const CategoryDetailPage = lazy(() => import('@pages/Categories/CategoryDetailPage'));
const BrandsPage = lazy(() => import('@pages/Categories/BrandsPage'));
const BrandDetailPage = lazy(() => import('@pages/Categories/BrandDetailPage'));
const SearchPage = lazy(() => import('@pages/Search/SearchResultsPage'));
const PCBuilderPage = lazy(() => import('@pages/PCBuilder/PCBuilderPage'));
const MyBuildsPage = lazy(() => import('@pages/MyBuilds/MyBuildsPage'));
const SharedBuildPage = lazy(() => import('@pages/SharedBuild/SharedBuildPage'));

const CartPage = lazy(() => import('@pages/Cart/CartPage'));
const WishlistPage = lazy(() => import('@pages/Wishlist/WishlistPage'));
const CheckoutPage = lazy(() => import('@pages/Checkout/CheckoutPage'));
const OrdersPage = lazy(() => import('@pages/Orders/OrdersPage'));
const OrderDetailPage = lazy(() => import('@pages/Orders/OrderDetailPage'));
const ReturnsPage = lazy(() => import('@pages/Orders/ReturnsPage'));
const ReturnStatusPage = lazy(() => import('@pages/Orders/ReturnStatusPage'));
const ProfilePage = lazy(() => import('@pages/Profile/ProfilePage'));

const VendorDashboardPage = lazy(() => import('@pages/Vendor/VendorDashboardPage'));
const VendorProductsPage = lazy(() => import('@pages/Vendor/VendorProductsPage'));
const VendorProductFormPage = lazy(() => import('@pages/Vendor/VendorProductFormPage'));
const VendorOrdersPage = lazy(() => import('@pages/Vendor/VendorOrdersPage'));
const VendorReturnsPage = lazy(() => import('@pages/Vendor/VendorReturnsPage'));
const VendorProfilePage = lazy(() => import('@pages/Vendor/VendorProfilePage'));
const VendorPublicPage = lazy(() => import('@pages/Vendor/VendorPublicPage'));
const VendorStorePage = lazy(() => import('@pages/Vendor/VendorStorePage'));
const VendorReviewsPage = lazy(() => import('@pages/Vendor/VendorReviewsPage'));

const AdminDashboardPage = lazy(() => import('@pages/Admin/AdminDashboardPage'));
const AdminVendorsPage = lazy(() => import('@pages/Admin/AdminVendorsPage'));
const AdminUsersPage = lazy(() => import('@pages/Admin/AdminUsersPage'));
const AdminOrdersPage = lazy(() => import('@pages/Admin/AdminOrdersPage'));
const AdminReturnsPage = lazy(() => import('@pages/Admin/AdminReturnsPage'));
const AdminReviewsPage = lazy(() => import('@pages/Admin/AdminReviewsPage'));
const AdminProductsListPage = lazy(() => import('@pages/Admin/AdminProductsListPage'));
const AdminBrandsListPage = lazy(() => import('@pages/Admin/AdminBrandsListPage'));
const AdminBrandFormPage = lazy(() => import('@pages/Admin/AdminBrandFormPage'));
const AdminCategoriesListPage = lazy(() => import('@pages/Admin/AdminCategoriesListPage'));
const AdminCategoryFormPage = lazy(() => import('@pages/Admin/AdminCategoryFormPage'));

const NotFoundPage = lazy(() => import('@pages/NotFound/NotFoundPage'));

const PageFallback = () => (
  <div className="flex min-h-[60vh] items-center justify-center text-text-secondary">
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-accent-400 border-t-transparent" />
  </div>
);

const withSuspense = (Component) => (
  <ErrorBoundary scope="page">
    <Suspense fallback={<PageFallback />}>
      <Component />
    </Suspense>
  </ErrorBoundary>
);

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      // ----- public -----
      { path: ROUTE_PATHS.HOME, element: withSuspense(HomePage) },
      { path: ROUTE_PATHS.LOGIN, element: withSuspense(LoginPage) },
      { path: ROUTE_PATHS.REGISTER, element: withSuspense(RegisterPage) },
      { path: ROUTE_PATHS.REGISTER_CUSTOMER, element: withSuspense(CustomerRegisterPage) },
      { path: ROUTE_PATHS.REGISTER_VENDOR, element: withSuspense(VendorRegisterPage) },
      { path: ROUTE_PATHS.FORGOT_PASSWORD, element: withSuspense(ForgotPasswordPage) },
      { path: ROUTE_PATHS.VENDOR_PENDING, element: withSuspense(VendorPendingPage) },
      { path: ROUTE_PATHS.RESET_PASSWORD, element: withSuspense(ResetPasswordPage) },

      { path: ROUTE_PATHS.PRODUCTS, element: withSuspense(ShopPage) },
      { path: ROUTE_PATHS.PRODUCT_DETAIL, element: withSuspense(ProductDetailPage) },
      { path: ROUTE_PATHS.CATEGORIES, element: withSuspense(CategoriesPage) },
      { path: ROUTE_PATHS.CATEGORY_DETAIL, element: withSuspense(CategoryDetailPage) },
      { path: ROUTE_PATHS.BRANDS, element: withSuspense(BrandsPage) },
      { path: ROUTE_PATHS.BRAND_DETAIL, element: withSuspense(BrandDetailPage) },
      { path: ROUTE_PATHS.SEARCH, element: withSuspense(SearchPage) },
      { path: ROUTE_PATHS.PC_BUILDER, element: withSuspense(PCBuilderPage) },
      { path: ROUTE_PATHS.SHARED_BUILD, element: withSuspense(SharedBuildPage) },

      { path: ROUTE_PATHS.CART, element: withSuspense(CartPage) },
      { path: ROUTE_PATHS.WISHLIST, element: withSuspense(WishlistPage) },

      // ----- authenticated customer -----
      {
        element: <ProtectedRoute roles={['customer', 'admin']} />,
        children: [
          { path: ROUTE_PATHS.CHECKOUT, element: withSuspense(CheckoutPage) },
          { path: ROUTE_PATHS.ORDERS, element: withSuspense(OrdersPage) },
          { path: ROUTE_PATHS.ORDER_DETAIL, element: withSuspense(OrderDetailPage) },
          { path: ROUTE_PATHS.RETURNS, element: withSuspense(ReturnsPage) },
          { path: ROUTE_PATHS.RETURN_DETAIL, element: withSuspense(ReturnStatusPage) },
          { path: ROUTE_PATHS.PROFILE, element: withSuspense(ProfilePage) },
          { path: ROUTE_PATHS.MY_BUILDS, element: withSuspense(MyBuildsPage) },
        ],
      },

      // ----- vendor (also requires verified vendor status) -----
      // Wrap in <VendorShell /> so every vendor page shares the sidebar
      // and header chrome. Reviews and Store entries are wired here.
      {
        element: <ProtectedRoute roles={['vendor', 'admin']} requireVerified />,
        children: [
          {
            element: <VendorShell />,
            children: [
              { path: ROUTE_PATHS.VENDOR_DASHBOARD, element: withSuspense(VendorDashboardPage) },
              { path: ROUTE_PATHS.VENDOR_STORE, element: withSuspense(VendorStorePage) },
              { path: ROUTE_PATHS.VENDOR_PRODUCTS, element: withSuspense(VendorProductsPage) },
              { path: ROUTE_PATHS.VENDOR_PRODUCT_NEW, element: withSuspense(VendorProductFormPage) },
              { path: ROUTE_PATHS.VENDOR_PRODUCT_EDIT, element: withSuspense(VendorProductFormPage) },
              { path: ROUTE_PATHS.VENDOR_ORDERS, element: withSuspense(VendorOrdersPage) },
              { path: ROUTE_PATHS.VENDOR_RETURNS, element: withSuspense(VendorReturnsPage) },
              { path: ROUTE_PATHS.VENDOR_REVIEWS, element: withSuspense(VendorReviewsPage) },
              { path: ROUTE_PATHS.VENDOR_PROFILE, element: withSuspense(VendorProfilePage) },
            ],
          },
          { path: ROUTE_PATHS.VENDOR_PUBLIC, element: withSuspense(VendorPublicPage) },
        ],
      },

      // ----- admin (every admin route lives under <AdminShell />) -----
      {
        element: <ProtectedRoute roles={['admin']} />,
        children: [
          {
            element: <AdminShell />,
            children: [
              { path: ROUTE_PATHS.ADMIN_DASHBOARD, element: withSuspense(AdminDashboardPage) },
              { path: ROUTE_PATHS.ADMIN_VENDORS, element: withSuspense(AdminVendorsPage) },
              { path: ROUTE_PATHS.ADMIN_USERS, element: withSuspense(AdminUsersPage) },
              { path: ROUTE_PATHS.ADMIN_ORDERS, element: withSuspense(AdminOrdersPage) },
              { path: ROUTE_PATHS.ADMIN_RETURNS, element: withSuspense(AdminReturnsPage) },
              { path: ROUTE_PATHS.ADMIN_REVIEWS, element: withSuspense(AdminReviewsPage) },

              // Products (Module 9 — admin product moderation surface)
              { path: ROUTE_PATHS.ADMIN_PRODUCTS, element: withSuspense(AdminProductsListPage) },

              // Brands CRUD
              { path: ROUTE_PATHS.ADMIN_BRANDS, element: withSuspense(AdminBrandsListPage) },
              { path: ROUTE_PATHS.ADMIN_BRAND_NEW, element: withSuspense(AdminBrandFormPage) },
              { path: ROUTE_PATHS.ADMIN_BRAND_EDIT, element: withSuspense(AdminBrandFormPage) },

              // Categories CRUD
              { path: ROUTE_PATHS.ADMIN_CATEGORIES, element: withSuspense(AdminCategoriesListPage) },
              { path: ROUTE_PATHS.ADMIN_CATEGORY_NEW, element: withSuspense(AdminCategoryFormPage) },
              { path: ROUTE_PATHS.ADMIN_CATEGORY_EDIT, element: withSuspense(AdminCategoryFormPage) },
            ],
          },
        ],
      },

      // ----- explicit /not-found (programmatic navigation target) -----
      { path: ROUTE_PATHS.NOT_FOUND_LITERAL, element: withSuspense(NotFoundPage) },
      // ----- catch-all -----
      { path: ROUTE_PATHS.NOT_FOUND, element: withSuspense(NotFoundPage) },
    ],
  },
]);

const AppRouter = () => <RouterProvider router={router} />;

export default AppRouter;
