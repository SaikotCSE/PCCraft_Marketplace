// VendorDashboardPage — vendor analytics home (Module 10).
//
// Data sources:
//   • GET /api/v1/vendor/dashboard/overview/        → KPI bundle
//   • GET /api/v1/vendor/dashboard/revenue-over-time/?range=7d|30d|90d
//   • GET /api/v1/vendor/dashboard/top-products/?limit=5
//   • GET /api/v1/vendor/dashboard/low-stock/
//
// Layout matches Module 10 spec:
//   1. Four KPI cards (Total Earnings, This Month Revenue, Pending Orders,
//      Active Returns)
//   2. Recharts LineChart with a range selector (7d / 30d / 90d)
//   3. Top-5 products table
//   4. Low-stock alert list with "Update stock" deep-link

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  Banknote,
  CalendarClock,
  PackageCheck,
  Undo2,
  Image as ImageIcon,
  RefreshCcw,
  ExternalLink,
} from 'lucide-react';

import { usePageTitle } from '@/hooks/usePageTitle';
import vendorService from '@services/vendorService';
import { formatPrice } from '@utils/formatters';
import { paths } from '@routes/routePaths';

const RANGE_OPTIONS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
];

const CHART_TICK_FORMATTER = (value) =>
  value >= 1000 ? `${(value / 1000).toFixed(0)}k` : String(value);

const CHART_DATE_FORMATTER = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-BD', { month: 'short', day: 'numeric' });
};

