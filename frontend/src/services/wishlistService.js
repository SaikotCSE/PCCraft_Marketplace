import api from '@services/axiosInstance';
const unwrap = (r) => r.data?.data ?? r.data;

export const wishlistService = {
  fetch: () => api.get('/wishlist/').then(unwrap),
  add: (productId) => api.post('/wishlist/items/', { product: productId }).then(unwrap),
  remove: (itemId) => api.delete(`/wishlist/items/${itemId}/`).then(unwrap),
  moveToCart: (itemId, quantity = 1) =>
    api
      .post(`/wishlist/items/${itemId}/move-to-cart/`, { quantity })
      .then(unwrap),
};

export default wishlistService;
