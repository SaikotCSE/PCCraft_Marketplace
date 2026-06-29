// CustomerRegisterPage — single-page signup for buyers, with the
// "join PCCraft" marketing column on the left.
//
// Three-step flow (matching the UI's ACCOUNT → VERIFY → DONE indicator):
//
//   1. ACCOUNT  — user fills in the registration form. Submits to
//      `authService.registerCustomer`, which POSTs to
//      `/api/v1/auth/register/customer/`. The backend returns
//      `{user, requires_verification, email, message}` and the user is
//      *not* logged in until step 2 succeeds.
//
//   2. VERIFY   — user enters the 6-digit OTP emailed to them. Submit
//      to `useAuthStore.verifyOtp`. On success the auth store is
//      hydrated (access + refresh + user) and we advance.
//
//   3. DONE     — short success animation, then redirect to the
//      originally-requested route or HOME.
//
// Validation is wired through RHF + zodResolver + customerRegisterSchema.
// `password` and `confirm_password` share a Zod refine that asserts they
// match; the same schema exposes `evaluatePassword()` for the live
// strength bar.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import {
  User,
  Mail,
  Phone,
  Calendar,
  UserPlus,
  BadgeCheck,
  Cpu,
  ShieldCheck,
  Truck,
  ArrowLeft,
  Sparkles,
  KeyRound,
  RotateCw,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';

import useAuthStore from '@context/useAuthStore';
import { customerRegisterSchema } from '@utils/validators';
import { ROUTES } from '@routes/routePaths';
import FormField, { PasswordField } from '@components/common/FormField';
import PasswordStrength from '@components/common/PasswordStrength';

const GENDERS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
];

// Marketing-column value props — same icon language used by the navbar
// promo strip and home feature tiles, so the brand reads consistent.
const VALUE_PROPS = [
  {
    icon: BadgeCheck,
    title: 'Verified vendors only',
    body: 'Every seller on PCCraft holds a current trade licence and is reviewed by our team.',
  },
  {
    icon: Cpu,
    title: 'Compatibility built in',
    body: 'Live checks across socket, RAM, PSU wattage, and case clearance as you shop.',
  },
  {
    icon: Truck,
    title: 'Same-day dispatch',
    body: 'In-stock orders from verified vendors ship within hours across Bangladesh.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure checkout',
    body: 'JWT auth, encrypted payment data, and a 7-day return window on every order.',
  },
];

const Testimonial = () => (
  <motion.figure
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.4, duration: 0.5 }}
    className="relative overflow-hidden rounded-xl border border-accent-500/20 bg-primary-900/40 p-5 backdrop-blur"
  >
    <Sparkles className="absolute -right-3 -top-3 h-16 w-16 text-accent-500/15" />
    <blockquote className="text-sm leading-relaxed text-text-inverse/85">
      “PCCraft was the first place where I could drop in a 7800X3D and a
      B650 board and know the BIOS was already updated — the
      compatibility engine saved me a return.”
    </blockquote>
    <figcaption className="mt-3 flex items-center gap-3">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-accent-500 to-accent-700 text-xs font-bold text-primary-900">
        R
      </span>
      <div className="text-xs leading-tight">
        <p className="font-semibold text-text-inverse">Riyad H.</p>
        <p className="text-text-inverse/60">Built a 7800X3D rig · Dhaka</p>
      </div>
    </figcaption>
  </motion.figure>
);

