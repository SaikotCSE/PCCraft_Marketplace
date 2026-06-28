// ReturnsPage — Module 4 + Module 10 list of customer return requests.
//
// Per spec §4 / §5 this page renders any return requests the customer has
// opened. Module 4 wires up the navigation entry (and the "Request return"
// link from OrderDetailPage for DELIVERED items within the 7-day window);
// Module 10 owns the request form, vendor/admin approval workflow, and
// the timeline detail page — those are deliberately stubbed here.
//
// We *do* fetch via returnService.list() because that endpoint exists and
// callers expect the page to render past + in-flight returns immediately.
// If the endpoint is not yet available (older backend), we fall back to
// the empty state rather than crashing.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Undo2 } from 'lucide-react';

import { returnService } from '@services/returnService';
import { usePageTitle } from '@hooks/usePageTitle';
import EmptyState from '@components/common/EmptyState';
import Skeleton from '@components/common/Skeleton';
import StatusBadge from '@components/common/StatusBadge';
import { RETURN_STATUSES } from '@utils/constants';
import { formatDate } from '@utils/formatters';
import { paths } from '@routes/routePaths';

const ReturnsPage = () => {
  usePageTitle('My returns · PCCraft');

  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await returnService.list();
        if (cancelled) return;
        const list = data?.results || data?.data || data || [];
        setReturns(list);
      } catch (err) {
        if (cancelled) return;
        // 404 here means the Module 10 endpoint isn't live yet — show the
        // empty state instead of an error toast.
        if (err?.response?.status === 404) {
          setReturns([]);
        } else {
          setError(err.message || 'Failed to load returns');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-bold text-text-primary">
            My returns
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Open and historical return requests. Return windows apply per
            delivered item.
          </p>
        </div>
        <Link
          to={paths.orders()}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary hover:border-accent-500"
        >
          View orders
        </Link>
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
          description="When you request a return for a delivered item, it'll appear here. You can request a return from any order within 7 days of delivery."
          icon={Undo2}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-50 text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="px-4 py-3">Return</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Requested</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {returns.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-text-primary">
                    {r.return_number || r.id}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                    {r.order_number || r.order?.order_number || '—'}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {formatDate(r.created_at || r.requested_at)}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {r.reason_label || r.reason || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status || RETURN_STATUSES.PENDING} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default ReturnsPage;