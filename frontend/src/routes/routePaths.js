// routePaths — canonical URL paths for the app.
//
// Centralizing these in one file means we never have to grep for
// "/login" or "/products/:slug" across the codebase. Every <Link to>,
// navigate(), and auth-redirect uses a constant from here.
//
// Path segments that contain dynamic params are exported as TEMPLATE
// STRINGS (e.g. PRODUCT_DETAIL = '/products/:slug') so the React Router
// v7 `path` prop accepts them verbatim. To build a concrete URL, use
// the matching helper below.

export const ROUTE_PATHS = Object.freeze({
  // ----- public -----
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  REGISTER_CUSTOMER: '/register/customer',
  REGISTER_VENDOR: '/register/vendor',
  VENDOR_PENDING: '/vendor/pending',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password/:uid/:token',
  PRODUCTS: '/products',
  PRODUCT_DETAIL: '/products/:slug',
  CATEGORIES: '/categories',
  CATEGORY_DETAIL: '/categories/:slug',
  BRANDS: '/brands',
  BRAND_DETAIL: '/brands/:slug',
  SEARCH: '/search',
  PC_BUILDER: '/pc-builder',

  // ----- cart + wishlist (anonymous-readable) -----
  CART: '/cart',
  WISHLIST: '/wishlist',

  // ----- authenticated customer -----
  CHECKOUT: '/checkout',
  ORDERS: '/orders',
  ORDER_DETAIL: '/orders/:orderNumber',
  RETURNS: '/returns',
  PROFILE: '/profile',

  // ----- vendor -----
  VENDOR_DASHBOARD: '/vendor',
  VENDOR_PRODUCTS: '/vendor/products',
  VENDOR_PRODUCT_NEW: '/vendor/products/new',
  VENDOR_PRODUCT_EDIT: '/vendor/products/:slug/edit',
  VENDOR_ORDERS: '/vendor/orders',
  VENDOR_PROFILE: '/vendor/profile',
  VENDOR_PUBLIC: '/vendors/:storeSlug',

  // ----- admin -----
  ADMIN_DASHBOARD: '/admin',
  ADMIN_VENDORS: '/admin/vendors',
  ADMIN_USERS: '/admin/users',
  ADMIN_ORDERS: '/admin/orders',
  ADMIN_RETURNS: '/admin/returns',

  // ----- fallbacks -----
  NOT_FOUND: '*',
});

/** Build a concrete URL from a template by substituting :params. */
export const buildPath = (template, params = {}) =>
  Object.entries(params).reduce(
    (acc, [key, value]) => acc.replace(`:${key}`, encodeURIComponent(String(value))),
    template
  );

export const paths = {
  home: () => ROUTE_PATHS.HOME,
  login: () => ROUTE_PATHS.LOGIN,
  register: () => ROUTE_PATHS.REGISTER,
  registerVendor: () => ROUTE_PATHS.REGISTER_VENDOR,
  forgotPassword: () => ROUTE_PATHS.FORGOT_PASSWORD,
  resetPassword: (uid, token) => buildPath(ROUTE_PATHS.RESET_PASSWORD, { uid, token }),

  products: () => ROUTE_PATHS.PRODUCTS,
  productDetail: (slug) => buildPath(ROUTE_PATHS.PRODUCT_DETAIL, { slug }),

  categories: () => ROUTE_PATHS.CATEGORIES,
  categoryDetail: (slug) => buildPath(ROUTE_PATHS.CATEGORY_DETAIL, { slug }),

  brands: () => ROUTE_PATHS.BRANDS,
  brandDetail: (slug) => buildPath(ROUTE_PATHS.BRAND_DETAIL, { slug }),

  search: () => ROUTE_PATHS.SEARCH,
  pcBuilder: () => ROUTE_PATHS.PC_BUILDER,
  cart: () => ROUTE_PATHS.CART,
  wishlist: () => ROUTE_PATHS.WISHLIST,

  checkout: () => ROUTE_PATHS.CHECKOUT,
  orders: () => ROUTE_PATHS.ORDERS,
  orderDetail: (orderNumber) => buildPath(ROUTE_PATHS.ORDER_DETAIL, { orderNumber }),
  returns: () => ROUTE_PATHS.RETURNS,
  profile: () => ROUTE_PATHS.PROFILE,

  vendorDashboard: () => ROUTE_PATHS.VENDOR_DASHBOARD,
  vendorProducts: () => ROUTE_PATHS.VENDOR_PRODUCTS,
  vendorProductNew: () => ROUTE_PATHS.VENDOR_PRODUCT_NEW,
  vendorProductEdit: (slug) => buildPath(ROUTE_PATHS.VENDOR_PRODUCT_EDIT, { slug }),
  vendorOrders: () => ROUTE_PATHS.VENDOR_ORDERS,
  vendorProfile: () => ROUTE_PATHS.VENDOR_PROFILE,
  vendorPublic: (storeSlug) => buildPath(ROUTE_PATHS.VENDOR_PUBLIC, { storeSlug }),

  adminDashboard: () => ROUTE_PATHS.ADMIN_DASHBOARD,
  adminVendors: () => ROUTE_PATHS.ADMIN_VENDORS,
  adminUsers: () => ROUTE_PATHS.ADMIN_USERS,
  adminOrders: () => ROUTE_PATHS.ADMIN_ORDERS,
  adminReturns: () => ROUTE_PATHS.ADMIN_RETURNS,
};

// Nested `ROUTES` is the convenient short-hand used by pages:
//   ROUTES.HOME, ROUTES.VENDOR.DASHBOARD, ROUTES.AUTH.FORGOT_PASSWORD
// All keys are read-only snapshots of the same paths above, so the
// router wiring and the in-page navigation never drift.
export const ROUTES = Object.freeze({
  HOME: ROUTE_PATHS.HOME,
  AUTH: Object.freeze({
    LOGIN: ROUTE_PATHS.LOGIN,
    REGISTER: ROUTE_PATHS.REGISTER,
    REGISTER_CUSTOMER: ROUTE_PATHS.REGISTER_CUSTOMER,
    REGISTER_VENDOR: ROUTE_PATHS.REGISTER_VENDOR,
    FORGOT_PASSWORD: ROUTE_PATHS.FORGOT_PASSWORD,
    RESET_PASSWORD: ROUTE_PATHS.RESET_PASSWORD,
  }),
  VENDOR: Object.freeze({
    DASHBOARD: ROUTE_PATHS.VENDOR_DASHBOARD,
    PRODUCTS: ROUTE_PATHS.VENDOR_PRODUCTS,
    ORDERS: ROUTE_PATHS.VENDOR_ORDERS,
    PROFILE: ROUTE_PATHS.VENDOR_PROFILE,
    PENDING: ROUTE_PATHS.VENDOR_PENDING,
  }),
  ADMIN: Object.freeze({
    DASHBOARD: ROUTE_PATHS.ADMIN_DASHBOARD,
    VENDORS: ROUTE_PATHS.ADMIN_VENDORS,
    USERS: ROUTE_PATHS.ADMIN_USERS,
    ORDERS: ROUTE_PATHS.ADMIN_ORDERS,
    RETURNS: ROUTE_PATHS.ADMIN_RETURNS,
  }),
  LEGAL: Object.freeze({
    TERMS: '/legal/terms',
    PRIVACY: '/legal/privacy',
  }),
});

export default ROUTE_PATHS;
