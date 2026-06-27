// useWishlistStore — Zustand store for saved products.
//
// Same dual-mode pattern as the cart: anonymous users get a local-only
// wishlist that syncs on login; authenticated users go through the API.
// We store only product IDs locally (no stale price/title snapshots) and
// resolve display fields at render time via productService.detail.
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { wishlistService } from '@services/wishlistService';
import { STORAGE_KEYS } from '@utils/constants';

export const useWishlistStore = create(
  persist(
    (set, get) => ({
      productIds: [],
      items: [], // hydrated server rows: { id, product: { id, slug, ... } }
      isLoading: false,
      error: null,

      // ----- selectors -----
      has: (productId) => get().productIds.includes(productId),
      count: () => get().productIds.length,

      // ----- local mutators -----
      addLocal: (productId) => {
        if (get().productIds.includes(productId)) return;
        set({ productIds: [...get().productIds, productId] });
      },

      removeLocal: (productId) => {
        set({ productIds: get().productIds.filter((id) => id !== productId) });
      },

      toggleLocal: (productId) => {
        if (get().has(productId)) get().removeLocal(productId);
        else get().addLocal(productId);
      },

      clearLocal: () => set({ productIds: [], items: [] }),

      // ----- server sync -----
      fetch: async () => {
        set({ isLoading: true, error: null });
        try {
          const data = await wishlistService.fetch();
          const payload = data?.data || data;
          const items = payload?.items || payload?.results || [];
          const productIds = items.map((i) => i.product?.id ?? i.product_id).filter(Boolean);
          set({ items, productIds });
          return items;
        } catch (err) {
          set({ error: err.message });
          throw err;
        } finally {
          set({ isLoading: false });
        }
      },

      add: async (productId) => {
        get().addLocal(productId);
        try {
          await wishlistService.add(productId);
        } catch (err) {
          get().removeLocal(productId);
          throw err;
        }
      },

      remove: async (productId) => {
        const item = get().items.find((i) => (i.product?.id ?? i.product_id) === productId);
        get().removeLocal(productId);
        try {
          if (item?.id) await wishlistService.remove(item.id);
        } catch (err) {
          get().addLocal(productId);
          throw err;
        }
      },

      toggle: async (productId) => {
        if (get().has(productId)) return get().remove(productId);
        return get().add(productId);
      },

      syncAnonymousToServer: async () => {
        const local = get().productIds;
        if (!local.length) return;
        for (const id of local) {
          try {
            await wishlistService.add(id);
          } catch {
            // ignore duplicates / stock errors
          }
        }
        get().clearLocal();
        await get().fetch();
      },

      reset: () => set({ productIds: [], items: [], error: null }),
    }),
    {
      name: STORAGE_KEYS.WISHLIST_BACKUP || 'pccraft-wishlist-backup',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ productIds: state.productIds }),
    }
  )
);

export default useWishlistStore;
