import api from '@services/axiosInstance';
const unwrap = (r) => r.data?.data ?? r.data;

export const vendorService = {
  publicProfile: (storeSlug) => api.get(`/vendors/${storeSlug}/`).then(unwrap),
  myProducts: (params) => api.get('/vendor/products/', { params }).then(unwrap),
  myOrders: (params) => api.get('/vendor/orders/', { params }).then(unwrap),
  myDashboard: () => api.get('/vendor/dashboard/').then(unwrap),
};

export default vendorService;
