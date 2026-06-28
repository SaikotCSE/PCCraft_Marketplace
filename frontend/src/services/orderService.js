// orderService — REST client for Module 4 (Order System).
//
// Endpoints covered (all return the APIResponse envelope → unwrapped):
//
//   Customer — addresses
//     GET    /api/v1/addresses/                   listAddresses(params)
//     POST   /api/v1/addresses/                   createAddress(payload)
//     GET    /api/v1/addresses/<id>/              getAddress(id)
//     PATCH  /api/v1/addresses/<id>/              updateAddress(id, payload)
//     DELETE /api/v1/addresses/<id>/              deleteAddress(id)
//     POST   /api/v1/addresses/<id>/set-default/  setDefaultAddress(id)
//
//   Customer — orders
//     GET  /api/v1/orders/                        listOrders(params)
//     POST /api/v1/orders/                        placeOrder(payload)
//     GET  /api/v1/orders/<order_number>/         getOrder(orderNumber)
//     POST /api/v1/orders/<order_number>/cancel/  cancelOrder(orderNumber)
//
//   Vendor — orders
//     GET   /api/v1/vendor/orders/                       listVendorOrders(params)
//     GET   /api/v1/vendor/orders/<order_number>/        getVendorOrder(orderNumber)
//     PATCH /api/v1/vendor/orders/items/<item_id>/status/ updateVendorItemStatus(itemId, payload)
//
// Field names match the backend serializers verbatim — DO NOT rename.
//   - Order:    order_number, status, payment_status, payment_method,
//               subtotal, shipping_fee, tax, discount, total,
//               items[], shipping_address{}, can_cancel, ...
//   - Item:     id, product_id, product_slug, product_name_snapshot,
//               vendor_id, vendor_name, unit_price, quantity, line_total,
//               item_status, tracking_number (order-level), ...
//   - Address:  id, label, full_name, phone, street_address, address_line2,
//               city, district, postal_code, country, is_default
//
// `payment_method` is REQUIRED on POST /orders/ per the spec; the backend
// defaults to COD if omitted, but we send it explicitly to stay in sync
// with what the UI is showing the customer.
import api from '@services/axiosInstance';

const unwrap = (r) => r.data?.data ?? r.data;

export const orderService = {
  // ─────────────────────── addresses ───────────────────────
  listAddresses: (params = {}) =>
    api.get('/addresses/', { params }).then(unwrap),

  getAddress: (id) =>
    api.get(`/addresses/${id}/`).then(unwrap),

  createAddress: (payload) =>
    api.post('/addresses/', payload).then(unwrap),

  updateAddress: (id, payload) =>
    api.patch(`/addresses/${id}/`, payload).then(unwrap),

  deleteAddress: (id) =>
    api.delete(`/addresses/${id}/`).then(unwrap),

  setDefaultAddress: (id) =>
    api.post(`/addresses/${id}/set-default/`).then(unwrap),

  // ─────────────────── customer orders ──────────────────────
  /**
   * @param {{status?: string, page?: number, page_size?: number,
   *          ordering?: string}} params
   */
  listOrders: (params = {}) =>
    api.get('/orders/', { params }).then(unwrap),

  /**
   * @param {{address_id: string, payment_method?: string, notes?: string}} payload
   *        payment_method defaults to 'COD' (Cash on Delivery) — Module 5
   *        will add 'SSL_COMMERZ' once the gateway is integrated.
   */
  placeOrder: (payload) =>
    api.post('/orders/', {
      payment_method: 'COD',
      ...payload,
    }).then(unwrap),

  getOrder: (orderNumber) =>
    api.get(`/orders/${orderNumber}/`).then(unwrap),

  cancelOrder: (orderNumber) =>
    api.post(`/orders/${orderNumber}/cancel/`).then(unwrap),

  // ──────────────────── vendor orders ───────────────────────
  /**
   * @param {{status?: string, item_status?: string,
   *          page?: number, page_size?: number, ordering?: string}} params
   */
  listVendorOrders: (params = {}) =>
    api.get('/vendor/orders/', { params }).then(unwrap),

  getVendorOrder: (orderNumber) =>
    api.get(`/vendor/orders/${orderNumber}/`).then(unwrap),

  /**
   * @param {string} itemId
   * @param {{status: string, tracking_number?: string}} payload
   *        status must be UPPERCASE (CONFIRMED|PROCESSING|SHIPPED|DELIVERED).
   *        Per spec §4.x the vendor transition is forward-only and the
   *        backend rejects backwards moves.
   */
  updateVendorItemStatus: (itemId, payload) =>
    api.patch(`/vendor/orders/items/${itemId}/status/`, payload).then(unwrap),
};

export default orderService;
