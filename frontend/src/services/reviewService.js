import api from '@services/axiosInstance';
const unwrap = (r) => r.data?.data ?? r.data;

export const reviewService = {
  forProduct: (slug, params) =>
    api.get(`/products/${slug}/reviews/`, { params }).then(unwrap),
  create: (slug, payload) =>
    api.post(`/products/${slug}/reviews/`, payload).then(unwrap),
  reply: (reviewId, payload) =>
    api.post(`/reviews/${reviewId}/reply/`, payload).then(unwrap),
};

export default reviewService;
