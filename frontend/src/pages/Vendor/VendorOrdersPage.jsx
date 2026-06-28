// VendorOrdersPage — Module 4 vendor-side order management.
//
// Per spec §4.x:
//   - Table of order items for vendor's products
//   - Columns: order number, product thumbnail + name, customer, qty,
//              unit price, order date, current status (dropdown to update)
//   - Filter tabs: All / Processing / Shipped / Delivered
//   - Status dropdown: disabled for backward transitions (forward-only)
//
// The vendor sees order ITEMS not orders — one order can contain items
// from many vendors. We render one row per item for clarity and let the
// vendor update each item's status independently.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Truck } from 'lucide-react';
import toast from 'react-hot-toast';

import { useOrderStore } from '@context/useOrderStore';
import { usePageTitle } from '@hooks/usePageTitle';
import EmptyState from '@components/common/EmptyState';
import Skeleton from '@components/common/Skeleton';
import StatusBadge from '@components/common/StatusBadge';
import { ORDER_STATUSES } from '@utils/constants';
import { formatDate, formatPrice } from '@utils/formatters';
import { paths } from '@routes/routePaths';

// Allowed vendor transitions — order matters; index is the rank used to
// disable backward moves in the dropdown.
const VENDOR_STATUS_FLOW = [
  ORDER_STATUSES.CONFIRMED,
  ORDER_STATUSES.PROCESSING,
  ORDER_STATUSES.SHIPPED,
  ORDER_STATUSES.DELIVERED,
];

// Spec filter tabs: All / Processing / Shipped / Delivered.
const TABS = [
  { id: 'ALL', label: 'All' },
  { id: ORDER_STATUSES.PROCESSING, label: 'Processing' },
  { id: ORDER_STATUSES.SHIPPED, label: 'Shipped' },
  { id: ORDER_STATUSES.DELIVERED, label: 'Delivered' },
];

