// AdminProductsListPage — Module 9 admin product moderation queue.
//
// Spec §2.7 / Module 9:
//   - filter by status, vendor, search
//   - sort newest/oldest
//   - per row: thumbnail, name, vendor, brand, status chip,
//     price, stock, avg rating, review count, actions
//   - actions: change status (active / hidden / suspended),
//     soft-delete (archive) with optional reason
//   - click row → AdminProductFormPage edit
import { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  Check,
  EyeOff,
  MoreVertical,
  Pause,
  Play,
  RotateCcw,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { usePageTitle } from '@/hooks/usePageTitle';
import EmptyState from '@components/common/EmptyState';
import Skeleton from '@components/common/Skeleton';
import StatusBadge from '@components/common/StatusBadge';
import ConfirmDialog from '@components/common/ConfirmDialog';
import Modal from '@components/common/Modal';
import { adminService } from '@services/adminService';
import { paths } from '@/routes/routePaths';
import { cn } from '@/utils/cn';
import { formatDate, formatPrice } from '@/utils/formatters';
import { PRODUCT_STATUS } from '@/utils/constants';

const PAGE_SIZE = 20;

const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: PRODUCT_STATUS.DRAFT, label: 'Draft' },
  { value: PRODUCT_STATUS.ACTIVE, label: 'Active' },
  { value: PRODUCT_STATUS.PAUSED, label: 'Paused' },
  { value: PRODUCT_STATUS.HIDDEN, label: 'Hidden' },
];

