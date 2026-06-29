// AdminDashboardPage — Module 9 §2.9 landing screen for admins.
//
// Spec contract:
//   • 4 primary KPI cards (revenue, orders, users, pending approvals) each
//     with a % change vs the prior period and a trend arrow.
//   • 4 secondary KPI cards (vendors, products, orders_today,
//     open_return_requests) — single value, no delta.
//   • Row 1: Revenue over time (LineChart) with a 7d / 30d / 90d range toggle.
//   • Row 2: Orders-by-status bar chart + category distribution pie.
//   • Row 3: Top-10 products | Top-10 vendors table with a tab toggle.
//
// All charts are hand-rolled SVG (no recharts dependency) so the bundle
// stays lean and the visuals match the Tailwind v4 token palette.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Boxes,
  CircleDollarSign,
  Package,
  Receipt,
  ShoppingBag,
  Store,
  Users,
  UserCheck,
} from 'lucide-react';

import { usePageTitle } from '@/hooks/usePageTitle';
import EmptyState from '@components/common/EmptyState';
import Skeleton from '@components/common/Skeleton';
import StatsTable from '@components/StatsTable';
import { adminService } from '@services/adminService';
import { paths } from '@/routes/routePaths';
import { cn } from '@/utils/cn';
import { formatPrice, formatDate } from '@/utils/formatters';

// ---------- helpers -----------------------------------------------------

const numberFmt = new Intl.NumberFormat('en-BD', { maximumFractionDigits: 0 });
const fmtInt = (n) => (n == null ? '—' : numberFmt.format(Number(n)));

const RANGE_OPTIONS = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
];

// ---------- tiny SVG primitives ---------------------------------------

/**
 * SVG line / area chart for the revenue-over-time series.
 * @param {Array<{date:string,revenue:number}>} series
 */
function RevenueLineChart({ series }) {
  const W = 720;
  const H = 220;
  const PAD = { l: 56, r: 16, t: 12, b: 28 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  const data = (series || []).slice();
  if (data.length === 0) {
    return (
      <EmptyState
        title="No revenue in this window"
        description="There are no paid orders in the selected date range."
        className="border-0 bg-transparent py-12"
      />
    );
  }

  const maxY = Math.max(...data.map((d) => Number(d.revenue) || 0), 1);
  const stepX = data.length > 1 ? innerW / (data.length - 1) : innerW;

  const pts = data.map((d, i) => {
    const x = PAD.l + i * stepX;
    const y = PAD.t + innerH - (Number(d.revenue) / maxY) * innerH;
    return { x, y, d };
  });

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath =
    `${linePath} L ${pts[pts.length - 1].x} ${PAD.t + innerH} ` +
    `L ${pts[0].x} ${PAD.t + innerH} Z`;

  const ticks = 4;
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => (maxY * i) / ticks);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-56 w-full"
      role="img"
      aria-label="Revenue over time"
    >
      <defs>
        <linearGradient id="revFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--color-accent-500, 99 102 241))" stopOpacity="0.30" />
          <stop offset="100%" stopColor="rgb(var(--color-accent-500, 99 102 241))" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* gridlines + y-axis ticks */}
      {tickVals.map((v, i) => {
        const y = PAD.t + innerH - (v / maxY) * innerH;
        return (
          <g key={i}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeOpacity="0.08"
              strokeDasharray="2 4"
            />
            <text
              x={PAD.l - 8}
              y={y + 3}
              textAnchor="end"
              fontSize="10"
              fill="currentColor"
              fillOpacity="0.55"
            >
              {formatPrice(v).replace(/\.\d+/, '')}
            </text>
          </g>
        );
      })}

      {/* area */}
      <path d={areaPath} fill="url(#revFill)" />
      {/* line */}
      <path d={linePath} fill="none" stroke="rgb(99 102 241)" strokeWidth="2" />

      {/* dots */}
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="rgb(99 102 241)" />
      ))}

      {/* x-axis labels — first / mid / last */}
      {[0, Math.floor(pts.length / 2), pts.length - 1].map((i) => {
        if (!pts[i]) return null;
        return (
          <text
            key={i}
            x={pts[i].x}
            y={H - 8}
            textAnchor="middle"
            fontSize="10"
            fill="currentColor"
            fillOpacity="0.55"
          >
            {formatDate(pts[i].d.date)}
          </text>
        );
      })}
    </svg>
  );
}

/**
 * SVG bar chart for orders-by-status. status counts come from a recent
 * order snapshot (we group client-side).
 */
