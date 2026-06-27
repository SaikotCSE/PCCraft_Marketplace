import api from '@services/axiosInstance';
const unwrap = (r) => r.data?.data ?? r.data;

export const compatibilityService = {
  checkBuild: (buildId) => api.get(`/compatibility/check/${buildId}/`).then(unwrap),
  compatibleWith: (slotKey, params) =>
    api.get(`/compatibility/slots/${slotKey}/compatible/`, { params }).then(unwrap),
  saveBuild: (payload) => api.post('/compatibility/builds/', payload).then(unwrap),
  loadBuild: (buildId) => api.get(`/compatibility/builds/${buildId}/`).then(unwrap),
};

export default compatibilityService;
