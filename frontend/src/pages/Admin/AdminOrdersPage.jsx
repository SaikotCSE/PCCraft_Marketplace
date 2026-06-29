// AdminOrdersPage — Module 9 platform-wide order moderation.
//
// Spec §2.9:
//   - Filterable table: search (order_number), status filter, date range
//   - Table: order_number, customer (from shipping_address.full_name),
//     item_count, total, status, payment_status, created_at
//   - Click row → detail modal with full line items + shipping block
//
// OrderSerializer fields (verified against backend):
//   id, order_number, status, payment_status, payment_method, subtotal,
//   shipping_fee, tax, discount, total, notes, tracking_number,
//   shipping_address (dict snapshot), items[], item_count, can_cancel,
//   cancelled_at, confirmed_at, shipped_at, delivered_at, created_at,
//   updated_at.
//
// OrderItemSerializer fields:
//   id, product_id, product_slug, product_name_snapshot, primary_image_url,
//   vendor_id, vendor_name, unit_price, discount_snapshot, quantity,
//   line_total, item_status, shipped_at, delivered_at, can_return,
//   days_to_return_close, return_request_id, created_at.
//
// NOTE: there is NO `customer` field — we display `shipping_address.full_name`.
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Filter,
  Loader2,
  Package,
  Search,
  Truck,
  X,
} from 'lucide-react';

import { usePageTitle } from '@/hooks/usePageTitle';
import EmptyState from '@components/common/EmptyState';
import Modal from '@components/common/Modal';
import Skeleton from '@components/common/Skeleton';
import StatusBadge from '@components/common/StatusBadge';
import { adminService } from '@services/adminService';
import { cn } from '@/utils/cn';
import { formatPrice, formatDate, formatDateTime } from '@/utils/formatters';

const PAGE_SIZE = 20;

// Filter options (from backend OrderStatus enum).
const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'OUT_FOR_DELIVERY',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'FAILED',
  'REFUNDED',
  'RETURN_REQUESTED',
  'RETURNED',
].map((v) => (typeof v === 'string' ? { value: v, label: humanise(v) } : v));

