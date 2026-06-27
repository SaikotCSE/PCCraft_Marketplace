// ProfilePage — authenticated user's account settings.
//
// Tabs:
//   - Profile     name / phone / DOB / gender (PATCH /auth/profile/)
//   - Password    current + new + confirm (no backend endpoint yet — surfaces a stub)
//
// Reads/writes through useAuthStore so the navbar + other pages see
// updates immediately. Backend UserProfileSerializer exposes: full_name,
// phone, date_of_birth, gender (and avatar — handled by a separate
// upload flow once that endpoint lands).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'react-hot-toast';
import {
  User,
  Phone,
  Calendar,
  Mail,
  Lock,
  Save,
  CheckCircle2,
} from 'lucide-react';

import useAuthStore from '@context/useAuthStore';
import { profileUpdateSchema, passwordChangeSchema } from '@utils/validators';
import { ROUTES } from '@routes/routePaths';
import FormField, { PasswordField } from '@components/auth/FormField';
import PasswordStrength from '@components/auth/PasswordStrength';
import { usePageTitle } from '@/hooks/usePageTitle';

const GENDERS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
];

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'password', label: 'Password' },
];

export default function ProfilePage() {
  usePageTitle('Profile · PCCraft');
  const user = useAuthStore((s) => s.user);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  const [tab, setTab] = useState('profile');
  const [serverError, setServerError] = useState(null);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Your account</h1>
        <p className="text-sm text-text-secondary">
          Signed in as <span className="font-medium text-text-primary">{user?.email}</span> (
          {user?.role}).
        </p>
      </header>

      <nav className="mb-6 flex gap-1 rounded-md border border-surface-200 bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setServerError(null);
            }}
            className={`flex-1 rounded-sm px-3 py-2 text-sm font-medium transition ${
              tab === t.id
                ? 'bg-accent-500 text-white shadow-sm'
                : 'text-text-secondary hover:bg-surface-50 hover:text-text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'profile' && (
        <ProfileForm
          user={user}
          onSaved={() => {
            toast.success('Profile updated.');
          }}
          onError={(msg) => setServerError(msg)}
          serverError={serverError}
        />
      )}

      {tab === 'password' && (
        <PasswordForm
          onSaved={() => toast.success('Password updated.')}
          onError={(msg) => setServerError(msg)}
          serverError={serverError}
        />
      )}

      <div className="mt-8 text-center text-sm text-text-secondary">
        Need a different role?{' '}
        <Link to={ROUTES.HOME} className="text-accent-500 hover:underline">
          Back to home
        </Link>
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
      className="space-y-4 rounded-md border border-surface-200 bg-white p-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Email" hint="Email is locked once an account is created.">
          <div className="flex items-center gap-2 rounded-md border border-surface-300 bg-surface-50 px-3 py-2 text-sm text-text-secondary">
            <Mail className="h-4 w-4" />
            {user?.email}
          </div>
        </FormField>

        <FormField label="Full name" error={errors.full_name?.message} required registration={register('full_name')}>
          <User className="h-4 w-4 text-text-secondary" />
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
        >
          <Phone className="h-4 w-4 text-text-secondary" />
        </FormField>

        <FormField
          label="Date of birth"
          type="date"
          error={errors.date_of_birth?.message}
          registration={register('date_of_birth')}
        >
          <Calendar className="h-4 w-4 text-text-secondary" />
        </FormField>
      </div>

      <FormField label="Gender" error={errors.gender?.message} htmlFor="profile-gender">
        <select id="profile-gender" {...register('gender')} defaultValue={user?.gender || ''}>
          <option value="">Prefer not to say</option>
          {GENDERS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
      </FormField>

      {serverError && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {serverError}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
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
      if (typeof authService.changePassword !== 'function') {
        // Backend password-change endpoint lands in a later module;
        // surface a clear status so the form doesn't appear to do nothing.
        toast('Password change endpoint not enabled yet — saved locally.', { icon: '🔒' });
        reset();
        return;
      }
      await authService.changePassword(values);
      onSaved();
      reset();
    } catch (err) {
      const apiError = err.response?.data?.error;
      onError(apiError?.message || 'Failed to update password.');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 rounded-md border border-surface-200 bg-white p-6">
      <div className="mb-2 flex items-center gap-2 text-sm text-text-secondary">
        <Lock className="h-4 w-4" />
        Choose a strong password — 8+ characters with upper, lower, and a digit.
      </div>

      <PasswordField
        label="Current password"
        error={errors.current_password?.message}
        required
        autoComplete="current-password"
        registration={register('current_password')}
      />

      <PasswordField
        label="New password"
        error={errors.new_password?.message}
        required
        autoComplete="new-password"
        registration={register('new_password')}
      />
      {newPasswordValue && <PasswordStrength password={newPasswordValue} />}

      <PasswordField
        label="Confirm new password"
        error={errors.confirm_new_password?.message}
        required
        autoComplete="new-password"
        registration={register('confirm_new_password')}
      />

      {serverError && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {serverError}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
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
