import { useEffect, useState } from 'react';

/**
 * Debounce a fast-changing value (e.g. search input).
 *
 * @template T
 * @param {T} value        The live value to debounce.
 * @param {number} delay   Milliseconds to wait before flushing.
 * @returns {T}            The debounced value.
 */
export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}