const MarketingColumn = () => (
  <div className="relative hidden h-full overflow-hidden bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 p-10 text-text-inverse lg:flex lg:flex-col">
    {/* Decorative blur orbs + grid pattern */}
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-accent-500/25 blur-3xl" />
      <div className="absolute -bottom-32 -right-20 h-80 w-80 rounded-full bg-accent-400/20 blur-3xl" />
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
          backgroundSize: '36px 36px',
        }}
      />
    </div>

    {/* Logo + status */}
    <div className="relative flex items-center gap-2.5">
      <span className="relative grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-accent-500 to-accent-700 text-primary-900 shadow-lg shadow-accent-500/30">
        <Cpu className="h-5 w-5" />
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 animate-pulse rounded-full bg-success ring-2 ring-primary-800" />
      </span>
      <div>
        <p className="font-heading text-base font-bold tracking-tight">
          PCCraft
        </p>
        <p className="text-[11px] text-text-inverse/60">
          Bangladesh&apos;s PC marketplace
        </p>
      </div>
    </div>

    {/* Headline + subhead */}
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative mt-10"
    >
      <span className="inline-flex items-center gap-2 rounded-full border border-accent-400/30 bg-accent-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-accent-300">
        <Sparkles className="h-3 w-3" />
        New here? You&apos;re in good company.
      </span>
      <h1 className="mt-4 font-heading text-3xl font-bold leading-tight xl:text-4xl">
        Build smarter.{' '}
        <span className="bg-gradient-to-r from-accent-300 via-accent-400 to-accent-300 bg-clip-text text-transparent">
          Buy better.
        </span>
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-text-inverse/75">
        Create an account to save PC builds, get compatibility checks in
        real time, and unlock vendor-verified pricing across every PC
        builder slot.
      </p>
    </motion.div>

    {/* Value props */}
    <ul className="relative mt-8 grid gap-3">
      {VALUE_PROPS.map((p, idx) => {
        const Icon = p.icon;
        return (
          <motion.li
            key={p.title}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 + idx * 0.08, duration: 0.4 }}
            className="flex items-start gap-3 rounded-lg border border-white/5 bg-white/5 p-3 backdrop-blur"
          >
            <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-accent-500/20 text-accent-300">
              <Icon className="h-4 w-4" />
            </span>
            <div className="text-sm">
              <p className="font-semibold text-text-inverse">{p.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-text-inverse/65">
                {p.body}
              </p>
            </div>
          </motion.li>
        );
      })}
    </ul>

    {/* Footer testimonial */}
    <div className="relative mt-8">
      <Testimonial />
    </div>

    <p className="relative mt-6 text-[11px] text-text-inverse/40">
      © {new Date().getFullYear()} PCCraft Marketplace. All rights reserved.
    </p>
  </div>
);

// ---------------------------------------------------------------------------
// Step indicator — driven by the `step` prop ('account' | 'verify' | 'done').
// Mirrors the visual shown in image_bf69a3.jpg.
// ---------------------------------------------------------------------------
const STEPS = [
  { id: 'account', label: 'Account' },
  { id: 'verify', label: 'Verify' },
  { id: 'done', label: 'Done' },
];

