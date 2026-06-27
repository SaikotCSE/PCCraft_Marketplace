// usePageTitle — sets `document.title` on mount and restores the previous
// title on unmount. Accepts a static string or a function returning the
// title (useful when the title depends on data not yet loaded).
//
//   usePageTitle('Login');
//   usePageTitle(user ? `${user.full_name} · PCCraft` : 'Profile · PCCraft');
//
// The hook is intentionally tiny: no deps, no side-effects on re-render
// beyond the simple assignment so that route changes feel snappy.
import { useEffect } from 'react';

export function usePageTitle(title) {
  useEffect(() => {
    const prev = document.title;
    const next = typeof title === 'function' ? title() : title;
    if (next) document.title = String(next);
    return () => {
      document.title = prev;
    };
  }, [title]);
}

export default usePageTitle;
