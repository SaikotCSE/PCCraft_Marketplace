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
} from 'lucide-react';

import useAuthStore from '@context/useAuthStore';
import { vendorStorefrontSchema } from '@utils/validators';
import { ROUTES } from '@routes/routePaths';
import FormField from '@components/auth/FormField';
import FileUpload from '@components/auth/FileUpload';
import { usePageTitle } from '@/hooks/usePageTitle';

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

      <p className="mt-8 text-center text-sm text-text-secondary">
        Need to change something else?{' '}
        <Link to={ROUTES.HOME} className="text-accent-500 hover:underline">
          Back to home
        </Link>
      </p>
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
      >
        <Store className="h-4 w-4 text-text-secondary" />
      </FormField>

      <FormField
        label="Contact email"
        type="email"
        error={errors.store_contact_email?.message}
        registration={register('store_contact_email')}
        hint="Shown on your storefront for customer support"
        autoComplete="email"
      >
        <Mail className="h-4 w-4 text-text-secondary" />
      </FormField>

      <FormField
        label="Store description"
        error={errors.store_description?.message}
        registration={register('store_description')}
        hint="Markdown supported. Shown on your public storefront."
      >
        <FileText className="h-4 w-4 text-text-secondary" />
      </FormField>

      <FormField
        label="Return policy"
        error={errors.vendor_return_policy?.message}
        registration={register('vendor_return_policy')}
        hint="Be specific — customers trust clear return terms."
      >
        <FileText className="h-4 w-4 text-text-secondary" />
      </FormField>

      <FormField
        label="Low-stock threshold"
        type="number"
        error={errors.low_stock_threshold?.message}
        registration={register('low_stock_threshold', { valueAsNumber: true })}
        hint="We will email you when any SKU drops below this count."
      >
        <Hash className="h-4 w-4 text-text-secondary" />
      </FormField>

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
    formState: { errors },
    reset,
  } = useForm({
    defaultValues: { trade_license_doc: null, nid_doc: null },
  });

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
      />
      <FileUpload
        label="NID (optional)"
        error={errors.nid_doc?.message}
        hint="PDF, JPG, PNG, or WEBP — up to 5 MB"
        registration={register('nid_doc')}
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