export default function VendorDashboardPage() {
  usePageTitle('Vendor dashboard · PCCraft');

  const [overview, setOverview] = useState(null);
  const [revenue, setRevenue] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [range, setRange] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Re-fetch revenue series whenever the range changes. The other three
  // endpoints are range-independent so they only load once.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [ov, rv, top, low] = await Promise.all([
          vendorService.dashboardOverview(),
          vendorService.dashboardRevenueOverTime({ range }),
          vendorService.dashboardTopProducts({ limit: 5 }),
          vendorService.dashboardLowStock(),
        ]);
        if (cancelled) return;
        setOverview(ov);
        setRevenue(Array.isArray(rv) ? rv : []);
        setTopProducts(Array.isArray(top) ? top : []);
        setLowStock(Array.isArray(low) ? low : []);
      } catch (err) {
        if (cancelled) return;
        const message =
          err.response?.data?.error?.message ||
          err.message ||
          'Could not load dashboard data.';
        setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [range]);

  const refreshAll = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      vendorService.dashboardOverview(),
      vendorService.dashboardRevenueOverTime({ range }),
      vendorService.dashboardTopProducts({ limit: 5 }),
      vendorService.dashboardLowStock(),
    ])
      .then(([ov, rv, top, low]) => {
        setOverview(ov);
        setRevenue(Array.isArray(rv) ? rv : []);
        setTopProducts(Array.isArray(top) ? top : []);
        setLowStock(Array.isArray(low) ? low : []);
      })
      .catch((err) => {
        const message =
          err.response?.data?.error?.message ||
          err.message ||
          'Could not load dashboard data.';
        setError(message);
      })
      .finally(() => setLoading(false));
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">
            Vendor dashboard
          </h1>
          <p className="text-sm text-text-secondary">
            Real-time earnings, orders, and inventory health for your store.
          </p>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md border border-surface-200 bg-white px-3 py-2 text-sm font-medium text-text-primary transition hover:bg-surface-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      {error && (
        <div
          role="alert"
          className="mb-6 rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      )}

      <section
        aria-label="Key performance indicators"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <KpiCard
          icon={Banknote}
          label="Total earnings"
          value={formatPrice(overview?.total_revenue_all_time ?? 0)}
          loading={loading}
        />
        <KpiCard
          icon={CalendarClock}
          label="This month revenue"
          value={formatPrice(overview?.revenue_this_month ?? 0)}
          loading={loading}
        />
        <KpiCard
          icon={PackageCheck}
          label="Pending orders"
          value={overview?.pending_orders ?? 0}
          loading={loading}
        />
        <KpiCard
          icon={Undo2}
          label="Active returns"
          value={overview?.active_returns ?? 0}
          loading={loading}
        />
      </section>

      <section className="mt-8 rounded-md border border-surface-200 bg-white p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-text-primary">
            Revenue over time
          </h2>
          <div
            role="tablist"
            aria-label="Time range"
            className="inline-flex overflow-hidden rounded-md border border-surface-200 bg-surface-50"
          >
            {RANGE_OPTIONS.map((opt) => {
              const active = range === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setRange(opt.value)}
                  className={`px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? 'bg-accent-500 text-white'
                      : 'text-text-secondary hover:bg-surface-100'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="h-72 w-full">
          {revenue.length === 0 && !loading ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={revenue}
                margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tickFormatter={CHART_DATE_FORMATTER}
                  stroke="#6b7280"
                  fontSize={11}
                />
                <YAxis
                  tickFormatter={CHART_TICK_FORMATTER}
                  stroke="#6b7280"
                  fontSize={11}
                  width={48}
                />
                <Tooltip
                  formatter={(value) => formatPrice(value)}
                  labelFormatter={(label) =>
                    label ? new Date(label).toLocaleDateString('en-BD') : ''
                  }
                  contentStyle={{
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-md border border-surface-200 bg-white p-6 lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold text-text-primary">
            Top 5 products
          </h2>
          <TopProductsTable rows={topProducts} loading={loading} />
        </section>

        <section className="rounded-md border border-surface-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary">
              Low-stock alerts
            </h2>
            <span className="text-xs text-text-secondary">
              {overview?.low_stock_products_count ?? lowStock.length} product
              {overview?.low_stock_products_count === 1 ? '' : 's'}
            </span>
          </div>
          <LowStockList rows={lowStock} loading={loading} />
        </section>
      </div>
    </div>
  );
}

// ─── KPI card ──────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, loading }) {
  return (
    <div className="rounded-md border border-surface-200 bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-text-secondary">
        <Icon className="h-4 w-4 text-accent-500" />
        {label}
      </div>
      <div className="text-2xl font-semibold text-text-primary">
        {loading ? '—' : value}
      </div>
    </div>
  );
}

// ─── Top products table ────────────────────────────────────────────────
function TopProductsTable({ rows, loading }) {
  if (loading) {
    return <p className="text-sm text-text-secondary">Loading top products…</p>;
  }
  if (!rows || rows.length === 0) {
    return (
      <p className="text-sm text-text-secondary">
        No sales yet — once orders come in, your best-sellers will appear here.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-surface-200 text-xs uppercase tracking-wide text-text-secondary">
            <th className="py-2 pr-3">Product</th>
            <th className="py-2 pr-3 text-right">Units sold</th>
            <th className="py-2 pr-3 text-right">Revenue</th>
            <th className="py-2 pr-3 text-right">Stock</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.product_id}
              className="border-b border-surface-100 last:border-0"
            >
              <td className="py-3 pr-3">
                <div className="flex items-center gap-3">
                  {row.primary_image ? (
                    <img
                      src={row.primary_image}
                      alt=""
                      className="h-10 w-10 flex-shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded bg-surface-100 text-text-secondary">
                      <ImageIcon className="h-4 w-4" />
                    </div>
                  )}
                  <span className="line-clamp-2 font-medium text-text-primary">
                    {row.name}
                  </span>
                </div>
              </td>
              <td className="py-3 pr-3 text-right">{row.total_sold}</td>
              <td className="py-3 pr-3 text-right font-medium">
                {formatPrice(row.revenue)}
              </td>
              <td className="py-3 pr-3 text-right">{row.current_stock}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Low-stock list ────────────────────────────────────────────────────
function LowStockList({ rows, loading }) {
  if (loading) {
    return <p className="text-sm text-text-secondary">Checking inventory…</p>;
  }
  if (!rows || rows.length === 0) {
    return (
      <p className="text-sm text-text-secondary">
        All stocked up. Nothing below your threshold right now.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-surface-100">
      {rows.map((row) => (
        <li
          key={row.product_id}
          className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text-primary">
              {row.name}
            </p>
            <p className="text-xs text-text-secondary">
              {row.stock_quantity} in stock · threshold {row.low_stock_threshold}
            </p>
          </div>
          <Link
            to={paths.vendorProductEdit(row.slug)}
            className="inline-flex items-center gap-1 rounded-md border border-surface-200 px-2 py-1 text-xs font-medium text-text-primary transition hover:bg-surface-50"
          >
            Update stock
            <ExternalLink className="h-3 w-3" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ─── Empty chart placeholder ──────────────────────────────────────────
function EmptyChart() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-sm text-text-secondary">
      <Banknote className="mb-2 h-8 w-8 text-text-secondary" />
      <p>No revenue recorded in this window yet.</p>
    </div>
  );
}
