// SearchBar — Module 11 — enhanced search input with live suggestions.
//
// Per spec §11.1 (frontend):
//   • `useDebounce(query, 300)` triggers suggestions fetch.
//   • Dropdown below the input shows:
//       - "Recent Searches" (from localStorage, max 5, with × to remove).
//       - "Suggestions" (from API): product names + category names.
//   • Click suggestion → navigate to /search?q=<suggestion>.
//   • Press Enter or click the search icon → /search?q=<query>.
//
// The bar is uncontrolled-on-mount (initial value from props or URL) but
// re-syncs when the `initialQuery` prop changes (e.g. landing on the
// /search page with ?q= already set).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Clock, X, Loader2, Tag, Package } from 'lucide-react';

import { useDebounce } from '@hooks/useDebounce';
import { useClickOutside } from '@hooks/useClickOutside';
import { useLocalStorage } from '@hooks/useLocalStorage';
import { searchService } from '@services/searchService';
import { paths } from '@routes/routePaths';
import { STORAGE_KEYS } from '@utils/constants';
import { cn } from '@utils/cn';

const RECENT_MAX = 5;
const MIN_QUERY_LEN = 2;

const SearchBar = ({
  initialQuery = '',
  onSubmit,
  size = 'md',
  className = '',
  autoFocus = false,
}) => {
  const navigate = useNavigate();
  const [value, setValue] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [recents, setRecents] = useLocalStorage(STORAGE_KEYS.RECENT_SEARCHES, []);
  const debounced = useDebounce(value, 300);
  const [suggestions, setSuggestions] = useState({
    products: [],
    categories: [],
  });
  const [loading, setLoading] = useState(false);

  const containerRef = useClickOutside(() => setOpen(false));
  const inputRef = useRef(null);
  const reqIdRef = useRef(0);

  // When the parent updates the initial query (e.g. URL changed), sync the
  // input so the bar reflects the active search.
  useEffect(() => {
    setValue(initialQuery);
  }, [initialQuery]);

  // Live suggestions — only when the user has typed at least 2 chars.
  useEffect(() => {
    const q = (debounced || '').trim();
    if (q.length < MIN_QUERY_LEN) {
      setSuggestions({ products: [], categories: [] });
      setLoading(false);
      return undefined;
    }
    const myReq = ++reqIdRef.current;
    setLoading(true);
    searchService
      .suggestions(q)
      .then((data) => {
        if (reqIdRef.current !== myReq) return;
        setSuggestions({
          products: Array.isArray(data?.products) ? data.products : [],
          categories: Array.isArray(data?.categories) ? data.categories : [],
        });
      })
      .catch(() => {
        if (reqIdRef.current !== myReq) return;
        setSuggestions({ products: [], categories: [] });
      })
      .finally(() => {
        if (reqIdRef.current === myReq) setLoading(false);
      });
  }, [debounced]);

  // Build a flat list of selectable items so ↑/↓ navigation is uniform:
  //   recents → product suggestions → category suggestions
  const items = useMemo(() => {
    const list = [];
    const safeRecents = Array.isArray(recents) ? recents.slice(0, RECENT_MAX) : [];
    safeRecents.forEach((q) => list.push({ type: 'recent', query: q }));
    suggestions.products.forEach((p) =>
      list.push({ type: 'product', query: p.name, slug: p.slug })
    );
    suggestions.categories.forEach((c) =>
      list.push({ type: 'category', query: c.name, slug: c.slug })
    );
    return list;
  }, [recents, suggestions]);

  // Reset the keyboard cursor whenever the menu contents change.
  useEffect(() => {
    setActiveIndex(items.length > 0 ? 0 : -1);
  }, [items]);

  const commit = useCallback(
    (rawQuery) => {
      const q = (rawQuery ?? value).trim();
      if (!q) return;
      // Persist into recent-searches (newest first, dedup, cap RECENT_MAX).
      const next = [
        q,
        ...(Array.isArray(recents) ? recents.filter((r) => r !== q) : []),
      ].slice(0, RECENT_MAX);
      setRecents(next);
      setOpen(false);
      if (onSubmit) onSubmit(q);
      else navigate(`${paths.search()}?q=${encodeURIComponent(q)}`);
    },
    [value, recents, setRecents, onSubmit, navigate]
  );

  const onItemSelect = useCallback(
    (item) => {
      if (!item) return;
      if (item.type === 'product' && item.slug) {
        setOpen(false);
        navigate(paths.productDetail(item.slug));
        return;
      }
      if (item.type === 'category' && item.slug) {
        setOpen(false);
        navigate(`${paths.categoryDetail(item.slug)}`);
        return;
      }
      commit(item.query);
    },
    [commit, navigate]
  );

  const removeRecent = (q, e) => {
    e?.stopPropagation?.();
    setRecents((prev) => (Array.isArray(prev) ? prev.filter((r) => r !== q) : []));
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (items.length === 0) return;
      setOpen(true);
      setActiveIndex((i) => (i + 1) % items.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (items.length === 0) return;
      setOpen(true);
      setActiveIndex((i) => (i <= 0 ? items.length - 1 : i - 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (open && activeIndex >= 0 && items[activeIndex]) {
        onItemSelect(items[activeIndex]);
      } else {
        commit();
      }
    }
  };

  const sizeClasses =
    size === 'sm'
      ? 'h-9 text-sm'
      : size === 'lg'
        ? 'h-12 text-base'
        : 'h-10 text-sm';

  const showDropdown =
    open &&
    (loading ||
      (Array.isArray(recents) && recents.length > 0) ||
      suggestions.products.length > 0 ||
      suggestions.categories.length > 0);

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          commit();
        }}
        className={cn(
          'flex items-center gap-2 rounded-md border border-primary-900/10 bg-surface-50 pl-3 pr-1 text-text-primary focus-within:border-accent-400',
          sizeClasses
        )}
      >
        <Search className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={value}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck="false"
          placeholder="Search products, categories, brands…"
          aria-label="Search PCCraft"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls="navbar-search-listbox"
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="h-full w-full bg-transparent text-text-primary placeholder:text-text-secondary focus:outline-none"
        />
        {value && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setValue('');
              inputRef.current?.focus();
            }}
            className="grid h-6 w-6 place-items-center rounded text-text-secondary hover:bg-surface-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="submit"
          aria-label="Submit search"
          className="grid h-8 place-items-center rounded bg-accent-500 px-3 text-xs font-semibold uppercase tracking-wide text-primary-900 transition hover:bg-accent-400"
        >
          <span className="hidden sm:inline">Search</span>
          <Search className="h-4 w-4 sm:hidden" aria-hidden="true" />
        </button>
      </form>

      {showDropdown && (
        <div
          id="navbar-search-listbox"
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-md border border-border bg-surface shadow-xl"
        >
          {loading && items.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          )}

          {Array.isArray(recents) && recents.length > 0 && (
            <div>
              <div className="flex items-center justify-between border-b border-surface-200 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Recent
                </span>
                <button
                  type="button"
                  onClick={() => setRecents([])}
                  className="text-[11px] font-medium normal-case text-text-secondary hover:text-danger"
                >
                  Clear all
                </button>
              </div>
              <ul>
                {recents.slice(0, RECENT_MAX).map((q) => {
                  const itemIndex = items.findIndex(
                    (i) => i.type === 'recent' && i.query === q
                  );
                  return (
                    <li key={`recent-${q}`}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={activeIndex === itemIndex}
                        onMouseEnter={() => setActiveIndex(itemIndex)}
                        onClick={() => onItemSelect({ type: 'recent', query: q })}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface-100',
                          activeIndex === itemIndex && 'bg-surface-100'
                        )}
                      >
                        <span className="flex items-center gap-2 text-text-primary">
                          <Clock className="h-3.5 w-3.5 text-text-secondary" />
                          {q}
                        </span>
                        <span
                          role="button"
                          tabIndex={-1}
                          aria-label={`Remove ${q} from recent searches`}
                          onClick={(e) => removeRecent(q, e)}
                          className="grid h-6 w-6 place-items-center rounded text-text-secondary hover:bg-surface-200 hover:text-danger"
                        >
                          <X className="h-3.5 w-3.5" />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {suggestions.products.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 border-b border-surface-200 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                <Package className="h-3.5 w-3.5" /> Products
              </div>
              <ul>
                {suggestions.products.map((p) => {
                  const itemIndex = items.findIndex(
                    (i) => i.type === 'product' && i.slug === p.slug
                  );
                  return (
                    <li key={`prod-${p.id || p.slug}`}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={activeIndex === itemIndex}
                        onMouseEnter={() => setActiveIndex(itemIndex)}
                        onClick={() =>
                          onItemSelect({ type: 'product', query: p.name, slug: p.slug })
                        }
                        className={cn(
                          'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-100',
                          activeIndex === itemIndex && 'bg-surface-100'
                        )}
                      >
                        <Package className="h-3.5 w-3.5 text-text-secondary" />
                        <span className="truncate text-text-primary">{p.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {suggestions.categories.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 border-b border-surface-200 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                <Tag className="h-3.5 w-3.5" /> Categories
              </div>
              <ul>
                {suggestions.categories.map((c) => {
                  const itemIndex = items.findIndex(
                    (i) => i.type === 'category' && i.slug === c.slug
                  );
                  return (
                    <li key={`cat-${c.id || c.slug}`}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={activeIndex === itemIndex}
                        onMouseEnter={() => setActiveIndex(itemIndex)}
                        onClick={() =>
                          onItemSelect({ type: 'category', query: c.name, slug: c.slug })
                        }
                        className={cn(
                          'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-100',
                          activeIndex === itemIndex && 'bg-surface-100'
                        )}
                      >
                        <Tag className="h-3.5 w-3.5 text-text-secondary" />
                        <span className="truncate text-text-primary">{c.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {value.trim() && !loading && items.length === 0 && (
            <div className="px-3 py-4 text-sm text-text-secondary">
              No matches for <span className="font-semibold text-text-primary">{value}</span>.
              Press <span className="rounded bg-surface-200 px-1.5 py-0.5 text-xs">Enter</span> to
              search anyway.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
