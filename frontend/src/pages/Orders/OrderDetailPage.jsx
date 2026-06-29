// OrderDetailPage — Module 4 single order detail.
//
// Per spec §4.x:
//   - Order number + date header
//   - Status stepper (visual timeline using Stepper.jsx)
//   - Items table: thumbnail, name, vendor, qty, unit price, item total, item status badge
//   - Shipping address card (from snapshot)
//   - Price summary card
//   - "Cancel Order" button (only if status PENDING or CONFIRMED) → confirm dialog
//   - "Request Return" button per item (only if status DELIVERED and within 7 days)
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, Truck } from 'lucide-react';
import toast from 'react-hot-toast';

import { useOrderStore } from '@context/useOrderStore';
import { usePageTitle } from '@hooks/usePageTitle';
import EmptyState from '@components/common/EmptyState';
import Skeleton from '@components/common/Skeleton';
import StatusBadge from '@components/common/StatusBadge';
import Stepper from '@components/common/Stepper';
import ReturnRequestModal from './ReturnRequestModal';
import { ORDER_STATUSES } from '@utils/constants';
import { formatDate, formatDateTime, formatPrice } from '@utils/formatters';
import { paths } from '@routes/routePaths';

// Canonical happy-path order timeline (Module 4 spec).
const TIMELINE = [
  { key: ORDER_STATUSES.PENDING, title: 'Pending', subtitle: 'Awaiting confirmation' },
  { key: ORDER_STATUSES.CONFIRMED, title: 'Confirmed', subtitle: 'Vendor accepted' },
  { key: ORDER_STATUSES.PROCESSING, title: 'Processing', subtitle: 'Picking & packing' },
  { key: ORDER_STATUSES.SHIPPED, title: 'Shipped', subtitle: 'On the way' },
  { key: ORDER_STATUSES.DELIVERED, title: 'Delivered', subtitle: 'Completed' },
];

// 7-day return window per spec §5.
const RETURN_WINDOW_DAYS = 7;

