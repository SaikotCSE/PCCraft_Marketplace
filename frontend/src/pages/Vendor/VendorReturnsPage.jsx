// VendorReturnsPage — Module 5 vendor moderation queue.
//
// Per spec §5 vendors:
//   - See every return request against their products
//   - Approve or reject PENDING returns (with a rejection reason if rejecting)
//   - Mark SHIPPED_BACK returns as RECEIVED once they have the item
//
// All actions go through returnService.{listVendorReturns,reviewReturn,markReceived}.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, ChevronRight, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';

import { returnService } from '@services/returnService';
import { usePageTitle } from '@hooks/usePageTitle';
import EmptyState from '@components/common/EmptyState';
import Skeleton from '@components/common/Skeleton';
import StatusBadge from '@components/common/StatusBadge';
import { RETURN_STATUSES } from '@utils/constants';
import { formatDate, formatDateTime } from '@utils/formatters';
import { paths } from '@routes/routePaths';

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: RETURN_STATUSES.PENDING, label: 'Pending' },
  { value: RETURN_STATUSES.APPROVED, label: 'Approved' },
  { value: RETURN_STATUSES.SHIPPED_BACK, label: 'Shipped back' },
  { value: RETURN_STATUSES.RECEIVED, label: 'Received' },
  { value: RETURN_STATUSES.REFUND_INITIATED, label: 'Refund initiated' },
  { value: RETURN_STATUSES.REFUNDED, label: 'Refunded' },
  { value: RETURN_STATUSES.REJECTED, label: 'Rejected' },
];

const REASON_LABELS = {
  DAMAGED: 'Damaged in transit',
  NOT_AS_DESCRIBED: 'Not as described',
  WRONG_ITEM: 'Wrong item received',
  DEFECTIVE: 'Defective / not working',
  MISSING_PARTS: 'Missing parts or accessories',
};

