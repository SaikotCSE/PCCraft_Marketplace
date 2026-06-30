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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
  MapPin,
  Plus,
  Pencil,
  Trash2,
  Star,
  Home,
  Building2,
} from 'lucide-react';

import useAuthStore from '@context/useAuthStore';
import { useOrderStore } from '@context/useOrderStore';
import { orderService } from '@services/orderService';
import { profileUpdateSchema, passwordChangeSchema, addressSchema } from '@utils/validators';
import { ROUTES } from '@routes/routePaths';
import FormField, { PasswordField } from '@components/common/FormField';
import PasswordStrength from '@components/common/PasswordStrength';
import EmptyState from '@components/common/EmptyState';
import Modal from '@components/common/Modal';
import ConfirmDialog from '@components/common/ConfirmDialog';
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
  { id: 'addresses', label: 'Addresses', icon: MapPin },
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

  const [searchParams, setSearchParams] = useSearchParams();
  // Tab is URL-driven so checkout can deep-link to ?tab=addresses.
  const tabParam = searchParams.get('tab');
  const tab = TABS.some((t) => t.id === tabParam) ? tabParam : 'profile';
  const setTab = (next) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'profile') {
      params.delete('tab');
    } else {
      params.set('tab', next);
    }
    setSearchParams(params, { replace: true });
  };
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
            ) : tab === 'addresses' ? (
              <motion.div
                key="addresses"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                <AddressesTab onError={(msg) => setServerError(msg)} serverError={serverError} />
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

function SectionHeader({ title, description, icon: Icon, trailing }) {
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
      {trailing ? <div className="flex-shrink-0">{trailing}</div> : null}
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

// ─── Addresses tab ────────────────────────────────────────────────────
// Customer-facing shipping address book. Wraps:
//   GET    /api/v1/addresses/             list
//   POST   /api/v1/addresses/             create
//   PATCH  /api/v1/addresses/:id/         update
//   DELETE /api/v1/addresses/:id/         delete
//   POST   /api/v1/addresses/:id/set-default/  mark default
// Mirrors the backend ShippingAddressSerializer shape.
//
// State is read from / written to `useOrderStore` so changes made here
// show up immediately on the checkout address step without a reload.
function AddressesTab({ onError, serverError }) {
  // Shared store — same source of truth as CheckoutPage.
  const addresses = useOrderStore((s) => s.addresses);
  const loading = useOrderStore((s) => s.addressesLoading);
  const fetchAddresses = useOrderStore((s) => s.fetchAddresses);
  const createAddress = useOrderStore((s) => s.createAddress);
  const updateAddress = useOrderStore((s) => s.updateAddress);
  const deleteAddress = useOrderStore((s) => s.deleteAddress);
  const setDefaultAddress = useOrderStore((s) => s.setDefaultAddress);

  const [editing, setEditing] = useState(null); // 'new' | { id, ... } | null
  const [deleting, setDeleting] = useState(null);
  const [actionPending, setActionPending] = useState(false);

  // First-mount fetch (subsequent navigation back to the tab will reuse
  // the cached list from the store).
  useEffect(() => {
    fetchAddresses().catch(() => {});
  }, [fetchAddresses]);

  const handleSetDefault = async (addr) => {
    if (addr.is_default) return;
    setActionPending(true);
    try {
      await setDefaultAddress(addr.id);
      toast.success('Default address updated.');
    } catch (err) {
      const apiError = err.response?.data?.error;
      onError(apiError?.message || 'Failed to set default address.');
    } finally {
      setActionPending(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setActionPending(true);
    try {
      await deleteAddress(deleting.id);
      toast.success('Address deleted.');
      setDeleting(null);
    } catch (err) {
      const apiError = err.response?.data?.error;
      onError(apiError?.message || 'Failed to delete address.');
    } finally {
      setActionPending(false);
    }
  };

  const handleSaved = () => {
    setEditing(null);
    toast.success(editing === 'new' ? 'Address added.' : 'Address updated.');
  };

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-surface-300 bg-white p-6 shadow-sm">
        <SectionHeader
          title="Shipping addresses"
          description="Save the places you ship to. We'll pre-fill the checkout with your default address and let you pick another when you order."
          icon={MapPin}
          trailing={
            <button
              type="button"
              onClick={() => setEditing('new')}
              className="inline-flex items-center gap-2 rounded-md bg-accent-500 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-accent-600"
            >
              <Plus className="h-4 w-4" />
              Add address
            </button>
          }
        />

        {loading && addresses.length === 0 ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-40 animate-pulse rounded-md border border-surface-200 bg-surface-100"
              />
            ))}
          </div>
        ) : addresses.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              icon={MapPin}
              title="No addresses yet"
              description="Add your first shipping address to speed up checkout."
              actionLabel="Add address"
              onAction={() => setEditing('new')}
            />
          </div>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {addresses.map((addr) => (
              <AddressCard
                key={addr.id}
                address={addr}
                pending={actionPending}
                onEdit={() => setEditing(addr)}
                onDelete={() => setDeleting(addr)}
                onSetDefault={() => handleSetDefault(addr)}
              />
            ))}
          </ul>
        )}

        {serverError && (
          <div
            role="alert"
            className="mt-4 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
          >
            {serverError}
          </div>
        )}
      </div>

      <Modal
        open={editing !== null}
        onClose={() => (actionPending ? null : setEditing(null))}
        title={editing && editing !== 'new' ? 'Edit address' : 'Add address'}
        size="lg"
        hideCloseButton={actionPending}
      >
        {editing !== null && (
          <AddressForm
            initial={editing === 'new' ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={handleSaved}
            onError={onError}
            setBusy={setActionPending}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => (actionPending ? null : setDeleting(null))}
        onConfirm={handleDelete}
        title="Delete this address?"
        description={
          deleting
            ? `${deleting.full_name} — ${deleting.street_address}, ${deleting.city}. Past orders keep the address snapshot regardless.`
            : ''
        }
        confirmLabel="Delete address"
        tone="danger"
        loading={actionPending}
      />
    </div>
  );
}