function humanise(raw) {
  return String(raw || '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------- page ------------------------------------------------------

const AdminOrdersPage = () => {
  usePageTitle('Orders · Admin · PCCraft');
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const [appliedSearch, setAppliedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setAppliedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [appliedSearch, status, dateFrom, dateTo]);

  const [detailOrder, setDetailOrder] = useState(null);

  const filters = useMemo(
    () => ({
      search: appliedSearch || undefined,
      status: status || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      page,
      page_size: PAGE_SIZE,
    }),
    [appliedSearch, status, dateFrom, dateTo, page],
  );

  const query = useQuery({
    queryKey: ['admin', 'orders', filters],
    queryFn: () => adminService.listOrders(filters),
    keepPreviousData: true,
  });

  const results = Array.isArray(query.data?.data)
    ? query.data.data
    : Array.isArray(query.data)
    ? query.data
    : [];
  const pagination = query.data?.meta?.pagination || {};
  const totalCount = pagination.total_items ?? results.length;
  const totalPages =
    pagination.total_pages ?? Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-heading text-2xl font-bold text-text-primary">
          Orders
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Monitor and moderate every order on the platform ·{' '}
          {totalCount.toLocaleString()} total
        </p>
      </header>

      {/* ----- filter bar ----------------------------------------- */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setAppliedSearch(search.trim());
        }}
        className="flex flex-wrap items-center gap-2 rounded-lg border border-surface-200 bg-surface-50 p-3"
      >
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-text-secondary" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by order number…"
            className="w-full rounded-md border border-border bg-surface py-1.5 pl-8 pr-3 text-sm focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
          />
        </div>
        <div className="flex items-center gap-1.5 text-xs text-text-secondary">
          <Filter className="h-3.5 w-3.5" />
          <span>Filter</span>
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-border bg-surface py-1.5 pl-2 pr-7 text-sm focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
        >
          {STATUS_FILTERS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <DateField label="From" value={dateFrom} onChange={setDateFrom} />
        <DateField label="To" value={dateTo} onChange={setDateTo} />
        {(status || dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => {
              setStatus('');
              setDateFrom('');
              setDateTo('');
            }}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-surface-100"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </form>

      {/* ----- table ---------------------------------------------- */}
      <div className="overflow-hidden rounded-xl border border-surface-200 bg-surface shadow-sm">
        {query.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : results.length === 0 ? (
          <EmptyState
            title="No orders match your filters"
            description="Try clearing the search box or changing the status/date filters."
            className="border-0 bg-transparent py-12"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-surface-200 bg-surface-50 text-left text-xs uppercase tracking-wide text-text-secondary">
                <tr>
                  <th className="px-4 py-2.5">Order</th>
                  <th className="px-4 py-2.5">Customer</th>
                  <th className="px-4 py-2.5">Items</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Payment</th>
                  <th className="px-4 py-2.5">Placed</th>
                </tr>
              </thead>
              <tbody>
                {results.map((o) => {
                  const customer =
                    o.shipping_address?.full_name || 'Unknown customer';
                  return (
                    <tr
                      key={o.order_number}
                      onClick={() => setDetailOrder(o.order_number)}
                      className="cursor-pointer border-b border-surface-100 last:border-0 hover:bg-surface-50/60"
                    >
                      <td className="px-4 py-2.5 font-mono text-xs text-text-primary">
                        {o.order_number}
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary">
                        {customer}
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary">
                        {o.item_count ?? o.items?.length ?? 0}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-text-primary">
                        {formatPrice(o.total)}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={o.status} size="sm" />
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary">
                        {humanise(o.payment_status)}
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary">
                        {formatDateTime(o.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-surface-200 bg-surface-50 px-4 py-2.5 text-xs text-text-secondary">
            <span>
              Page {page} of {totalPages} · {totalCount.toLocaleString()} orders
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 font-medium text-text-secondary hover:bg-surface-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 font-medium text-text-secondary hover:bg-surface-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {detailOrder && (
        <OrderDetailModal
          orderNumber={detailOrder}
          onClose={() => {
            setDetailOrder(null);
            queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
          }}
        />
      )}
    </div>
  );
};

// ---------- sub-components --------------------------------------------

const DateField = ({ label, value, onChange }) => (
  <label className="flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-secondary">
    <Calendar className="h-3.5 w-3.5" />
    <span>{label}</span>
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border-0 bg-transparent p-0 text-xs text-text-primary focus:outline-none focus:ring-0"
    />
  </label>
);

const OrderDetailModal = ({ orderNumber, onClose }) => {
  const query = useQuery({
    queryKey: ['admin', 'orders', 'detail', orderNumber],
    queryFn: () => adminService.getOrder(orderNumber),
    enabled: Boolean(orderNumber),
    staleTime: 0,
  });

  return (
    <Modal open onClose={onClose} title={`Order ${orderNumber}`} size="xl">
      {query.isLoading ? (
        <div className="flex items-center justify-center py-12 text-text-secondary">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : query.error ? (
        <EmptyState
          title="Could not load order"
          description={
            query.error?.response?.data?.error?.message ||
            'An unexpected error occurred.'
          }
          className="border-0 bg-transparent py-10"
        />
      ) : (
        <OrderDetail order={query.data?.data || query.data} />
      )}
    </Modal>
  );
};

const OrderDetail = ({ order }) => {
  if (!order) return null;
  const addr = order.shipping_address || {};
  const items = order.items || [];

  return (
    <div className="space-y-5 text-sm">
      <section className="grid gap-3 rounded-lg border border-surface-200 bg-surface-50 p-4 sm:grid-cols-3">
        <Detail label="Status">
          <StatusBadge status={order.status} size="sm" />
        </Detail>
        <Detail label="Payment">
          <StatusBadge status={order.payment_status} size="sm" />
        </Detail>
        <Detail label="Placed">{formatDateTime(order.created_at)}</Detail>
        <Detail label="Order #">
          <span className="font-mono text-xs">{order.order_number}</span>
        </Detail>
        <Detail label="Tracking">
          {order.tracking_number ? (
            <span className="inline-flex items-center gap-1 text-accent-600">
              <Truck className="h-3 w-3" /> {order.tracking_number}
            </span>
          ) : (
            '—'
          )}
        </Detail>
        <Detail label="Payment method">
          {order.payment_method
            ? humanise(order.payment_method)
            : '—'}
        </Detail>
      </section>

      <section>
        <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Shipping address
        </h3>
        <div className="mt-2 rounded-lg border border-surface-200 bg-surface-50 p-4 text-sm">
          <p className="font-medium text-text-primary">
            {addr.full_name || '—'}
          </p>
          {addr.phone && (
            <p className="text-xs text-text-secondary">{addr.phone}</p>
          )}
          <p className="mt-1 text-text-secondary">
            {addr.address_line1}
            {addr.address_line2 ? `, ${addr.address_line2}` : ''}
          </p>
          <p className="text-text-secondary">
            {[addr.city, addr.state, addr.postal_code]
              .filter(Boolean)
              .join(', ')}
            {addr.country ? ` · ${addr.country}` : ''}
          </p>
        </div>
      </section>

      <section>
        <h3 className="flex items-center gap-1.5 font-heading text-sm font-semibold uppercase tracking-wide text-text-secondary">
          <Package className="h-3.5 w-3.5" /> Items ({items.length})
        </h3>
        <ul className="mt-2 divide-y divide-surface-200 rounded-lg border border-surface-200 bg-surface">
          {items.map((it) => (
            <li key={it.id} className="flex flex-wrap items-start gap-3 p-3">
              {it.primary_image_url ? (
                <img
                  src={it.primary_image_url}
                  alt=""
                  className="h-14 w-14 flex-none rounded-md border border-surface-200 object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 flex-none items-center justify-center rounded-md border border-dashed border-surface-300 bg-surface-50 text-xs text-text-secondary">
                  ?
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-text-primary">
                  {it.product_name_snapshot || 'Product'}
                </p>
                {it.vendor_name && (
                  <p className="text-xs text-text-secondary">
                    Sold by {it.vendor_name}
                  </p>
                )}
                <p className="text-xs text-text-secondary">
                  {formatPrice(it.unit_price)} × {it.quantity}
                </p>
                {it.can_return && (
                  <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                    Returnable ({it.days_to_return_close ?? '?'}d left)
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="font-semibold text-text-primary">
                  {formatPrice(it.line_total)}
                </p>
                <p className="text-xs text-text-secondary">
                  {humanise(it.item_status)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-surface-200 bg-surface-50 p-4">
        <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Totals
        </h3>
        <dl className="mt-2 grid gap-1.5 text-sm">
          <Row label="Subtotal" value={formatPrice(order.subtotal)} />
          <Row label="Shipping" value={formatPrice(order.shipping_fee)} />
          <Row label="Tax" value={formatPrice(order.tax)} />
          {Number(order.discount) > 0 && (
            <Row
              label="Discount"
              value={`-${formatPrice(order.discount)}`}
              tone="success"
            />
          )}
          <div className="my-1 border-t border-surface-200" />
          <Row label="Total" value={formatPrice(order.total)} bold />
        </dl>
      </section>

      {order.notes && (
        <section>
          <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-text-secondary">
            Customer notes
          </h3>
          <p className="mt-2 whitespace-pre-line rounded-md border border-surface-200 bg-surface-50 p-3 text-sm text-text-primary">
            {order.notes}
          </p>
        </section>
      )}
    </div>
  );
};

const Detail = ({ label, children }) => (
  <div>
    <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
      {label}
    </p>
    <div className="mt-1 text-sm text-text-primary">{children}</div>
  </div>
);

const Row = ({ label, value, bold, tone }) => (
  <div className="flex items-center justify-between">
    <dt className="text-text-secondary">{label}</dt>
    <dd
      className={cn(
        bold ? 'text-base font-bold text-text-primary' : 'text-text-primary',
        tone === 'success' && 'text-emerald-700',
      )}
    >
      {value}
    </dd>
  </div>
);

export default AdminOrdersPage;
