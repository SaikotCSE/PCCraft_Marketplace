import api from '@services/axiosInstance';
const unwrap = (r) => r.data?.data ?? r.data;

export const returnService = {
  request: (payload) => api.post('/returns/', payload).then(unwrap),
  list: () => api.get('/returns/').then(unwrap),
  status: (id) => api.get(`/returns/${id}/`).then(unwrap),
};

export default returnService;
