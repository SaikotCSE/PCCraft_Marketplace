// ReturnStatusPage — Module 5 single return request detail.
//
// Renders:
//   - Header: return number, status badge, order link
//   - Customer info + reason + description
//   - Evidence image gallery
//   - Lifecycle Stepper (7 statuses per spec §5)
//   - Ship-back form when status === APPROVED and customer owns it
//
// All actions go through returnService; the page re-fetches after each mutation.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, PackageCheck, Truck } from 'lucide-react';
import toast from 'react-hot-toast';

import { returnService } from '@services/returnService';
import { usePageTitle } from '@hooks/usePageTitle';
import EmptyState from '@components/common/EmptyState';
import Skeleton from '@components/common/Skeleton';
import StatusBadge from '@components/common/StatusBadge';
import Stepper from '@components/common/Stepper';
import { RETURN_STATUSES } from '@utils/constants';
import { formatDate, formatDateTime, formatPrice } from '@utils/formatters';
import { paths } from '@routes/routePaths';

// Canonical happy-path return lifecycle (spec §5).
const TIMELINE = [
  { key: RETURN_STATUSES.PENDING, title: 'Submitted', subtitle: 'Awaiting vendor review' },
  { key: RETURN_STATUSES.APPROVED, title: 'Approved', subtitle: 'Send the item back' },
  { key: RETURN_STATUSES.SHIPPED_BACK, title: 'In transit', subtitle: 'On its way to vendor' },
  { key: RETURN_STATUSES.RECEIVED, title: 'Received', subtitle: 'Vendor has the item' },
  { key: RETURN_STATUSES.REFUND_INITIATED, title: 'Refund initiated', subtitle: 'Admin processing' },
  { key: RETURN_STATUSES.REFUNDED, title: 'Refunded', subtitle: 'Money returned' },
];

const REASON_LABELS = {
  DAMAGED: 'Damaged in transit',
  NOT_AS_DESCRIBED: 'Not as described',
  WRONG_ITEM: 'Wrong item received',
  DEFECTIVE: 'Defective / not working',
  MISSING_PARTS: 'Missing parts or accessories',
};

// Map server status -> stepper index (1-based for Stepper).
const stepIndexFor = (status) => {
  if (status === RETURN_STATUSES.REJECTED) return -1;
  const idx = TIMELINE.findIndex((s) => s.key === status);
  return idx >= 0 ? idx + 1 : 0;
};