const VendorReturnsPage = () => {
  usePageTitle('Returns · Vendor · PCCraft');

  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // per-return review state (action + rejection_reason + vendor_notes)
  const [reviewState, setReviewState] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = statusFilter ? { status: statusFilter } : {};
      const result = await returnService.listVendorReturns(params);
      const list = result?.results || result?.data || result || [];
      setReturns(list);
    } catch (err) {
      setError(err?.message || 'Failed to load returns');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const setReviewFor = (id, patch) =>
    setReviewState((p) => ({ ...p, [id]: { action: 'APPROVED', notes: '', rejection: '', ...(p[id] || {}), ...patch } }));

  const onApprove = async (row) => {
    const r = reviewState[row.id] || {};
    setBusyId(row.id);
    try {
      await returnService.reviewReturn(row.id, {
        action: 'APPROVED',
        vendor_notes: r.notes || '',
      });
      toast.success('Return approved.');
      await load();
    } catch (err) {
      // interceptor handles toast
    } finally {
      setBusyId(null);
    }
  };

  const onReject = async (row) => {
    const r = reviewState[row.id] || {};
    if (!r.rejection || r.rejection.trim().length < 5) {
      toast.error('Rejection reason must be at least 5 characters.');
      return;
    }
    setBusyId(row.id);
    try {
      await returnService.reviewReturn(row.id, {
        action: 'REJECTED',
        rejection_reason: r.rejection.trim(),
        vendor_notes: r.notes || '',
      });
      toast.success('Return rejected.');
      await load();
    } catch (err) {
      // interceptor handles toast
    } finally {
      setBusyId(null);
    }
  };

  const onMarkReceived = async (row) => {
    setBusyId(row.id);
    try {
      await returnService.markReceived(row.id, {});
      toast.success('Marked as received.');
      await load();
    } catch (err) {
      // interceptor handles toast
    } finally {
      setBusyId(null);
    }
  };

  const counts = useMemo(() => {
    const c = { total: returns.length };
    for (const r of returns) {
      c[r.status] = (c[r.status] || 0) + 1;
    }
    return c;
  }, [returns]);

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-bold text-text-primary">
            Return requests
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Approve, reject, and process returns for your products.
          </p>
        </div>
      </div>

      {/* Status filter */}
      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => {
          const active = statusFilter === f.value;
          const count =
            f.value === '' ? counts.total : counts[f.value] || 0;
          return (
            <button
              key={f.value || 'ALL'}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className={
                'rounded-full border px-3 py-1 text-xs font-medium ' +
                (active
                  ? 'border-accent-500 bg-accent-50 text-accent-700'
                  : 'border-border bg-surface text-text-secondary hover:border-accent-500')
              }
            >
              {f.label}
              <span className="ml-1.5 text-text-secondary">{count}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" rounded="rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : returns.length === 0 ? (
        <EmptyState
          title="No return requests"
          description="When a customer requests a return for one of your products, it'll show up here."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-50 text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="w-8 px-3 py-3"></th>
                <th className="px-4 py-3">Return</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {returns.map((r) => {
                const expanded = expandedId === r.id;
                const rs = reviewState[r.id] || { action: 'APPROVED', notes: '', rejection: '' };
                const evidence = r.evidence || r.evidence_items || [];
                return (
                  <FragmentRow
                    key={r.id}
                    r={r}
                    expanded={expanded}
                    onToggle={() => setExpandedId(expanded ? null : r.id)}
                    reviewState={rs}
                    setReviewFor={(patch) => setReviewFor(r.id, patch)}
                    onApprove={() => onApprove(r)}
                    onReject={() => onReject(r)}
                    onMarkReceived={() => onMarkReceived(r)}
                    busy={busyId === r.id}
                    evidence={evidence}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

const FragmentRow = ({
  r,
  expanded,
  onToggle,
  reviewState: rs,
  setReviewFor,
  onApprove,
  onReject,
  onMarkReceived,
  busy,
  evidence,
}) => {
  const orderNumber = r.order_number || r.order_item?.order?.order_number || r.order?.order_number;
  const isPending = r.status === RETURN_STATUSES.PENDING;
  const isShipped = r.status === RETURN_STATUSES.SHIPPED_BACK;
  return (
    <>
      <tr className="hover:bg-surface-50">
        <td className="px-3 py-3 align-top">
          <button
            type="button"
            onClick={onToggle}
            className="rounded p-1 text-text-secondary hover:bg-surface-100 hover:text-text-primary"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </td>
        <td className="px-4 py-3 align-top font-mono text-xs font-semibold text-text-primary">
          {r.return_number || r.id}
        </td>
        <td className="px-4 py-3 align-top font-mono text-xs text-text-secondary">
          {orderNumber || '—'}
        </td>
        <td className="px-4 py-3 align-top text-text-secondary">
          {r.customer_name || r.customer?.full_name || '—'}
        </td>
        <td className="px-4 py-3 align-top text-text-primary">
          {r.product_name_snapshot ||
            r.order_item?.product_name_snapshot ||
            '—'}
        </td>
        <td className="px-4 py-3 align-top text-text-secondary">
          {REASON_LABELS[r.reason] || r.reason || '—'}
        </td>
        <td className="px-4 py-3 align-top">
          <StatusBadge status={r.status} size="sm" />
        </td>
        <td className="px-4 py-3 align-top text-right">
          {isPending ? (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onApprove}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-md bg-success px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Approve
              </button>
              <button
                type="button"
                onClick={onReject}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-md border border-danger bg-surface px-2.5 py-1 text-xs font-semibold text-danger hover:bg-red-50 disabled:opacity-50"
              >
                <X className="h-3 w-3" />
                Reject
              </button>
            </div>
          ) : isShipped ? (
            <button
              type="button"
              onClick={onMarkReceived}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md bg-accent-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-accent-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Mark received
            </button>
          ) : (
            <span className="text-xs text-text-secondary">—</span>
          )}
        </td>
      </tr>

      {expanded && (
        <tr className="bg-surface-50">
          <td colSpan={8} className="px-4 py-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Description
                </p>
                <p className="mt-1 whitespace-pre-line text-sm text-text-primary">
                  {r.description || '—'}
                </p>
                <p className="mt-3 text-xs text-text-secondary">
                  Submitted {formatDateTime(r.created_at)}
                </p>
                {r.tracking_number_return && (
                  <p className="mt-1 text-xs text-text-secondary">
                    Return tracking:{' '}
                    <span className="font-mono font-semibold text-text-primary">
                      {r.tracking_number_return}
                    </span>
                  </p>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Evidence ({evidence.length})
                </p>
                {evidence.length === 0 ? (
                  <p className="mt-1 text-xs text-text-secondary">
                    No images uploaded.
                  </p>
                ) : (
                  <ul className="mt-1 grid grid-cols-3 gap-2">
                    {evidence.map((e) => (
                      <li
                        key={e.id || e.image}
                        className="overflow-hidden rounded-md border border-border bg-surface"
                      >
                        <a
                          href={e.image || e.image_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <img
                            src={e.image || e.image_url}
                            alt={e.caption || 'Evidence'}
                            className="h-20 w-full object-cover"
                          />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {orderNumber && (
                  <Link
                    to={paths.orderDetail(orderNumber)}
                    className="mt-3 inline-block text-[11px] font-medium text-accent-600 hover:underline"
                  >
                    View order {orderNumber}
                  </Link>
                )}
              </div>

              {isPending && (
                <div className="lg:col-span-2 space-y-3 rounded-md border border-border bg-surface p-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      Rejection reason (required to reject)
                    </label>
                    <textarea
                      rows={2}
                      value={rs.rejection}
                      onChange={(e) => setReviewFor({ rejection: e.target.value })}
                      className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-primary focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      Vendor notes (optional, internal)
                    </label>
                    <textarea
                      rows={2}
                      value={rs.notes}
                      onChange={(e) => setReviewFor({ notes: e.target.value })}
                      className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-primary focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                    />
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

export default VendorReturnsPage;