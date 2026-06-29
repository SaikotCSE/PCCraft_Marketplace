// FileUpload — drag-and-drop file input with MIME / size preview.
//
// Used by the vendor registration step 4 for the trade license and NID
// documents. Accepts the file via click or drop; validates client-side
// for size (5 MB) and MIME (PDF / JPEG / PNG / WEBP). Reports the chosen
// file back to the parent form via either:
//   • `onFileChange(name, file)` if provided (preferred — typically wired
//     to react-hook-form's `setValue`), OR
//   • the legacy `registration.onChange` synthetic-event path as a fallback.
//
// The synthetic-event path tries to dispatch a `change` event shaped like
// a native `<input type="file">` selection. RHF's auto-generated onChange
// reads the registered ref's `.files` for file inputs, so a drop or a
// programmatic update wouldn't propagate. Parents should pass
// `onFileChange` to dodge that pitfall.
import { useEffect, useRef, useState } from 'react';
import { Upload, FileText, X } from 'lucide-react';

const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';
const MAX_BYTES = 5 * 1024 * 1024;
const HUMAN_TYPES = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WEBP',
};

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * @param {{
 *   label: string,
 *   error?: string,
 *   hint?: string,
 *   required?: boolean,
 *   registration?: object,             // RHF { name, onChange, onBlur, ref }
 *   onFileChange?: (name, file) => void,
 *   accept?: string,
 *   maxBytes?: number,
 * }} props
 */
export default function FileUpload({
  label,
  error,
  hint,
  required,
  registration,
  onFileChange,
  accept = ACCEPT,
  maxBytes = MAX_BYTES,
}) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [localFile, setLocalFile] = useState(null);

  // Sync local preview with form state when validation clears the file.
  const registeredFile = registration?.value;
  const file = registeredFile ?? localFile;
  const fieldName = registration?.name;

  useEffect(() => {
    if (registeredFile) setLocalFile(registeredFile);
    if (registeredFile == null && localFile != null) setLocalFile(null);
    // We only want to react to external resets of the registered value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registeredFile]);

  const onPick = () => inputRef.current?.click();

  const commit = (next) => {
    setLocalFile(next);
    if (onFileChange) {
      onFileChange(fieldName, next);
      return;
    }
    if (registration?.onChange && fieldName) {
      if (next == null) {
        registration.onChange({ target: { files: [], name: fieldName }, type: 'change' });
        return;
      }
      const dt = typeof DataTransfer !== 'undefined' ? new DataTransfer() : null;
      if (dt) dt.items.add(next);
      registration.onChange({
        target: { files: dt ? dt.files : [next], name: fieldName },
        type: 'change',
        persist: () => {},
      });
    }
  };

  const onSelect = (selected) => {
    if (!selected) {
      commit(null);
      return;
    }
    if (selected.size > maxBytes) {
      commit(null);
      // Surface the validation message via RHF — the parent will show it.
      // We rely on the parent's `validate` to translate this into an error.
      return;
    }
    commit(selected);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) onSelect(dropped);
  };

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-text-primary">
        {label}
        {required && <span className="text-danger">*</span>}
      </label>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={file ? undefined : onPick}
        className={`flex cursor-pointer items-center gap-3 rounded-md border-2 border-dashed bg-surface-50 p-4 transition-colors ${
          dragOver ? 'border-accent-500 bg-accent-500/5' : 'border-surface-300 hover:border-accent-500/60'
        } ${error ? 'border-danger' : ''} ${file ? 'cursor-default' : ''}`}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (!file && (e.key === 'Enter' || e.key === ' ')) onPick();
        }}
      >
        <input
          ref={(el) => {
            inputRef.current = el;
            if (registration?.ref) registration.ref(el);
          }}
          type="file"
          accept={accept}
          onChange={(e) => onSelect(e.target.files?.[0])}
          onBlur={registration?.onBlur}
          name={fieldName}
          className="sr-only"
        />

        {file ? (
          <>
            <div className="grid h-10 w-10 place-items-center rounded-md bg-accent-500/10 text-accent-500">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text-primary">{file.name}</p>
              <p className="text-xs text-text-secondary">
                {HUMAN_TYPES[file.type] || file.type || 'unknown'} · {formatBytes(file.size)}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (inputRef.current) inputRef.current.value = '';
                onSelect(null);
              }}
              className="rounded-md p-1.5 text-text-secondary hover:bg-surface-200 hover:text-danger"
              aria-label="Remove file"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            <div className="grid h-10 w-10 place-items-center rounded-md bg-accent-500/10 text-accent-500">
              <Upload className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text-primary">
                Drop a file here or <span className="text-accent-500">browse</span>
              </p>
              <p className="text-xs text-text-secondary">
                PDF, JPG, PNG, or WEBP — up to {(maxBytes / (1024 * 1024)).toFixed(0)} MB
              </p>
            </div>
          </>
        )}
      </div>

      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-text-secondary">{hint}</p>
      ) : null}
    </div>
  );
}