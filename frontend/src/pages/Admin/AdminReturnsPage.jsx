// AdminReturnsPage — Module 5 admin refund workflow.
//
// Per spec §5 admins:
//   - See every return request across the platform
//   - Process refund for RECEIVED returns (records admin_notes + transaction_id)
//   - Confirm refund to mark the return REFUNDED (terminal state)
//
// All actions go through returnService.{listAdminReturns,processRefund,confirmRefund}.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
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

const AdminReturnsPage = () => {
  usePageTitle('Returns · Admin · PCCraft');

  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [actionState, setActionState] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = statusFilter ? { status: statusFilter } : {};
      const result = await returnService.listAdminReturns(params);
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

  const setStateFor = (id, patch) =>
    setActionState((p) => ({
      ...p,
      [id]: { txn: '', notes: '', ...(p[id] || {}), ...patch },
    }));

  const onProcessRefund = async (row) => {
    const s = actionState[row.id] || {};
    setBusyId(row.id);
    try {
      await returnService.processRefund(row.id, {
        transaction_id: (s.txn || '').trim() || undefined,
        admin_notes: s.notes || '',
      });
      toast.success('Refund initiated.');
      await load();
    } catch (err) {
      // interceptor handles toast
    } finally {
      setBusyId(null);
    }
  };

  const onConfirmRefund = async (row) => {
    setBusyId(row.id);
    try {
      await returnService.confirmRefund(row.id, {});
      toast.success('Refund confirmed.');
      await load();
    } catch (err) {
      // interceptor handles toast
    } finally {
      setBusyId(null);
    }
  };

  const counts = useMemo(() => {
    const c = { total: returns.length };
    for (const r of returns) c[r.status] = (c[r.status] || 0) + 1;
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
            Approve, reject, and process refunds platform-wide.
          </p>
        </div>
      </div>

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
          description="No return requests match the current filter."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-50 text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="w-8 px-3 py-3"></th>
                <th className="px-4 py-3">Return</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {returns.map((r) => {
                const expanded = expandedId === r.id;
                const s = actionState[r.id] || { txn: '', notes: '' };
                const evidence = r.evidence || r.evidence_items || [];
                const orderNumber =
                  r.order_number ||
                  r.order_item?.order?.order_number ||
                  r.order?.order_number;
                const isReceived = r.status === RETURN_STATUSES.RECEIVED;
                const isInitiated = r.status === RETURN_STATUSES.REFUND_INITIATED;
                return (
                  <FragmentRow
                    key={r.id}
                    r={r}
                    expanded={expanded}
                    onToggle={() => setExpandedId(expanded ? null : r.id)}
                    state={s}
                    setStateFor={(patch) => setStateFor(r.id, patch)}
                    onProcessRefund={() => onProcessRefund(r)}
                    onConfirmRefund={() => onConfirmRefund(r)}
                    busy={busyId === r.id}
                    evidence={evidence}
                    orderNumber={orderNumber}
                    isReceived={isReceived}
                    isInitiated={isInitiated}
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
  state,
  setStateFor,
  onProcessRefund,
  onConfirmRefund,
  busy,
  evidence,
  orderNumber,
  isReceived,
  isInitiated,
}) => (
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
        {r.vendor_name || r.order_item?.vendor_name || '—'}
      </td>
      <td className="px-4 py-3 align-top text-text-primary">
        {r.product_name_snapshot ||
          r.order_item?.product_name_snapshot ||
          '—'}
      </td>
      <td className="px-4 py-3 align-top">
        <StatusBadge status={r.status} size="sm" />
      </td>
      <td className="px-4 py-3 align-top text-right">
        {isReceived ? (
          <button
            type="button"
            onClick={onProcessRefund}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md bg-accent-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-accent-700 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            Process refund
          </button>
        ) : isInitiated ? (
          <button
            type="button"
            onClick={onConfirmRefund}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md bg-success px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            Confirm refund
          </button>
        ) : (
          <span className="text-xs text-text-secondary">—</span>
        )}
      </td>
    </tr>
    {expanded && (
      <tr className="bg-surface-50">
        <td colSpan={7} className="px-4 py-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Customer reason
              </p>
              <p className="mt-1 text-sm text-text-primary">
                {REASON_LABELS[r.reason] || r.reason || '—'}
              </p>
              <p className="mt-2 whitespace-pre-line text-sm text-text-primary">
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
              {r.received_at && (
                <p className="mt-1 text-xs text-text-secondary">
                  Received on {formatDate(r.received_at)}
                </p>
              )}
              {r.refunded_at && (
                <p className="mt-1 text-xs text-text-secondary">
                  Refunded on {formatDate(r.refunded_at)}
                </p>
              )}
              {r.transaction_id && (
                <p className="mt-1 text-xs text-text-secondary">
                  Transaction:{' '}
                  <span className="font-mono text-text-primary">
                    {r.transaction_id}
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

            {(isReceived || isInitiated) && (
              <div className="lg:col-span-2 space-y-3 rounded-md border border-border bg-surface p-3">
                {isReceived && (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      Transaction ID (optional)
                    </label>
                    <input
                      type="text"
                      value={state.txn}
                      onChange={(e) => setStateFor({ txn: e.target.value })}
                      placeholder="Bank / processor reference"
                      className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-primary focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    Admin notes (optional)
                  </label>
                  <textarea
                    rows={2}
                    value={state.notes}
                    onChange={(e) => setStateFor({ notes: e.target.value })}
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

export default AdminReturnsPage;