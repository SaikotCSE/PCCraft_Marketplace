// useCartStore — Zustand store for the shopping cart.
//
// Two operating modes:
//   1. Authenticated user → /cart/items/ is the source of truth; we
//      hydrate from the server on login and push every mutation through
//      cartService.
//   2. Anonymous user → cart lives entirely client-side under
//      STORAGE_KEYS.CART_BACKUP; we sync it to the server the moment the
//      user logs in (cartService.addItem in a loop).
//
// The store never holds raw server data only — it always exposes the
// computed totals React components need (subtotal, itemCount).
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { cartService } from '@services/cartService';
import { STORAGE_KEYS } from '@utils/constants';

const emptyTotals = () => ({ subtotal: 0, item_count: 0, tax: 0, shipping: 0, total: 0 });

const computeTotals = (items) => {
  if (!Array.isArray(items) || items.length === 0) return emptyTotals();
  const subtotal = items.reduce((sum, i) => sum + Number(i.line_total ?? i.subtotal ?? 0), 0);
  const item_count = items.reduce((sum, i) => sum + Number(i.quantity ?? 0), 0);
  const tax = +(subtotal * 0.05).toFixed(2); // 5% VAT — placeholder until backend returns tax
  const shipping = items.length > 0 ? 60 : 0;
  const total = +(subtotal + tax + shipping).toFixed(2);
  return { subtotal: +subtotal.toFixed(2), item_count, tax, shipping, total };
};

export const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],
      totals: emptyTotals(),
      isLoading: false,
      error: null,
      lastSyncedAt: null,

      // ----- selectors -----
      itemCount: () => get().totals.item_count,
      subtotal: () => get().totals.subtotal,

      // ----- mutators (anonymous path) -----
      addLocal: (item) => {
        const items = [...get().items];
        const idx = items.findIndex((i) => i.product_id === item.product_id);
        if (idx >= 0) {
          items[idx] = { ...items[idx], quantity: items[idx].quantity + (item.quantity || 1) };
        } else {
          items.push({ ...item, quantity: item.quantity || 1 });
        }
        set({ items, totals: computeTotals(items) });
      },

      removeLocal: (productId) => {
        const items = get().items.filter((i) => i.product_id !== productId);
        set({ items, totals: computeTotals(items) });
      },

      updateLocal: (productId, quantity) => {
        const items = get().items
          .map((i) => (i.product_id === productId ? { ...i, quantity } : i))
          .filter((i) => i.quantity > 0);
        set({ items, totals: computeTotals(items) });
      },

      clearLocal: () => set({ items: [], totals: emptyTotals() }),

      // ----- sync (server path) -----
      fetch: async () => {
        set({ isLoading: true, error: null });
        try {
          const data = await cartService.fetch();
          const payload = data?.data || data;
          const items = payload?.items || payload?.results || [];
          set({
            items,
            totals: payload?.totals || computeTotals(items),
            lastSyncedAt: new Date().toISOString(),
          });
          return items;
        } catch (err) {
          set({ error: err.message });
          throw err;
        } finally {
          set({ isLoading: false });
        }
      },

      addItem: async (payload) => {
        // Optimistic local update — server is the eventual source of truth.
        get().addLocal(payload);
        try {
          await cartService.addItem(payload);
          await get().fetch();
        } catch (err) {
          get().removeLocal(payload.product_id);
          throw err;
        }
      },

      updateQty: async (itemId, quantity) => {
        const snapshot = get().items;
        get().updateLocal(
          snapshot.find((i) => i.id === itemId)?.product_id,
          quantity
        );
        try {
          await cartService.updateQty(itemId, quantity);
        } catch (err) {
          set({ items: snapshot, totals: computeTotals(snapshot) });
          throw err;
        }
      },

      removeItem: async (itemId) => {
        const snapshot = get().items;
        get().removeLocal(snapshot.find((i) => i.id === itemId)?.product_id);
        try {
          await cartService.removeItem(itemId);
        } catch (err) {
          set({ items: snapshot, totals: computeTotals(snapshot) });
          throw err;
        }
      },

      clear: async () => {
        const snapshot = get().items;
        get().clearLocal();
        try {
          await cartService.clear();
        } catch (err) {
          set({ items: snapshot, totals: computeTotals(snapshot) });
          throw err;
        }
      },

      /** Merge an anonymous local cart into the user's server cart. */
      syncAnonymousToServer: async () => {
        const local = get().items;
        if (!local.length) return;
        for (const item of local) {
          try {
            await cartService.addItem({ product_id: item.product_id, quantity: item.quantity });
          } catch {
            // ignore individual failures; user can resolve in UI
          }
        }
        get().clearLocal();
        await get().fetch();
      },

      reset: () => set({ items: [], totals: emptyTotals(), error: null, lastSyncedAt: null }),
    }),
    {
      name: STORAGE_KEYS.CART_BACKUP || 'pccraft-cart-backup',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items }), // only persist the line items
    }
  )
);

export default useCartStore;
