// ProfilePage — authenticated user's account settings.
//
// Layout:
//   1. Identity hero  — avatar, name, email, role + status pills
//   2. Tab strip       — Profile | Password
//   3. Active tab body — form card with sectioned groups
//   4. Account meta    — quick facts (member since, role, account id)
//
// All data is sourced from useAuthStore so the navbar reflects changes
// the moment a PATCH succeeds. Errors render inline beneath each field.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import {
  User,
  Phone,
  Calendar,
  Mail,
  Lock,
  Save,
  CheckCircle2,
  Shield,
  AtSign,
  Cake,
  IdCard,
  CalendarClock,
  LogOut,
  KeyRound,
  UserCircle2,
} from 'lucide-react';

import useAuthStore from '@context/useAuthStore';
import { profileUpdateSchema, passwordChangeSchema } from '@utils/validators';
import { ROUTES } from '@routes/routePaths';
import FormField, { PasswordField } from '@components/common/FormField';
import PasswordStrength from '@components/common/PasswordStrength';
import { usePageTitle } from '@/hooks/usePageTitle';
import { cn } from '@utils/cn';

const GENDERS = [
  { value: '', label: 'Select gender' },
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
];

const TABS = [
  { id: 'profile', label: 'Profile', icon: UserCircle2 },
  { id: 'password', label: 'Password', icon: KeyRound },
];

// ─── Helpers ─────────────────────────────────────────────────────────
function initialsOf(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');
}

function formatDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return d;
  }
}

const ROLE_TONE = {
  customer: { label: 'Customer', tone: 'accent' },
  vendor: { label: 'Vendor', tone: 'info' },
  admin: { label: 'Administrator', tone: 'warning' },
};

const TONE_STYLES = {
  accent: 'bg-accent-500/10 text-accent-600 ring-accent-500/20',
  info: 'bg-info/10 text-info ring-info/20',
  warning: 'bg-warning/10 text-warning ring-warning/20',
  success: 'bg-success/10 text-success ring-success/20',
  danger: 'bg-danger/10 text-danger ring-danger/20',
  neutral: 'bg-surface-100 text-text-secondary ring-surface-300',
};

function Pill({ tone = 'neutral', children, icon: Icon }) {
  const dotTone = {
    accent: 'bg-accent-500',
    info: 'bg-info',
    warning: 'bg-warning',
    success: 'bg-success',
    danger: 'bg-danger',
    neutral: 'bg-text-secondary',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONE_STYLES[tone],
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" /> : <span className={cn('h-1.5 w-1.5 rounded-full', dotTone[tone])} />}
      {children}
    </span>
  );
}

