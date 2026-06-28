// useIntersectionObserver — Module 7
// -----------------------------------------------------------------------------
// Returns `{ ref, isIntersecting }`. Once the observed node enters the
// viewport (default: 100px root margin — preload just before visible),
// `isIntersecting` flips to `true` and stays `true` permanently. This
// stops carousels from re-fetching when the user scrolls back out.
// -----------------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react';

/**
 * Observe a single element and report whether it has entered the viewport.
 *
 * @param {Object}  [options]
 * @param {number}  [options.threshold=0]      0..1 — fraction visible to fire.
 * @param {string}  [options.rootMargin='100px'] CSS-style margin around root.
 * @returns {{ ref: React.RefObject, isIntersecting: boolean }}
 */
export function useIntersectionObserver(
  { threshold = 0, rootMargin = '100px' } = {},
) {
  const ref = useRef(null);
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsIntersecting(true);
          }
        });
      },
      { rootMargin, threshold },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin, threshold]);

  return { ref, isIntersecting };
}

export default useIntersectionObserver;