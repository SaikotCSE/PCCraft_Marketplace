import api from '@services/axiosInstance';
const unwrap = (r) => r.data?.data ?? r.data;

export const vendorService = {
  // ---- reads (public) ----
  publicProfile: (storeSlug) => api.get(`/vendors/${storeSlug}/`).then(unwrap),

  // ---- vendor dashboard (read) ----
  // Backend mounts the vendor router at /api/v1/vendor/products/ (apps/products/urls.py).
  myProducts: (params) => api.get('/vendor/products/', { params }).then(unwrap),
  myProduct: (slug) => api.get(`/vendor/products/${slug}/`).then(unwrap),
  myOrders: (params) => api.get('/orders/vendor/', { params }).then(unwrap),
  myDashboard: () => api.get('/dashboard/vendor/').then(unwrap),

  // ---- vendor product writes ----
  createProduct: (payload) => api.post('/vendor/products/', payload).then(unwrap),
  updateProduct: (slug, payload) => api.patch(`/vendor/products/${slug}/`, payload).then(unwrap),
  deleteProduct: (slug) => api.delete(`/vendor/products/${slug}/`).then(unwrap),

  // ---- vendor image actions ----
  addImages: (slug, formData) =>
    api
      .post(`/vendor/products/${slug}/images/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then(unwrap),
  deleteImage: (slug, imageId) =>
    api.delete(`/vendor/products/${slug}/images/${imageId}/`).then(unwrap),
  reorderImages: (slug, orderedIds) =>
    api.post(`/vendor/products/${slug}/images/reorder/`, { ids: orderedIds }).then(unwrap),
  setPrimaryImage: (slug, imageId) =>
    api.patch(`/vendor/products/${slug}/images/${imageId}/set-primary/`).then(unwrap),
};

export default vendorService;
