// useUIStore — Zustand store for cross-page UI state.
//
// Holds things that don't deserve their own slice but need to be read by
// more than one component:
//   - mobile nav open
//   - search drawer open
//   - global modal stack (so any component can push a modal without
//     prop-drilling)
//   - theme preference (light/dark — set per spec §1.2)
//   - toast queue mirror (react-hot-toast owns the actual toasts; this
//     keeps a counter for tests + persistent banners if we ever need them)
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { STORAGE_KEYS } from '@utils/constants';

const defaultModal = () => null;

export const useUIStore = create(
  persist(
    (set, get) => ({
      // ----- navigation -----
      isMobileNavOpen: false,
      isSearchOpen: false,
      isCartDrawerOpen: false,

      // ----- modal stack (top of stack is rendered) -----
      modalStack: [],
      pushModal: (modal) =>
        set((s) => ({
          modalStack: [...s.modalStack, { id: crypto.randomUUID(), ...modal }],
        })),
      popModal: () =>
        set((s) => ({ modalStack: s.modalStack.slice(0, -1) })),
      closeAllModals: () => set({ modalStack: [] }),

      // ----- theme -----
      theme: 'light', // 'light' | 'dark'
      setTheme: (theme) => set({ theme }),

      // ----- network status (for offline banner) -----
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      setOnline: (isOnline) => set({ isOnline }),

      // ----- toggles -----
      toggleMobileNav: () => set((s) => ({ isMobileNavOpen: !s.isMobileNavOpen })),
      closeMobileNav: () => set({ isMobileNavOpen: false }),

      toggleSearch: () => set((s) => ({ isSearchOpen: !s.isSearchOpen })),
      closeSearch: () => set({ isSearchOpen: false }),

      toggleCartDrawer: () => set((s) => ({ isCartDrawerOpen: !s.isCartDrawerOpen })),
      closeCartDrawer: () => set({ isCartDrawerOpen: false }),

      reset: () =>
        set({
          isMobileNavOpen: false,
          isSearchOpen: false,
          isCartDrawerOpen: false,
          modalStack: [],
          theme: get().theme,
          isOnline: get().isOnline,
        }),
    }),
    {
      name: STORAGE_KEYS.UI_PREFS || 'pccraft-ui-prefs',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ theme: state.theme }),
    }
  )
);

export default useUIStore;