const AdminProductsListPage = () => {
  usePageTitle('Products · Admin · PCCraft');
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [statusFilter, setStatusFilter] = useState(params.get('status') || '');
  const [moderateTarget, setModerateTarget] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [hideTarget, setHideTarget] = useState(null);
  const [hideReason, setHideReason] = useState('');
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [hardDeleteTarget, setHardDeleteTarget] = useState(null);
  const [hardDeleteReason, setHardDeleteReason] = useState('');
  const [menuOpenFor, setMenuOpenFor] = useState(null);
  const queryClient = useQueryClient();

  const filters = useMemo(
    () => ({
      search: q.trim() || undefined,
      status: statusFilter || undefined,
      ordering: params.get('ordering') || '-created_at',
      page: Number(params.get('page') || 1),
      page_size: PAGE_SIZE,
    }),
    [q, statusFilter, params],
  );

  const query = useQuery({
    queryKey: ['admin', 'products', filters],
    queryFn: () => adminService.listProducts(filters),
    keepPreviousData: true,
  });

  const moderateMutation = useMutation({
    mutationFn: ({ id, status, reason }) =>
      adminService.moderateProduct(id, { status, reason }),
    onSuccess: (data) => {
      toast.success(`Status set to ${data?.status || 'updated'}`);
      queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
      setModerateTarget(null);
    },
    onError: (err) =>
      toast.error(err?.response?.data?.error?.message || 'Moderation failed'),
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, reason }) => adminService.deleteProduct(id, { reason }),
    onSuccess: () => {
      toast.success('Product archived');
      queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
      setArchiveTarget(null);
      setArchiveReason('');
    },
    onError: (err) =>
      toast.error(err?.response?.data?.error?.message || 'Archive failed'),
  });

  // Slug-keyed actions wired into the spec §3166-3172 surface
  // (/admin/products/{slug}/hide|restore|DELETE). Each maps directly to
  // a button in the row's overflow menu; reason is always optional.
  const hideMutation = useMutation({
    mutationFn: ({ slug, reason }) =>
      adminService.hideProduct(slug, { reason }),
    onSuccess: () => {
      toast.success('Product hidden');
      queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
      setHideTarget(null);
      setHideReason('');
    },
    onError: (err) =>
      toast.error(err?.response?.data?.error?.message || 'Hide failed'),
  });

  const restoreMutation = useMutation({
    mutationFn: ({ slug, reason }) =>
      adminService.restoreProduct(slug, { reason }),
    onSuccess: () => {
      toast.success('Product restored');
      queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
      setRestoreTarget(null);
    },
    onError: (err) =>
      toast.error(err?.response?.data?.error?.message || 'Restore failed'),
  });

  const hardDeleteMutation = useMutation({
    mutationFn: ({ slug, reason }) =>
      adminService.hardDeleteProduct(slug, { reason }),
    onSuccess: () => {
      toast.success('Product permanently deleted');
      queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
      setHardDeleteTarget(null);
      setHardDeleteReason('');
    },
    onError: (err) =>
      toast.error(err?.response?.data?.error?.message || 'Hard delete failed'),
  });

  const items = Array.isArray(query.data) ? query.data : [];
  const meta = query.data?.meta;

  const applyUrl = useCallback(
    (patch) => {
      const next = new URLSearchParams(params);
      Object.entries(patch).forEach(([k, v]) => {
        if (v === undefined || v === null || v === '') next.delete(k);
        else next.set(k, v);
      });
      next.delete('page');
      setParams(next);
    },
    [params, setParams],
  );

  const onSearch = (e) => {
    e.preventDefault();
    applyUrl({ q: q.trim() });
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-text-primary">
            Products
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Moderate the product catalog — change status, archive, or
            inspect any listing.
          </p>
        </div>
      </header>

      {/* Filters */}
      <form
        onSubmit={onSearch}
        className="grid gap-2 rounded-lg border border-surface-200 bg-surface-50 p-3 sm:grid-cols-[1fr_220px_auto]"
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-text-secondary" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, slug, SKU…"
            className="w-full rounded-md border border-border bg-surface py-1.5 pl-8 pr-3 text-sm focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            applyUrl({ status: e.target.value });
          }}
          className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-100"
        >
          Search
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-surface-200 bg-surface shadow-sm">
        <table className="min-w-full divide-y divide-surface-200 text-sm">
          <thead className="bg-surface-50">
            <tr>
              <th className="px-4 py-2 text-left font-semibold text-text-secondary">Product</th>
              <th className="px-4 py-2 text-left font-semibold text-text-secondary">Vendor</th>
              <th className="px-4 py-2 text-left font-semibold text-text-secondary">Brand</th>
              <th className="px-4 py-2 text-right font-semibold text-text-secondary">Price</th>
              <th className="px-4 py-2 text-right font-semibold text-text-secondary">Stock</th>
              <th className="px-4 py-2 text-left font-semibold text-text-secondary">Status</th>
              <th className="px-4 py-2 text-right font-semibold text-text-secondary">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {query.isLoading &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  <td className="px-4 py-3"><Skeleton className="h-10 w-48" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-5 w-28" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-5 w-20" /></td>
                  <td className="px-4 py-3"><Skeleton className="ml-auto h-5 w-16" /></td>
                  <td className="px-4 py-3"><Skeleton className="ml-auto h-5 w-10" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-5 w-20" /></td>
                  <td className="px-4 py-3"><Skeleton className="ml-auto h-5 w-24" /></td>
                </tr>
              ))}
            {!query.isLoading && items.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    title="No products match"
                    description="Try clearing your filters or search terms."
                  />
                </td>
              </tr>
            )}
            {items.map((p) => (
              <tr key={p.id || p.slug} className="hover:bg-surface-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {p.primary_image ? (
                      <img
                        src={p.primary_image}
                        alt=""
                        className="h-10 w-10 rounded-md border border-surface-200 object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-md border border-dashed border-surface-300 bg-surface-50" />
                    )}
                    <div className="min-w-0">
                      <Link
                        to={paths.productDetail(p.slug)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate font-medium text-text-primary hover:text-accent-600"
                      >
                        {p.name}
                      </Link>
                      <div className="flex items-center gap-2 text-xs text-text-secondary">
                        <span>/{p.slug}</span>
                        {p.sku && <span>· SKU {p.sku}</span>}
                        {p.average_rating != null && (
                          <span className="inline-flex items-center gap-0.5">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            {Number(p.average_rating).toFixed(1)}
                            {p.review_count != null && ` (${p.review_count})`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {p.vendor_name || '—'}
                </td>
                <td className="px-4 py-3 text-text-secondary">{p.brand || '—'}</td>
                <td className="px-4 py-3 text-right font-medium text-text-primary">
                  {formatPrice(p.effective_price || p.base_price)}
                </td>
                <td className="px-4 py-3 text-right text-text-secondary">
                  {p.stock_quantity ?? '—'}
                </td>
                <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setModerateTarget(p)}
                      className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-surface-50"
                    >
                      Moderate
                    </button>
                    <button
                      type="button"
                      onClick={() => setArchiveTarget(p)}
                      className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                    >
                      <Archive className="h-3.5 w-3.5" /> Archive
                    </button>
                    <div className="relative">
                      <button
                        type="button"
                        aria-haspopup="menu"
                        aria-expanded={menuOpenFor === p.slug}
                        aria-label={`More actions for ${p.name}`}
                        onClick={() =>
                          setMenuOpenFor(menuOpenFor === p.slug ? null : p.slug)
                        }
                        className="rounded-md border border-border p-1 text-text-secondary hover:bg-surface-50"
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                      {menuOpenFor === p.slug && (
                        <div
                          role="menu"
                          className="absolute right-0 z-10 mt-1 w-44 rounded-md border border-surface-200 bg-surface py-1 text-left shadow-lg"
                          onMouseLeave={() => setMenuOpenFor(null)}
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMenuOpenFor(null);
                              setHideReason('');
                              setHideTarget(p);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-50"
                          >
                            <EyeOff className="h-3.5 w-3.5" /> Hide
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMenuOpenFor(null);
                              setRestoreTarget(p);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-50"
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Restore
                          </button>
                          <hr className="my-1 border-surface-200" />
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMenuOpenFor(null);
                              setHardDeleteReason('');
                              setHardDeleteTarget(p);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Hard delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {meta && (meta.next || meta.previous) && (
        <div className="flex items-center justify-between text-xs text-text-secondary">
          <span>Page {meta.page || 1}</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!meta.previous}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('page', String(Math.max(1, Number(meta.page || 1) - 1)));
                setParams(next);
              }}
              className={cn(
                'rounded-md border px-2.5 py-1',
                meta.previous
                  ? 'border-border bg-surface hover:bg-surface-50'
                  : 'cursor-not-allowed border-surface-200 bg-surface-50 opacity-60',
              )}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!meta.next}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('page', String(Number(meta.page || 1) + 1));
                setParams(next);
              }}
              className={cn(
                'rounded-md border px-2.5 py-1',
                meta.next
                  ? 'border-border bg-surface hover:bg-surface-50'
                  : 'cursor-not-allowed border-surface-200 bg-surface-50 opacity-60',
              )}
            >
              Next
            </button>
          </div>
        </div>
      )}

      <ModerateModal
        target={moderateTarget}
        onClose={() => setModerateTarget(null)}
        onConfirm={(status, reason) =>
          moderateMutation.mutate({ id: moderateTarget.id, status, reason })
        }
        loading={moderateMutation.isPending}
      />

      <Modal
        open={Boolean(archiveTarget)}
        onClose={() => {
          setArchiveTarget(null);
          setArchiveReason('');
        }}
        title="Archive product?"
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setArchiveTarget(null);
                setArchiveReason('');
              }}
              className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                archiveMutation.mutate({ id: archiveTarget.id, reason: archiveReason })
              }
              disabled={archiveMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-danger px-4 py-2 text-sm font-semibold text-white hover:bg-danger/90 disabled:opacity-60"
            >
              <Archive className="h-4 w-4" />
              {archiveMutation.isPending ? 'Archiving…' : 'Archive product'}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="text-text-secondary">
            <span className="font-medium text-text-primary">
              {archiveTarget?.name}
            </span>{' '}
            will be removed from the public catalog. Vendors can no
            longer edit it; you can restore from the database.
          </p>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Reason (optional, visible to vendor)
            </span>
            <textarea
              rows={3}
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              maxLength={2000}
              className="w-full rounded-md border border-border bg-surface p-2 text-sm"
              placeholder="e.g. Reported copyright infringement…"
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={Boolean(hideTarget)}
        onClose={() => {
          setHideTarget(null);
          setHideReason('');
        }}
        title="Hide product?"
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setHideTarget(null);
                setHideReason('');
              }}
              className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                hideMutation.mutate({ slug: hideTarget.slug, reason: hideReason })
              }
              disabled={hideMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-60"
            >
              <EyeOff className="h-4 w-4" />
              {hideMutation.isPending ? 'Hiding…' : 'Hide product'}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="text-text-secondary">
            <span className="font-medium text-text-primary">
              {hideTarget?.name}
            </span>{' '}
            will be hidden from the public catalog. You can restore it later
            from the same menu.
          </p>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Reason (optional)
            </span>
            <textarea
              rows={3}
              value={hideReason}
              onChange={(e) => setHideReason(e.target.value)}
              maxLength={2000}
              className="w-full rounded-md border border-border bg-surface p-2 text-sm"
              placeholder="Why is this being hidden?"
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={Boolean(restoreTarget)}
        onClose={() => setRestoreTarget(null)}
        title="Restore product?"
        footer={
          <>
            <button
              type="button"
              onClick={() => setRestoreTarget(null)}
              className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                restoreMutation.mutate({ slug: restoreTarget.slug, reason: '' })
              }
              disabled={restoreMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-60"
            >
              <RotateCcw className="h-4 w-4" />
              {restoreMutation.isPending ? 'Restoring…' : 'Restore product'}
            </button>
          </>
        }
      >
        <div className="space-y-2 text-sm text-text-secondary">
          <p>
            <span className="font-medium text-text-primary">
              {restoreTarget?.name}
            </span>{' '}
            will be set back to <span className="font-medium">Active</span>{' '}
            and re-listed in the public catalog.
          </p>
        </div>
      </Modal>

      <Modal
        open={Boolean(hardDeleteTarget)}
        onClose={() => {
          setHardDeleteTarget(null);
          setHardDeleteReason('');
        }}
        title="Permanently delete product?"
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setHardDeleteTarget(null);
                setHardDeleteReason('');
              }}
              className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                hardDeleteMutation.mutate({
                  slug: hardDeleteTarget.slug,
                  reason: hardDeleteReason,
                })
              }
              disabled={
                hardDeleteMutation.isPending ||
                hardDeleteReason.trim().length < 3
              }
              className="inline-flex items-center gap-1.5 rounded-md bg-danger px-4 py-2 text-sm font-semibold text-white hover:bg-danger/90 disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
              {hardDeleteMutation.isPending ? 'Deleting…' : 'Delete forever'}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="text-text-secondary">
            <span className="font-medium text-text-primary">
              {hardDeleteTarget?.name}
            </span>{' '}
            will be <span className="font-semibold text-red-700">permanently
            removed</span> from the database. This is irreversible and
            cannot be undone.
          </p>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Reason (required, ≥ 3 characters — recorded in audit log)
            </span>
            <textarea
              rows={3}
              value={hardDeleteReason}
              onChange={(e) => setHardDeleteReason(e.target.value)}
              maxLength={2000}
              className="w-full rounded-md border border-border bg-surface p-2 text-sm"
              placeholder="e.g. Test fixture, copyright violation…"
            />
          </label>
        </div>
      </Modal>
    </div>
  );
};

