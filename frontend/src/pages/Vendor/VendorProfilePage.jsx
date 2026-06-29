// VendorProfilePage — vendor's store profile + KYC status banner.
//
// Top of page shows the vendor's approval status (PENDING / APPROVED /
// REJECTED / INFO_REQUESTED). When REJECTED, the staff-supplied
// rejection_reason is surfaced so the vendor can act on it.
//
// Storefront config below uses VendorProfileSerializer's writable
// fields: store_name, store_description, store_contact_email,
// vendor_return_policy, low_stock_threshold. PATCH goes through
// `authService.updateProfile` (which currently hits /auth/profile/
// — once a dedicated /vendor/profile/ lands, swap the URL).
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'react-hot-toast';
import {
  Store,
  Mail,
  FileText,
  Hash,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  Save,
  RefreshCw,
  ImagePlus,
  Trash2,
} from 'lucide-react';

import useAuthStore from '@context/useAuthStore';
import {
  vendorStorefrontSchema,
  vendorStoreAssetsSchema,
  MAX_LOGO_BYTES,
  MAX_BANNER_BYTES,
} from '@utils/validators';
import { ROUTES } from '@routes/routePaths';
import FormField from '@components/common/FormField';
import FileUpload from '@components/common/DocumentUpload';
import { usePageTitle } from '@/hooks/usePageTitle';
import authService from '@services/authService';

const STATUS_META = {
  PENDING: {
    icon: Clock,
    tone: 'warning',
    title: 'Application under review',
    body:
      'We received your application. Our team verifies trade licenses and NIDs within 2 business days. We will email you once a decision is made.',
  },
  APPROVED: {
    icon: CheckCircle2,
    tone: 'success',
    title: 'You\'re approved to sell',
    body: 'Your storefront is live. Configure your branding below to start attracting customers.',
  },
  REJECTED: {
    icon: XCircle,
    tone: 'danger',
    title: 'Application rejected',
    body:
      'Our team could not verify your business. See the reason below and re-submit corrected documents when ready.',
  },
  INFO_REQUESTED: {
    icon: AlertTriangle,
    tone: 'warning',
    title: 'More information needed',
    body: 'Please re-upload the requested documents so we can finish verifying your account.',
  },
  SUSPENDED: {
    icon: XCircle,
    tone: 'danger',
    title: 'Store suspended',
    body: 'Contact support for details. Your storefront is hidden from customers until resolved.',
  },
};

const TONE_CLASSES = {
  warning: 'border-warning/30 bg-warning/5 text-warning',
  success: 'border-success/30 bg-success/5 text-success',
  danger: 'border-danger/30 bg-danger/5 text-danger',
  info: 'border-info/30 bg-info/5 text-info',
};