// ─── Page ────────────────────────────────────────────────────────────
export default function ProfilePage() {
  usePageTitle('Profile · PCCraft');
  const user = useAuthStore((s) => s.user);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const logout = useAuthStore((s) => s.logout);

  const [tab, setTab] = useState('profile');
  const [serverError, setServerError] = useState(null);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const initials = useMemo(() => initialsOf(user?.full_name) || 'PC', [user?.full_name]);
  const roleMeta = ROLE_TONE[user?.role] || ROLE_TONE.customer;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-surface-200">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      {/* ── Identity hero ─────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="relative mb-8 overflow-hidden rounded-md border border-surface-300 bg-white shadow-sm"
      >
        {/* Decorative gradient strip + soft accent orb for visual depth. */}
        <div
          aria-hidden
          className="relative h-28 w-full overflow-hidden bg-gradient-to-br from-primary-800 via-primary-700 to-primary-800"
        >
          <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-accent-500/40 blur-2xl" />
          <div className="absolute left-1/3 top-2 h-2 w-2 rounded-full bg-accent-300/60" />
          <div className="absolute left-1/2 top-6 h-1.5 w-1.5 rounded-full bg-accent-300/40" />
          <div className="absolute left-2/3 bottom-4 h-1 w-1 rounded-full bg-accent-300/50" />
        </div>
        <div className="px-6 pb-6 sm:px-8">
          <div className="-mt-14 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:gap-6">
            {/* Avatar */}
            <div className="relative flex h-28 w-28 flex-shrink-0 items-center justify-center">
              <div
                aria-hidden
                className="absolute inset-0 rounded-md bg-gradient-to-br from-accent-500 to-accent-700 blur-md opacity-60"
              />
              <div className="relative flex h-full w-full items-center justify-center rounded-md border-4 border-white bg-gradient-to-br from-accent-500 via-accent-600 to-primary-800 text-3xl font-bold text-text-inverse shadow-lg">
                {initials}
              </div>
            </div>

            {/* Name + email + pills */}
            <div className="min-w-0 flex-1 pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-semibold text-text-primary">
                  {user?.full_name || 'Your account'}
                </h1>
                <Pill tone={roleMeta.tone} icon={Shield}>
                  {roleMeta.label}
                </Pill>
                <Pill tone={user?.is_verified ? 'success' : 'warning'} icon={CheckCircle2}>
                  {user?.is_verified ? 'Verified' : 'Unverified'}
                </Pill>
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-text-secondary">
                <Mail className="h-3.5 w-3.5" />
                {user?.email}
              </p>
            </div>

            {/* Quick action */}
            <button
              type="button"
              onClick={async () => {
                await logout();
                toast.success('Signed out.');
              }}
              className="inline-flex items-center gap-2 rounded-md border border-surface-300 bg-white px-3 py-2 text-sm font-medium text-text-primary transition hover:border-danger hover:bg-danger/5 hover:text-danger"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </motion.section>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* ── Main column: tabs + form ───────────────────────────── */}
        <div>
          <nav
            role="tablist"
            aria-label="Account settings"
            className="mb-4 inline-flex rounded-md border border-surface-300 bg-white p-1 shadow-sm"
          >
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  onClick={() => {
                    setTab(t.id);
                    setServerError(null);
                  }}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-sm px-4 py-2 text-sm font-medium transition',
                    active
                      ? 'bg-gradient-to-r from-accent-500 to-accent-600 text-white shadow-sm'
                      : 'text-text-secondary hover:bg-surface-100 hover:text-text-primary',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </nav>

          <AnimatePresence mode="wait">
            {tab === 'profile' ? (
              <motion.div
                key="profile"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                <ProfileForm
                  user={user}
                  onSaved={() => {
                    toast.success('Profile updated.');
                    setServerError(null);
                  }}
                  onError={(msg) => setServerError(msg)}
                  serverError={serverError}
                />
              </motion.div>
            ) : (
              <motion.div
                key="password"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                <PasswordForm
                  onSaved={() => {
                    toast.success('Password updated.');
                    setServerError(null);
                  }}
                  onError={(msg) => setServerError(msg)}
                  serverError={serverError}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-8 text-center text-sm text-text-secondary">
            Need a different role?{' '}
            <Link to={ROUTES.HOME} className="text-accent-500 hover:underline">
              Back to home
            </Link>
          </div>
        </div>

        {/* ── Side column: account meta ──────────────────────────── */}
        <aside className="space-y-4">
          <div className="rounded-md border border-surface-300 bg-white p-5 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              <Shield className="h-3.5 w-3.5 text-accent-500" />
              Account
            </h2>
            <dl className="space-y-3 text-sm">
              <MetaRow icon={IdCard} label="Account ID" value={user?.id ? user.id.slice(0, 8) : '—'} />
              <MetaRow icon={AtSign} label="Email" value={user?.email} />
              <MetaRow icon={User} label="Role" value={roleMeta.label} />
              <MetaRow icon={CalendarClock} label="Member since" value={formatDate(user?.date_joined)} />
              <MetaRow icon={Cake} label="Date of birth" value={formatDate(user?.date_of_birth)} />
            </dl>
          </div>

          <div className="rounded-md border border-surface-300 bg-white p-5 shadow-sm">
            <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              Tips
            </h2>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                Use a unique password you don&apos;t reuse elsewhere.
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                Keep your phone number current so vendors can reach you.
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                Verify your email to unlock order updates and receipts.
              </li>
            </ul>
          </div>
        </aside>
      </div>
      </div>
    </div>
  );
}

function MetaRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-text-secondary" />
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-text-secondary">{label}</dt>
        <dd className="truncate font-medium text-text-primary">{value || '—'}</dd>
      </div>
    </div>
  );
}