const StepIndicator = ({ step }) => {
  const currentIndex = STEPS.findIndex((s) => s.id === step);
  return (
    <div className="mt-5 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-text-secondary">
      {STEPS.map((s, idx) => {
        const isActive = idx === currentIndex;
        const isComplete = idx < currentIndex;
        return (
          <div key={s.id} className="flex items-center gap-2">
            <span
              className={`flex items-center gap-1.5 transition-colors ${
                isActive
                  ? 'text-accent-500'
                  : isComplete
                    ? 'text-success'
                    : 'text-text-secondary'
              }`}
            >
              <span
                className={`h-1.5 rounded-full transition-all ${
                  isActive
                    ? 'w-6 bg-accent-500'
                    : isComplete
                      ? 'w-6 bg-success'
                      : 'w-1.5 bg-surface-300'
                }`}
              />
              {s.label}
            </span>
            {idx < STEPS.length - 1 && (
              <span
                className={`h-px w-6 transition-colors ${
                  isComplete ? 'bg-success' : 'bg-surface-300'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// OTP input — six single-character slots with auto-advance + paste support.
// ---------------------------------------------------------------------------
const OtpInput = ({ value, onChange, disabled, error }) => {
  const refs = useRef([]);
  const slots = Array.from({ length: 6 }, (_, i) => value[i] || '');

  const setSlot = (idx, ch) => {
    const next = slots.slice();
    next[idx] = ch;
    const merged = next.join('').slice(0, 6);
    onChange(merged);
    if (ch && idx < 5) refs.current[idx + 1]?.focus();
  };

  const handleChange = (idx, e) => {
    const ch = e.target.value.replace(/\D/g, '').slice(-1);
    if (!ch) {
      setSlot(idx, '');
      return;
    }
    setSlot(idx, ch);
  };

  const handleKeyDown = (idx, e) => {
    if (e.key === 'Backspace' && !slots[idx] && idx > 0) {
      refs.current[idx - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && idx > 0) refs.current[idx - 1]?.focus();
    if (e.key === 'ArrowRight' && idx < 5) refs.current[idx + 1]?.focus();
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData
      .getData('text')
      .replace(/\D/g, '')
      .slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted.padEnd(value.length, '').slice(0, 6));
    const focusIdx = Math.min(pasted.length, 5);
    refs.current[focusIdx]?.focus();
  };

  return (
    <div
      className={`flex justify-center gap-2 sm:gap-3 ${
        error ? 'animate-[shake_0.3s_ease-in-out]' : ''
      }`}
      onPaste={handlePaste}
    >
      {slots.map((slot, idx) => (
        <input
          key={idx}
          ref={(el) => (refs.current[idx] = el)}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          disabled={disabled}
          value={slot}
          onChange={(e) => handleChange(idx, e)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          aria-label={`Digit ${idx + 1}`}
          className={`h-12 w-10 rounded-md border bg-white text-center font-heading text-lg font-semibold text-text-primary shadow-sm transition focus:outline-none focus:ring-2 focus:ring-accent-500/40 sm:h-14 sm:w-12 sm:text-xl ${
            error
              ? 'border-danger focus:border-danger'
              : 'border-surface-300 focus:border-accent-500'
          } disabled:cursor-not-allowed disabled:bg-surface-100 disabled:opacity-60`}
        />
      ))}
    </div>
  );
};

// ===========================================================================
// Main page
// ===========================================================================
export default function CustomerRegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const registerAction = useAuthStore((s) => s.register);
  const verifyOtpAction = useAuthStore((s) => s.verifyOtp);
  const resendOtpAction = useAuthStore((s) => s.resendOtp);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.role);

  // step ∈ 'account' | 'verify' | 'done'
  const [step, setStep] = useState('account');
  const [pendingEmail, setPendingEmail] = useState('');
  const [serverError, setServerError] = useState(null);

  // OTP view state
  const [otpValue, setOtpValue] = useState('');
  const [verifyError, setVerifyError] = useState(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendStatus, setResendStatus] = useState('');

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
    setError,
  } = useForm({
    resolver: zodResolver(customerRegisterSchema),
    defaultValues: {
      full_name: '',
      email: '',
      phone: '',
      password: '',
      confirm_password: '',
      date_of_birth: '',
      gender: '',
      accept_terms: false,
    },
  });

  const passwordValue = useWatch({ control, name: 'password' });
  // Per spec §Module 1: submit button stays disabled until the user
  // ticks the Terms of Service checkbox.
  const acceptTerms = watch('accept_terms');

  // Cooldown countdown for the resend link
  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // Once authenticated (after VERIFY), redirect to the original target.
  useEffect(() => {
    if (step === 'done' && isAuthenticated && role === 'customer') {
      const target = location.state?.from || ROUTES.HOME;
      const t = setTimeout(() => navigate(target, { replace: true }), 900);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [step, isAuthenticated, role, location.state, navigate]);

  // ─── Step 1: register ────────────────────────────────────────────
  const onSubmit = async (values) => {
    setServerError(null);
    try {
      const result = await registerAction('customer', values);
      const payload = result?.data || result;
      const requiresVerification = payload?.requires_verification ?? true;
      const email = payload?.email || values.email;
      const successMessage =
        payload?.message ||
        'Account created. Check your email for a 6-digit verification code.';

      if (requiresVerification) {
        setPendingEmail(email);
        setResendCooldown(60); // backend caps at 30s; UI shows a friendly 60s
        setStep('verify');
        toast.success(successMessage);
        return;
      }

      // Auto-login path (e.g. verification disabled in dev) — straight to done.
      setStep('done');
      toast.success(successMessage);
    } catch (err) {
      const apiError = err.response?.data?.error;
      const fields = apiError?.details?.fields || apiError?.fields;
      if (fields && typeof fields === 'object') {
        Object.entries(fields).forEach(([name, messages]) => {
          setError(name, {
            type: 'server',
            message: Array.isArray(messages) ? messages[0] : String(messages),
          });
        });
        return;
      }
      const message = apiError?.message || 'Registration failed. Please try again.';
      setServerError(message);
      toast.error(message);
    }
  };

  // ─── Step 2: verify OTP ──────────────────────────────────────────
  const onVerify = async (e) => {
    e?.preventDefault?.();
    if (otpValue.length !== 6) {
      setVerifyError('Enter the 6-digit code we sent to your email.');
      return;
    }
    setVerifyError(null);
    try {
      await verifyOtpAction({ email: pendingEmail, code: otpValue });
      toast.success('Email verified — you’re in!');
      setStep('done');
    } catch (err) {
      const apiError = err.response?.data?.error;
      const message =
        apiError?.message ||
        'That code didn’t work. Please check the digits and try again.';
      setVerifyError(message);
      toast.error(message);
    }
  };

  // Resend handler. Backend enforces a 30-second cooldown and a 5/hour
  // rate limit — we surface its generic 200 message either way.
  const onResend = async () => {
    if (resendCooldown > 0) return;
    setResendStatus('');
    try {
      const res = await resendOtpAction({ email: pendingEmail });
      setResendStatus(
        res?.message ||
          'A new code is on its way. Check your inbox (and spam folder).'
      );
      setResendCooldown(60);
      toast.success('Verification code resent.');
    } catch (err) {
      const apiError = err.response?.data?.error;
      const message =
        apiError?.message || 'Could not resend code right now. Please try again.';
      setResendStatus(message);
      toast.error(message);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen overflow-hidden bg-surface-100">
      {/* Ambient blobs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-10 h-96 w-96 rounded-full bg-accent-500/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-primary-700/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, #475569 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-6xl items-stretch px-4 py-8 sm:px-6 lg:px-8">
        <div className="relative grid w-full overflow-hidden rounded-2xl border border-surface-300 bg-white shadow-2xl shadow-primary-900/10 ring-1 ring-primary-900/5 lg:grid-cols-2">
          {/* Left: marketing column (desktop only) */}
          <MarketingColumn />

          {/* Right: form card */}
          <div className="relative flex flex-col p-6 sm:p-8 lg:p-10">
            {/* Mobile-only header strip — mirrors the marketing column on small screens */}
            <div className="mb-6 lg:hidden">
              <div className="flex items-center gap-2.5">
                <span className="relative grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-primary-800 to-primary-900 text-accent-300 shadow-md shadow-primary-900/30">
                  <Cpu className="h-4 w-4" />
                  <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-success ring-2 ring-white" />
                </span>
                <div>
                  <p className="font-heading text-sm font-bold tracking-tight text-primary-900">
                    PCCraft
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-text-secondary">
                    Bangladesh&apos;s PC marketplace
                  </p>
                </div>
              </div>
            </div>

            <Link
              to={ROUTES.HOME}
              className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-text-secondary transition hover:text-accent-500"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to home
            </Link>

            <div className="mt-3">
              <h2 className="font-heading text-2xl font-bold text-text-primary sm:text-3xl">
                {step === 'verify'
                  ? 'Verify your email'
                  : step === 'done'
                    ? 'You’re all set!'
                    : 'Create your account'}
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                {step === 'verify'
                  ? `Enter the 6-digit code we sent to ${pendingEmail || 'your email'}.`
                  : step === 'done'
                    ? 'Welcome to PCCraft — taking you to the marketplace…'
                    : 'Track orders, save builds, and curate a wishlist.'}
              </p>
            </div>

            {/* Progress dots — driven by the active step */}
            <StepIndicator step={step} />

            <AnimatePresence mode="wait">
              {step === 'account' && (
                <motion.form
                  key="account"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  onSubmit={handleSubmit(onSubmit)}
                  noValidate
                  className="mt-6 flex flex-1 flex-col gap-4"
                >
                  <FormField
                    label="Full name"
                    error={errors.full_name?.message}
                    required
                    registration={register('full_name')}
                    autoComplete="name"
                    leadingIcon={<User className="h-4 w-4" />}
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      label="Email"
                      type="email"
                      error={errors.email?.message}
                      required
                      registration={register('email')}
                      autoComplete="email"
                      placeholder="you@example.com"
                      leadingIcon={<Mail className="h-4 w-4" />}
                    />

                    <FormField
                      label="Phone"
                      type="tel"
                      error={errors.phone?.message}
                      required
                      registration={register('phone')}
                      hint="Bangladesh number, e.g. +8801712345678"
                      autoComplete="tel"
                      placeholder="+8801712345678"
                      leadingIcon={<Phone className="h-4 w-4" />}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      label="Date of birth"
                      type="date"
                      error={errors.date_of_birth?.message}
                      required
                      registration={register('date_of_birth')}
                      leadingIcon={<Calendar className="h-4 w-4" />}
                    />

                    <FormField
                      label="Gender"
                      error={errors.gender?.message}
                      required
                      htmlFor="customer-gender"
                    >
                      <select
                        id="customer-gender"
                        {...register('gender')}
                        defaultValue=""
                        className="w-full"
                      >
                        <option value="" disabled>
                          Select…
                        </option>
                        {GENDERS.map((g) => (
                          <option key={g.value} value={g.value}>
                            {g.label}
                          </option>
                        ))}
                      </select>
                    </FormField>
                  </div>

                  <PasswordField
                    label="Password"
                    error={errors.password?.message}
                    required
                    autoComplete="new-password"
                    registration={register('password')}
                    placeholder="At least 8 characters"
                  />
                  {passwordValue && <PasswordStrength password={passwordValue} />}

                  <PasswordField
                    label="Confirm password"
                    error={errors.confirm_password?.message}
                    required
                    autoComplete="new-password"
                    registration={register('confirm_password')}
                    placeholder="Repeat your password"
                  />

                  <label className="flex items-start gap-2 rounded-md border border-surface-200 bg-surface-100 px-3 py-2.5 text-sm text-text-secondary transition hover:border-accent-400 hover:bg-surface-50">
                    <input
                      type="checkbox"
                      {...register('accept_terms')}
                      className="mt-0.5 rounded border-surface-300 text-accent-500 focus:ring-accent-500"
                    />
                    <span>
                      I agree to PCCraft&apos;s{' '}
                      <Link
                        to={ROUTES.LEGAL.TERMS}
                        className="font-medium text-accent-500 hover:underline"
                      >
                        Terms of Service
                      </Link>{' '}
                      and{' '}
                      <Link
                        to={ROUTES.LEGAL.PRIVACY}
                        className="font-medium text-accent-500 hover:underline"
                      >
                        Privacy Policy
                      </Link>
                      .
                    </span>
                  </label>
                  {errors.accept_terms && (
                    <p className="text-xs text-danger">
                      {errors.accept_terms.message}
                    </p>
                  )}

                  {serverError && (
                    <div
                      role="alert"
                      className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
                    >
                      {serverError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting || !acceptTerms}
                    className="group relative mt-2 inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-md bg-gradient-to-r from-accent-500 to-accent-600 px-4 py-3 text-sm font-semibold text-primary-900 shadow-md shadow-accent-500/30 transition hover:shadow-lg hover:shadow-accent-500/40 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 -translate-x-full bg-white/20 transition-transform duration-300 group-hover:translate-x-0"
                    />
                    <UserPlus className="relative h-4 w-4" />
                    <span className="relative">
                      {isSubmitting ? 'Creating account…' : 'Create account'}
                    </span>
                  </button>

                  <div className="mt-2 space-y-1 text-center text-sm">
                    <p className="text-text-secondary">
                      Selling on PCCraft?{' '}
                      <Link
                        to={ROUTES.AUTH.REGISTER_VENDOR}
                        className="font-medium text-accent-500 hover:underline"
                      >
                        Apply as a vendor
                      </Link>
                    </p>
                    <p className="text-text-secondary">
                      Already have an account?{' '}
                      <Link
                        to={ROUTES.AUTH.LOGIN}
                        className="font-medium text-accent-500 hover:underline"
                      >
                        Sign in
                      </Link>
                    </p>
                  </div>
                </motion.form>
              )}

              {step === 'verify' && (
                <motion.form
                  key="verify"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  onSubmit={onVerify}
                  className="mt-6 flex flex-1 flex-col gap-5"
                >
                  {/* KeyRound icon header */}
                  <div className="flex flex-col items-center gap-3 pt-2">
                    <span className="grid h-14 w-14 place-items-center rounded-full bg-accent-500/10 text-accent-500">
                      <KeyRound className="h-7 w-7" />
                    </span>
                    <p className="text-center text-sm text-text-secondary">
                      Didn’t get the email? Check your spam folder, or use
                      the resend link below.
                    </p>
                  </div>

                  <OtpInput
                    value={otpValue}
                    onChange={setOtpValue}
                    disabled={isSubmitting}
                    error={Boolean(verifyError)}
                  />

                  {verifyError && (
                    <div
                      role="alert"
                      className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-center text-sm text-danger"
                    >
                      {verifyError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting || otpValue.length !== 6}
                    className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-md bg-gradient-to-r from-accent-500 to-accent-600 px-4 py-3 text-sm font-semibold text-primary-900 shadow-md shadow-accent-500/30 transition hover:shadow-lg hover:shadow-accent-500/40 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 -translate-x-full bg-white/20 transition-transform duration-300 group-hover:translate-x-0"
                    />
                    <span className="relative">
                      {isSubmitting ? 'Verifying…' : 'Verify code'}
                    </span>
                    <ArrowRight className="relative h-4 w-4" />
                  </button>

                  <div className="flex flex-col items-center gap-1 text-center text-sm">
                    <button
                      type="button"
                      onClick={onResend}
                      disabled={resendCooldown > 0 || isSubmitting}
                      className="inline-flex items-center gap-1.5 font-medium text-accent-500 transition hover:underline disabled:cursor-not-allowed disabled:text-text-secondary disabled:no-underline"
                    >
                      <RotateCw
                        className={`h-3.5 w-3.5 ${
                          resendCooldown > 0 ? '' : 'group-hover:rotate-90'
                        }`}
                      />
                      {resendCooldown > 0
                        ? `Resend code in ${resendCooldown}s`
                        : 'Resend code'}
                    </button>
                    {resendStatus && (
                      <p className="text-xs text-text-secondary">{resendStatus}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setStep('account');
                        setOtpValue('');
                        setVerifyError(null);
                        setResendStatus('');
                      }}
                      className="mt-1 text-xs text-text-secondary underline-offset-2 hover:underline"
                    >
                      Use a different email
                    </button>
                  </div>
                </motion.form>
              )}

              {step === 'done' && (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="mt-6 flex flex-1 flex-col items-center justify-center gap-4 text-center"
                >
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{
                      type: 'spring',
                      stiffness: 220,
                      damping: 14,
                      delay: 0.1,
                    }}
                    className="grid h-20 w-20 place-items-center rounded-full bg-success/15 text-success ring-4 ring-success/10"
                  >
                    <CheckCircle2 className="h-10 w-10" />
                  </motion.span>
                  <div>
                    <h3 className="font-heading text-xl font-bold text-text-primary">
                      Welcome to PCCraft!
                    </h3>
                    <p className="mt-1 text-sm text-text-secondary">
                      Your email is verified. You’ll be redirected in a moment…
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}