export default function VendorProfilePage() {
  usePageTitle('Store profile · PCCraft');
  const user = useAuthStore((s) => s.user);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const [vendorMeta, setVendorMeta] = useState(null);
  const [serverError, setServerError] = useState(null);
  const [resubmitting, setResubmitting] = useState(false);

  // Refresh on mount so we always have the latest status.
  useEffect(() => {
    refreshProfile().then((u) => {
      if (u?.vendor_meta) setVendorMeta(u.vendor_meta);
    });
  }, [refreshProfile]);

  // Fall back to user.vendor_meta if present (some endpoints embed it).
  const meta = vendorMeta || user?.vendor_meta || {};
  const status = meta.status || 'PENDING';
  const banner = STATUS_META[status] || STATUS_META.PENDING;
  const BannerIcon = banner.icon;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Store profile</h1>
        <p className="text-sm text-text-secondary">
          Configure your storefront and keep your KYC documents up to date.
        </p>
      </header>

      <div
        role="status"
        className={`mb-6 flex gap-3 rounded-md border p-4 ${TONE_CLASSES[banner.tone]}`}
      >
        <BannerIcon className="mt-0.5 h-5 w-5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold">{banner.title}</p>
          <p className="mt-0.5 text-sm opacity-90">{banner.body}</p>
          {status === 'REJECTED' && meta.rejection_reason && (
            <p className="mt-2 rounded-md border border-danger/40 bg-white/60 p-2 text-xs text-text-primary">
              <strong>Reason from our team:</strong> {meta.rejection_reason}
            </p>
          )}
        </div>
      </div>

      {(status === 'REJECTED' || status === 'INFO_REQUESTED') && (
        <ResubmitForm
          submitting={resubmitting}
          onSubmit={async (values) => {
            setResubmitting(true);
            setServerError(null);
            try {
              const authService = (await import('@services/authService')).default;
              const fd = new FormData();
              if (values.trade_license_doc) fd.append('trade_license_doc', values.trade_license_doc);
              if (values.nid_doc) fd.append('nid_doc', values.nid_doc);
              await authService.uploadVendorDocuments(fd);
              toast.success('Documents submitted. We will re-review shortly.');
              await refreshProfile();
            } catch (err) {
              const apiError = err.response?.data?.error;
              setServerError(apiError?.message || 'Submission failed.');
            } finally {
              setResubmitting(false);
            }
          }}
          serverError={serverError}
        />
      )}

      <StorefrontForm
        defaults={meta}
        onSubmit={async (values) => {
          try {
            await updateProfile(values);
            toast.success('Store profile saved.');
          } catch (err) {
            const apiError = err.response?.data?.error;
            toast.error(apiError?.message || 'Could not save profile.');
          }
        }}
      />

      <BrandingForm
        defaults={meta}
        onSaved={async () => {
          await refreshProfile();
        }}
      />

      <p className="mt-8 text-center text-sm text-text-secondary">
        Need to change something else?{' '}
        <Link to={ROUTES.HOME} className="text-accent-500 hover:underline">
          Back to home
        </Link>
      </p>
    </div>
  );
}
// ─── Branding (logo + banner) ──────────────────────────────────────────
function BrandingForm({ defaults, onSaved }) {
  const [logoPreview, setLogoPreview] = useState(defaults.store_logo || '');
  const [bannerPreview, setBannerPreview] = useState(defaults.store_banner || '');
  const [logoFile, setLogoFile] = useState(null);
  const [bannerFile, setBannerFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);

  // Re-sync previews when the parent's vendor_meta changes (after save).
  useEffect(() => {
    setLogoPreview(defaults.store_logo || '');
    setBannerPreview(defaults.store_banner || '');
  }, [defaults.store_logo, defaults.store_banner]);

  const onPickFile = (setter, previewSetter) => (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
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
    setServerError(null);
    const payload = {};
    if (logoFile) payload.store_logo = logoFile;
    if (bannerFile) payload.store_banner = bannerFile;
    if (Object.keys(payload).length === 0) {
      toast('Pick a new logo or banner first.', { icon: 'ℹ️' });
      return;
    }
    // Client-side schema validation -- catches oversize / wrong MIME before
    // the request goes out.
    const parsed = vendorStoreAssetsSchema.safeParse(payload);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      setServerError(first?.message || 'Invalid file.');
      return;
    }
    setSubmitting(true);
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
      setServerError(apiError?.message || 'Could not save branding.');
    } finally {
      setSubmitting(false);
    }
  };

  const hasChanges = Boolean(logoFile || bannerFile);

  return (
    <form
      onSubmit={submit}
      noValidate
      className="mt-6 space-y-5 rounded-md border border-surface-200 bg-white p-6"
    >
      <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
        <ImagePlus className="h-5 w-5 text-accent-500" />
        Branding
      </h2>
      <p className="text-sm text-text-secondary">
        Logo and banner appear on your public storefront. Logo: square, JPG / PNG /
        WEBP up to {MAX_LOGO_BYTES / (1024 * 1024)} MB. Banner: wide ratio, up to{' '}
        {MAX_BANNER_BYTES / (1024 * 1024)} MB.
      </p>

      <AssetPicker
        label="Store logo"
        preview={logoPreview}
        onPick={onPickFile(setLogoFile, setLogoPreview)}
        onClear={clearLogo}
        file={logoFile}
      />

      <AssetPicker
        label="Store banner"
        preview={bannerPreview}
        onPick={onPickFile(setBannerFile, setBannerPreview)}
        onClear={clearBanner}
        file={bannerFile}
        wide
      />

      {serverError && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {serverError}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="submit"
          disabled={!hasChanges || submitting}
          className="inline-flex items-center gap-2 rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {submitting ? 'Uploading…' : 'Save branding'}
        </button>
      </div>
    </form>
  );
}

