import { useEffect, useRef, useState } from 'react';

/**
 * Observe a single element and report whether it has entered the viewport.
 * Used for lazy-load / infinite-scroll triggers.
 */
export function useIntersectionObserver({ rootMargin = '0px', threshold = 0 } = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => entry.isIntersecting && setInView(true)),
      { rootMargin, threshold },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin, threshold]);

  return [ref, inView];
}