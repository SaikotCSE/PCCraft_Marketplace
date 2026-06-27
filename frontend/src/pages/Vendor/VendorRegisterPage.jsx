// VendorRegisterPage — 4-step vendor signup.
//
// Step 1: Account   (owner_name, email, phone, password)
// Step 2: Business  (business_name, business_type, business_phone,
//                    trade_license_number)
// Step 3: Address   (street, city, district, postal_code)
// Step 4: Documents (trade_license_doc, nid_number, nid_doc)
//
// On submit we build a `FormData` and POST to /api/v1/auth/register/vendor/.
// The backend serializer decodes `business_address` from its JSON-string
// form (see VendorRegisterSerializer.to_internal_value). The two document
// fields are multipart files; FileUpload enforces 5 MB + MIME limits.
//
// Vendor accounts do NOT auto-login. The backend returns a pending-review
// envelope; we redirect to /vendor/pending so the user sees their status.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import {
  User,
  Mail,
  Phone,
  Lock,
  Store,
  Briefcase,
  FileText,
  Hash,
  ArrowRight,
  ArrowLeft,
  Check,
} from 'lucide-react';

import useAuthStore from '@context/useAuthStore';
import {
  vendorAccountSchema,
  vendorBusinessSchema,
  vendorAddressSchema,
  vendorDocumentsSchema,
} from '@utils/validators';
import { ROUTES } from '@routes/routePaths';
import FormField, { PasswordField } from '@components/auth/FormField';
import PasswordStrength from '@components/auth/PasswordStrength';
import Stepper from '@components/auth/Stepper';
import FileUpload from '@components/auth/FileUpload';

const STEP_SCHEMAS = [
  vendorAccountSchema,
  vendorBusinessSchema,
  vendorAddressSchema,
  vendorDocumentsSchema,
];

const STEP_FIELDS = [
  ['owner_name', 'email', 'phone', 'password', 'confirm_password'],
  ['business_name', 'business_type', 'business_phone', 'trade_license_number'],
  ['street', 'city', 'district', 'postal_code'],
  ['trade_license_doc', 'nid_number', 'nid_doc'],
];

const STEPS = [
  { title: 'Account', subtitle: 'Your sign-in credentials' },
  { title: 'Business', subtitle: 'Company details' },
  { title: 'Address', subtitle: 'Where you operate from' },
  { title: 'Documents', subtitle: 'Verification files' },
];

const BUSINESS_TYPES = [
  { value: 'SOLE_PROP', label: 'Sole proprietorship' },
  { value: 'PARTNERSHIP', label: 'Partnership' },
  { value: 'PVT_LTD', label: 'Private limited' },
  { value: 'OTHER', label: 'Other' },
];