function AssetPicker({ label, preview, onPick, onClear, file, wide = false }) {
  const inputId = `vendor-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div>
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-text-primary">
        {label}
      </label>
      <div
        className={`flex items-center gap-4 rounded-md border border-dashed border-surface-300 bg-surface-50 p-4 ${
          wide ? 'h-40' : 'h-28'
        }`}
      >
        {preview ? (
          <img
            src={preview}
            alt={`${label} preview`}
            className={`flex-shrink-0 rounded object-cover ${
              wide ? 'h-32 w-56' : 'h-20 w-20'
            }`}
          />
        ) : (
          <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded bg-surface-100 text-text-secondary">
            <ImagePlus className="h-6 w-6" />
          </div>
        )}
        <div className="flex flex-1 flex-col gap-2">
          <p className="text-xs text-text-secondary">
            {file ? `Selected: ${file.name}` : 'Pick a new image to replace the current one.'}
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
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={onPick}
              />
            </label>
            {(file || preview !== '') && (
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
// ─── Storefront config ───────────────────────────────────────────────
function StorefrontForm({ defaults, onSubmit }) {
  const initial = useMemo(
    () => ({
      store_name: defaults.store_name || defaults.business_name || '',
      store_description: defaults.store_description || '',
      store_contact_email: defaults.store_contact_email || '',
      vendor_return_policy: defaults.vendor_return_policy || '',
      low_stock_threshold: defaults.low_stock_threshold ?? 5,
    }),
    [defaults]
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
    reset,
  } = useForm({
    resolver: zodResolver(vendorStorefrontSchema),
    defaultValues: initial,
  });

  useEffect(() => {
    reset(initial);
  }, [initial, reset]);

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="space-y-4 rounded-md border border-surface-200 bg-white p-6"
    >
      <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
        <Store className="h-5 w-5 text-accent-500" />
        Storefront
      </h2>

      <FormField
        label="Store name"
        error={errors.store_name?.message}
        required
        registration={register('store_name')}
        leadingIcon={<Store className="h-4 w-4" />}
      />

      <FormField
        label="Contact email"
        type="email"
        error={errors.store_contact_email?.message}
        registration={register('store_contact_email')}
        hint="Shown on your storefront for customer support"
        autoComplete="email"
        leadingIcon={<Mail className="h-4 w-4" />}
      />

      <FormField
        label="Store description"
        error={errors.store_description?.message}
        registration={register('store_description')}
        hint="Markdown supported. Shown on your public storefront."
        leadingIcon={<FileText className="h-4 w-4" />}
      />

      <FormField
        label="Return policy"
        error={errors.vendor_return_policy?.message}
        registration={register('vendor_return_policy')}
        hint="Be specific — customers trust clear return terms."
        leadingIcon={<FileText className="h-4 w-4" />}
      />

      <FormField
        label="Low-stock threshold"
        type="number"
        error={errors.low_stock_threshold?.message}
        registration={register('low_stock_threshold', { valueAsNumber: true })}
        hint="We will email you when any SKU drops below this count."
        leadingIcon={<Hash className="h-4 w-4" />}
      />

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="submit"
          disabled={!isDirty || isSubmitting}
          className="inline-flex items-center gap-2 rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {isSubmitting ? 'Saving…' : 'Save storefront'}
        </button>
      </div>
    </form>
  );
}

// ─── Document resubmission ────────────────────────────────────────────
function ResubmitForm({ onSubmit, submitting, serverError }) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
    reset,
  } = useForm({
    defaultValues: { trade_license_doc: null, nid_doc: null },
  });

  // Custom dropzone needs setValue — RHF's `register` onChange path
  // reads the registered ref's `.files` and misses drops.
  const handleFileChange = (name, file) => {
    if (!name) return;
    setValue(name, file, { shouldValidate: true, shouldDirty: true });
  };

  const submit = async (values) => {
    await onSubmit(values);
    reset();
  };

  return (
    <form
      onSubmit={handleSubmit(submit)}
      noValidate
      className="mb-6 space-y-4 rounded-md border border-warning/40 bg-warning/5 p-6"
    >
      <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
        <RefreshCw className="h-5 w-5 text-warning" />
        Re-submit documents
      </h2>
      <p className="text-sm text-text-secondary">
        Upload at least one updated document. We will re-review within 1 business day.
      </p>

      <FileUpload
        label="Trade license (optional)"
        error={errors.trade_license_doc?.message}
        hint="PDF, JPG, PNG, or WEBP — up to 5 MB"
        registration={register('trade_license_doc')}
        onFileChange={handleFileChange}
      />
      <FileUpload
        label="NID (optional)"
        error={errors.nid_doc?.message}
        hint="PDF, JPG, PNG, or WEBP — up to 5 MB"
        registration={register('nid_doc')}
        onFileChange={handleFileChange}
      />

      {serverError && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {serverError}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {submitting ? 'Submitting…' : 'Submit documents'}
        </button>
      </div>
    </form>
  );
}
