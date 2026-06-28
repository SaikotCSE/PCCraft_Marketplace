// useOrderStore — Zustand store for Module 4 (Order System).
//
// Three slices:
//   1. addresses — the customer's address book (incl. `defaultAddressId`).
//   2. orders    — customer's order history + `lastPlacedOrder` so the
//                  CheckoutPage can redirect to its detail page.
//   3. vendorOrders — vendor's incoming orders + per-item status updates.
//
// Mirrors the useCartStore conventions:
//   - action methods `throw` on failure so React Query / call-sites can
//     display errors via toast.
//   - snapshot-and-rollback pattern on mutating actions so the UI
//     reverts on server rejection.
//   - one `isLoading` flag per slice, plus a single `error` string.
import { create } from 'zustand';

import { orderService } from '@services/orderService';

const initial = {
  addresses: [],
  defaultAddressId: null,
  addressesLoading: false,
  addressError: null,

  orders: [],
  ordersMeta: { count: 0, page: 1, pageSize: 20, hasNext: false },
  currentOrder: null,
  lastPlacedOrder: null,
  ordersLoading: false,
  ordersError: null,

  vendorOrders: [],
  vendorOrdersMeta: { count: 0, page: 1, pageSize: 20, hasNext: false },
  vendorCurrentOrder: null,
  vendorLoading: false,
  vendorError: null,
};