function AddressCard({ address, pending, onEdit, onDelete, onSetDefault }) {
  const Icon = (address.label || '').toLowerCase().includes('office')
    ? Building2
    : Home;

  return (
    <li className="relative rounded-md border border-surface-300 bg-surface-50 p-4 transition hover:border-accent-500/50 hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-500/10 text-accent-600 ring-1 ring-accent-500/20">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-text-primary">
                {address.label || 'Address'}
              </p>
              {address.is_default && (
                <Pill tone="accent" icon={Star}>
                  Default
                </Pill>
              )}
            </div>
            <p className="truncate text-xs text-text-secondary">
              {address.full_name} · {address.phone}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 text-sm leading-relaxed text-text-primary">
        <p>{address.street_address}</p>
        {address.address_line2 ? <p>{address.address_line2}</p> : null}
        <p>
          {address.city}, {address.district}
          {address.postal_code ? ` - ${address.postal_code}` : ''}
        </p>
        <p className="text-text-secondary">{address.country}</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-surface-200 pt-3">
        {!address.is_default && (
          <button
            type="button"
            onClick={onSetDefault}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md border border-surface-300 bg-white px-2.5 py-1.5 text-xs font-medium text-text-primary transition hover:border-accent-500 hover:text-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Star className="h-3.5 w-3.5" />
            Set default
          </button>
        )}
        <button
          type="button"
          onClick={onEdit}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md border border-surface-300 bg-white px-2.5 py-1.5 text-xs font-medium text-text-primary transition hover:border-accent-500 hover:text-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-surface-300 bg-white px-2.5 py-1.5 text-xs font-medium text-danger transition hover:border-danger hover:bg-danger/5 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      </div>
    </li>
  );
}

