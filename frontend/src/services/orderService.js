import api from '@services/axiosInstance';
const unwrap = (r) => r.data?.data ?? r.data;

export const orderService = {
  list: (params) => api.get('/orders/', { params }).then(unwrap),
  detail: (orderNumber) => api.get(`/orders/${orderNumber}/`).then(unwrap),
  checkout: (payload) => api.post('/orders/checkout/', payload).then(unwrap),
  cancel: (orderNumber) => api.post(`/orders/${orderNumber}/cancel/`).then(unwrap),
};

export default orderService;
