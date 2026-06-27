import api from '@services/axiosInstance';
const unwrap = (r) => r.data?.data ?? r.data;

export const adminService = {
  dashboard: () => api.get('/admin/dashboard/').then(unwrap),
  pendingVendors: () => api.get('/admin/vendors/pending/').then(unwrap),
  approveVendor: (id) => api.post(`/admin/vendors/${id}/approve/`).then(unwrap),
  rejectVendor: (id, reason) =>
    api.post(`/admin/vendors/${id}/reject/`, { reason }).then(unwrap),
  listUsers: (params) => api.get('/admin/users/', { params }).then(unwrap),
  listOrders: (params) => api.get('/admin/orders/', { params }).then(unwrap),
};

export default adminService;
