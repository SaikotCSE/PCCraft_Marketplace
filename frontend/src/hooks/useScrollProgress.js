// useScrollProgress — Module 7-style utility.
//
// Returns a number in [0, 1] representing how far the user has scrolled
// down the document. Used by the Navbar to drive the gradient progress
// bar that grows as you scroll.
//
// Throttled via requestAnimationFrame so it stays smooth on long pages.
// Resilient to SSR (returns 0 if `window` is missing).
import { useEffect, useState } from 'react';

export function useScrollProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let frame = 0;
    const compute = () => {
      const doc = document.documentElement;
      const max = (doc.scrollHeight - window.innerHeight) || 1;
      const value = Math.min(1, Math.max(0, window.scrollY / max));
      setProgress(value);
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        compute();
      });
    };

    compute();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return progress;
}

export default useScrollProgress;