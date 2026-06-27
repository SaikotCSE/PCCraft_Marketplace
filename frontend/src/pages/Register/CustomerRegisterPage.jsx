// CustomerRegisterPage — single-page signup for buyers.
//
// Submits to `authService.registerCustomer`, which POSTs to
// `/api/v1/auth/register/customer/`. On success the backend returns a
// full JWT pair + user record (auto-login). We then redirect the user
// to either their `from` location or the customer home.
//
// Validation is wired through RHF + zodResolver + customerRegisterSchema.
// `password` and `confirm_password` share a Zod refine that asserts they
// match; the same schema exposes `evaluatePassword()` for the live
// strength bar.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'react-hot-toast';
import { User, Mail, Phone, Calendar, Lock, UserPlus } from 'lucide-react';

import useAuthStore from '@context/useAuthStore';
import { customerRegisterSchema } from '@utils/validators';
import { ROUTES } from '@routes/routePaths';
import FormField, { PasswordField } from '@components/auth/FormField';
import PasswordStrength from '@components/auth/PasswordStrength';

const GENDERS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
];

export default function CustomerRegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const registerAction = useAuthStore((s) => s.register);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.role);

  const [serverError, setServerError] = useState(null);

  const {
    register,
    handleSubmit,
    control,
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

  useEffect(() => {
    if (isAuthenticated && role === 'customer') {
      const target = location.state?.from || ROUTES.HOME;
      navigate(target, { replace: true });
    }
  }, [isAuthenticated, role, location.state, navigate]);

  const onSubmit = async (values) => {
    setServerError(null);
    try {
      const user = await registerAction('customer', values);
      toast.success('Account created — welcome to PCCraft!');
      const target = location.state?.from || ROUTES.HOME;
      navigate(target, { replace: true });
      return user;
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-50 px-4 py-12">
      <div className="w-full max-w-2xl rounded-md border border-surface-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <Link to={ROUTES.HOME} className="text-sm text-text-secondary hover:text-accent-500">
            ← Back to home
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-text-primary">Create a customer account</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Track orders, save builds, and curate a wishlist.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <FormField
            label="Full name"
            error={errors.full_name?.message}
            required
            registration={register('full_name')}
          >
            <User className="h-4 w-4 text-text-secondary" />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Email"
              type="email"
              error={errors.email?.message}
              required
              registration={register('email')}
              autoComplete="email"
            >
              <Mail className="h-4 w-4 text-text-secondary" />
            </FormField>

            <FormField
              label="Phone"
              type="tel"
              error={errors.phone?.message}
              required
              registration={register('phone')}
              hint="Bangladesh number, e.g. +8801712345678"
              autoComplete="tel"
            >
              <Phone className="h-4 w-4 text-text-secondary" />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Date of birth"
              type="date"
              error={errors.date_of_birth?.message}
              required
              registration={register('date_of_birth')}
            >
              <Calendar className="h-4 w-4 text-text-secondary" />
            </FormField>

            <FormField label="Gender" error={errors.gender?.message} required htmlFor="customer-gender">
              <select id="customer-gender" {...register('gender')} defaultValue="">
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
          />
          {passwordValue && <PasswordStrength password={passwordValue} />}

          <PasswordField
            label="Confirm password"
            error={errors.confirm_password?.message}
            required
            autoComplete="new-password"
            registration={register('confirm_password')}
          />

          <label className="flex items-start gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              {...register('accept_terms')}
              className="mt-0.5 rounded border-surface-300 text-accent-500 focus:ring-accent-500"
            />
            <span>
              I agree to PCCraft&apos;s{' '}
              <Link to={ROUTES.LEGAL.TERMS} className="text-accent-500 hover:underline">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link to={ROUTES.LEGAL.PRIVACY} className="text-accent-500 hover:underline">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          {errors.accept_terms && <p className="text-xs text-danger">{errors.accept_terms.message}</p>}

          {serverError && (
            <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {serverError}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <UserPlus className="h-4 w-4" />
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </button>

          <p className="text-center text-sm text-text-secondary">
            Selling on PCCraft?{' '}
            <Link to={ROUTES.AUTH.REGISTER_VENDOR} className="text-accent-500 hover:underline">
              Apply as a vendor
            </Link>
          </p>

          <p className="text-center text-sm text-text-secondary">
            Already have an account?{' '}
            <Link to={ROUTES.AUTH.LOGIN} className="text-accent-500 hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}