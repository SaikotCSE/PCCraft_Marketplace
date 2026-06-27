import api from '@services/axiosInstance';
const unwrap = (r) => r.data?.data ?? r.data;

export const brandService = {
  list: () => api.get('/brands/').then(unwrap),
  detail: (slug) => api.get(`/brands/${slug}/`).then(unwrap),
};

export default brandService;
