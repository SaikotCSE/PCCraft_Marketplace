import api from '@services/axiosInstance';
const unwrap = (r) => r.data?.data ?? r.data;

export const cartService = {
  fetch: () => api.get('/cart/').then(unwrap),
  addItem: (payload) => api.post('/cart/items/', payload).then(unwrap),
  updateQty: (itemId, quantity) =>
    api.patch(`/cart/items/${itemId}/`, { quantity }).then(unwrap),
  removeItem: (itemId) => api.delete(`/cart/items/${itemId}/`).then(unwrap),
  clear: () => api.delete('/cart/').then(unwrap),
};

export default cartService;
