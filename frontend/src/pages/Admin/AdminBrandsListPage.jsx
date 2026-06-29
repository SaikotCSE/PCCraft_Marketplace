// AdminBrandsListPage — Module 9 admin CRUD over Brand.
//
// Spec: list, filter (q, is_deleted), create/edit form on a separate
// route, soft-delete with restore, logo upload (optional, file URL).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Search, RotateCcw, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { usePageTitle } from '@/hooks/usePageTitle';
import EmptyState from '@components/common/EmptyState';
import Skeleton from '@components/common/Skeleton';
import StatusBadge from '@components/common/StatusBadge';
import ConfirmDialog from '@components/common/ConfirmDialog';
import { adminService } from '@services/adminService';
import { paths } from '@/routes/routePaths';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/formatters';

const PAGE_SIZE = 20;

const AdminBrandsListPage = () => {
  usePageTitle('Brands · Admin · PCCraft');
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const queryClient = useQueryClient();

  const filters = useMemo(
    () => ({
      q: q.trim() || undefined,
      page: Number(params.get('page') || 1),
      page_size: PAGE_SIZE,
    }),
    [q, params],
  );

  const query = useQuery({
    queryKey: ['admin', 'brands', filters],
    queryFn: () => adminService.listBrands(filters),
    keepPreviousData: true,
  });

  const restoreMutation = useMutation({
    mutationFn: (slug) => adminService.restoreBrand(slug),
    onSuccess: () => {
      toast.success('Brand restored');
      queryClient.invalidateQueries({ queryKey: ['admin', 'brands'] });
    },
    onError: (err) =>
      toast.error(err?.response?.data?.error?.message || 'Restore failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (slug) => adminService.deleteBrand(slug),
    onSuccess: () => {
      toast.success('Brand archived');
      queryClient.invalidateQueries({ queryKey: ['admin', 'brands'] });
      setConfirmDelete(null);
    },
    onError: (err) =>
      toast.error(err?.response?.data?.error?.message || 'Delete failed'),
  });

  const items = Array.isArray(query.data) ? query.data : [];
  const meta = query.data?.meta;

  const onSearch = useCallback(
    (e) => {
      e.preventDefault();
      const next = new URLSearchParams(params);
      if (q.trim()) next.set('q', q.trim());
      else next.delete('q');
      next.delete('page');
      setParams(next);
    },
    [q, params, setParams],
  );

  useEffect(() => {
    // Reset to page 1 if the search box is cleared.
    if (q === '' && params.get('q')) {
      const next = new URLSearchParams(params);
      next.delete('q');
      next.delete('page');
      setParams(next);
    }
  }, [q, params, setParams]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-text-primary">
            Brands
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Manage the catalog of product brands available to vendors.
          </p>
        </div>
        <Link
          to={paths.adminBrandNew()}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent-500 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-accent-600"
        >
          <Plus className="h-4 w-4" /> New brand
        </Link>
      </header>

      <form
        onSubmit={onSearch}
        className="flex flex-wrap items-center gap-2 rounded-lg border border-surface-200 bg-surface-50 p-3"
      >
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-text-secondary" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or slug…"
            className="w-full rounded-md border border-border bg-surface py-1.5 pl-8 pr-3 text-sm focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
          />
        </div>
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
              <th className="px-4 py-2 text-left font-semibold text-text-secondary">Name</th>
              <th className="px-4 py-2 text-left font-semibold text-text-secondary">Slug</th>
              <th className="px-4 py-2 text-left font-semibold text-text-secondary">Status</th>
              <th className="px-4 py-2 text-left font-semibold text-text-secondary">Created</th>
              <th className="px-4 py-2 text-right font-semibold text-text-secondary">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {query.isLoading && (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  <td className="px-4 py-3"><Skeleton className="h-5 w-32" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-5 w-24" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-5 w-16" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-5 w-24" /></td>
                  <td className="px-4 py-3"><Skeleton className="ml-auto h-5 w-20" /></td>
                </tr>
              ))
            )}
            {!query.isLoading && items.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    title="No brands yet"
                    description="Create your first brand to start organising products."
                  />
                </td>
              </tr>
            )}
            {items.map((brand) => (
              <tr key={brand.id || brand.slug} className="hover:bg-surface-50">
                <td className="px-4 py-3 font-medium text-text-primary">
                  <Link
                    to={paths.adminBrandEdit(brand.slug)}
                    className="hover:text-accent-600"
                  >
                    {brand.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-text-secondary">{brand.slug}</td>
                <td className="px-4 py-3">
                  {brand.is_deleted || brand.deleted_at ? (
                    <StatusBadge status="ARCHIVED" />
                  ) : brand.is_active === false ? (
                    <StatusBadge status="INACTIVE" />
                  ) : (
                    <StatusBadge status="ACTIVE" />
                  )}
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {formatDate(brand.created_at)}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-1">
                    <Link
                      to={paths.adminBrandEdit(brand.slug)}
                      className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-surface-50"
                    >
                      Edit
                    </Link>
                    {brand.is_deleted || brand.deleted_at ? (
                      <button
                        type="button"
                        onClick={() => restoreMutation.mutate(brand.slug)}
                        disabled={restoreMutation.isPending}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Restore
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(brand)}
                        className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Archive
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {meta && (meta.next || meta.previous) && (
        <div className="flex items-center justify-between text-xs text-text-secondary">
          <span>
            Page {meta.page || 1}
            {meta.total_count != null && ` of ${Math.max(1, Math.ceil(meta.total_count / PAGE_SIZE))}`}
          </span>
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
                'rounded-md border px-2.5 py-1 text-xs',
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
                'rounded-md border px-2.5 py-1 text-xs',
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

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => deleteMutation.mutate(confirmDelete?.slug)}
        title="Archive brand?"
        description={
          confirmDelete
            ? `“${confirmDelete.name}” will be hidden from the public catalog. You can restore it later.`
            : ''
        }
        confirmLabel="Archive"
        loading={deleteMutation.isPending}
      />

      {deleteMutation.isPending && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30">
          <Loader2 className="h-6 w-6 animate-spin text-white" />
        </div>
      )}
    </div>
  );
};

export default AdminBrandsListPage;