const STATUS_OPTIONS = [
  { value: PRODUCT_STATUS.ACTIVE, label: 'Publish (Active)', icon: Play, tone: 'green' },
  { value: PRODUCT_STATUS.PAUSED, label: 'Pause', icon: Pause, tone: 'amber' },
  { value: PRODUCT_STATUS.HIDDEN, label: 'Hide', icon: EyeOff, tone: 'slate' },
];

const ModerateModal = ({ target, onClose, onConfirm, loading }) => {
  const [status, setStatus] = useState(PRODUCT_STATUS.ACTIVE);
  const [reason, setReason] = useState('');

  // Reset when target changes
  useMemo(() => {
    if (target) {
      setStatus(PRODUCT_STATUS.ACTIVE);
      setReason('');
    }
  }, [target]);

  if (!target) return null;

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title={`Moderate · ${target.name}`}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(status, reason)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-60"
          >
            <Check className="h-4 w-4" />
            {loading ? 'Saving…' : 'Apply status'}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-text-secondary">
          Current status: <StatusBadge status={target.status} />
        </p>
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
            New status
          </p>
          <div className="space-y-1.5">
            {STATUS_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                  status === opt.value
                    ? 'border-accent-500 bg-accent-500/10'
                    : 'border-border hover:bg-surface-50',
                )}
              >
                <input
                  type="radio"
                  name="moderation-status"
                  value={opt.value}
                  checked={status === opt.value}
                  onChange={() => setStatus(opt.value)}
                  className="sr-only"
                />
                <opt.icon className="h-4 w-4 text-text-secondary" />
                <span className="font-medium text-text-primary">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Note (optional, internal)
          </span>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={2000}
            className="w-full rounded-md border border-border bg-surface p-2 text-sm"
            placeholder="Why is this change being made?"
          />
        </label>
      </div>
    </Modal>
  );
};

export default AdminProductsListPage;
