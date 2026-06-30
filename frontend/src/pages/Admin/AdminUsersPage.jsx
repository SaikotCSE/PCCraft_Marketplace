// AdminUsersPage — Module 9 admin user-management console.
//
// Spec §2.9:
//   • Filterable table (search by name/email, role filter, status filter)
//   • Columns: avatar+name, email, role badge, status chip (active/inactive/
//     locked), joined date + last seen
//   • Row actions: Unlock (locked accounts), Suspend (modal w/ reason),
//     Activate, Change Role, Delete (soft, ConfirmDialog)
//
// The admin user serializer (`AdminUserSerializer`) exposes:
//   id, email, full_name, phone, role, is_active, is_staff, is_locked,
//   failed_login_attempts, last_failed_login, date_joined, last_login,
//   vendor_status (vendor's application status, if any).
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eraser,
  Filter,
  KeyRound,
  Loader2,
  Lock,
  LockOpen,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { usePageTitle } from '@/hooks/usePageTitle';
import ConfirmDialog from '@components/common/ConfirmDialog';
import EmptyState from '@components/common/EmptyState';
import Modal from '@components/common/Modal';
import Skeleton from '@components/common/Skeleton';
import StatusBadge from '@components/common/StatusBadge';
import { adminService } from '@services/adminService';
import { ROLES, ROLE_LABELS } from '@/utils/constants';
import { cn } from '@/utils/cn';
import { formatDate, formatDateTime } from '@/utils/formatters';

const PAGE_SIZE = 20;

// ---------- helpers ----------------------------------------------------

const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'locked', label: 'Locked' },
];

const ROLE_FILTERS = [
  { value: '', label: 'All roles' },
  ...Object.values(ROLES).map((r) => ({ value: r, label: ROLE_LABELS[r] || r })),
];

/**
 * Render initials + coloured background for an avatar-less user.
 */
