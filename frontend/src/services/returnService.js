// returnService — REST client for Module 5 (Returns & Refunds).
//
// Endpoints covered (all return the APIResponse envelope → unwrapped):
//
//   Customer
//     POST /api/v1/orders/items/<item_id>/return/   initiateReturn(itemId, payload)
//     GET  /api/v1/returns/                         listMyReturns(params)
//     GET  /api/v1/returns/<id>/                    getReturn(id)
//     POST /api/v1/returns/<id>/ship-back/          shipBackReturn(id, payload)
//
//   Vendor
//     GET   /api/v1/vendor/returns/                  listVendorReturns(params)
//     PATCH /api/v1/vendor/returns/<id>/review/      reviewReturn(id, payload)
//     PATCH /api/v1/vendor/returns/<id>/mark-received/  markReceived(id, payload)
//
//   Admin
//     GET   /api/v1/admin/returns/                   listAdminReturns(params)
//     PATCH /api/v1/admin/returns/<id>/process-refund/   processRefund(id, payload)
//     PATCH /api/v1/admin/returns/<id>/confirm-refund/   confirmRefund(id, payload)
//
// Field names match the backend serializers verbatim — DO NOT rename.
//   - reason:           DAMAGED | DEFECTIVE | WRONG_ITEM | NOT_AS_DESCRIBED | OTHER
//   - status:           PENDING | APPROVED | REJECTED | SHIPPED_BACK
//                       | RECEIVED | REFUND_INITIATED | REFUNDED
//   - evidence[]:       { id, image_url, caption, uploaded_at }
//   - return_number:    RET-YYYYMMDD-NNNNN
import api from '@services/axiosInstance';

const unwrap = (r) => r.data?.data ?? r.data;

export const returnService = {
  // ─────────────────────── customer ───────────────────────
  /**
   * Submit a new return for one delivered order item.
   *
   * @param {string} itemId  - the OrderItem UUID
   * @param {{ reason: string, description: string,
   *           images?: File[] }} payload
   *        images is an optional list of up to 4 File objects
   *        (the backend enforces MAX_RETURN_EVIDENCE = 4).
   *
   * We use multipart/form-data when any image is provided,
   * otherwise plain JSON to keep payloads small.
   */
  initiateReturn: (itemId, { reason, description, images = [] } = {}) => {
    if (images && images.length > 0) {
      const form = new FormData();
      form.append('reason', reason);
      form.append('description', description);
      images.forEach((file) => form.append('images', file));
      return api
        .post(`/orders/items/${itemId}/return/`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        .then(unwrap);
    }
    return api
      .post(`/orders/items/${itemId}/return/`, { reason, description })
      .then(unwrap);
  },

  /**
   * @param {{ status?: string, page?: number, page_size?: number }} params
   */
  listMyReturns: (params = {}) =>
    api.get('/returns/', { params }).then(unwrap),

  getReturn: (id) =>
    api.get(`/returns/${id}/`).then(unwrap),

  /**
   * @param {string} id
   * @param {{ tracking_number: string }} payload
   */
  shipBackReturn: (id, payload) =>
    api.post(`/returns/${id}/ship-back/`, payload).then(unwrap),

  // ──────────────────────── vendor ────────────────────────
  /**
   * @param {{ status?: string, page?: number, page_size?: number }} params
   */
  listVendorReturns: (params = {}) =>
    api.get('/vendor/returns/', { params }).then(unwrap),

  /**
   * @param {string} id
   * @param {{ action: 'approve'|'reject',
   *           reason?: string, vendor_notes?: string }} payload
   *        ``reason`` is required when action === 'reject'.
   */
  reviewReturn: (id, payload) =>
    api.patch(`/vendor/returns/${id}/review/`, payload).then(unwrap),

  /**
   * @param {string} id
   * @param {{ vendor_notes?: string }} payload
   */
  markReceived: (id, payload = {}) =>
    api.patch(`/vendor/returns/${id}/mark-received/`, payload).then(unwrap),

  // ───────────────────────── admin ────────────────────────
  /**
   * @param {{ status?: string, page?: number, page_size?: number }} params
   */
  listAdminReturns: (params = {}) =>
    api.get('/admin/returns/', { params }).then(unwrap),

  /**
   * @param {string} id
   * @param {{ admin_notes?: string }} payload
   */
  processRefund: (id, payload = {}) =>
    api.patch(`/admin/returns/${id}/process-refund/`, payload).then(unwrap),

  /**
   * @param {string} id
   * @param {{ admin_notes?: string }} payload
   */
  confirmRefund: (id, payload = {}) =>
    api.patch(`/admin/returns/${id}/confirm-refund/`, payload).then(unwrap),
};

// Backwards-compat aliases for the old stub shape.
returnService.request = returnService.initiateReturn;
returnService.list = returnService.listMyReturns;
returnService.status = returnService.getReturn;

export default returnService;
