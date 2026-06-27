// FormField — labeled input with inline Zod error rendering.
//
// Wraps a single input so every form in the app gets the same look + the
// same red helper-text pattern below the field. Supports text, email,
// password (with show/hide toggle), tel, date, number, file, and select.
//
// Usage:
//   <FormField label="Email" error={errors.email?.message} required>
//     <input type="email" {...register('email')} />
//   </FormField>
import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/**
 * @param {{
 *   label: string,
 *   error?: string,
 *   hint?: string,
 *   required?: boolean,
 *   htmlFor?: string,
 *   trailing?: React.ReactNode,
 *   children: React.ReactElement,
 * }} props
 */
const FormField = forwardRef(function FormField(
  { label, error, hint, required, htmlFor, trailing, children },
  ref,
) {
  const id = htmlFor || `field-${label?.toLowerCase().replace(/\s+/g, '-')}`;
  const describedBy = error
    ? `${id}-error`
    : hint
      ? `${id}-hint`
      : undefined;

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="flex items-center gap-1 text-sm font-medium text-text-primary"
      >
        {label}
        {required && <span className="text-danger">*</span>}
        {trailing && <span className="ml-auto">{trailing}</span>}
      </label>

      {/*
       * We render the child input ourselves instead of using a render prop
       * so the field contract is stable: `<FormField>` is responsible for
       * the label + error, the child is responsible for the control. We
       * forward id/error-* attributes via DOM injection (see below).
       */}
      <FieldControlClone id={id} describedBy={describedBy} hasError={!!error}>
        {children}
      </FieldControlClone>

      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-text-secondary">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

/**
 * Clones the single child input and injects the id / aria / className so
 * the field can wire error styling without the caller writing it. Keeps
 * FormField stable across text, email, password, tel, number, date, file.
 */
function FieldControlClone({ id, describedBy, hasError, children }) {
  const child = children;
  if (!child || typeof child !== 'object' || !('type' in child)) {
    return children;
  }
  const existing = child.props || {};
  const baseClass =
    'block w-full rounded-md border bg-surface-50 px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent-500 disabled:cursor-not-allowed disabled:opacity-60';
  const errorClass = hasError
    ? 'border-danger focus:ring-danger'
    : 'border-surface-300';

  return (
    <child.type
      {...existing}
      id={existing.id || id}
      aria-invalid={hasError || undefined}
      aria-describedby={describedBy || existing['aria-describedby']}
      className={`${baseClass} ${errorClass} ${existing.className || ''}`.trim()}
    />
  );
}

// ─── PasswordField — convenient wrapper for password inputs ───────────
/**
 * @param {{
 *   label: string,
 *   error?: string,
 *   hint?: string,
 *   required?: boolean,
 *   registration: object, // react-hook-form { onChange, onBlur, ref, name }
 *   autoComplete?: string,
 * }} props
 */
export function PasswordField({ label, error, hint, required, registration, autoComplete = 'current-password' }) {
  const [show, setShow] = useState(false);
  return (
    <FormField label={label} error={error} hint={hint} required={required}>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          {...registration}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          tabIndex={-1}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-2 flex items-center px-1 text-text-secondary hover:text-text-primary"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </FormField>
  );
}

export default FormField;