const OrderDetailPage = () => {
  usePageTitle('Order · PCCraft');
  const { orderNumber } = useParams();
  const navigate = useNavigate();

  const currentOrder = useOrderStore((s) => s.currentOrder);
  const fetchOrder = useOrderStore((s) => s.fetchOrder);
  const cancelOrder = useOrderStore((s) => s.cancelOrder);
  const ordersLoading = useOrderStore((s) => s.ordersLoading);
  const ordersError = useOrderStore((s) => s.ordersError);

  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [returnModalItem, setReturnModalItem] = useState(null);

  useEffect(() => {
    if (!orderNumber) return;
    fetchOrder(orderNumber).catch(() => {});
  }, [orderNumber, fetchOrder]);

  // Clear stale state when navigating to a different order.
  useEffect(() => () => setConfirmCancel(false), [orderNumber]);

  const order = currentOrder?.order_number === orderNumber ? currentOrder : null;
  const status = order?.status;
  const items = order?.items || [];
  const address = order?.shipping_address || {};
  const isCancellable = order?.can_cancel === true;
  const isCancelled = status === ORDER_STATUSES.CANCELLED;

  const currentStepIdx = useMemo(() => {
    if (!status) return 0;
    if (status === ORDER_STATUSES.CANCELLED) return -1;
    const idx = TIMELINE.findIndex((t) => t.key === status);
    return idx >= 0 ? idx + 1 : 0;
  }, [status]);

  const isReturnable = (item) => {
    if (item?.item_status !== ORDER_STATUSES.DELIVERED) return false;
    const deliveredAt = item?.delivered_at || order?.delivered_at;
    if (!deliveredAt) return false;
    const deliveredDate = new Date(deliveredAt);
    if (Number.isNaN(deliveredDate.getTime())) return false;
    const ageMs = Date.now() - deliveredDate.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    return ageDays <= RETURN_WINDOW_DAYS;
  };

  const onCancel = async () => {
    setCancelling(true);
    try {
      await cancelOrder(orderNumber);
      toast.success('Order cancelled.');
      setConfirmCancel(false);
    } catch (err) {
      // interceptor handles toast
    } finally {
      setCancelling(false);
    }
  };

  // ── render ─────────────────────────────────────────────────────
  if (ordersLoading && !order) {
    return (
      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Skeleton className="mb-6 h-6 w-32" />
        <Skeleton className="mb-4 h-8 w-64" />
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" rounded="rounded-xl" />
          <Skeleton className="h-48 w-full" rounded="rounded-xl" />
        </div>
      </section>
    );
  }

  if (!order) {
    return (
      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => navigate(paths.orders())}
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to orders
        </button>
        <EmptyState
          title="Order not found"
          description={
            ordersError
              ? `We couldn't load order ${orderNumber}.`
              : `Order ${orderNumber} does not exist or does not belong to you.`
          }
          actionLabel="View all orders"
          onAction={() => navigate(paths.orders())}
        />
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={() => navigate(paths.orders())}
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to orders
      </button>

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-text-primary sm:text-3xl">
            Order <span className="font-mono">{order.order_number}</span>
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Placed on {formatDateTime(order.created_at)}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* Timeline */}
      {!isCancelled ? (
        <div className="mt-8 rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-secondary">
            Status timeline
          </h2>
          <Stepper steps={TIMELINE} currentStep={currentStepIdx} />
          {order.tracking_number && (
            <p className="mt-4 flex items-center gap-2 text-xs text-text-secondary">
              <Truck className="h-3.5 w-3.5" />
              Tracking number:{' '}
              <span className="font-mono font-semibold text-text-primary">
                {order.tracking_number}
              </span>
            </p>
          )}
        </div>
      ) : (
        <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          This order was cancelled
          {order.cancelled_at ? ` on ${formatDate(order.cancelled_at)}` : ''}.
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {/* Items */}
          <div className="rounded-xl border border-border bg-surface shadow-sm">
            <header className="border-b border-border px-5 py-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">
              Items ({items.length})
            </header>
            <ul className="divide-y divide-border">
              {items.map((it) => {
                const unitPrice = Number(it.unit_price ?? 0);
                const qty = Number(it.quantity ?? 0);
                const lineTotal = Number(it.line_total ?? unitPrice * qty);
                return (
                  <li key={it.id} className="flex items-start gap-4 px-5 py-4">
                    <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md border border-border bg-surface-50">
                      {it.primary_image_url ? (
                        <img
                          src={it.primary_image_url}
                          alt={it.product_name_snapshot}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-text-primary">
                        {it.product_name_snapshot || 'Product'}
                      </p>
                      <p className="mt-0.5 text-xs text-text-secondary">
                        Vendor: {it.vendor_name || 'PCCraft'}
                      </p>
                      <p className="mt-0.5 text-xs text-text-secondary">
                        {formatPrice(unitPrice)} × {qty}
                      </p>
                      <div className="mt-2">
                        <StatusBadge status={it.item_status} size="sm" />
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-text-primary">
                        {formatPrice(lineTotal)}
                      </p>
                      {isReturnable(it) ? (
                        <button
                          type="button"
                          onClick={() => setReturnModalItem(it)}
                          className="mt-2 inline-block text-[11px] font-medium text-accent-600 hover:underline"
                        >
                          Request return
                        </button>
                      ) : it.item_status === ORDER_STATUSES.DELIVERED ? (
                        <p className="mt-2 text-[11px] text-text-secondary">
                          Return window closed
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Shipping address (snapshot) */}
          {address && (address.full_name || address.street_address) && (
            <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
                Shipping address
              </h3>
              <p className="mt-2 text-sm font-medium text-text-primary">
                {address.full_name}
              </p>
              <p className="text-sm text-text-secondary">{address.phone}</p>
              <p className="mt-1 text-sm text-text-secondary">
                {address.street_address}
                {address.address_line2 ? `, ${address.address_line2}` : ''}
                <br />
                {address.city}
                {address.district ? `, ${address.district}` : ''}{' '}
                {address.postal_code}
              </p>
            </div>
          )}

          {/* Cancel button */}
          {isCancellable && (
            <div className="flex justify-end">
              {!confirmCancel ? (
                <button
                  type="button"
                  onClick={() => setConfirmCancel(true)}
                  className="inline-flex items-center gap-2 rounded-md border border-danger bg-surface px-4 py-2 text-sm font-semibold text-danger hover:bg-red-50"
                >
                  <Ban className="h-4 w-4" />
                  Cancel order
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-danger bg-red-50 px-3 py-2 text-sm text-red-700">
                  <span>Cancel this order? Stock will be restored.</span>
                  <button
                    type="button"
                    onClick={onCancel}
                    disabled={cancelling}
                    className="rounded-md bg-danger px-3 py-1 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-60"
                  >
                    {cancelling ? 'Cancelling…' : 'Yes, cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmCancel(false)}
                    disabled={cancelling}
                    className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-text-primary"
                  >
                    Keep order
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Price summary */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <h3 className="font-heading text-base font-semibold text-text-primary">
              Price summary
            </h3>
            <dl className="mt-3 space-y-2 text-sm">
              <SummaryRow label="Subtotal" value={formatPrice(order.subtotal)} />
              <SummaryRow label="Shipping" value={formatPrice(order.shipping_fee)} />
              <SummaryRow label="VAT" value={formatPrice(order.tax)} />
              {Number(order.discount) > 0 && (
                <SummaryRow
                  label="Discount"
                  value={`-${formatPrice(order.discount)}`}
                  valueClass="text-emerald-600"
                />
              )}
              <div className="mt-2 flex justify-between border-t border-border pt-3 text-base">
                <dt className="font-semibold text-text-primary">Total</dt>
                <dd className="font-bold text-text-primary">
                  {formatPrice(order.total)}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-[11px] text-text-secondary">
              Payment: <span className="font-medium">{order.payment_method || 'COD'}</span>
            </p>
            {order.notes && (
              <p className="mt-2 text-[11px] text-text-secondary">
                Notes: <span className="font-medium">{order.notes}</span>
              </p>
            )}
          </div>
        </aside>
      </div>

      {/* Return request modal — opened by "Request return" on a delivered item */}
      <ReturnRequestModal
        open={!!returnModalItem}
        item={returnModalItem}
        onClose={() => setReturnModalItem(null)}
        onCreated={(returnId) => {
          setReturnModalItem(null);
          if (returnId) navigate(paths.returnDetail(returnId));
        }}
      />
    </section>
  );
};

const SummaryRow = ({ label, value, valueClass = '' }) => (
  <div className="flex justify-between text-text-secondary">
    <dt>{label}</dt>
    <dd className={`font-medium ${valueClass || 'text-text-primary'}`}>{value}</dd>
  </div>
);

export default OrderDetailPage;