function getInitials(name, email) {
  const source = (name && name.trim()) || (email && email.split('@')[0]) || '?';
  return source
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const AVATAR_PALETTE = [
  'bg-rose-200 text-rose-800',
  'bg-amber-200 text-amber-800',
  'bg-emerald-200 text-emerald-800',
  'bg-sky-200 text-sky-800',
  'bg-violet-200 text-violet-800',
  'bg-pink-200 text-pink-800',
];

function initialsClass(seed) {
  let h = 0;
  for (let i = 0; i < (seed || '').length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

// ---------- page -------------------------------------------------------

const AdminUsersPage = () => {
  usePageTitle('Users · Admin · PCCraft');
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const [suspendTarget, setSuspendTarget] = useState(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [roleTarget, setRoleTarget] = useState(null);
  const [pendingRole, setPendingRole] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [hardDeleteTarget, setHardDeleteTarget] = useState(null);
  const [hardDeleteConfirm, setHardDeleteConfirm] = useState('');
  const [hardDeleteReason, setHardDeleteReason] = useState('');

  // Debounce search → query string.
  const [appliedSearch, setAppliedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setAppliedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page when filters change.
  useEffect(() => {
    setPage(1);
  }, [appliedSearch, role, status]);

  const filters = useMemo(
    () => ({
      search: appliedSearch || undefined,
      role: role || undefined,
      status: status || undefined,
      page,
      page_size: PAGE_SIZE,
    }),
    [appliedSearch, role, status, page],
  );

  const query = useQuery({
    queryKey: ['admin', 'users', filters],
    queryFn: () => adminService.listUsers(filters),
    keepPreviousData: true,
  });

  // ---------- mutations ----------------------------------------------

  const suspendMutation = useMutation({
    mutationFn: ({ id, reason }) => adminService.suspendUser(id, { reason }),
    onSuccess: () => {
      toast.success('User suspended');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setSuspendTarget(null);
      setSuspendReason('');
    },
    onError: (err) =>
      toast.error(err?.response?.data?.error?.message || 'Suspend failed'),
  });

  const activateMutation = useMutation({
    mutationFn: (id) => adminService.activateUser(id),
    onSuccess: () => {
      toast.success('User activated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err) =>
      toast.error(err?.response?.data?.error?.message || 'Activate failed'),
  });

  const unlockMutation = useMutation({
    mutationFn: (id) => adminService.unlockUser(id),
    onSuccess: () => {
      toast.success('Account unlocked');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err) =>
      toast.error(err?.response?.data?.error?.message || 'Unlock failed'),
  });

  const changeRoleMutation = useMutation({
    mutationFn: ({ id, role: nextRole }) => adminService.changeUserRole(id, nextRole),
    onSuccess: () => {
      toast.success('Role updated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setRoleTarget(null);
      setPendingRole('');
    },
    onError: (err) =>
      toast.error(err?.response?.data?.error?.message || 'Role change failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => adminService.deleteUser(id),
    onSuccess: () => {
      toast.success('User deactivated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setDeleteTarget(null);
    },
    onError: (err) =>
      toast.error(err?.response?.data?.error?.message || 'Delete failed'),
  });

  const hardDeleteMutation = useMutation({
    mutationFn: ({ id, reason }) =>
      adminService.hardDeleteUser(id, { reason }),
    onSuccess: (snapshot) => {
      toast.success(
        `User ${snapshot?.email || ''} permanently deleted. They can re-register with the same email.`,
      );
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setHardDeleteTarget(null);
      setHardDeleteConfirm('');
      setHardDeleteReason('');
    },
    onError: (err) =>
      toast.error(
        err?.response?.data?.error?.message || 'Permanent delete failed',
      ),
  });

  // ---------- derived -------------------------------------------------

  // `unwrap` peels the envelope → response is `{data: [...], meta: {pagination: {...}}}`.
  const results = Array.isArray(query.data?.data)
    ? query.data.data
    : Array.isArray(query.data)
    ? query.data
    : [];
  const pagination = query.data?.meta?.pagination || {};
  const totalCount = pagination.total_items ?? results.length;
  const totalPages =
    pagination.total_pages ?? Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const onSearchSubmit = (e) => {
    e.preventDefault();
    setAppliedSearch(search.trim());
  };

  // ---------- render --------------------------------------------------

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-text-primary">
            Users
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Manage all platform accounts · {totalCount.toLocaleString()} total
          </p>
        </div>
      </header>

      {/* ----- filter bar ----------------------------------------- */}
      <form
        onSubmit={onSearchSubmit}
        className="flex flex-wrap items-center gap-2 rounded-lg border border-surface-200 bg-surface-50 p-3"
      >
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-text-secondary" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded-md border border-border bg-surface py-1.5 pl-8 pr-3 text-sm focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
          />
        </div>
        <div className="flex items-center gap-1.5 text-xs text-text-secondary">
          <Filter className="h-3.5 w-3.5" />
          <span>Filter</span>
        </div>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded-md border border-border bg-surface py-1.5 pl-2 pr-7 text-sm focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
        >
          {ROLE_FILTERS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
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
      </form>

      {/* ----- table ---------------------------------------------- */}
      <div className="overflow-hidden rounded-xl border border-surface-200 bg-surface shadow-sm">
        {query.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : results.length === 0 ? (
          <EmptyState
            title="No users match your filters"
            description="Try clearing the search box or changing the role/status filter."
            className="border-0 bg-transparent py-12"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-surface-200 bg-surface-50 text-left text-xs uppercase tracking-wide text-text-secondary">
                <tr>
                  <th className="px-4 py-2.5">User</th>
                  <th className="px-4 py-2.5">Email</th>
                  <th className="px-4 py-2.5">Role</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Joined</th>
                  <th className="px-4 py-2.5">Last seen</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {results.map((u) => {
                  const initials = getInitials(u.full_name, u.email);
                  const isAdmin = u.role === ROLES.ADMIN;
                  return (
                    <tr
                      key={u.id}
                      className="border-b border-surface-100 last:border-0 hover:bg-surface-50/60"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              'flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold',
                              initialsClass(u.id || u.email),
                            )}
                            aria-hidden="true"
                          >
                            {initials}
                          </span>
                          <div>
                            <p className="font-medium text-text-primary">
                              {u.full_name || '—'}
                            </p>
                            {u.phone && (
                              <p className="text-xs text-text-secondary">{u.phone}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary">{u.email}</td>
                      <td className="px-4 py-2.5">
                        <RoleBadge role={u.role} />
                      </td>
                      <td className="px-4 py-2.5">
                        <UserStatusCell u={u} />
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary">
                        {formatDate(u.date_joined)}
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary">
                        {u.last_login ? formatDateTime(u.last_login) : 'Never'}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          {u.is_locked && (
                            <IconAction
                              icon={LockOpen}
                              label="Unlock"
                              tone="amber"
                              onClick={() => unlockMutation.mutate(u.id)}
                              loading={unlockMutation.isPending && unlockMutation.variables === u.id}
                            />
                          )}
                          {u.is_active ? (
                            <IconAction
                              icon={UserX}
                              label="Suspend"
                              tone="amber"
                              onClick={() => {
                                setSuspendTarget(u);
                                setSuspendReason('');
                              }}
                            />
                          ) : (
                            <IconAction
                              icon={UserCheck}
                              label="Activate"
                              tone="emerald"
                              onClick={() => activateMutation.mutate(u.id)}
                              loading={
                                activateMutation.isPending && activateMutation.variables === u.id
                              }
                            />
                          )}
                          <IconAction
                            icon={KeyRound}
                            label="Change role"
                            onClick={() => {
                              setRoleTarget(u);
                              setPendingRole(u.role);
                            }}
                          />
                          {!isAdmin && (
                            <IconAction
                              icon={Trash2}
                              label="Delete"
                              tone="rose"
                              onClick={() => setDeleteTarget(u)}
                            />
                          )}
                          {!isAdmin && (
                            <IconAction
                              icon={Eraser}
                              label="Delete permanently"
                              tone="rose"
                              onClick={() => {
                                setHardDeleteTarget(u);
                                setHardDeleteConfirm('');
                                setHardDeleteReason('');
                              }}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ----- pagination --------------------------------------- */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-surface-200 bg-surface-50 px-4 py-2.5 text-xs text-text-secondary">
            <span>
              Page {page} of {totalPages} · {totalCount.toLocaleString()} users
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

      {/* ----- modals --------------------------------------------- */}

      <Modal
        open={Boolean(suspendTarget)}
        onClose={() =>
          suspendMutation.isPending ? null : setSuspendTarget(null)
        }
        title="Suspend user"
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setSuspendTarget(null)}
              disabled={suspendMutation.isPending}
              className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                suspendMutation.mutate({
                  id: suspendTarget.id,
                  reason: suspendReason.trim() || 'No reason provided.',
                })
              }
              disabled={suspendMutation.isPending}
              className="inline-flex items-center justify-center rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600 disabled:opacity-60"
            >
              {suspendMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Suspend'
              )}
            </button>
          </>
        }
      >
        {suspendTarget && (
          <div className="space-y-3 text-sm text-text-secondary">
            <p>
              You are about to suspend{' '}
              <strong className="text-text-primary">
                {suspendTarget.full_name || suspendTarget.email}
              </strong>
              . They will be unable to sign in until reactivated.
            </p>
            <label className="block text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Reason (optional, stored in audit log)
            </label>
            <textarea
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="e.g. Multiple chargebacks, TOS violation, etc."
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
            />
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(roleTarget)}
        onClose={() =>
          changeRoleMutation.isPending ? null : setRoleTarget(null)
        }
        title="Change role"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setRoleTarget(null)}
              disabled={changeRoleMutation.isPending}
              className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                changeRoleMutation.mutate({ id: roleTarget.id, role: pendingRole })
              }
              disabled={changeRoleMutation.isPending || !pendingRole || pendingRole === roleTarget?.role}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {changeRoleMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Save role
            </button>
          </>
        }
      >
        {roleTarget && (
          <div className="space-y-3 text-sm text-text-secondary">
            <p>
              Updating role for{' '}
              <strong className="text-text-primary">
                {roleTarget.full_name || roleTarget.email}
              </strong>
              . Current role: <strong>{ROLE_LABELS[roleTarget.role] || roleTarget.role}</strong>.
            </p>
            <label className="block text-xs font-semibold uppercase tracking-wide text-text-secondary">
              New role
            </label>
            <select
              value={pendingRole}
              onChange={(e) => setPendingRole(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
            >
              {Object.values(ROLES).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r] || r}
                </option>
              ))}
            </select>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() =>
          deleteMutation.isPending ? null : setDeleteTarget(null)
        }
        onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        title={`Deactivate ${deleteTarget?.full_name || deleteTarget?.email || 'user'}?`}
        description="The account will be soft-deleted and the user will be unable to sign in. This action is logged and can be reversed by an administrator via the support tool."
        confirmLabel="Deactivate user"
        tone="danger"
        loading={deleteMutation.isPending}
      />

      {/*
        Hard-delete confirmation -- permanent removal from the DB.
        Requires the admin to type the literal string "DELETE" to enable
        the confirm button so a misclick can't wipe a real account.
        Reason is optional but recommended and is recorded in the audit log.
      */}
      <Modal
        open={Boolean(hardDeleteTarget)}
        onClose={() => {
          if (hardDeleteMutation.isPending) return;
          setHardDeleteTarget(null);
          setHardDeleteConfirm('');
          setHardDeleteReason('');
        }}
        size="sm"
        title={`Permanently delete ${
          hardDeleteTarget?.full_name || hardDeleteTarget?.email || 'user'
        }?`}
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                if (hardDeleteMutation.isPending) return;
                setHardDeleteTarget(null);
                setHardDeleteConfirm('');
                setHardDeleteReason('');
              }}
              disabled={hardDeleteMutation.isPending}
              className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                hardDeleteMutation.mutate({
                  id: hardDeleteTarget.id,
                  reason: hardDeleteReason.trim() || undefined,
                })
              }
              disabled={
                hardDeleteMutation.isPending ||
                hardDeleteConfirm.trim() !== 'DELETE'
              }
              className="inline-flex items-center justify-center rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-danger/90 focus:outline-none focus:ring-2 focus:ring-danger/40 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {hardDeleteMutation.isPending ? 'Deleting…' : 'Delete forever'}
            </button>
          </>
        }
      >
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
            <Eraser className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-3 text-sm text-text-secondary">
            <p>
              The account, profile, login attempts, and verification
              codes will be <strong className="text-text-primary">permanently
              removed</strong> from the database. The email
              {hardDeleteTarget?.email ? (
                <code className="mx-1 rounded bg-surface-100 px-1 py-0.5 text-xs">
                  {hardDeleteTarget.email}
                </code>
              ) : null}
              will become available for fresh registrations. This cannot
              be undone.
            </p>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Reason (optional, recorded in audit log)
              </span>
              <input
                type="text"
                value={hardDeleteReason}
                onChange={(e) => setHardDeleteReason(e.target.value)}
                placeholder="e.g. duplicate account, user-requested erasure"
                className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Type <span className="font-mono text-danger">DELETE</span> to confirm
              </span>
              <input
                type="text"
                value={hardDeleteConfirm}
                onChange={(e) => setHardDeleteConfirm(e.target.value)}
                placeholder="DELETE"
                autoComplete="off"
                className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
              />
            </label>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// ---------- sub-components --------------------------------------------

const RoleBadge = ({ role }) => {
  const tone =
    role === ROLES.ADMIN
      ? 'bg-rose-100 text-rose-700'
      : role === ROLES.VENDOR
      ? 'bg-violet-100 text-violet-700'
      : 'bg-blue-100 text-blue-700';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide',
        tone,
      )}
    >
      <ShieldCheck className="h-3 w-3" aria-hidden="true" />
      {ROLE_LABELS[role] || role}
    </span>
  );
};

const UserStatusCell = ({ u }) => {
  if (u.is_locked) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-rose-700">
        <Lock className="h-3 w-3" aria-hidden="true" />
        Locked
      </span>
    );
  }
  if (!u.is_active) {
    return <StatusBadge status="INACTIVE" size="sm" />;
  }
  return <StatusBadge status="ACTIVE" size="sm" />;
};

const IconAction = ({ icon: Icon, label, onClick, tone = 'slate', loading = false }) => {
  const toneCls = {
    slate: 'text-text-secondary hover:bg-surface-100',
    emerald: 'text-emerald-700 hover:bg-emerald-50',
    amber: 'text-amber-700 hover:bg-amber-50',
    rose: 'text-rose-700 hover:bg-rose-50',
  }[tone] || 'text-text-secondary hover:bg-surface-100';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-md transition disabled:cursor-not-allowed disabled:opacity-50',
        toneCls,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
    </button>
  );
};

export default AdminUsersPage;
