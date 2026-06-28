// OrdersPage — Module 4 customer order history.
//
// Per spec §4.x:
//   - Table/list of orders: order number, date, total, status badge, item count
//   - Sort by: newest first (default), oldest
//   - Filter by status (tab bar)
//   - Click row → OrderDetailPage
//
// Backend defaults to `-created_at`; we still pass `ordering` explicitly so
// the UI toggle is observable.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, Package } from 'lucide-react';

import { useOrderStore } from '@context/useOrderStore';
import { usePageTitle } from '@hooks/usePageTitle';
import EmptyState from '@components/common/EmptyState';
import Skeleton from '@components/common/Skeleton';
import StatusBadge from '@components/common/StatusBadge';
import { formatDate, formatPrice } from '@utils/formatters';
import { paths } from '@routes/routePaths';

// Tab definitions — "ALL" shows every status, the rest are the canonical
// OrderStatus enum values from the backend (uppercase strings).
const TABS = [
  { id: 'ALL', label: 'All' },
  { id: 'PENDING', label: 'Pending' },
  { id: 'CONFIRMED', label: 'Confirmed' },
  { id: 'PROCESSING', label: 'Processing' },
  { id: 'SHIPPED', label: 'Shipped' },
  { id: 'DELIVERED', label: 'Delivered' },
  { id: 'CANCELLED', label: 'Cancelled' },
];

const OrdersPage = () => {
  usePageTitle('My orders · PCCraft');
  const navigate = useNavigate();

  const orders = useOrderStore((s) => s.orders);
  const meta = useOrderStore((s) => s.ordersMeta);
  const fetchOrders = useOrderStore((s) => s.fetchOrders);
  const isLoading = useOrderStore((s) => s.ordersLoading);

  const [status, setStatus] = useState('ALL');
  const [sortNewest, setSortNewest] = useState(true);

  useEffect(() => {
    fetchOrders({
      status: status === 'ALL' ? undefined : status,
      ordering: sortNewest ? '-created_at' : 'created_at',
    }).catch(() => {});
  }, [status, sortNewest, fetchOrders]);

  const tabsWithCounts = useMemo(() => {
    const counts = { ALL: orders.length };
    for (const o of orders) counts[o.status] = (counts[o.status] || 0) + 1;
    return TABS.map((t) => ({ ...t, count: counts[t.id] || 0 }));
  }, [orders]);

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-bold text-text-primary">
            My orders
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Track and review all your past and active orders.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSortNewest((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary hover:border-accent-500"
        >
          {sortNewest ? (
            <>
              <ArrowDown className="h-3.5 w-3.5" /> Newest first
            </>
          ) : (
            <>
              <ArrowUp className="h-3.5 w-3.5" /> Oldest first
            </>
          )}
        </button>
      </div>

      {/* Tab bar */}
      <div
        role="tablist"
        className="mb-6 flex flex-wrap gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1 shadow-sm"
      >
        {tabsWithCounts.map((t) => {
          const isActive = status === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setStatus(t.id)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                isActive
                  ? 'bg-accent-500 text-white shadow-sm'
                  : 'text-text-secondary hover:bg-surface-100 hover:text-text-primary'
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  isActive ? 'bg-white/20' : 'bg-surface-200 text-text-secondary'
                }`}
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" rounded="rounded-lg" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          title="No orders yet"
          description={
            status === 'ALL'
              ? "Once you place an order it'll show up here."
              : `You don't have any ${status.toLowerCase()} orders.`
          }
          actionLabel={status === 'ALL' ? 'Browse products' : 'Show all'}
          onAction={() =>
            status === 'ALL'
              ? navigate(paths.products())
              : setStatus('ALL')
          }
          icon={Package}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-50 text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.map((o) => (
                <tr
                  key={o.order_number}
                  onClick={() => navigate(paths.orderDetail(o.order_number))}
                  className="cursor-pointer transition hover:bg-surface-50"
                >
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-text-primary">
                    {o.order_number}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {formatDate(o.created_at)}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {o.item_count ?? o.items?.length ?? 0}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-text-primary">
                    {formatPrice(o.total)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination hint */}
          {meta?.count > orders.length && (
            <div className="border-t border-border bg-surface-50 px-4 py-3 text-center text-xs text-text-secondary">
              Showing {orders.length} of {meta.count} orders
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default OrdersPage;