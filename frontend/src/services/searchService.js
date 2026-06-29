import api from '@services/axiosInstance';
const unwrap = (r) => r.data?.data ?? r.data;

export const searchService = {
  /**
   * Full-text + faceted product search.
   * @param {string} q           The user's query string.
   * @param {object} [params]    Extra filter params (category, brand, min_price,
   *                            max_price, in_stock, discount, min_rating,
   *                            vendor, ordering, page, page_size).
   */
  products: (q, params) =>
    api.get('/search/', { params: { q, ...params } }).then(unwrap),

  /**
   * Live autocomplete. Returns up to 5 product names + 3 category names
   * matching the query prefix. Backend caches for 5 min per query string.
   * @param {string} q
   */
  suggestions: (q) =>
    api.get('/search/suggestions/', { params: { q } }).then(unwrap),

  /**
   * Top-N most-frequent queries with non-zero results in the last 7 days.
   * Used by the search results empty state.
   */
  trending: () => api.get('/search/trending/').then(unwrap),

  /**
   * Trending products shown in the empty-state of the search results
   * page when the user's query returns zero matches (Module 11 §11.1
   * frontend: "suggested categories or trending products below").
   */
  trendingProducts: (limit = 8) =>
    api.get('/search/trending-products/', { params: { limit } }).then(unwrap),
};

export default searchService;
