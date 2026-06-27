import { useCallback, useEffect, useState } from 'react';

/**
 * Reactive `localStorage` binding. Returns a `[value, setValue]` tuple just
 * like `useState` but persists every write to `window.localStorage`.
 *
 * Important: never use this for sensitive data (auth tokens, etc.). Per
 * Frontend Standards rule #12, tokens belong in memory (Zustand) only.
 *
 * @template T
 * @param {string} key
 * @param {T} initialValue
 * @returns {[T, (next: T | ((prev: T) => T)) => void]}
 */
export function useLocalStorage(key, initialValue) {
  const read = useCallback(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return initialValue;
      return JSON.parse(raw);
    } catch {
      return initialValue;
    }
  }, [key, initialValue]);

  const [value, setValue] = useState(read);

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota exceeded or storage unavailable — ignore */
    }
  }, [key, value]);

  return [value, setValue];
}