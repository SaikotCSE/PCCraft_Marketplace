// Recommendation Service — Module 7
// -----------------------------------------------------------------------------
// Thin wrapper around the 5 GET endpoints + 1 POST action defined in
// `PCCraft_Master_Spec_v4.md §7.3`. All responses follow:
//   { count: number, source: string, results: ProductListSerializer[] }
// so the carousel can hydrate straight from `response.data.results`.
// -----------------------------------------------------------------------------
import api from '@services/axiosInstance';

const unwrap = (response) => response?.data ?? null;

export const recommendationService = {
  /**
   * GET /api/v1/recommendations/trending/?category=<id>&limit=<n>
   * Public. Returns the global (or category-scoped) trending feed.
   */
  getTrending: ({ category_id: categoryId, limit = 10 } = {}) =>
    api
      .get('/recommendations/trending/', {
        params: {
          ...(categoryId ? { category: categoryId } : {}),
          limit,
        },
      })
      .then(unwrap),

  /**
   * GET /api/v1/recommendations/personalized/?limit=<n>
   * IsAuthenticated. Falls back to trending on cold start (<3 signals).
   */
  getPersonalized: ({ limit = 10 } = {}) =>
    api.get('/recommendations/personalized/', { params: { limit } }).then(unwrap),

  /**
   * GET /api/v1/recommendations/recently-viewed/?limit=<n>
   * Public. Uses X-Session-Key header for anonymous viewers.
   * `sessionKey` arg is appended so the http client can attach the header.
   */
  getRecentlyViewed: ({ limit = 10, sessionKey = '' } = {}) =>
    api
      .get('/recommendations/recently-viewed/', {
        params: { limit },
        headers: sessionKey ? { 'X-Session-Key': sessionKey } : undefined,
      })
      .then(unwrap),

  /**
   * GET /api/v1/recommendations/<slug>/similar/?limit=<n>
   * Public. Content-based similarity (same category+brand + spec score).
   */
  getSimilar: (slug, { limit = 10 } = {}) =>
    api.get(`/recommendations/similar/${slug}/`, { params: { limit } }).then(unwrap),

  /**
   * GET /api/v1/recommendations/<slug>/frequently-bought-together/?limit=<n>
   * Public. Co-occurrence from delivered/shipped orders.
   */
  getFrequentlyBoughtTogether: (slug, { limit = 10 } = {}) =>
    api
      .get(`/recommendations/frequently-bought-together/${slug}/`, {
        params: { limit },
      })
      .then(unwrap),

  /**
   * POST /api/v1/products/<slug>/track-view/
   * Public. Persists a ProductView row with X-Session-Key for anonymous.
   * Fired by ProductDetailPage 500ms after slug change.
   */
  trackView: (slug, { sessionKey = '' } = {}) =>
    api.post(`/products/${slug}/track-view/`, null, {
      headers: sessionKey ? { 'X-Session-Key': sessionKey } : undefined,
    }),
};

export default recommendationService;
