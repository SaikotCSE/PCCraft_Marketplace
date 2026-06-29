// FormField — labeled input with inline Zod error rendering.
//
// Wraps a single input so every form in the app gets the same look + the
// same red helper-text pattern below the field. Supports text, email,
// password (with show/hide toggle), tel, date, number, file, and select.
//
// Usage (RHF):
//   <FormField
//     label="Email"
//     error={errors.email?.message}
//     required
//     registration={register('email')}     // RHF's { onChange, onBlur, ref, name }
//     autoComplete="email"
//     leadingIcon={<Mail className="h-4 w-4" />}
//   />
//
// `registration` is the recommended path — the field renders its own input
// so RHF state, error styling, id, and aria-describedby all stay in sync.
// For unusual cases you can still pass `children` (the input element) and
// the field will clone it, but you must spread RHF's `register()` props
// yourself onto the child.
import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

const FIELD_ID_PREFIX = 'field';

function fieldId(label, htmlFor) {
  if (htmlFor) return htmlFor;
  const slug = String(label || 'field').toLowerCase().replace(/\s+/g, '-');
  return `${FIELD_ID_PREFIX}-${slug}`;
}

/**
 * @param {{
 *   label: string,
 *   error?: string,
 *   hint?: string,
 *   required?: boolean,
 *   htmlFor?: string,
 *   trailing?: React.ReactNode,
 *   leadingIcon?: React.ReactNode,
 *   registration?: object, // react-hook-form { onChange, onBlur, ref, name }
 *   type?: string,         // input type, default "text"
 *   autoComplete?: string,
 *   placeholder?: string,
 *   children?: React.ReactElement, // legacy: pass the input as children
 * }} props
 */
const FormField = forwardRef(function FormField(props, ref) {
  const {
    label,
    error,
    hint,
    required,
    htmlFor,
    trailing,
    leadingIcon,
    registration,
    type = 'text',
    autoComplete,
    placeholder,
    children,
  } = props;

  const id = fieldId(label, htmlFor);
  const describedBy = error
    ? `${id}-error`
    : hint
      ? `${id}-hint`
      : undefined;

  // Two render paths:
  // 1. `registration` path (preferred): FormField owns the input.
  // 2. Legacy `children` path: caller provides the input; we clone it and
  //    inject id / aria / className. This still works for selects, etc.
  const isRegistrationPath = registration && !children;

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

      <div className="relative">
        {leadingIcon ? (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-text-secondary">
            {leadingIcon}
          </span>
        ) : null}

        {isRegistrationPath ? (
          <input
            ref={(node) => {
              // Forward the ref AND hand it to RHF.
              if (registration.ref) registration.ref(node);
              if (typeof ref === 'function') ref(node);
              else if (ref) ref.current = node;
            }}
            id={id}
            type={type}
            name={registration.name}
            onChange={registration.onChange}
            onBlur={registration.onBlur}
            autoComplete={autoComplete}
            placeholder={placeholder}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={inputClassName(error, !!leadingIcon)}
          />
        ) : (
          <FieldControlClone id={id} describedBy={describedBy} hasError={!!error} hasIcon={!!leadingIcon}>
            {children}
          </FieldControlClone>
        )}
      </div>

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

function inputClassName(hasError, hasIcon) {
  // Single source of truth for input chrome. Keep this identical to the
  // classes FieldControlClone injects so both code paths render the same.
  const base =
    'block w-full rounded-md border bg-surface-50 text-sm text-text-primary placeholder:text-text-secondary transition focus:outline-none focus:ring-2 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-60';
  const sizing = hasIcon ? 'py-2 pl-9 pr-3' : 'px-3 py-2';
  const state = hasError
    ? 'border-danger focus:border-danger focus:ring-danger'
    : 'border-surface-300 focus:border-accent-500 focus:ring-accent-500';
  return `${base} ${sizing} ${state}`;
}

/**
 * Clones the single child input and injects the id / aria / className so
 * the field can wire error styling without the caller writing it. Used by
 * the legacy `children` path; the registration path renders its own input.
 */
function FieldControlClone({ id, describedBy, hasError, hasIcon, children }) {
  const child = children;
  if (!child || typeof child !== 'object' || !('type' in child)) {
    return children;
  }
  const existing = child.props || {};
  return (
    <child.type
      {...existing}
      id={existing.id || id}
      aria-invalid={hasError || existing['aria-invalid']}
      aria-describedby={describedBy || existing['aria-describedby']}
      className={`${inputClassName(hasError, hasIcon)} ${existing.className || ''}`.trim()}
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
 *   leadingIcon?: React.ReactNode,
 *   placeholder?: string,
 * }} props
 */
export function PasswordField({
  label,
  error,
  hint,
  required,
  registration,
  autoComplete = 'current-password',
  leadingIcon,
  placeholder,
}) {
  const [show, setShow] = useState(false);
  // PasswordField wraps FormField and adds a show/hide toggle. Because
  // FormField renders its own input in the registration path, we render
  // the input inside this wrapper and forward RHF's `register` props so
  // validation still runs.
  const id = fieldId(label);

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="flex items-center gap-1 text-sm font-medium text-text-primary"
      >
        {label}
        {required && <span className="text-danger">*</span>}
      </label>

      <div className="relative">
        {leadingIcon ? (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-text-secondary">
            {leadingIcon}
          </span>
        ) : null}

        <input
          ref={(node) => {
            if (registration.ref) registration.ref(node);
          }}
          id={id}
          name={registration.name}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          placeholder={placeholder}
          onChange={registration.onChange}
          onBlur={registration.onBlur}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={inputClassName(error, !!leadingIcon)}
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
}

export default FormField;