const VendorOrdersPage = () => {
  usePageTitle('Vendor orders · PCCraft');
  const navigate = useNavigate();

  const vendorOrders = useOrderStore((s) => s.vendorOrders);
  const fetchVendorOrders = useOrderStore((s) => s.fetchVendorOrders);
  const updateItemStatus = useOrderStore((s) => s.updateItemStatus);
  const isLoading = useOrderStore((s) => s.vendorLoading);

  const [status, setStatus] = useState('ALL');
  const [savingItemId, setSavingItemId] = useState(null);
  const [trackingForItemId, setTrackingForItemId] = useState(null);
  const [trackingDraft, setTrackingDraft] = useState('');

  useEffect(() => {
    fetchVendorOrders({
      item_status: status === 'ALL' ? undefined : status,
    }).catch(() => {});
  }, [status, fetchVendorOrders]);

  // Flatten to item rows so each row has full context (order number +
  // customer) regardless of which order it came from.
  const itemRows = useMemo(() => {
    const rows = [];
    for (const order of vendorOrders) {
      for (const item of order.items || []) {
        rows.push({
          item,
          order,
        });
      }
    }
    return rows;
  }, [vendorOrders]);

  const onChangeStatus = async (itemId, newStatus, trackingNumber = '') => {
    setSavingItemId(itemId);
    try {
      const payload = { status: newStatus };
      if (newStatus === ORDER_STATUSES.SHIPPED && trackingNumber) {
        payload.tracking_number = trackingNumber;
      }
      await updateItemStatus(itemId, payload);
      toast.success(`Item marked as ${newStatus}.`);
      if (newStatus === ORDER_STATUSES.SHIPPED) {
        setTrackingForItemId(null);
        setTrackingDraft('');
      }
    } catch (err) {
      // interceptor surfaces the error
    } finally {
      setSavingItemId(null);
    }
  };

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="font-heading text-3xl font-bold text-text-primary">
          Orders to fulfil
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          All order items for products in your store. Update item status as you pick, pack, and ship.
        </p>
      </div>

      {/* Filter tabs */}
      <div
        role="tablist"
        className="mb-6 flex flex-wrap gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1 shadow-sm"
      >
        {TABS.map((t) => {
          const isActive = status === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setStatus(t.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                isActive
                  ? 'bg-accent-500 text-white shadow-sm'
                  : 'text-text-secondary hover:bg-surface-100 hover:text-text-primary'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" rounded="rounded-lg" />
          ))}
        </div>
      ) : itemRows.length === 0 ? (
        <EmptyState
          title="No orders to show"
          description={
            status === 'ALL'
              ? 'When customers order your products, they will appear here.'
              : `You don't have any ${status.toLowerCase()} orders right now.`
          }
          actionLabel={status === 'ALL' ? null : 'Show all'}
          onAction={status === 'ALL' ? undefined : () => setStatus('ALL')}
          icon={Package}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-50 text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3 text-right">Qty × Price</th>
                <th className="px-4 py-3">Ordered</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {itemRows.map(({ item, order }) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  order={order}
                  saving={savingItemId === item.id}
                  trackingOpen={trackingForItemId === item.id}
                  trackingDraft={trackingDraft}
                  onTrackingDraftChange={setTrackingDraft}
                  onOpenTracking={() => {
                    setTrackingForItemId(item.id);
                    setTrackingDraft(item.tracking_number || order.tracking_number || '');
                  }}
                  onCancelTracking={() => {
                    setTrackingForItemId(null);
                    setTrackingDraft('');
                  }}
                  onChangeStatus={onChangeStatus}
                  onViewOrder={() => navigate(paths.orderDetail(order.order_number))}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

// ── one item row ─────────────────────────────────────────────────────
const ItemRow = ({
  item,
  order,
  saving,
  trackingOpen,
  trackingDraft,
  onTrackingDraftChange,
  onOpenTracking,
  onCancelTracking,
  onChangeStatus,
  onViewOrder,
}) => {
  const currentIdx = VENDOR_STATUS_FLOW.indexOf(item.item_status);

  // Disable any status that is at or below the current status (forward-only).
  const isOptionDisabled = (s) => {
    const idx = VENDOR_STATUS_FLOW.indexOf(s);
    return idx <= currentIdx;
  };

  return (
    <tr className="align-top">
      <td className="px-4 py-3 font-mono text-xs font-semibold text-text-primary">
        <button
          type="button"
          onClick={onViewOrder}
          className="hover:text-accent-600 hover:underline"
        >
          {order.order_number}
        </button>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-md border border-border bg-surface-50">
            {item.primary_image_url ? (
              <img
                src={item.primary_image_url}
                alt={item.product_name_snapshot}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full" />
            )}
          </div>
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm font-medium text-text-primary">
              {item.product_name_snapshot}
            </p>
            {item.product_slug && (
              <p className="mt-0.5 text-[11px] text-text-secondary">/{item.product_slug}</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-text-secondary">
        {(order.shipping_address?.full_name || 'Customer')}
      </td>
      <td className="px-4 py-3 text-right text-sm text-text-primary">
        {item.quantity} × {formatPrice(item.unit_price)}
        <div className="text-[11px] font-medium text-text-secondary">
          = {formatPrice(item.line_total)}
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-text-secondary">
        {formatDate(order.created_at)}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-2">
          <select
            value={item.item_status}
            disabled={saving}
            onChange={(e) => {
              const next = e.target.value;
              if (next === ORDER_STATUSES.SHIPPED) {
                onOpenTracking();
                return;
              }
              onChangeStatus(item.id, next);
            }}
            className="rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-text-primary shadow-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30 disabled:opacity-60"
          >
            {VENDOR_STATUS_FLOW.map((s) => (
              <option key={s} value={s} disabled={isOptionDisabled(s)}>
                {s}
                {isOptionDisabled(s) ? ' (locked)' : ''}
              </option>
            ))}
          </select>

          {trackingOpen && (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={trackingDraft}
                onChange={(e) => onTrackingDraftChange(e.target.value)}
                placeholder="Tracking #"
                className="w-32 rounded-md border border-border bg-surface px-2 py-1 text-xs shadow-sm focus:border-accent-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => onChangeStatus(item.id, ORDER_STATUSES.SHIPPED, trackingDraft)}
                disabled={saving || !trackingDraft.trim()}
                className="rounded-md bg-accent-500 px-2 py-1 text-xs font-semibold text-white hover:bg-accent-600 disabled:opacity-60"
              >
                Save
              </button>
              <button
                type="button"
                onClick={onCancelTracking}
                disabled={saving}
                className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-secondary"
              >
                ×
              </button>
            </div>
          )}

          {!trackingOpen && order.tracking_number && (
            <span className="inline-flex items-center gap-1 text-[11px] text-text-secondary">
              <Truck className="h-3 w-3" />
              {order.tracking_number}
            </span>
          )}

          <StatusBadge status={item.item_status} size="sm" />
        </div>
      </td>
    </tr>
  );
};

export default VendorOrdersPage;