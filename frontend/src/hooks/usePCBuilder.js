/**
 * PC Builder hook stub — full implementation arrives in Module 8.
 * For Module 0 the hook just exposes a typed shape so the placeholders
 * can import it without a missing-module error.
 */
import { useCallback, useState } from 'react';

const EMPTY_BUILD = Object.freeze({
  name: '',
  components: {}, // slot_key → product
  wattage: 0,
});

export function usePCBuilder() {
  const [build, setBuild] = useState(EMPTY_BUILD);

  const setComponent = useCallback((slotKey, product) => {
    setBuild((prev) => ({
      ...prev,
      components: { ...prev.components, [slotKey]: product },
    }));
  }, []);

  const removeComponent = useCallback((slotKey) => {
    setBuild((prev) => {
      const next = { ...prev.components };
      delete next[slotKey];
      return { ...prev, components: next };
    });
  }, []);

  const resetBuild = useCallback(() => setBuild(EMPTY_BUILD), []);

  return { build, setComponent, removeComponent, resetBuild };
}