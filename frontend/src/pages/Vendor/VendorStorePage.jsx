// VendorStorePage — "My Store" settings surface (Module 10).
//
// Mounted at `/vendor/store` and linked from the vendor sidebar
// "My Store" entry. Lets an approved vendor edit their storefront
// fields, upload a new logo / banner, set the return policy override,
// and adjust the per-vendor low-stock threshold.
//
// Spec §Module 10 (Vendor Dashboard):
//   - Store info form: store name, description textarea, contact email
//   - Logo upload (square, max 2MB, preview)
//   - Banner upload (wide ratio, max 5MB, preview)
//   - Return policy text area (overrides platform default; leave blank
//     to use platform default)
//   - Low stock threshold input (platform default: 5)
//   - Save button → PATCH /api/v1/auth/profile/  (same endpoint used in
//     Module 1; the view routes to VendorProfileSerializer for vendor
//     users, which includes all store fields)
//
// All API calls go through `axiosInstance` (no raw fetch). Auth state
// lives in Zustand's `useAuthStore` (no localStorage).
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'react-hot-toast';
import {
  Store,
  Mail,
  FileText,
  Hash,
  Save,
  ImagePlus,
  Trash2,
  AlertCircle,
} from 'lucide-react';

import useAuthStore from '@context/useAuthStore';
import FormField from '@components/common/FormField';
import { usePageTitle } from '@/hooks/usePageTitle';
import authService from '@services/authService';
import {
  vendorStorefrontSchema,
  vendorStoreAssetsSchema,
  MAX_LOGO_BYTES,
  MAX_BANNER_BYTES,
} from '@utils/validators';
import { useUIStore } from '@context/useUIStore';
import { paths } from '@/routes/routePaths';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const LOGO_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const BANNER_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function VendorStorePage() {
  usePageTitle('My store · Vendor · PCCraft');

  const user = useAuthStore((s) => s.user);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const currency = useUIStore((s) => s.currency);

  const [serverError, setServerError] = useState(null);
  const [savingStorefront, setSavingStorefront] = useState(false);
  const [savingBranding, setSavingBranding] = useState(false);

  // Vendor metadata lives at `user.vendor_meta` (sourced from the
  // profile endpoint) and acts as the form's default values.
  const meta = useMemo(
    () => user?.vendor_meta || {},
    [user?.vendor_meta],
  );

  // Always have the freshest data on mount.
  useEffect(() => {
    refreshProfile().catch(() => {
      // Silent — the form just shows the most recently cached values
      // and a serverError banner if both the cached and refetched
      // values are missing.
    });
  }, [refreshProfile]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-text-primary">
          <Store className="h-6 w-6 text-accent-500" />
          My store
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Update your storefront information, branding, and policy. Changes
          are reflected on your public store page as soon as you save.
        </p>
      </header>

      {serverError && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-2 rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      <StorefrontForm
        defaults={meta}
        submitting={savingStorefront}
        onSubmit={async (values) => {
          setServerError(null);
          setSavingStorefront(true);
          try {
            await updateProfile(values);
            toast.success('Store settings saved.');
          } catch (err) {
            const apiError = err.response?.data?.error;
            setServerError(apiError?.message || 'Could not save store settings.');
          } finally {
            setSavingStorefront(false);
          }
        }}
      />

      <BrandingForm
        defaults={meta}
        submitting={savingBranding}
        onSaved={async () => {
          await refreshProfile();
        }}
        onError={(msg) => setServerError(msg)}
      />

      <StorefrontSummary meta={meta} currency={currency} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Store info form
// ---------------------------------------------------------------------------
function StorefrontForm({ defaults, submitting, onSubmit }) {
  const initial = useMemo(
    () => ({
      store_name: defaults.store_name || defaults.business_name || '',
      store_description: defaults.store_description || '',
      store_contact_email: defaults.store_contact_email || '',
      vendor_return_policy: defaults.vendor_return_policy || '',
      low_stock_threshold: defaults.low_stock_threshold ?? 5,
    }),
    [defaults],
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty, isSubmitting },
    reset,
  } = useForm({
    resolver: zodResolver(vendorStorefrontSchema.pick({
      store_name: true,
      store_description: true,
      store_contact_email: true,
      vendor_return_policy: true,
      low_stock_threshold: true,
    })),
    defaultValues: initial,
  });

  // Re-seed the form whenever vendor_meta changes (e.g. after a save).
  useEffect(() => {
    reset(initial);
  }, [initial, reset]);

  const busy = submitting || isSubmitting;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="space-y-5 rounded-md border border-surface-200 bg-white p-6"
    >
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
          <Store className="h-5 w-5 text-accent-500" />
          Store information
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          These fields appear on your public storefront and in
          search results. Keep them accurate.
        </p>
      </div>

      <FormField
        label="Store name"
        error={errors.store_name?.message}
        required
        registration={register('store_name')}
        hint="Public-facing name customers see at your storefront."
        leadingIcon={<Store className="h-4 w-4" />}
      />

      <FormField
        label="Contact email"
        type="email"
        error={errors.store_contact_email?.message}
        registration={register('store_contact_email')}
        hint="Shown on your storefront for customer support."
        autoComplete="email"
        leadingIcon={<Mail className="h-4 w-4" />}
      />

      <FormField
        label="Store description"
        error={errors.store_description?.message}
        registration={register('store_description')}
        hint="Tell customers what you sell and what makes you different. Plain text; line breaks are preserved."
        leadingIcon={<FileText className="h-4 w-4" />}
      />

      <FormField
        label="Return policy"
        error={errors.vendor_return_policy?.message}
        registration={register('vendor_return_policy')}
        hint="Leave blank to use the platform default. Customers trust clear, specific terms."
        leadingIcon={<FileText className="h-4 w-4" />}
      />

      <FormField
        label="Low-stock threshold"
        type="number"
        error={errors.low_stock_threshold?.message}
        registration={register('low_stock_threshold', { valueAsNumber: true })}
        hint="We'll alert you when any product drops below this count. Platform default: 5."
        leadingIcon={<Hash className="h-4 w-4" />}
      />

      <div className="flex items-center justify-end gap-2 border-t border-surface-100 pt-4">
        <button
          type="button"
          onClick={() => reset(initial)}
          disabled={!isDirty || busy}
          className="inline-flex items-center gap-2 rounded-md border border-surface-200 bg-white px-3 py-2 text-sm font-medium text-text-primary transition hover:bg-surface-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Reset
        </button>
        <button
          type="submit"
          disabled={!isDirty || busy}
          className="inline-flex items-center gap-2 rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {busy ? 'Saving…' : 'Save store info'}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Branding (logo + banner) form
// ---------------------------------------------------------------------------
function BrandingForm({ defaults, submitting, onSaved, onError }) {
  const [logoPreview, setLogoPreview] = useState(defaults.store_logo || '');
  const [bannerPreview, setBannerPreview] = useState(
    defaults.store_banner || '',
  );
  const [logoFile, setLogoFile] = useState(null);
  const [bannerFile, setBannerFile] = useState(null);
  const [localError, setLocalError] = useState(null);

  useEffect(() => {
    setLogoPreview(defaults.store_logo || '');
    setBannerPreview(defaults.store_banner || '');
  }, [defaults.store_logo, defaults.store_banner]);

  const validateFile = (file, kind, maxBytes, mimes) => {
    if (!file) return null;
    if (file.size > maxBytes) {
      return `${kind} must be ${maxBytes / (1024 * 1024)} MB or smaller.`;
    }
    if (!mimes.includes(file.type)) {
      return `${kind} must be a JPG, PNG, or WEBP image.`;
    }
    return null;
  };

  const onPickFile = (setter, previewSetter, kind, maxBytes, mimes) =>
    (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const err = validateFile(file, kind, maxBytes, mimes);
      if (err) {
        setLocalError(err);
        return;
      }
      setLocalError(null);
      setter(file);
      const reader = new FileReader();
      reader.onload = (e) => previewSetter(e.target?.result || '');
      reader.readAsDataURL(file);
    };

  const clearLogo = () => {
    setLogoFile(null);
    setLogoPreview(defaults.store_logo || '');
  };
  const clearBanner = () => {
    setBannerFile(null);
    setBannerPreview(defaults.store_banner || '');
  };

  const submit = async (event) => {
    event.preventDefault();
    setLocalError(null);
    const payload = {};
    if (logoFile) payload.store_logo = logoFile;
    if (bannerFile) payload.store_banner = bannerFile;
    if (Object.keys(payload).length === 0) {
      toast('Pick a new logo or banner first.', { icon: 'ℹ️' });
      return;
    }
    // Client-side schema validation -- catches oversize / wrong MIME
    // before the request goes out.
    const parsed = vendorStoreAssetsSchema.safeParse(payload);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      setLocalError(first?.message || 'Invalid file.');
      return;
    }
    try {
      const fd = new FormData();
      if (logoFile) fd.append('store_logo', logoFile);
      if (bannerFile) fd.append('store_banner', bannerFile);
      await authService.updateProfile(fd);
      toast.success('Branding updated.');
      setLogoFile(null);
      setBannerFile(null);
      if (onSaved) await onSaved();
    } catch (err) {
      const apiError = err.response?.data?.error;
      const message = apiError?.message || 'Could not save branding.';
      setLocalError(message);
      if (onError) onError(message);
    }
  };

  const hasChanges = Boolean(logoFile || bannerFile);
  const busy = submitting;

  return (
    <form
      onSubmit={submit}
      noValidate
      className="mt-6 space-y-5 rounded-md border border-surface-200 bg-white p-6"
    >
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
          <ImagePlus className="h-5 w-5 text-accent-500" />
          Branding
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          Logo and banner appear on your public storefront.
        </p>
      </div>

      <AssetPicker
        label="Store logo"
        hint={`Square ratio preferred. JPG, PNG, or WEBP up to ${MAX_LOGO_BYTES / (1024 * 1024)} MB.`}
        preview={logoPreview}
        file={logoFile}
        onPick={onPickFile(setLogoFile, setLogoPreview, 'Logo', MAX_LOGO_BYTES, LOGO_MIMES)}
        onClear={clearLogo}
        shape="square"
      />

      <AssetPicker
        label="Store banner"
        hint={`Wide ratio preferred. JPG, PNG, or WEBP up to ${MAX_BANNER_BYTES / (1024 * 1024)} MB.`}
        preview={bannerPreview}
        file={bannerFile}
        onPick={onPickFile(setBannerFile, setBannerPreview, 'Banner', MAX_BANNER_BYTES, BANNER_MIMES)}
        onClear={clearBanner}
        shape="wide"
      />

      {localError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{localError}</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-surface-100 pt-4">
        <button
          type="submit"
          disabled={!hasChanges || busy}
          className="inline-flex items-center gap-2 rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {busy ? 'Uploading…' : 'Save branding'}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Asset picker (logo / banner)
// ---------------------------------------------------------------------------
function AssetPicker({ label, hint, preview, file, onPick, onClear, shape }) {
  const inputId = `vendor-store-${label.replace(/\s+/g, '-').toLowerCase()}`;
  const isWide = shape === 'wide';
  return (
    <div>
      <label
        htmlFor={inputId}
        className="mb-1 block text-sm font-medium text-text-primary"
      >
        {label}
      </label>
      <div
        className={`flex items-center gap-4 rounded-md border border-dashed border-surface-300 bg-surface-50 p-4 ${
          isWide ? 'h-40' : 'h-28'
        }`}
      >
        {preview ? (
          <img
            src={preview}
            alt={`${label} preview`}
            className={`flex-shrink-0 rounded object-cover ${
              isWide ? 'h-32 w-56' : 'h-20 w-20'
            }`}
          />
        ) : (
          <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded bg-surface-100 text-text-secondary">
            <ImagePlus className="h-6 w-6" />
          </div>
        )}
        <div className="flex flex-1 flex-col gap-2">
          <p className="text-xs text-text-secondary">
            {file
              ? `Selected: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`
              : hint}
          </p>
          <div className="flex items-center gap-2">
            <label
              htmlFor={inputId}
              className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-surface-200 bg-white px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-50"
            >
              Choose file
              <input
                id={inputId}
                type="file"
                accept={LOGO_MIMES.join(',')}
                className="hidden"
                onChange={onPick}
              />
            </label>
            {(file || preview) && (
              <button
                type="button"
                onClick={onClear}
                className="inline-flex items-center gap-1 rounded-md border border-surface-200 bg-white px-2 py-1 text-xs font-medium text-text-secondary hover:bg-surface-50"
              >
                <Trash2 className="h-3 w-3" />
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public-readonly summary of the current store state
// ---------------------------------------------------------------------------
function StorefrontSummary({ meta, currency }) {
  if (!meta) return null;
  const storeSlug = meta.store_slug || '';
  const publicHref = storeSlug ? paths.vendorPublic(storeSlug) : null;
  return (
    <aside
      aria-label="Store status"
      className="mt-6 rounded-md border border-surface-200 bg-surface-50 p-5 text-sm text-text-secondary"
    >
      <h3 className="mb-2 text-sm font-semibold text-text-primary">
        Store status
      </h3>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-secondary">
            Approval
          </dt>
          <dd className="font-medium text-text-primary">
            {meta.status || 'PENDING'}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-secondary">
            Average rating
          </dt>
          <dd className="font-medium text-text-primary">
            {Number(meta.average_rating || 0).toFixed(2)} ★
            <span className="ml-1 text-xs text-text-secondary">
              ({meta.total_reviews || 0} reviews)
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-secondary">
            Lifetime sales
          </dt>
          <dd className="font-medium text-text-primary">
            {Number(meta.total_sales || 0).toLocaleString()} units
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-secondary">
            Public storefront
          </dt>
          <dd className="font-medium text-text-primary">
            {publicHref ? (
              <a
                href={publicHref}
                className="text-accent-500 hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                {publicHref}
              </a>
            ) : (
              'Pending slug'
            )}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-text-secondary">
        Currency: {currency || 'BDT'}
      </p>
    </aside>
  );
}