// ─── Profile tab ──────────────────────────────────────────────────────
function ProfileForm({ user, onSaved, onError, serverError }) {
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
    reset,
  } = useForm({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: {
      full_name: user?.full_name || '',
      phone: user?.phone || '',
      date_of_birth: user?.date_of_birth || '',
      gender: user?.gender || '',
    },
  });

  useEffect(() => {
    reset({
      full_name: user?.full_name || '',
      phone: user?.phone || '',
      date_of_birth: user?.date_of_birth || '',
      gender: user?.gender || '',
    });
  }, [user, reset]);

  const onSubmit = async (values) => {
    try {
      await updateProfile(values);
      onSaved();
    } catch (err) {
      const apiError = err.response?.data?.error;
      onError(apiError?.message || 'Failed to save profile.');
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="space-y-6 rounded-md border border-surface-300 bg-white p-6 shadow-sm"
    >
      <SectionHeader
        title="Personal details"
        description="Tell us who you are. Vendors and admins see your name on orders and messages."
        icon={User}
      />

      <fieldset className="space-y-4 pt-2">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Full name"
            error={errors.full_name?.message}
            required
            registration={register('full_name')}
            autoComplete="name"
            leadingIcon={<User className="h-4 w-4" />}
          />

          <FormField label="Email" hint="Email is locked once an account is created.">
            <div className="flex items-center gap-2 rounded-md border border-surface-300 bg-surface-100 px-3 py-2 text-sm text-text-secondary">
              <Mail className="h-4 w-4" />
              <span className="truncate">{user?.email || '—'}</span>
            </div>
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Phone"
            type="tel"
            error={errors.phone?.message}
            registration={register('phone')}
            hint="Bangladesh number, e.g. +8801712345678"
            autoComplete="tel"
            leadingIcon={<Phone className="h-4 w-4" />}
          />

          <FormField
            label="Date of birth"
            type="date"
            error={errors.date_of_birth?.message}
            registration={register('date_of_birth')}
            leadingIcon={<Calendar className="h-4 w-4" />}
          />
        </div>

        <FormField
          label="Gender"
          error={errors.gender?.message}
          htmlFor="profile-gender"
        >
          <select id="profile-gender" {...register('gender')} defaultValue={user?.gender || ''}>
            {GENDERS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </FormField>
      </fieldset>

      {serverError && (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
        >
          {serverError}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-surface-200 pt-4">
        <p className="text-xs text-text-secondary">
          {isDirty ? 'You have unsaved changes.' : 'All changes saved.'}
        </p>
        <button
          type="submit"
          disabled={!isDirty || isSubmitting}
          className="inline-flex items-center gap-2 rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {isSubmitting ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

function SectionHeader({ title, description, icon: Icon }) {
  return (
    <div className="flex items-start gap-3 border-b border-surface-200 pb-4">
      {Icon ? (
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-accent-500/10 text-accent-600 ring-1 ring-accent-500/20">
          <Icon className="h-5 w-5" />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-text-secondary">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

// ─── Password tab ─────────────────────────────────────────────────────
function PasswordForm({ onSaved, onError, serverError }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
  } = useForm({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: {
      current_password: '',
      new_password: '',
      confirm_new_password: '',
    },
  });

  const newPasswordValue = watch('new_password');

  const onSubmit = async (values) => {
    try {
      const authService = (await import('@services/authService')).default;
      await authService.changePassword(values);
      onSaved();
      reset();
    } catch (err) {
      const apiError = err.response?.data?.error;
      onError(apiError?.message || 'Failed to update password.');
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="space-y-6 rounded-md border border-surface-300 bg-white p-6 shadow-sm"
    >
      <SectionHeader
        title="Change password"
        description="Pick a strong password — at least 8 characters with upper, lower, and a digit."
        icon={KeyRound}
      />

      <div className="space-y-4">
        <PasswordField
          label="Current password"
          error={errors.current_password?.message}
          required
          autoComplete="current-password"
          registration={register('current_password')}
          leadingIcon={<Lock className="h-4 w-4" />}
        />

        <PasswordField
          label="New password"
          error={errors.new_password?.message}
          required
          autoComplete="new-password"
          registration={register('new_password')}
          leadingIcon={<KeyRound className="h-4 w-4" />}
          placeholder="At least 8 characters"
        />
        {newPasswordValue ? <PasswordStrength password={newPasswordValue} /> : null}

        <PasswordField
          label="Confirm new password"
          error={errors.confirm_new_password?.message}
          required
          autoComplete="new-password"
          registration={register('confirm_new_password')}
          leadingIcon={<KeyRound className="h-4 w-4" />}
          placeholder="Repeat your new password"
        />
      </div>

      {serverError && (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
        >
          {serverError}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-surface-200 pt-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <CheckCircle2 className="h-4 w-4" />
          {isSubmitting ? 'Updating…' : 'Update password'}
        </button>
      </div>
    </form>
  );
}
