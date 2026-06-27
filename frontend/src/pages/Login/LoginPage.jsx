// LoginPage — two-phase login: role selection (phase 1) → credentials (phase 2).
//
// On phase 1 the user picks "Customer", "Vendor", or "Admin". Phase 2
// shows an email + password form. On success the user is redirected to
// a role-appropriate landing page (customer → /, vendor → /vendor/dashboard,
// admin → /admin/dashboard) via the `redirectByRole` helper below.
//
// Backend contract (LoginView): invalid credentials come back as HTTP 401
// with `code: "authentication_failed"` in the envelope error. Wrong-role
// logins come back as HTTP 403 with `code: "role_mismatch"`. The form
// treats both as inline form errors.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { Mail, Lock, ArrowLeft, LogIn } from 'lucide-react';

import useAuthStore from '@context/useAuthStore';
import { loginSchema } from '@utils/validators';
import { ROUTES } from '@routes/routePaths';
import FormField, { PasswordField } from '@components/auth/FormField';
import RoleCard from '@components/auth/RoleCard';
import { cn } from '@utils/cn';

const ROLE_OPTIONS = [
  {
    value: 'customer',
    title: 'Customer',
    description: 'Shop PC parts, build wishlists, and track orders.',
    icon: 'user',
    tone: 'accent',
  },
  {
    value: 'vendor',
    title: 'Vendor',
    description: 'Manage your storefront, products, and fulfillment.',
    icon: 'store',
    tone: 'info',
  },
  {
    value: 'admin',
    title: 'Admin',
    description: 'Approve vendors, moderate catalog, and review reports.',
    icon: 'shield',
    tone: 'warning',
  },
];

const ROLE_HOME = {
  customer: ROUTES.HOME,
  vendor: ROUTES.VENDOR.DASHBOARD,
  admin: ROUTES.ADMIN.DASHBOARD,
};

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((s) => s.login);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.role);

  const [phase, setPhase] = useState('select');
  const [selectedRole, setSelectedRole] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
    reset,
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  // If an already-logged-in user lands here, bounce to their home.
  useEffect(() => {
    if (isAuthenticated && role) {
      const target = location.state?.from || ROLE_HOME[role] || ROUTES.HOME;
      navigate(target, { replace: true });
    }
  }, [isAuthenticated, role, location.state, navigate]);

  const handleRoleSelect = (value) => {
    setSelectedRole(value);
    setPhase('credentials');
    reset();
  };

  const handleBack = () => {
    setPhase('select');
    setSelectedRole(null);
    reset();
  };

  const onSubmit = async (values) => {
    try {
      const user = await login({ ...values, role: selectedRole });
      toast.success(`Welcome back, ${user?.full_name || 'friend'}!`);
      const target = location.state?.from || ROLE_HOME[user.role] || ROUTES.HOME;
      navigate(target, { replace: true });
    } catch (err) {
      // axiosInstance unwraps `r.data.data` so err.response.data is the
      // envelope error: { success: false, error: { code, message } }.
      const apiError = err.response?.data?.error;
      const code = apiError?.code;
      const message = apiError?.message || 'Login failed. Please try again.';

      if (code === 'role_mismatch') {
        // Backend says the role we selected doesn't match this account.
        setError('root', { message });
        toast.error(message);
      } else if (code === 'authentication_failed') {
        setError('password', { type: 'server', message: 'Email or password is incorrect.' });
      } else if (code === 'account_inactive') {
        setError('root', { message });
        toast.error(message);
      } else {
        setError('root', { message: 'Unexpected error. Please try again.' });
      }
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-50 px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-2xl rounded-md border border-surface-200 bg-white p-8 shadow-sm"
      >
        <div className="mb-6 text-center">
          <Link to={ROUTES.HOME} className="text-sm text-text-secondary hover:text-accent-500">
            ← Back to home
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-text-primary">Sign in to PCCraft</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {phase === 'select'
              ? 'Choose how you want to sign in.'
              : 'Enter your email and password to continue.'}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {phase === 'select' ? (
            <motion.div
              key="select"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
              className="grid gap-4 sm:grid-cols-3"
            >
              {ROLE_OPTIONS.map((opt) => (
                <RoleCard
                  key={opt.value}
                  icon={opt.icon}
                  title={opt.title}
                  description={opt.description}
                  tone={opt.tone}
                  onSelect={() => handleRoleSelect(opt.value)}
                />
              ))}
            </motion.div>
          ) : (
            <motion.form
              key="credentials"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleSubmit(onSubmit)}
              noValidate
              className="space-y-4"
            >
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-accent-500"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Change role
              </button>

              <div className="rounded-md border border-surface-200 bg-surface-50 px-3 py-2 text-xs uppercase tracking-wide text-text-secondary">
                Signing in as <span className="font-semibold text-text-primary">{selectedRole}</span>
              </div>

              <FormField
                label="Email address"
                error={errors.email?.message}
                required
                registration={register('email')}
              >
                <Mail className="h-4 w-4 text-text-secondary" />
              </FormField>

              <PasswordField
                label="Password"
                error={errors.password?.message}
                required
                autoComplete="current-password"
                registration={register('password')}
              />

              <div className="flex items-center justify-between text-sm">
                <label className="inline-flex items-center gap-2 text-text-secondary">
                  <input
                    type="checkbox"
                    className="rounded border-surface-300 text-accent-500 focus:ring-accent-500"
                  />
                  Remember me
                </label>
                <Link
                  to={ROUTES.AUTH.FORGOT_PASSWORD}
                  className="text-accent-500 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>

              {errors.root?.message && (
                <div
                  role="alert"
                  className={cn(
                    'rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger'
                  )}
                >
                  {errors.root.message}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LogIn className="h-4 w-4" />
                {isSubmitting ? 'Signing in…' : 'Sign in'}
              </button>

              <p className="text-center text-sm text-text-secondary">
                Don&apos;t have an account?{' '}
                <Link to={ROUTES.AUTH.REGISTER_CUSTOMER} className="text-accent-500 hover:underline">
                  Create one
                </Link>
              </p>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}