import api from '@services/axiosInstance';
const unwrap = (r) => r.data?.data ?? r.data;

export const recommendationService = {
  forYou: () => api.get('/recommendations/for-you/').then(unwrap),
  trending: () => api.get('/recommendations/trending/').then(unwrap),
  coOccurrence: (productSlug) =>
    api.get(`/recommendations/co-occurrence/${productSlug}/`).then(unwrap),
  compatibility: (buildId) =>
    api.get(`/recommendations/compatibility/${buildId}/`).then(unwrap),
};

export default recommendationService;
