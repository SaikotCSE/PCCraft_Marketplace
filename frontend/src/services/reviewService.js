// reviewService — Module 6 backend client.
//
// Endpoint layout (see backend/apps/reviews/urls.py):
//   /api/v1/products/<slug>/reviews/           POST   create
//   /api/v1/products/<slug>/reviews/           GET    list (paginated, ordering=...)
//   /api/v1/products/<slug>/can-review/        GET    can-review flag for product
//   /api/v1/products/<slug>/rating-breakdown/  GET    per-star counts + percentages
//   /api/v1/reviews/can-review/?product=<slug> GET    (alt) global can-review probe
//   /api/v1/reviews/<id>/                      GET    retrieve
//   /api/v1/reviews/<id>/                      PATCH  update (title/body/images)
//   /api/v1/reviews/<id>/                      DELETE author delete
//   /api/v1/reviews/<id>/helpful/              POST   toggle helpful vote
//   /api/v1/vendor/reviews/                    GET    vendor's product reviews
//   /api/v1/vendor/reviews/<id>/reply/         POST   add or update reply
//   /api/v1/admin/reviews/                     GET    admin full list
//   /api/v1/admin/reviews/<id>/moderate/       PATCH  {is_hidden: bool}
//   /api/v1/admin/reviews/<id>/reply/          DELETE remove vendor reply
import api from '@services/axiosInstance';

// axiosInstance already unwraps the APIResponse envelope via its
// interceptor (toast on error, etc.). These helpers just unwrap to
// `data.data` for consistency with the other services.
const unwrap = (r) => r.data?.data ?? r.data;

/* -------------------------------------------------------------- *
 *  Customer-facing endpoints                                      *
 * -------------------------------------------------------------- */

/** GET /products/<slug>/reviews/ — paginated, supports ?ordering=. */
const forProduct = (slug, params = {}) =>
  api.get(`/products/${slug}/reviews/`, { params }).then(unwrap);

/** GET /products/<slug>/rating-breakdown/ — {avg, total, breakdown:{1..5}}. */
const ratingBreakdown = (slug) =>
  api.get(`/products/${slug}/rating-breakdown/`).then(unwrap);

/** GET /products/<slug>/can-review/ — {can_review, reason}. */
const canReviewForProduct = (slug) =>
  api.get(`/products/${slug}/can-review/`).then(unwrap);

/**
 * GET /reviews/can-review/?product=<slug>
 * Mirrors the per-product endpoint but routed through the reviews
 * namespace (spec §2.7 keeps both for client convenience).
 */
const canReviewGlobal = (slug) =>
  api.get('/reviews/can-review/', { params: { product: slug } }).then(unwrap);

/** POST /products/<slug>/reviews/ — multipart when images are supplied. */
const create = (slug, payload) => {
  const hasFiles = Array.isArray(payload?.images) && payload.images.length > 0;
  const body = hasFiles ? toFormData(payload) : payload;
  return api
    .post(`/products/${slug}/reviews/`, body, {
      headers: hasFiles ? { 'Content-Type': 'multipart/form-data' } : undefined,
    })
    .then(unwrap);
};

/** GET /reviews/<id>/ */
const retrieve = (reviewId) =>
  api.get(`/reviews/${reviewId}/`).then(unwrap);

/** PATCH /reviews/<id>/ — title, body, images only (rating immutable). */
const update = (reviewId, payload) => {
  const hasFiles = Array.isArray(payload?.images) && payload.images.length > 0;
  const body = hasFiles ? toFormData(payload) : payload;
  return api
    .patch(`/reviews/${reviewId}/`, body, {
      headers: hasFiles ? { 'Content-Type': 'multipart/form-data' } : undefined,
    })
    .then(unwrap);
};

/** DELETE /reviews/<id>/ */
const remove = (reviewId) =>
  api.delete(`/reviews/${reviewId}/`).then(unwrap);

/** POST /reviews/<id>/helpful/ — returns {helpful, count}. */
const toggleHelpful = (reviewId) =>
  api.post(`/reviews/${reviewId}/helpful/`).then(unwrap);

/* -------------------------------------------------------------- *
 *  Vendor endpoints                                               *
 * -------------------------------------------------------------- */

/**
 * GET /vendor/reviews/?ordering=...&replied=true|false&rating=N
 * Returns the vendor's product reviews (paginated).
 */
const vendorList = (params = {}) =>
  api.get('/vendor/reviews/', { params }).then(unwrap);

/** POST /vendor/reviews/<id>/reply/ — body {reply_text}. */
const vendorReply = (reviewId, replyText) =>
  api
    .post(`/vendor/reviews/${reviewId}/reply/`, { reply_text: replyText })
    .then(unwrap);

/* -------------------------------------------------------------- *
 *  Admin endpoints                                                *
 * -------------------------------------------------------------- */

/**
 * GET /admin/reviews/?is_hidden=&rating=&product=&vendor=&ordering=
 * Paginated. The spec exposes `product` and `vendor` as free-text
 * filters — server-side behaviour matches.
 */
const adminList = (params = {}) =>
  api.get('/admin/reviews/', { params }).then(unwrap);

/** PATCH /admin/reviews/<id>/moderate/ — body {is_hidden: bool}. */
const adminModerate = (reviewId, isHidden) =>
  api
    .patch(`/admin/reviews/${reviewId}/moderate/`, { is_hidden: isHidden })
    .then(unwrap);

/** DELETE /admin/reviews/<id>/reply/ */
const adminRemoveReply = (reviewId) =>
  api.delete(`/admin/reviews/${reviewId}/reply/`).then(unwrap);

/* -------------------------------------------------------------- *
 *  Internal helpers                                               *
 * -------------------------------------------------------------- */

/**
 * Convert the payload to multipart/form-data. The server expects each
 * scalar as its own field; `images` is the list of File objects.
 * Per spec, rating is *immutable* on update — caller is responsible
 * for not sending it.
 */
function toFormData(payload) {
  const fd = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (key === 'images' && Array.isArray(value)) {
      value.forEach((file) => {
        if (file instanceof File) fd.append('images', file);
        else if (file?.file instanceof File) fd.append('images', file.file);
      });
    } else if (Array.isArray(value)) {
      value.forEach((v) => fd.append(key, v));
    } else if (typeof value === 'object' && !(value instanceof File)) {
      // skip nested objects — the API only consumes scalars + image list
    } else {
      fd.append(key, value);
    }
  });
  return fd;
}

export const reviewService = {
  // Customer
  forProduct,
  ratingBreakdown,
  canReviewForProduct,
  canReviewGlobal,
  create,
  retrieve,
  update,
  remove,
  toggleHelpful,
  // Vendor
  vendorList,
  vendorReply,
  // Admin
  adminList,
  adminModerate,
  adminRemoveReply,
};

export default reviewService;
