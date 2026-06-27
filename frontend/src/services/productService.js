import api from '@services/axiosInstance';
const unwrap = (r) => r.data?.data ?? r.data;

export const productService = {
  list: (params) => api.get('/products/', { params }).then(unwrap),
  detail: (slug) => api.get(`/products/${slug}/`).then(unwrap),
  trending: () => api.get('/products/trending/').then(unwrap),
  search: (q) => api.get('/search/products/', { params: { q } }).then(unwrap),
};

export default productService;
