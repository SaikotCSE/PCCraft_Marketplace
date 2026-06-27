import api from '@services/axiosInstance';
const unwrap = (r) => r.data?.data ?? r.data;

export const categoryService = {
  tree: () => api.get('/categories/').then(unwrap),
  detail: (slug) => api.get(`/categories/${slug}/`).then(unwrap),
};

export default categoryService;
