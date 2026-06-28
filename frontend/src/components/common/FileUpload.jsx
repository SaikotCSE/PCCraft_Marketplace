// FileUpload — multi-image picker with preview grid.
//
// Spec §2.7 says the vendor product form uses this for image upload with:
//   • preview grid
//   • drag-to-reorder (simple HTML5 drag, no extra deps)
//   • star icon to mark a primary image
//   • max 8 images enforced per ProductService.MAX_PRODUCT_IMAGES
//
// Usage (controlled):
//   const [images, setImages] = useState([]);   // [{file, alt_text, is_primary}]
//   <FileUpload value={images} onChange={setImages} max={8} />
//
// Each item is a draft "image": it may be a fresh upload (with `file`) or
// an existing server image (no `file`, but has `id` and a `url`). The
// vendor form distinguishes them via `item.id` presence.
import { useRef, useState } from 'react';
import { Star, Trash2, Upload, X } from 'lucide-react';

import { MAX_PRODUCT_IMAGES } from '@/utils/constants';

const FileUpload = ({
  value = [],
  onChange,
  max = MAX_PRODUCT_IMAGES,
  accept = 'image/*',
  disabled = false,
}) => {
  const inputRef = useRef(null);
  const [draggingOver, setDraggingOver] = useState(false);
  const [error, setError] = useState(null);

  const remaining = Math.max(0, max - value.length);
  const canAdd = remaining > 0 && !disabled;

  const addFiles = (fileList) => {
    setError(null);
    if (!fileList?.length) return;
    const incoming = Array.from(fileList).slice(0, remaining);
    if (incoming.length < fileList.length) {
      setError(`Only ${max} images per product; trimmed the excess.`);
    }
    const drafts = incoming.map((file, i) => ({
      // local-only id so the grid stays stable across re-renders
      _localId: `local-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      preview: URL.createObjectURL(file),
      alt_text: file.name.replace(/\.[^.]+$/, ''),
      is_primary: value.length === 0 && i === 0,
    }));
    onChange?.([...value, ...drafts]);
  };

  const handlePick = (e) => {
    addFiles(e.target.files);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDraggingOver(false);
    if (!canAdd) return;
    addFiles(e.dataTransfer.files);
  };

  const removeAt = (idx) => {
    const next = value.filter((_, i) => i !== idx);
    // keep exactly one primary if any image remains
    if (next.length && !next.some((img) => img.is_primary)) {
      next[0] = { ...next[0], is_primary: true };
    }
    onChange?.(next);
  };

  const setPrimary = (idx) => {
    onChange?.(
      value.map((img, i) => ({ ...img, is_primary: i === idx })),
    );
  };

  const move = (from, to) => {
    if (from === to || to < 0 || to >= value.length) return;
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange?.(next);
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (canAdd) setDraggingOver(true);
        }}
        onDragLeave={() => setDraggingOver(false)}
        onDrop={handleDrop}
        className={[
          'rounded-lg border-2 border-dashed p-6 text-center transition',
          canAdd ? 'cursor-pointer hover:border-accent-400' : 'cursor-not-allowed opacity-60',
          draggingOver ? 'border-accent-500 bg-accent-50' : 'border-surface-300 bg-surface-50',
        ].join(' ')}
        onClick={() => canAdd && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          hidden
          onChange={handlePick}
          disabled={!canAdd}
        />
        <Upload className="mx-auto h-6 w-6 text-text-secondary" aria-hidden="true" />
        <p className="mt-2 text-sm text-text-secondary">
          {canAdd
            ? `Drag images here or click to browse (${remaining} slot${remaining === 1 ? '' : 's'} left)`
            : `Maximum ${max} images per product reached`}
        </p>
        <p className="mt-1 text-xs text-text-secondary">
          PNG, JPG, WebP up to 5 MB each
        </p>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">{error}</p>
      )}

      {value.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {value.map((img, idx) => {
            const preview = img.preview || img.url || img.image;
            return (
              <li
                key={img.id || img._localId}
                draggable={!disabled}
                onDragStart={(e) => e.dataTransfer.setData('text/plain', String(idx))}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = Number(e.dataTransfer.getData('text/plain'));
                  move(from, idx);
                }}
                className="group relative overflow-hidden rounded-lg border border-surface-200 bg-surface-50"
              >
                <img
                  src={preview}
                  alt={img.alt_text || 'Product image'}
                  className="aspect-square w-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-primary-900/70 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => move(idx, idx - 1)}
                    disabled={idx === 0}
                    className="rounded px-1 hover:bg-white/20 disabled:opacity-30"
                    aria-label="Move earlier"
                  >
                    ◀
                  </button>
                  <span>#{idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => move(idx, idx + 1)}
                    disabled={idx === value.length - 1}
                    className="rounded px-1 hover:bg-white/20 disabled:opacity-30"
                    aria-label="Move later"
                  >
                    ▶
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setPrimary(idx)}
                  className={[
                    'absolute right-1 top-1 rounded-full p-1 shadow',
                    img.is_primary
                      ? 'bg-accent-500 text-white'
                      : 'bg-white/90 text-text-secondary hover:text-accent-500',
                  ].join(' ')}
                  aria-label={img.is_primary ? 'Primary image' : 'Mark as primary'}
                  aria-pressed={img.is_primary}
                >
                  <Star className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => removeAt(idx)}
                  className="absolute left-1 top-1 rounded-full bg-white/90 p-1 text-danger shadow hover:bg-danger hover:text-white"
                  aria-label="Remove image"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {value.length > 0 && (
        <p className="mt-2 flex items-center gap-2 text-xs text-text-secondary">
          <Trash2 className="h-3 w-3" />
          Drag thumbnails to reorder. Star marks the primary.
        </p>
      )}
    </div>
  );
};

export default FileUpload;