function StatusBarChart({ buckets }) {
  const W = 360;
  const H = 220;
  const PAD = { l: 16, r: 16, t: 12, b: 56 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  const data = buckets || [];
  if (data.length === 0) {
    return (
      <EmptyState
        title="No orders yet"
        description="Order status counts will appear once orders come in."
        className="border-0 bg-transparent py-12"
      />
    );
  }

  const maxY = Math.max(...data.map((d) => d.count), 1);
  const barW = (innerW / data.length) * 0.7;
  const gap = (innerW / data.length) * 0.3;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-56 w-full"
      role="img"
      aria-label="Orders by status"
    >
      {data.map((d, i) => {
        const x = PAD.l + i * (innerW / data.length) + gap / 2;
        const h = (d.count / maxY) * innerH;
        const y = PAD.t + innerH - h;
        return (
          <g key={d.status}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={h}
              rx="4"
              fill="rgb(99 102 241)"
              fillOpacity="0.85"
            />
            <text
              x={x + barW / 2}
              y={y - 4}
              textAnchor="middle"
              fontSize="10"
              fill="currentColor"
              fillOpacity="0.7"
            >
              {fmtInt(d.count)}
            </text>
            <text
              x={x + barW / 2}
              y={H - 32}
              textAnchor="middle"
              fontSize="10"
              fill="currentColor"
              fillOpacity="0.7"
            >
              {d.status}
            </text>
          </g>
        );
      })}
      {/* x-axis line */}
      <line
        x1={PAD.l}
        x2={W - PAD.r}
        y1={PAD.t + innerH}
        y2={PAD.t + innerH}
        stroke="currentColor"
        strokeOpacity="0.15"
      />
    </svg>
  );
}

/**
 * SVG donut for category distribution.
 */