const ReturnStatusPage = () => {
  usePageTitle('Return · PCCraft');
  const { returnId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tracking, setTracking] = useState('');
  const [submittingShip, setSubmittingShip] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await returnService.getReturn(returnId);
      setData(result?.data || result);
      setTracking(result?.data?.tracking_number_return || result?.tracking_number_return || '');
    } catch (err) {
      setError(err?.message || 'Failed to load return');
    } finally {
      setLoading(false);
    }
  }, [returnId]);

  useEffect(() => {
    if (returnId) load();
  }, [returnId, load]);

  const onSubmitShipBack = async (e) => {
    e.preventDefault();
    const trimmed = tracking.trim();
    if (trimmed.length < 3) {
      toast.error('Please enter a valid tracking number.');
      return;
    }
    setSubmittingShip(true);
    try {
      await returnService.shipBackReturn(returnId, { tracking_number_return: trimmed });
      toast.success('Tracking submitted.');
      await load();
    } catch (err) {
      // interceptor handles toast
    } finally {
      setSubmittingShip(false);
    }
  };

  const stepIdx = useMemo(() => stepIndexFor(data?.status), [data?.status]);
  const isRejected = data?.status === RETURN_STATUSES.REJECTED;
  const isApproved = data?.status === RETURN_STATUSES.APPROVED;

  // ── render ─────────────────────────────────────────────────────
  if (loading && !data) {
    return (
      <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Skeleton className="mb-6 h-6 w-32" />
        <Skeleton className="mb-4 h-8 w-64" />
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" rounded="rounded-xl" />
          <Skeleton className="h-48 w-full" rounded="rounded-xl" />
        </div>
      </section>
    );
  }

  if (error && !data) {
    return (
      <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => navigate(paths.returns())}
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to returns
        </button>
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <EmptyState
          title="Return not found"
          description={`Return ${returnId} does not exist or does not belong to you.`}
          actionLabel="View all returns"
          onAction={() => navigate(paths.returns())}
        />
      </section>
    );
  }

  const evidence = data.evidence || data.evidence_items || [];
  const orderNumber =
    data.order_number || data.order_item?.order?.order_number || data.order?.order_number;

  return (
    <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={() => navigate(paths.returns())}
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to returns
      </button>

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-text-primary sm:text-3xl">
            Return{' '}
            <span className="font-mono">
              {data.return_number || data.id}
            </span>
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Submitted {formatDateTime(data.created_at)}
          </p>
        </div>
        <StatusBadge status={data.status} />
      </div>

      {/* Timeline */}
      <div className="mt-8 rounded-xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Status timeline
        </h2>
        {isRejected ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="font-semibold">This return was rejected.</p>
            {data.rejection_reason && (
              <p className="mt-1">Reason: {data.rejection_reason}</p>
            )}
          </div>
        ) : (
          <Stepper steps={TIMELINE} currentStep={stepIdx} />
        )}

        {/* Tracking chip */}
        {data.tracking_number_return && (
          <p className="mt-4 flex items-center gap-2 text-xs text-text-secondary">
            <Truck className="h-3.5 w-3.5" />
            Return tracking:{' '}
            <span className="font-mono font-semibold text-text-primary">
              {data.tracking_number_return}
            </span>
          </p>
        )}
        {data.refunded_at && (
          <p className="mt-2 flex items-center gap-2 text-xs text-text-secondary">
            <PackageCheck className="h-3.5 w-3.5" />
            Refunded on {formatDate(data.refunded_at)}
          </p>
        )}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {/* Item + reason */}
          <div className="rounded-xl border border-border bg-surface shadow-sm">
            <header className="border-b border-border px-5 py-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">
              Return details
            </header>
            <dl className="divide-y divide-border text-sm">
              <Row label="Item" value={data.product_name_snapshot || data.order_item?.product_name_snapshot || '—'} />
              <Row label="Order" value={orderNumber || '—'} />
              <Row label="Reason" value={REASON_LABELS[data.reason] || data.reason || '—'} />
              <Row
                label="Vendor"
                value={data.vendor_name || data.order_item?.vendor_name || '—'}
              />
              <Row label="Item price" value={formatPrice(data.order_item?.unit_price || 0)} />
            </dl>
            <div className="border-t border-border px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Description
              </p>
              <p className="mt-1 whitespace-pre-line text-sm text-text-primary">
                {data.description || '—'}
              </p>
            </div>
            {data.vendor_notes && (
              <div className="border-t border-border px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Vendor notes
                </p>
                <p className="mt-1 whitespace-pre-line text-sm text-text-primary">
                  {data.vendor_notes}
                </p>
              </div>
            )}
            {data.admin_notes && (
              <div className="border-t border-border px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Admin notes
                </p>
                <p className="mt-1 whitespace-pre-line text-sm text-text-primary">
                  {data.admin_notes}
                </p>
              </div>
            )}
          </div>

          {/* Evidence */}
          <div className="rounded-xl border border-border bg-surface shadow-sm">
            <header className="border-b border-border px-5 py-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">
              Evidence ({evidence.length})
            </header>
            {evidence.length === 0 ? (
              <p className="px-5 py-6 text-sm text-text-secondary">
                No images uploaded.
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 lg:grid-cols-4">
                {evidence.map((e) => (
                  <li
                    key={e.id || e.image}
                    className="overflow-hidden rounded-md border border-border bg-surface-50"
                  >
                    <a
                      href={e.image || e.image_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <img
                        src={e.image || e.image_url}
                        alt={e.caption || 'Evidence'}
                        className="h-32 w-full object-cover"
                      />
                    </a>
                    {e.caption && (
                      <p className="px-2 py-1 text-[11px] text-text-secondary">
                        {e.caption}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Ship-back form */}
          {isApproved && (
            <form
              onSubmit={onSubmitShipBack}
              className="rounded-xl border border-border bg-surface p-5 shadow-sm"
            >
              <h3 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
                Send the item back
              </h3>
              <p className="mt-1 text-xs text-text-secondary">
                Your return was approved. Enter the tracking number once you ship the item.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value)}
                  placeholder="Return tracking number"
                  className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                />
                <button
                  type="submit"
                  disabled={submittingShip || tracking.trim().length < 3}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-accent-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submittingShip && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Submit tracking
                </button>
              </div>
            </form>
          )}
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <h3 className="font-heading text-base font-semibold text-text-primary">
              Quick actions
            </h3>
            <div className="mt-3 space-y-2 text-sm">
              {orderNumber && (
                <Link
                  to={paths.orderDetail(orderNumber)}
                  className="block rounded-md border border-border bg-surface px-3 py-2 text-center text-xs font-medium text-text-primary hover:border-accent-500"
                >
                  View order
                </Link>
              )}
              <Link
                to={paths.returns()}
                className="block rounded-md border border-border bg-surface px-3 py-2 text-center text-xs font-medium text-text-primary hover:border-accent-500"
              >
                All returns
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
};

const Row = ({ label, value }) => (
  <div className="flex items-start justify-between gap-3 px-5 py-3">
    <dt className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
      {label}
    </dt>
    <dd className="text-right text-sm text-text-primary">{value}</dd>
  </div>
);

export default ReturnStatusPage;