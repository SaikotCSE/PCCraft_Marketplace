import api from '@services/axiosInstance';
const unwrap = (r) => r.data?.data ?? r.data;

// Map the spec's `range` shorthand (7d / 30d / 90d) to the integer
// `?days=N` query the dashboard views expect. Anything not in the table
// falls back to 30.
const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 };
const rangeToDays = (range) => RANGE_DAYS[range] || 30;

export const adminService = {
  // ----- Dashboard (spec mounts these under /admin/analytics/...) -----
  // Backend view takes ?days=N (integer); spec range shorthand mapped client-side.
  dashboard: () => api.get('/admin/analytics/overview/').then(unwrap),
  ordersOverTime: ({ range = '30d' } = {}) =>
    api.get('/admin/analytics/orders-over-time/', { params: { days: rangeToDays(range) } }).then(unwrap),
  revenueOverTime: ({ range = '30d' } = {}) =>
    api.get('/admin/analytics/revenue-over-time/', { params: { days: rangeToDays(range) } }).then(unwrap),
  topProducts: ({ limit = 10 } = {}) =>
    api.get('/admin/analytics/top-products/', { params: { limit } }).then(unwrap),
  topVendors: ({ limit = 10 } = {}) =>
    api.get('/admin/analytics/top-vendors/', { params: { limit } }).then(unwrap),
  categoryDistribution: () =>
    api.get('/admin/analytics/category-distribution/').then(unwrap),
  userGrowth: ({ range = '30d' } = {}) =>
    api.get('/admin/analytics/user-growth/', { params: { days: rangeToDays(range) } }).then(unwrap),

  // ----- Vendors -----
  listVendors: (params) => api.get('/admin/vendors/', { params }).then(unwrap),
  pendingVendors: () => api.get('/admin/vendors/pending/').then(unwrap),
  getVendor: (id) => api.get(`/admin/vendors/${id}/`).then(unwrap),
  approveVendor: (id) => api.patch(`/admin/vendors/${id}/approve/`).then(unwrap),
  rejectVendor: (id, reason) =>
    api.patch(`/admin/vendors/${id}/reject/`, { reason }).then(unwrap),
  requestInfoVendor: (id, message) =>
    api.patch(`/admin/vendors/${id}/request-info/`, { message }).then(unwrap),

  // ----- Users -----
  // AdminUserListView accepts: search, role, status (active|inactive|locked),
  // page, page_size.
  listUsers: (params) => api.get('/admin/users/', { params }).then(unwrap),
  suspendUser: (id, payload) => api.patch(`/admin/users/${id}/suspend/`, payload).then(unwrap),
  activateUser: (id) => api.patch(`/admin/users/${id}/activate/`).then(unwrap),
  changeUserRole: (id, role) => api.patch(`/admin/users/${id}/change-role/`, { role }).then(unwrap),
  unlockUser: (id) => api.patch(`/admin/users/${id}/unlock/`).then(unwrap),
  deleteUser: (id) => api.delete(`/admin/users/${id}/`).then(unwrap),
  hardDeleteUser: (id, payload) => api.delete(`/admin/users/${id}/hard-delete/`, { data: payload }).then(unwrap),

  // ----- Orders -----
  listOrders: (params) => api.get('/admin/orders/', { params }).then(unwrap),
  getOrder: (orderNumber) =>
    api.get(`/admin/orders/${encodeURIComponent(orderNumber)}/`).then(unwrap),

  // ----- Returns -----
  listReturns: (params) => api.get('/admin/returns/', { params }).then(unwrap),

  // ----- Reviews -----
  listReviews: (params) => api.get('/admin/reviews/', { params }).then(unwrap),
  reviewDetail: (id) => api.get(`/admin/reviews/${id}/`).then(unwrap),
  moderateReview: (id, payload) =>
    api.patch(`/admin/reviews/${id}/moderate/`, payload).then(unwrap),
  hideReview: (id) => api.patch(`/admin/reviews/${id}/hide/`).then(unwrap),
  restoreReview: (id) => api.patch(`/admin/reviews/${id}/restore/`).then(unwrap),
  removeVendorReply: (id) => api.delete(`/admin/reviews/${id}/reply/`).then(unwrap),

  // ----- Brands -----
  listBrands: (params) => api.get('/admin/brands/', { params }).then(unwrap),
  getBrand: (slug) => api.get(`/admin/brands/${slug}/`).then(unwrap),
  createBrand: (data) => api.post('/admin/brands/', data).then(unwrap),
  updateBrand: (slug, data) => api.patch(`/admin/brands/${slug}/`, data).then(unwrap),
  deleteBrand: (slug) => api.delete(`/admin/brands/${slug}/`).then(unwrap),
  restoreBrand: (slug) => api.patch(`/admin/brands/${slug}/restore/`).then(unwrap),

  // ----- Categories -----
  listCategories: (params) => api.get('/admin/categories/', { params }).then(unwrap),
  categoryTree: (params) => api.get('/admin/categories/tree/', { params }).then(unwrap),
  getCategory: (slug) => api.get(`/admin/categories/${slug}/`).then(unwrap),
  createCategory: (data) => api.post('/admin/categories/', data).then(unwrap),
  updateCategory: (slug, data) =>
    api.patch(`/admin/categories/${slug}/`, data).then(unwrap),
  deleteCategory: (slug) => api.delete(`/admin/categories/${slug}/`).then(unwrap),
  restoreCategory: (slug) => api.patch(`/admin/categories/${slug}/restore/`).then(unwrap),

  // ----- Products (moderation) -----
  // Spec §3163-3175: id-based detail / soft-delete + slug-based
  // hide / restore / hard-delete. Both surfaces coexist so existing
  // vendor console calls (id-keyed) and the admin console
  // (slug-keyed) keep working without breaking each other.
  listProducts: (params) => api.get('/admin/products/', { params }).then(unwrap),
  getProduct: (productId) => api.get(`/admin/products/${productId}/`).then(unwrap),
  deleteProduct: (productId) => api.delete(`/admin/products/${productId}/`).then(unwrap),
  moderateProduct: (productId, payload) =>
    api.patch(`/admin/products/${productId}/moderate/`, payload).then(unwrap),
  hideProduct: (slug, payload) =>
    api.patch(`/admin/products/${encodeURIComponent(slug)}/hide/`, payload).then(unwrap),
  restoreProduct: (slug, payload) =>
    api.patch(`/admin/products/${encodeURIComponent(slug)}/restore/`, payload).then(unwrap),
  hardDeleteProduct: (slug, payload) =>
    api.delete(`/admin/products/${encodeURIComponent(slug)}/`, { data: payload }).then(unwrap),
};

export default adminService;