export default function VendorRegisterPage() {
  const navigate = useNavigate();
  const registerAction = useAuthStore((s) => s.register);
  const [step, setStep] = useState(0);
  const [serverError, setServerError] = useState(null);

  const defaultValues = useMemo(
    () => ({
      owner_name: '',
      email: '',
      phone: '',
      password: '',
      confirm_password: '',
      business_name: '',
      business_type: '',
      business_phone: '',
      trade_license_number: '',
      street: '',
      city: '',
      district: '',
      postal_code: '',
      trade_license_doc: null,
      nid_number: '',
      nid_doc: null,
    }),
    []
  );

  const form = useForm({
    resolver: zodResolver(STEP_SCHEMAS[step]),
    defaultValues,
    mode: 'onBlur',
  });

  const { register, handleSubmit, trigger, getValues, formState, setError, watch } = form;
  const passwordValue = watch('password');

  const goNext = async () => {
    const fields = STEP_FIELDS[step];
    const valid = await trigger(fields);
    if (!valid) return;
    if (step < STEP_SCHEMAS.length - 1) setStep(step + 1);
  };

  const goBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const onSubmit = async () => {
    setServerError(null);
    const all = getValues();
    const fd = new FormData();
    fd.append('owner_name', all.owner_name);
    fd.append('email', all.email);
    fd.append('phone', all.phone);
    fd.append('password', all.password);
    fd.append('confirm_password', all.confirm_password);
    fd.append('business_name', all.business_name);
    fd.append('business_type', all.business_type);
    if (all.business_phone) fd.append('business_phone', all.business_phone);
    fd.append('trade_license_number', all.trade_license_number);
    fd.append(
      'business_address',
      JSON.stringify({
        street: all.street,
        city: all.city,
        district: all.district,
        postal_code: all.postal_code || '',
      })
    );
    if (all.trade_license_doc) fd.append('trade_license_doc', all.trade_license_doc);
    fd.append('nid_number', all.nid_number);
    if (all.nid_doc) fd.append('nid_doc', all.nid_doc);

    try {
      const result = await registerAction('vendor', fd);
      toast.success('Application submitted! Our team will review and reach out.');
      navigate(ROUTES.VENDOR.PENDING, { replace: true, state: { application: result } });
    } catch (err) {
      const apiError = err.response?.data?.error;
      const fields = apiError?.details?.fields || apiError?.fields;
      if (fields && typeof fields === 'object') {
        Object.entries(fields).forEach(([name, messages]) => {
          const msg = Array.isArray(messages) ? messages[0] : String(messages);
          setError(name, { type: 'server', message: msg });
        });
        return;
      }
      const message = apiError?.message || 'Application failed. Please try again.';
      setServerError(message);
      toast.error(message);
    }
  };

  return (
    <div className="min-h-screen bg-surface-50 px-4 py-12">
      <div className="mx-auto w-full max-w-3xl rounded-md border border-surface-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <Link to={ROUTES.HOME} className="text-sm text-text-secondary hover:text-accent-500">
            ← Back to home
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-text-primary">Apply to sell on PCCraft</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Tell us about your business. We&apos;ll review your application within 2 business days.
          </p>
        </div>

        <div className="mb-8">
          <Stepper steps={STEPS} currentStep={step + 1} />
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.18 }}
              className="space-y-4"
            >
              {step === 0 && (
                <>
                  <FormField
                    label="Full name (store owner)"
                    error={formState.errors.owner_name?.message}
                    required
                    registration={register('owner_name')}
                  >
                    <User className="h-4 w-4 text-text-secondary" />
                  </FormField>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      label="Email"
                      type="email"
                      error={formState.errors.email?.message}
                      required
                      registration={register('email')}
                      autoComplete="email"
                    >
                      <Mail className="h-4 w-4 text-text-secondary" />
                    </FormField>

                    <FormField
                      label="Phone"
                      type="tel"
                      error={formState.errors.phone?.message}
                      required
                      registration={register('phone')}
                      hint="Bangladesh number, e.g. +8801712345678"
                      autoComplete="tel"
                    >
                      <Phone className="h-4 w-4 text-text-secondary" />
                    </FormField>
                  </div>

                  <PasswordField
                    label="Password"
                    error={formState.errors.password?.message}
                    required
                    autoComplete="new-password"
                    registration={register('password')}
                  />
                  {passwordValue && <PasswordStrength password={passwordValue} />}

                  <PasswordField
                    label="Confirm password"
                    error={formState.errors.confirm_password?.message}
                    required
                    autoComplete="new-password"
                    registration={register('confirm_password')}
                  />
                </>
              )}

              {step === 1 && (
                <>
                  <FormField
                    label="Business name"
                    error={formState.errors.business_name?.message}
                    required
                    registration={register('business_name')}
                  >
                    <Store className="h-4 w-4 text-text-secondary" />
                  </FormField>

                  <FormField
                    label="Business type"
                    error={formState.errors.business_type?.message}
                    required
                    htmlFor="vendor-business-type"
                  >
                    <select id="vendor-business-type" {...register('business_type')} defaultValue="">
                      <option value="" disabled>
                        Select…
                      </option>
                      {BUSINESS_TYPES.map((b) => (
                        <option key={b.value} value={b.value}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </FormField>

                  <FormField
                    label="Business phone (optional)"
                    type="tel"
                    error={formState.errors.business_phone?.message}
                    registration={register('business_phone')}
                    hint="Bangladesh number, e.g. +8801712345678"
                    autoComplete="tel"
                  >
                    <Phone className="h-4 w-4 text-text-secondary" />
                  </FormField>

                  <FormField
                    label="Trade license number"
                    error={formState.errors.trade_license_number?.message}
                    required
                    registration={register('trade_license_number')}
                  >
                    <Hash className="h-4 w-4 text-text-secondary" />
                  </FormField>
                </>
              )}

              {step === 2 && (
                <>
                  <FormField
                    label="Street address"
                    error={formState.errors.street?.message}
                    required
                    registration={register('street')}
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      label="City"
                      error={formState.errors.city?.message}
                      required
                      registration={register('city')}
                    />
                    <FormField
                      label="District"
                      error={formState.errors.district?.message}
                      required
                      registration={register('district')}
                    />
                  </div>

                  <FormField
                    label="Postal code (optional)"
                    error={formState.errors.postal_code?.message}
                    registration={register('postal_code')}
                  />

                  <p className="rounded-md border border-surface-200 bg-surface-50 p-3 text-xs text-text-secondary">
                    <Briefcase className="mr-1 inline h-3.5 w-3.5" />
                    Country defaults to Bangladesh. Reach out to support if you operate elsewhere.
                  </p>
                </>
              )}

              {step === 3 && (
                <>
                  <FileUpload
                    label="Trade license document"
                    required
                    error={formState.errors.trade_license_doc?.message}
                    hint="PDF, JPG, PNG, or WEBP — up to 5 MB"
                    registration={register('trade_license_doc')}
                  />
                  <FormField
                    label="NID number"
                    error={formState.errors.nid_number?.message}
                    required
                    registration={register('nid_number')}
                    hint="National ID number of the business owner"
                  >
                    <Hash className="h-4 w-4 text-text-secondary" />
                  </FormField>
                  <FileUpload
                    label="NID document"
                    required
                    error={formState.errors.nid_doc?.message}
                    hint="PDF, JPG, PNG, or WEBP — up to 5 MB"
                    registration={register('nid_doc')}
                  />
                  <p className="rounded-md border border-surface-200 bg-surface-50 p-3 text-xs text-text-secondary">
                    <FileText className="mr-1 inline h-3.5 w-3.5" />
                    By submitting, you confirm that all information provided is accurate and that you
                    are authorised to operate this business in Bangladesh.
                  </p>
                </>
              )}
            </motion.div>
          </AnimatePresence>

          {serverError && (
            <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {serverError}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 0}
              className="inline-flex items-center gap-1 rounded-md border border-surface-300 bg-white px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-surface-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={goNext}
                className="inline-flex items-center gap-1 rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-600"
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={formState.isSubmitting}
                className="inline-flex items-center gap-1 rounded-md bg-success px-4 py-2 text-sm font-semibold text-white transition hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Check className="h-4 w-4" />
                {formState.isSubmitting ? 'Submitting…' : 'Submit application'}
              </button>
            )}
          </div>
        </form>

        <p className="mt-6 text-center text-sm text-text-secondary">
          Just here to shop?{' '}
          <Link to={ROUTES.AUTH.REGISTER_CUSTOMER} className="text-accent-500 hover:underline">
            Create a customer account
          </Link>
        </p>
      </div>
    </div>
  );
}