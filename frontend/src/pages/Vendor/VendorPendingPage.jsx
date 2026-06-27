// VendorPendingPage — shown right after vendor registration and any time a
// vendor (whose status is still PENDING) lands on a dashboard route. The
// page pulls the latest status from the store so the user sees the most
// up-to-date banner without needing to refresh.
import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, CheckCircle2, XCircle, AlertTriangle, RefreshCw } from 'lucide-react';

import useAuthStore from '@context/useAuthStore';
import { ROUTES } from '@routes/routePaths';
import { usePageTitle } from '@/hooks/usePageTitle';

const STATUS_META = {
  PENDING: {
    icon: Clock,
    color: 'text-warning',
    bg: 'border-warning/30 bg-warning/5',
    title: 'Your application is under review',
    body: 'Our team verifies trade licenses and NIDs within 2 business days. We will email you once a decision is made.',
  },
  APPROVED: {
    icon: CheckCircle2,
    color: 'text-success',
    bg: 'border-success/30 bg-success/5',
    title: "You're approved!",
    body: 'Your storefront is now active. Head to your dashboard to add products.',
  },
  REJECTED: {
    icon: XCircle,
    color: 'text-danger',
    bg: 'border-danger/30 bg-danger/5',
    title: 'Application rejected',
    body: 'See your vendor profile for the reason and how to re-submit corrected documents.',
  },
  INFO_REQUESTED: {
    icon: AlertTriangle,
    color: 'text-warning',
    bg: 'border-warning/30 bg-warning/5',
    title: 'More information needed',
    body: 'Please re-upload the requested documents on your vendor profile so we can finish verification.',
  },
};

export default function VendorPendingPage() {
  usePageTitle('Application pending · PCCraft');
  const location = useLocation();
  const application = location.state?.application;
  const user = useAuthStore((s) => s.user);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  // Pull the latest status from the server so the user always sees a fresh banner.
  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const status = user?.vendor_meta?.status || 'PENDING';
  const meta = STATUS_META[status] || STATUS_META.PENDING;
  const Icon = meta.icon;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.25 }}
        className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border ${meta.bg}`}
      >
        <Icon className={`h-8 w-8 ${meta.color}`} />
      </motion.div>

      <h1 className="text-2xl font-semibold text-text-primary">{meta.title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">{meta.body}</p>

      {status === 'REJECTED' && user?.vendor_meta?.rejection_reason && (
        <div className="mx-auto mt-4 max-w-md rounded-md border border-danger/30 bg-danger/5 p-3 text-left text-sm">
          <strong>Reason from our team:</strong> {user.vendor_meta.rejection_reason}
        </div>
      )}

      {application?.reference && (
        <p className="mx-auto mt-4 max-w-md text-xs text-text-secondary">
          Reference: <span className="font-mono">{application.reference}</span>
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          to={ROUTES.VENDOR.PROFILE}
          className="inline-flex items-center gap-2 rounded-md border border-surface-300 px-4 py-2 text-sm font-semibold text-text-primary hover:bg-surface-100"
        >
          <RefreshCw className="h-4 w-4" />
          Vendor profile
        </Link>
        <Link
          to={ROUTES.HOME}
          className="inline-flex items-center gap-2 rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
