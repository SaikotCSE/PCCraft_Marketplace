// AdminCategoriesListPage — Module 9 admin CRUD over Category tree.
//
// Spec: list (flat with parent slug), search, create/edit form on a
// separate route, soft-delete with restore.
import { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Search, RotateCcw, Trash2, FolderTree } from 'lucide-react';
import toast from 'react-hot-toast';

import { usePageTitle } from '@/hooks/usePageTitle';
import EmptyState from '@components/common/EmptyState';
import Skeleton from '@components/common/Skeleton';
import StatusBadge from '@components/common/StatusBadge';
import ConfirmDialog from '@components/common/ConfirmDialog';
import { adminService } from '@services/adminService';
import { paths } from '@/routes/routePaths';
import { cn } from '@/utils/cn';

const PAGE_SIZE = 25;

const AdminCategoriesListPage = () => {
  usePageTitle('Categories · Admin · PCCraft');
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [view, setView] = useState('flat'); // 'flat' | 'tree'
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

  const flatQuery = useQuery({
    queryKey: ['admin', 'categories', filters],
    queryFn: () => adminService.listCategories(filters),
    enabled: view === 'flat',
    keepPreviousData: true,
  });

  const treeQuery = useQuery({
    queryKey: ['admin', 'categories', 'tree'],
    queryFn: () => adminService.categoryTree(),
    enabled: view === 'tree',
  });

  const restoreMutation = useMutation({
    mutationFn: (slug) => adminService.restoreCategory(slug),
    onSuccess: () => {
      toast.success('Category restored');
      queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
    },
    onError: (err) =>
      toast.error(err?.response?.data?.error?.message || 'Restore failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (slug) => adminService.deleteCategory(slug),
    onSuccess: () => {
      toast.success('Category archived');
      queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
      setConfirmDelete(null);
    },
    onError: (err) =>
      toast.error(err?.response?.data?.error?.message || 'Delete failed'),
  });

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

  const flatItems = Array.isArray(flatQuery.data) ? flatQuery.data : [];
  const treeData = Array.isArray(treeQuery.data) ? treeQuery.data : [];
  const meta = flatQuery.data?.meta;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-text-primary">
            Categories
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Maintain the product taxonomy tree (max depth: 2 levels).
          </p>
        </div>
        <Link
          to={paths.adminCategoryNew()}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent-500 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-accent-600"
        >
          <Plus className="h-4 w-4" /> New category
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={onSearch} className="flex flex-1 items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
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

        <div className="inline-flex rounded-md border border-border bg-surface p-0.5 text-xs">
          {[
            { v: 'flat', label: 'List' },
            { v: 'tree', label: 'Tree' },
          ].map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => setView(opt.v)}
              className={cn(
                'rounded px-3 py-1 font-medium transition-colors',
                view === opt.v
                  ? 'bg-accent-500 text-white'
                  : 'text-text-secondary hover:bg-surface-100',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'tree' ? (
        <CategoryTreeView
          tree={treeData}
          loading={treeQuery.isLoading}
          onRestore={(slug) => restoreMutation.mutate(slug)}
          onDelete={setConfirmDelete}
          restoring={restoreMutation.isPending}
        />
      ) : (
        <>
          <CategoryTable
            items={flatItems}
            loading={flatQuery.isLoading}
            onRestore={(slug) => restoreMutation.mutate(slug)}
            onDelete={setConfirmDelete}
            restoring={restoreMutation.isPending}
          />

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
        </>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => deleteMutation.mutate(confirmDelete?.slug)}
        title="Archive category?"
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

const CategoryTable = ({ items, loading, onRestore, onDelete, restoring }) => (
  <div className="overflow-hidden rounded-xl border border-surface-200 bg-surface shadow-sm">
    <table className="min-w-full divide-y divide-surface-200 text-sm">
      <thead className="bg-surface-50">
        <tr>
          <th className="px-4 py-2 text-left font-semibold text-text-secondary">Name</th>
          <th className="px-4 py-2 text-left font-semibold text-text-secondary">Slug</th>
          <th className="px-4 py-2 text-left font-semibold text-text-secondary">Parent</th>
          <th className="px-4 py-2 text-left font-semibold text-text-secondary">Products</th>
          <th className="px-4 py-2 text-left font-semibold text-text-secondary">Status</th>
          <th className="px-4 py-2 text-right font-semibold text-text-secondary">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-surface-100">
        {loading &&
          Array.from({ length: 6 }).map((_, i) => (
            <tr key={`sk-${i}`}>
              <td className="px-4 py-3"><Skeleton className="h-5 w-32" /></td>
              <td className="px-4 py-3"><Skeleton className="h-5 w-24" /></td>
              <td className="px-4 py-3"><Skeleton className="h-5 w-20" /></td>
              <td className="px-4 py-3"><Skeleton className="h-5 w-12" /></td>
              <td className="px-4 py-3"><Skeleton className="h-5 w-16" /></td>
              <td className="px-4 py-3"><Skeleton className="ml-auto h-5 w-20" /></td>
            </tr>
          ))}
        {!loading && items.length === 0 && (
          <tr>
            <td colSpan={6}>
              <EmptyState
                icon={FolderTree}
                title="No categories yet"
                description="Create your first category to start organising products."
              />
            </td>
          </tr>
        )}
        {items.map((cat) => (
          <tr key={cat.id || cat.slug} className="hover:bg-surface-50">
            <td className="px-4 py-3 font-medium text-text-primary">
              <Link
                to={paths.adminCategoryEdit(cat.slug)}
                className="hover:text-accent-600"
              >
                {cat.name}
              </Link>
            </td>
            <td className="px-4 py-3 text-text-secondary">{cat.slug}</td>
            <td className="px-4 py-3 text-text-secondary">
              {cat.parent?.slug || cat.parent || '—'}
            </td>
            <td className="px-4 py-3 text-text-secondary">
              {cat.product_count ?? '—'}
            </td>
            <td className="px-4 py-3">
              {cat.is_active === false ? (
                <StatusBadge status="INACTIVE" />
              ) : (
                <StatusBadge status="ACTIVE" />
              )}
            </td>
            <td className="px-4 py-3 text-right">
              <div className="inline-flex items-center gap-1">
                <Link
                  to={paths.adminCategoryEdit(cat.slug)}
                  className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-surface-50"
                >
                  Edit
                </Link>
                {cat.is_active === false ? (
                  <button
                    type="button"
                    onClick={() => onRestore(cat.slug)}
                    disabled={restoring}
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Restore
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onDelete(cat)}
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
);

const CategoryTreeView = ({ tree, loading, onRestore, onDelete, restoring }) => {
  if (loading) {
    return (
      <div className="rounded-xl border border-surface-200 bg-surface p-4">
        <Skeleton className="h-5 w-40" />
        <div className="mt-3 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      </div>
    );
  }
  if (!tree.length) {
    return (
      <EmptyState
        icon={FolderTree}
        title="No categories yet"
        description="Create your first category to start organising products."
      />
    );
  }
  return (
    <div className="rounded-xl border border-surface-200 bg-surface p-3">
      {tree.map((root) => (
        <TreeNode key={root.id || root.slug} node={root} depth={0} onRestore={onRestore} onDelete={onDelete} restoring={restoring} />
      ))}
    </div>
  );
};

const TreeNode = ({ node, depth, onRestore, onDelete, restoring }) => (
  <div>
    <div
      className="group flex items-center justify-between rounded-md py-1.5 pr-2 text-sm hover:bg-surface-50"
      style={{ paddingLeft: depth * 18 + 4 }}
    >
      <div className="flex items-center gap-2">
        <FolderTree className="h-4 w-4 text-text-secondary" />
        <Link
          to={paths.adminCategoryEdit(node.slug)}
          className="font-medium text-text-primary hover:text-accent-600"
        >
          {node.name}
        </Link>
        <span className="text-xs text-text-secondary">/{node.slug}</span>
        {node.is_active === false && <StatusBadge status="INACTIVE" size="sm" />}
      </div>
      <div className="opacity-0 transition-opacity group-hover:opacity-100">
        {node.is_active === false ? (
          <button
            type="button"
            onClick={() => onRestore(node.slug)}
            disabled={restoring}
            className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
          >
            Restore
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onDelete(node)}
            className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700"
          >
            Archive
          </button>
        )}
      </div>
    </div>
    {(node.children || []).map((child) => (
      <TreeNode
        key={child.id || child.slug}
        node={child}
        depth={depth + 1}
        onRestore={onRestore}
        onDelete={onDelete}
        restoring={restoring}
      />
    ))}
  </div>
);

export default AdminCategoriesListPage;
