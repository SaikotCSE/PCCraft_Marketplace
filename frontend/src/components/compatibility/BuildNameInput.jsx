// BuildNameInput — inline editable build name.
//
// Click the pencil (or the text itself) to edit; Enter / blur commits,
// Escape reverts. Backed by `usePCBuilder().setName`. Keeps the title
// long enough to show full intent but caps at 120 chars (matches
// `setName` clamp on the store side).

import { useEffect, useRef, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';

import { usePCBuilder } from '@hooks/usePCBuilder';
import { cn } from '@utils/cn';

const MAX_LEN = 120;

const BuildNameInput = ({ className = '' }) => {
  const storedName = usePCBuilder((s) => s.name);
  const setName = usePCBuilder((s) => s.setName);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(storedName);
  const inputRef = useRef(null);

  // Keep the draft in sync when the store changes from elsewhere
  // (e.g. after a save server round-trip echoes the canonical name).
  useEffect(() => {
    if (!editing) setDraft(storedName);
  }, [storedName, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    const trimmed = (draft || '').trim().slice(0, MAX_LEN);
    setName(trimmed || 'My Build');
    setDraft(trimmed || 'My Build');
    setEditing(false);
  };

  const cancel = () => {
    setDraft(storedName);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <h1 className="font-heading text-2xl font-semibold text-text-primary">
          {storedName || 'My Build'}
        </h1>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Rename build"
          className="rounded-md p-1 text-text-secondary transition hover:bg-surface-100 hover:text-text-primary"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        maxLength={MAX_LEN}
        className="w-full max-w-xs rounded-md border border-accent-500 bg-surface px-3 py-1.5 font-heading text-xl font-semibold text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-500"
      />
      <button
        type="button"
        onClick={commit}
        aria-label="Save name"
        className="rounded-md p-1.5 text-emerald-500 hover:bg-emerald-500/10"
      >
        <Check className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={cancel}
        aria-label="Cancel rename"
        className="rounded-md p-1.5 text-text-secondary hover:bg-surface-100 hover:text-danger"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default BuildNameInput;