export const useOrderStore = create((set, get) => ({
  ...initial,

  // ─────────────────────── reset ───────────────────────
  reset: () => set({ ...initial }),
  resetOrders: () =>
    set({
      orders: [],
      ordersMeta: initial.ordersMeta,
      currentOrder: null,
      lastPlacedOrder: null,
      ordersLoading: false,
      ordersError: null,
    }),
  resetVendor: () =>
    set({
      vendorOrders: [],
      vendorOrdersMeta: initial.vendorOrdersMeta,
      vendorCurrentOrder: null,
      vendorLoading: false,
      vendorError: null,
    }),

  // ─────────────────────── addresses ───────────────────
  fetchAddresses: async () => {
    set({ addressesLoading: true, addressError: null });
    try {
      const data = await orderService.listAddresses();
      const list = data?.results || data?.data || data || [];
      const defaultAddr = list.find((a) => a.is_default);
      set({
        addresses: list,
        defaultAddressId: defaultAddr ? defaultAddr.id : null,
      });
      return list;
    } catch (err) {
      set({ addressError: err.message || 'Failed to load addresses' });
      throw err;
    } finally {
      set({ addressesLoading: false });
    }
  },

  createAddress: async (payload) => {
    try {
      const created = await orderService.createAddress(payload);
      const list = [...get().addresses, created];
      const defaultId = created.is_default ? created.id : get().defaultAddressId;
      // If this is the first address the backend auto-defaults it; reflect that.
      const normalized = list.map((a) =>
        a.id === created.id
          ? a
          : created.is_default
          ? { ...a, is_default: false }
          : a
      );
      set({
        addresses: normalized,
        defaultAddressId:
          defaultId || (normalized.length === 1 ? normalized[0].id : defaultId),
      });
      return created;
    } catch (err) {
      set({ addressError: err.message || 'Failed to create address' });
      throw err;
    }
  },

  updateAddress: async (id, payload) => {
    const snapshot = get().addresses;
    const optimistic = snapshot.map((a) =>
      a.id === id ? { ...a, ...payload } : a
    );
    set({ addresses: optimistic });
    try {
      const updated = await orderService.updateAddress(id, payload);
      const list = get().addresses.map((a) => (a.id === id ? updated : a));
      set({ addresses: list });
      return updated;
    } catch (err) {
      set({ addresses: snapshot, addressError: err.message });
      throw err;
    }
  },

  deleteAddress: async (id) => {
    const snapshot = get().addresses;
    const filtered = snapshot.filter((a) => a.id !== id);
    set({
      addresses: filtered,
      defaultAddressId:
        get().defaultAddressId === id
          ? filtered.find((a) => a.is_default)?.id || null
          : get().defaultAddressId,
    });
    try {
      await orderService.deleteAddress(id);
    } catch (err) {
      set({ addresses: snapshot, addressError: err.message });
      throw err;
    }
  },

  setDefaultAddress: async (id) => {
    const snapshot = get().addresses;
    // Optimistic — flip is_default on all addresses locally.
    const optimistic = snapshot.map((a) => ({ ...a, is_default: a.id === id }));
    set({ addresses: optimistic, defaultAddressId: id });
    try {
      await orderService.setDefaultAddress(id);
    } catch (err) {
      set({ addresses: snapshot, addressError: err.message });
      throw err;
    }
  },

  // ─────────────────────── customer orders ─────────────
  fetchOrders: async (params = {}) => {
    set({ ordersLoading: true, ordersError: null });
    try {
      const data = await orderService.listOrders(params);
      const list = data?.results || data?.data || data || [];
      const meta = {
        count: data?.count ?? list.length,
        page: data?.page ?? params.page ?? 1,
        pageSize: data?.page_size ?? params.page_size ?? 20,
        hasNext: !!data?.next,
      };
      set({ orders: list, ordersMeta: meta });
      return list;
    } catch (err) {
      set({ ordersError: err.message || 'Failed to load orders' });
      throw err;
    } finally {
      set({ ordersLoading: false });
    }
  },

  fetchOrder: async (orderNumber) => {
    set({ ordersError: null });
    try {
      const data = await orderService.getOrder(orderNumber);
      set({ currentOrder: data });
      return data;
    } catch (err) {
      set({ ordersError: err.message || 'Failed to load order' });
      throw err;
    }
  },

  placeOrder: async ({ address_id, notes = '' }) => {
    set({ ordersError: null });
    try {
      const data = await orderService.placeOrder({ address_id, notes });
      const created = data?.order || data; // envelope may wrap under "order"
      const orderNumber = created?.order_number;
      set({
        lastPlacedOrder: created,
        currentOrder: created,
      });
      return created;
    } catch (err) {
      set({ ordersError: err.message || 'Failed to place order' });
      throw err;
    }
  },

  cancelOrder: async (orderNumber) => {
    try {
      const data = await orderService.cancelOrder(orderNumber);
      // Update both `orders` list and `currentOrder` if it's the same one.
      const updated = data?.order || data;
      set({
        orders: get().orders.map((o) =>
          o.order_number === orderNumber ? { ...o, ...updated, status: 'CANCELLED' } : o
        ),
        currentOrder:
          get().currentOrder?.order_number === orderNumber
            ? { ...get().currentOrder, ...updated, status: 'CANCELLED' }
            : get().currentOrder,
      });
      return updated;
    } catch (err) {
      set({ ordersError: err.message || 'Failed to cancel order' });
      throw err;
    }
  },

  // ─────────────────────── vendor orders ───────────────
  fetchVendorOrders: async (params = {}) => {
    set({ vendorLoading: true, vendorError: null });
    try {
      const data = await orderService.listVendorOrders(params);
      const list = data?.results || data?.data || data || [];
      const meta = {
        count: data?.count ?? list.length,
        page: data?.page ?? params.page ?? 1,
        pageSize: data?.page_size ?? params.page_size ?? 20,
        hasNext: !!data?.next,
      };
      set({ vendorOrders: list, vendorOrdersMeta: meta });
      return list;
    } catch (err) {
      set({ vendorError: err.message || 'Failed to load vendor orders' });
      throw err;
    } finally {
      set({ vendorLoading: false });
    }
  },

  fetchVendorOrder: async (orderNumber) => {
    try {
      const data = await orderService.getVendorOrder(orderNumber);
      set({ vendorCurrentOrder: data });
      return data;
    } catch (err) {
      set({ vendorError: err.message || 'Failed to load vendor order' });
      throw err;
    }
  },

  updateItemStatus: async (itemId, payload) => {
    try {
      const data = await orderService.updateVendorItemStatus(itemId, payload);
      // Patch the item inside vendorCurrentOrder if present.
      const cur = get().vendorCurrentOrder;
      if (cur) {
        const items = (cur.items || []).map((i) =>
          i.id === itemId
            ? {
                ...i,
                item_status: payload.status,
                ...(payload.tracking_number
                  ? { tracking_number: payload.tracking_number }
                  : {}),
              }
            : i
        );
        set({ vendorCurrentOrder: { ...cur, items } });
      }
      return data;
    } catch (err) {
      set({ vendorError: err.message || 'Failed to update item status' });
      throw err;
    }
  },
}));

export default useOrderStore;