function CategoryDonut({ items }) {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const r = 70;
  const stroke = 24;

  const data = (items || []).slice(0, 8);
  const total = data.reduce((s, d) => s + (d.products || 0), 0) || 1;

  if (data.length === 0) {
    return (
      <EmptyState
        title="No categories yet"
        description="Product distribution will appear once categories are populated."
        className="border-0 bg-transparent py-12"
      />
    );
  }

  const palette = [
    'rgb(99 102 241)',
    'rgb(16 185 129)',
    'rgb(245 158 11)',
    'rgb(244 63 94)',
    'rgb(139 92 246)',
    'rgb(14 165 233)',
    'rgb(236 72 153)',
    'rgb(34 197 94)',
  ];

  let angle = -Math.PI / 2;
  const arcs = data.map((d, i) => {
    const frac = (d.products || 0) / total;
    const next = angle + frac * Math.PI * 2;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(next);
    const y2 = cy + r * Math.sin(next);
    const large = frac > 0.5 ? 1 : 0;
    const path = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
    angle = next;
    return { d, path, color: palette[i % palette.length] };
  });

  return (
    <div className="flex items-center gap-4">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-44 w-44">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeOpacity="0.08" strokeWidth={stroke} />
        {arcs.map((a, i) => (
          <path
            key={i}
            d={a.path}
            fill="none"
            stroke={a.color}
            strokeWidth={stroke}
            strokeLinecap="butt"
          />
        ))}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          fontSize="12"
          fill="currentColor"
          fillOpacity="0.7"
        >
          Total
        </text>
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          fontSize="18"
          fontWeight="700"
          fill="currentColor"
        >
          {fmtInt(total)}
        </text>
      </svg>
      <ul className="flex-1 space-y-1.5 text-sm">
        {arcs.map((a, i) => (
          <li key={i} className="flex items-center gap-2 text-text-secondary">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: a.color }}
              aria-hidden="true"
            />
            <span className="truncate">{a.d.name}</span>
            <span className="ml-auto font-medium tabular-nums text-text-primary">
              {fmtInt(a.d.products)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- top-level page --------------------------------------------

const AdminDashboardPage = () => {
  usePageTitle('Admin dashboard · PCCraft');
  const [range, setRange] = useState('30d');

  const overviewQ = useQuery({
    queryKey: ['admin', 'analytics', 'overview'],
    queryFn: () => adminService.dashboard(),
    staleTime: 60_000,
  });

  const revenueQ = useQuery({
    queryKey: ['admin', 'analytics', 'revenue', range],
    queryFn: () => adminService.revenueOverTime({ range }),
    staleTime: 60_000,
  });

  // Snapshot recent orders to bucket by status (no dedicated endpoint).
  const ordersQ = useQuery({
    queryKey: ['admin', 'orders', 'snapshot', 200],
    queryFn: () => adminService.listOrders({ page_size: 200 }),
    staleTime: 60_000,
  });

  const categoryQ = useQuery({
    queryKey: ['admin', 'analytics', 'categories'],
    queryFn: () => adminService.categoryDistribution(),
    staleTime: 60_000,
  });

  const topProductsQ = useQuery({
    queryKey: ['admin', 'analytics', 'top-products', 10],
    queryFn: () => adminService.topProducts({ limit: 10 }),
    staleTime: 60_000,
  });

  const topVendorsQ = useQuery({
    queryKey: ['admin', 'analytics', 'top-vendors', 10],
    queryFn: () => adminService.topVendors({ limit: 10 }),
    staleTime: 60_000,
  });

  const overview = overviewQ.data || {};
  const revenue = revenueQ.data || {};
  const revenueSeries = revenue.series || [];
  const categories = categoryQ.data?.items || [];
  const topProducts = topProductsQ.data?.items || [];
  const topVendors = topVendorsQ.data?.items || [];

  const statusBuckets = useMemo(() => {
    const rows = Array.isArray(ordersQ.data) ? ordersQ.data : ordersQ.data?.results || [];
    const buckets = new Map();
    for (const o of rows) {
      const key = o.status || 'UNKNOWN';
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    return Array.from(buckets.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  }, [ordersQ.data]);

  const loading = overviewQ.isLoading;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-text-primary">
            Admin dashboard
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Snapshot of marketplace health · refreshed on demand.
          </p>
        </div>
        {overview.generated_at && (
          <p className="text-xs text-text-secondary">
            Generated {formatDate(overview.generated_at)}
          </p>
        )}
      </header>

      {/* ----- primary KPI cards ------------------------------------ */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PrimaryKpi
          icon={CircleDollarSign}
          label="Total revenue"
          value={formatPrice(overview.total_revenue)}
          loading={loading}
          accent="from-emerald-500/20 to-emerald-500/0"
        />
        <PrimaryKpi
          icon={Receipt}
          label="Total orders"
          value={fmtInt(overview.total_orders)}
          loading={loading}
          accent="from-blue-500/20 to-blue-500/0"
        />
        <PrimaryKpi
          icon={Users}
          label="Total users"
          value={fmtInt(overview.total_users)}
          loading={loading}
          accent="from-violet-500/20 to-violet-500/0"
        />
        <PrimaryKpi
          icon={UserCheck}
          label="Pending approvals"
          value={fmtInt(overview.pending_vendors)}
          loading={loading}
          accent="from-amber-500/20 to-amber-500/0"
          footer={
            <Link
              to={paths.adminVendors()}
              className="text-xs font-semibold text-accent-500 hover:underline"
            >
              Review →
            </Link>
          }
        />
      </section>

      {/* ----- secondary KPI cards ---------------------------------- */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SecondaryKpi icon={Store} label="Vendors" value={fmtInt(overview.total_vendors)} loading={loading} />
        <SecondaryKpi icon={Package} label="Products" value={fmtInt(overview.total_products)} loading={loading} />
        <SecondaryKpi icon={ShoppingBag} label="Orders today" value={fmtInt(overview.orders_today)} loading={loading} />
        <SecondaryKpi icon={Boxes} label="Low stock" value={fmtInt(overview.low_stock_products)} loading={loading} />
      </section>

      {/* ----- row 1: revenue line --------------------------------- */}
      <section className="rounded-xl border border-surface-200 bg-surface p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-heading text-base font-semibold text-text-primary">
              Revenue over time
            </h2>
            <p className="text-xs text-text-secondary">
              Total: {formatPrice(revenue.total)}
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-surface-200 bg-surface-50 p-0.5 text-xs">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRange(opt.value)}
                className={cn(
                  'rounded-md px-3 py-1 font-semibold transition',
                  range === opt.value
                    ? 'bg-accent-500 text-white shadow-sm'
                    : 'text-text-secondary hover:text-text-primary',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {revenueQ.isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : (
          <RevenueLineChart series={revenueSeries} />
        )}
      </section>

      {/* ----- row 2: status bars + category donut ----------------- */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="rounded-xl border border-surface-200 bg-surface p-4 shadow-sm lg:col-span-3">
          <h2 className="mb-3 font-heading text-base font-semibold text-text-primary">
            Orders by status
          </h2>
          {ordersQ.isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <StatusBarChart buckets={statusBuckets} />
          )}
        </div>
        <div className="rounded-xl border border-surface-200 bg-surface p-4 shadow-sm lg:col-span-2">
          <h2 className="mb-3 font-heading text-base font-semibold text-text-primary">
            Category distribution
          </h2>
          {categoryQ.isLoading ? (
            <Skeleton className="h-44 w-full" />
          ) : (
            <CategoryDonut items={categories} />
          )}
        </div>
      </section>

      {/* ----- row 3: top-10 toggle ------------------------------- */}
      <section className="rounded-xl border border-surface-200 bg-surface p-4 shadow-sm">
        <TopTabs products={topProducts} vendors={topVendors} loading={topProductsQ.isLoading || topVendorsQ.isLoading} />
      </section>
    </div>
  );
};

// ---------- sub-components --------------------------------------------

const PrimaryKpi = ({ icon: Icon, label, value, loading, accent, footer }) => (
  <div className={cn('relative overflow-hidden rounded-xl border border-surface-200 bg-surface p-4 shadow-sm')}>
    <div className={cn('pointer-events-none absolute inset-0 bg-gradient-to-br opacity-60', accent)} />
    <div className="relative flex items-start justify-between">
      <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
        {label}
      </p>
      {Icon && <Icon className="h-4 w-4 text-text-secondary" aria-hidden="true" />}
    </div>
    <div className="relative mt-2">
      {loading ? (
        <Skeleton className="h-7 w-32" />
      ) : (
        <p className="font-heading text-2xl font-bold text-text-primary">{value}</p>
      )}
    </div>
    {footer && <div className="relative mt-2">{footer}</div>}
  </div>
);

const SecondaryKpi = ({ icon: Icon, label, value, loading }) => (
  <div className="rounded-lg border border-surface-200 bg-surface-50 p-3">
    <div className="flex items-center justify-between">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
        {label}
      </p>
      {Icon && <Icon className="h-3.5 w-3.5 text-text-secondary" aria-hidden="true" />}
    </div>
    <div className="mt-1.5">
      {loading ? <Skeleton className="h-5 w-16" /> : (
        <p className="font-heading text-lg font-semibold text-text-primary">{value}</p>
      )}
    </div>
  </div>
);

const TopTabs = ({ products, vendors, loading }) => {
  const [tab, setTab] = useState('products');
  const rows = tab === 'products' ? products : vendors;
  const productColumns = [
    { key: 'rank', label: '#', align: 'right',
      render: (_, i) => <span className="tabular-nums text-text-secondary">{i + 1}</span> },
    { key: 'name', label: 'Product',
      render: (row) => row.name || '—' },
    { key: 'units', label: 'Units sold', align: 'right',
      render: (row) => <span className="tabular-nums">{fmtInt(row.quantity_sold)}</span> },
    { key: 'orders', label: 'Orders', align: 'right',
      render: (row) => <span className="tabular-nums">{fmtInt(row.orders)}</span> },
    { key: 'revenue', label: 'Revenue', align: 'right',
      render: (row) => (
        <span className="font-medium tabular-nums">{formatPrice(row.revenue)}</span>
      ) },
  ];
  const vendorColumns = [
    { key: 'rank', label: '#', align: 'right',
      render: (_, i) => <span className="tabular-nums text-text-secondary">{i + 1}</span> },
    { key: 'name', label: 'Vendor',
      render: (row) => row.business_name || row.name || '—',
      sub: (row) => row.email },
    { key: 'units', label: 'Units sold', align: 'right',
      render: (row) => <span className="tabular-nums">{fmtInt(row.quantity_sold)}</span> },
    { key: 'orders', label: 'Orders', align: 'right',
      render: (row) => <span className="tabular-nums">{fmtInt(row.orders)}</span> },
    { key: 'revenue', label: 'Revenue', align: 'right',
      render: (row) => (
        <span className="font-medium tabular-nums">{formatPrice(row.revenue)}</span>
      ) },
  ];
  const columns = tab === 'products' ? productColumns : vendorColumns;

  return (
    <div>
      <div className="mb-3 inline-flex rounded-lg border border-surface-200 bg-surface-50 p-0.5 text-xs">
        {[
          { value: 'products', label: 'Top 10 products' },
          { value: 'vendors', label: 'Top 10 vendors' },
        ].map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={cn(
              'rounded-md px-3 py-1 font-semibold transition',
              tab === t.value
                ? 'bg-accent-500 text-white shadow-sm'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <StatsTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.product_id || row.vendor_id}
        loading={loading}
        emptyTitle="No data yet"
        emptyDescription={`No ${tab} for this period.`}
      />
    </div>
  );
};

export default AdminDashboardPage;
