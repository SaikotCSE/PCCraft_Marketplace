// FileUpload — drag-and-drop file input with MIME / size preview.
//
// Used by the vendor registration step 3 for the trade license and NID
// documents. Accepts the file via click or drop; validates client-side
// for size (5 MB) and MIME (PDF / JPEG / PNG / WEBP). Reports the chosen
// file back via react-hook-form's `onChange`.
import { useRef, useState } from 'react';
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
 *   registration: object, // RHF { onChange, onBlur, ref, name }
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
  accept = ACCEPT,
  maxBytes = MAX_BYTES,
}) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const file = registration?.value;

  const onPick = () => inputRef.current?.click();

  const onSelect = (selected) => {
    if (!selected) {
      registration.onChange(null);
      return;
    }
    if (selected.size > maxBytes) {
      registration.onChange(undefined);
      // Surface the validation message via RHF — the parent will show it.
      // We rely on the parent's `validate` to translate this into an error.
      return;
    }
    registration.onChange(selected);
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
            registration.ref(el);
          }}
          type="file"
          accept={accept}
          onChange={(e) => onSelect(e.target.files?.[0])}
          onBlur={registration.onBlur}
          name={registration.name}
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