import { useEffect, useRef } from 'react';

/**
 * Calls `handler` whenever a pointerdown event lands outside the returned ref.
 * Used by dropdowns, modals, popovers to close themselves on outside click.
 */
export function useClickOutside(handler) {
  const ref = useRef(null);

  useEffect(() => {
    function listener(event) {
      if (!ref.current || ref.current.contains(event.target)) return;
      handler(event);
    }
    document.addEventListener('pointerdown', listener);
    return () => document.removeEventListener('pointerdown', listener);
  }, [handler]);

  return ref;
}