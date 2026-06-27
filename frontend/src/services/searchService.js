import api from '@services/axiosInstance';
const unwrap = (r) => r.data?.data ?? r.data;

export const searchService = {
  products: (q, params) => api.get('/search/products/', { params: { q, ...params } }).then(unwrap),
  suggestions: (q) => api.get('/search/suggestions/', { params: { q } }).then(unwrap),
};

export default searchService;