function AddressForm({ initial, onCancel, onSaved, onError, setBusy }) {
  const isEdit = Boolean(initial);
  const createAddress = useOrderStore((s) => s.createAddress);
  const updateAddress = useOrderStore((s) => s.updateAddress);
  const user = useAuthStore((s) => s.user);

  // Name + phone come from the user profile. We pre-fill the form so the
  // customer doesn't have to re-type them, and we hide the fields in the
  // UI. The values are merged back into the payload before submit so the
  // backend still receives them.
  const profileName = user?.full_name || '';
  const profilePhone = user?.phone || '';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      label: initial?.label ?? 'Home',
      full_name: initial?.full_name || profileName,
      phone: initial?.phone || profilePhone,
      street_address: initial?.street_address ?? '',
      address_line2: initial?.address_line2 ?? '',
      city: initial?.city ?? '',
      district: initial?.district ?? '',
      postal_code: initial?.postal_code ?? '',
      country: initial?.country ?? 'Bangladesh',
      is_default: initial?.is_default ?? false,
    },
  });

  // Keep the form in sync when an existing address is opened for editing.
  useEffect(() => {
    if (!initial) return;
    reset({
      label: initial.label || 'Home',
      full_name: initial.full_name || profileName,
      phone: initial.phone || profilePhone,
      street_address: initial.street_address || '',
      address_line2: initial.address_line2 || '',
      city: initial.city || '',
      district: initial.district || '',
      postal_code: initial.postal_code || '',
      country: initial.country || 'Bangladesh',
      is_default: Boolean(initial.is_default),
    });
  }, [initial, profileName, profilePhone, reset]);

  const onSubmit = async (values) => {
    setBusy(true);
    try {
      // Always send the latest profile values for name/phone so they match
      // whatever the customer's profile currently says.
      const payload = {
        ...values,
        full_name: profileName,
        phone: profilePhone || values.phone,
      };
      if (isEdit) {
        await updateAddress(initial.id, payload);
      } else {
        await createAddress(payload);
      }
      onSaved();
    } catch (err) {
      const fieldErrors = err.response?.data?.error?.fields;
      const apiMessage = err.response?.data?.error?.message;
      if (fieldErrors && typeof fieldErrors === 'object') {
        onError(apiMessage || 'Please review the highlighted fields.');
      } else {
        onError(apiMessage || 'Failed to save address.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <FormField
        label="Label"
        hint="e.g. Home, Office"
        error={errors.label?.message}
        registration={register('label')}
        leadingIcon={<Home className="h-4 w-4" />}
      />

      {/* Recipient / phone are auto-filled from the user profile so the
          customer doesn't have to repeat them on every new address. */}
      <div className="rounded-md border border-surface-200 bg-surface-50 px-3 py-2 text-xs text-text-secondary">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            Shipping to{' '}
            <span className="font-medium text-text-primary">
              {profileName || '— add your name in your profile'}
            </span>
            {profilePhone ? (
              <>
                {' · '}
                <Phone className="mb-0.5 mr-0.5 inline h-3 w-3" />
                <span className="font-medium text-text-primary">{profilePhone}</span>
              </>
            ) : null}
          </span>
          <Link
            to="/profile?tab=profile"
            className="font-medium text-accent-600 hover:text-accent-700 hover:underline"
          >
            Update name / phone
          </Link>
        </div>
      </div>

      <FormField
        label="Street address"
        required
        hint="House + road"
        error={errors.street_address?.message}
        registration={register('street_address')}
        autoComplete="address-line1"
      />

      <FormField
        label="Address line 2"
        hint="Apartment, floor (optional)"
        error={errors.address_line2?.message}
        registration={register('address_line2')}
        autoComplete="address-line2"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <FormField
          label="City"
          required
          error={errors.city?.message}
          registration={register('city')}
          autoComplete="address-level2"
        />
        <FormField
          label="District"
          required
          error={errors.district?.message}
          registration={register('district')}
          autoComplete="address-level1"
        />
        <FormField
          label="Postal code"
          error={errors.postal_code?.message}
          registration={register('postal_code')}
          autoComplete="postal-code"
        />
      </div>

      <FormField
        label="Country"
        error={errors.country?.message}
        registration={register('country')}
      />

      <label className="flex cursor-pointer items-center gap-2 rounded-md border border-surface-300 bg-surface-50 px-3 py-2 text-sm text-text-primary">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-surface-300 text-accent-500 focus:ring-accent-500"
          {...register('is_default')}
        />
        <span>Use this as my default shipping address</span>
      </label>

      <div className="flex items-center justify-end gap-2 border-t border-surface-200 pt-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="rounded-md border border-surface-300 bg-white px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-100 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add address'}
        </button>
      </div>
    </form>
  );
}
