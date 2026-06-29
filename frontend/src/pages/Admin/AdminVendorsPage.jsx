// AdminVendorsPage — Module 9 vendor approval queue.
//
// Spec §2.9 (Module 9 — Admin Console):
//   - Four status tabs: PENDING / APPROVED / REJECTED / INFO_REQUESTED
//   - Each tab pulls `/admin/vendors/?status=...` via adminService
//   - Pending + INFO_REQUESTED rows expose approve/reject/request-info actions
//   - Approve + reject require a reason/message via Modal prompts
//
// AdminVendorApplicationSerializer exposes (verified against backend):
//   vendor_id, user_id, email, full_name, phone, is_user_active,
//   status, business_name, business_type, trade_license_number,
//   business_address, store_name, store_slug, store_description,
//   store_contact_email, rejection_reason, approved_at, approved_by,
//   created_at, updated_at.
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  Info,
  Loader2,
  Mail,
  Search,
  ShieldCheck,
  Store as StoreIcon,
  X,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { usePageTitle } from '@/hooks/usePageTitle';
import EmptyState from '@components/common/EmptyState';
import Modal from '@components/common/Modal';
import Skeleton from '@components/common/Skeleton';
import StatusBadge from '@components/common/StatusBadge';
import { adminService } from '@services/adminService';
import { cn } from '@/utils/cn';
import { formatDateTime } from '@/utils/formatters';

// ---------- constants -------------------------------------------------

const VENDOR_STATUS_TABS = [
  { value: 'PENDING', label: 'Pending review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'INFO_REQUESTED', label: 'Info requested' },
];

const PAGE_SIZE = 20;

// ---------- helpers ---------------------------------------------------

function businessAddressLine(address) {
  if (!address || typeof address !== 'object') return '';
  const { street, city, district, postal_code: postal } = address;
  return [street, city, district, postal].filter(Boolean).join(', ');
}

// ---------- page ------------------------------------------------------

const AdminVendorsPage = () => {
  usePageTitle('Vendors · Admin · PCCraft');
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('PENDING');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [appliedSearch, setAppliedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setAppliedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, appliedSearch]);

  const [expandedId, setExpandedId] = useState(null);
  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [infoTarget, setInfoTarget] = useState(null);
  const [infoMessage, setInfoMessage] = useState('');

  const filters = {
    status: activeTab,
    search: appliedSearch || undefined,
    page,
    page_size: PAGE_SIZE,
  };

  const query = useQuery({
    queryKey: ['admin', 'vendors', filters],
    queryFn: () => adminService.listVendors(filters),
    keepPreviousData: true,
  });

  const tabCounts = useVendorTabCounts();

  const approveMutation = useMutation({
    mutationFn: (id) => adminService.approveVendor(id),
    onSuccess: () => {
      toast.success('Vendor approved');
      queryClient.invalidateQueries({ queryKey: ['admin', 'vendors'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      setApproveTarget(null);
    },
    onError: (err) =>
      toast.error(err?.response?.data?.error?.message || 'Approve failed'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }) => adminService.rejectVendor(id, reason),
    onSuccess: () => {
      toast.success('Vendor rejected');
      queryClient.invalidateQueries({ queryKey: ['admin', 'vendors'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      setRejectTarget(null);
      setRejectReason('');
    },
    onError: (err) =>
      toast.error(err?.response?.data?.error?.message || 'Reject failed'),
  });

  const requestInfoMutation = useMutation({
    mutationFn: ({ id, message }) => adminService.requestInfoVendor(id, message),
    onSuccess: () => {
      toast.success('Info request sent');
      queryClient.invalidateQueries({ queryKey: ['admin', 'vendors'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setInfoTarget(null);
      setInfoMessage('');
    },
    onError: (err) =>
      toast.error(err?.response?.data?.error?.message || 'Request failed'),
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

  const canModerate = activeTab === 'PENDING' || activeTab === 'INFO_REQUESTED';

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-heading text-2xl font-bold text-text-primary">
          Vendors
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Approve new seller accounts, moderate rejected applications, and
          track info-request follow-ups.
        </p>
      </header>

      <div className="overflow-x-auto rounded-lg border border-surface-200 bg-surface">
        <nav className="flex min-w-max divide-x divide-surface-200">
          {VENDOR_STATUS_TABS.map((tab) => {
            const isActive = tab.value === activeTab;
            const count = tabCounts[tab.value];
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition',
                  isActive
                    ? 'bg-accent-500/10 text-accent-600'
                    : 'text-text-secondary hover:bg-surface-50',
                )}
              >
                <span>{tab.label}</span>
                <span
                  className={cn(
                    'inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-1.5 text-xs font-semibold',
                    isActive
                      ? 'bg-accent-500 text-white'
                      : 'bg-surface-200 text-text-secondary',
                  )}
                >
                  {count === undefined ? '…' : count}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setAppliedSearch(search.trim());
        }}
        className="rounded-lg border border-surface-200 bg-surface-50 p-3"
      >
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-text-secondary" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by store, owner, email…"
            className="w-full rounded-md border border-border bg-surface py-1.5 pl-8 pr-3 text-sm focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
          />
        </div>
      </form>

      <div className="space-y-3">
        {query.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))
        ) : results.length === 0 ? (
          <EmptyState
            title={`No ${activeTab.toLowerCase().replace('_', ' ')} vendors`}
            description={
              activeTab === 'PENDING'
                ? 'No new applications are waiting for review.'
                : `There are no vendors in the ${activeTab.toLowerCase().replace('_', ' ')} state right now.`
            }
            className="border-surface-200 bg-surface"
          />
        ) : (
          results.map((v) => (
            <VendorCard
              key={v.vendor_id}
              v={v}
              canModerate={canModerate}
              expanded={expandedId === v.vendor_id}
              onToggle={() =>
                setExpandedId(expandedId === v.vendor_id ? null : v.vendor_id)
              }
              onApprove={() => setApproveTarget(v)}
              onReject={() => {
                setRejectTarget(v);
                setRejectReason('');
              }}
              onRequestInfo={() => {
                setInfoTarget(v);
                setInfoMessage('');
              }}
            />
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-lg border border-surface-200 bg-surface-50 px-4 py-2.5 text-xs text-text-secondary">
          <span>
            Page {page} of {totalPages} · {totalCount.toLocaleString()} vendors
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

      <Modal
        open={Boolean(approveTarget)}
        onClose={() =>
          approveMutation.isPending ? null : setApproveTarget(null)
        }
        title="Approve vendor"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setApproveTarget(null)}
              disabled={approveMutation.isPending}
              className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => approveMutation.mutate(approveTarget.vendor_id)}
              disabled={approveMutation.isPending}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {approveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Approve application
            </button>
          </>
        }
      >
        {approveTarget && (
          <p className="text-sm text-text-secondary">
            Approve <strong className="text-text-primary">{approveTarget.store_name}</strong>{' '}
            owned by {approveTarget.full_name || approveTarget.email}? The vendor
            will gain full seller access and receive an approval email.
          </p>
        )}
      </Modal>

      <Modal
        open={Boolean(rejectTarget)}
        onClose={() =>
          rejectMutation.isPending ? null : setRejectTarget(null)
        }
        title="Reject vendor application"
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setRejectTarget(null)}
              disabled={rejectMutation.isPending}
              className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                rejectMutation.mutate({
                  id: rejectTarget.vendor_id,
                  reason: rejectReason.trim(),
                })
              }
              disabled={
                rejectMutation.isPending || rejectReason.trim().length < 5
              }
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {rejectMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              Reject application
            </button>
          </>
        }
      >
        {rejectTarget && (
          <div className="space-y-3 text-sm text-text-secondary">
            <p>
              Reject <strong className="text-text-primary">{rejectTarget.store_name}</strong>.
              The vendor will receive an email with your reason and instructions to update their application.
            </p>
            <label className="block text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Reason (required, at least 5 chars)
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="e.g. Trade license image is unreadable — please re-upload a clearer scan."
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
            />
            <p className="text-xs text-text-secondary">
              {rejectReason.trim().length}/1000
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(infoTarget)}
        onClose={() =>
          requestInfoMutation.isPending ? null : setInfoTarget(null)
        }
        title="Request additional information"
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setInfoTarget(null)}
              disabled={requestInfoMutation.isPending}
              className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                requestInfoMutation.mutate({
                  id: infoTarget.vendor_id,
                  message: infoMessage.trim(),
                })
              }
              disabled={
                requestInfoMutation.isPending || infoMessage.trim().length < 5
              }
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {requestInfoMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Info className="h-4 w-4" />
              )}
              Send request
            </button>
          </>
        }
      >
        {infoTarget && (
          <div className="space-y-3 text-sm text-text-secondary">
            <p>
              Send a request for more information to{' '}
              <strong className="text-text-primary">{infoTarget.store_name}</strong>.
              The application stays in <strong>INFO_REQUESTED</strong> state until they reply.
            </p>
            <label className="block text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Message to vendor (required, at least 5 chars)
            </label>
            <textarea
              value={infoMessage}
              onChange={(e) => setInfoMessage(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="e.g. Please upload your updated trade license — the current document is expired."
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
            />
            <p className="text-xs text-text-secondary">
              {infoMessage.trim().length}/1000
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
};

// ---------- sub-components --------------------------------------------

const VendorCard = ({
  v,
  canModerate,
  expanded,
  onToggle,
  onApprove,
  onReject,
  onRequestInfo,
}) => {
  const submitted = formatDateTime(v.created_at);
  const addr = businessAddressLine(v.business_address);
  return (
    <article
      className={cn(
        'rounded-xl border border-surface-200 bg-surface shadow-sm transition',
        expanded && 'ring-1 ring-accent-300',
      )}
    >
      <div className="flex flex-wrap items-start gap-4 p-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
          <StoreIcon className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading text-lg font-semibold text-text-primary">
              {v.store_name || v.business_name || 'Unnamed vendor'}
            </h3>
            <StatusBadge status={v.status} size="sm" />
            {!v.is_user_active && (
              <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                Account disabled
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-text-secondary">
            {v.full_name || '—'} · {v.email}
          </p>
          <p className="mt-0.5 text-xs text-text-secondary">
            Business: {v.business_name || '—'} ({v.business_type || '—'}) ·
            Submitted {submitted}
          </p>
          {v.rejection_reason && (
            <p className="mt-2 rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-700">
              <strong>Last rejection reason:</strong> {v.rejection_reason}
            </p>
          )}
        </div>
        {canModerate ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onApprove}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-600"
            >
              <Check className="h-3.5 w-3.5" /> Approve
            </button>
            <button
              type="button"
              onClick={onRequestInfo}
              className="inline-flex items-center gap-1 rounded-md border border-accent-300 bg-accent-50 px-2.5 py-1 text-xs font-semibold text-accent-700 transition hover:bg-accent-100"
            >
              <Info className="h-3.5 w-3.5" /> Request info
            </button>
            <button
              type="button"
              onClick={onReject}
              className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
            >
              <X className="h-3.5 w-3.5" /> Reject
            </button>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-100 px-2 py-0.5 text-xs font-medium text-text-secondary">
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            Read-only
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-center gap-1 border-t border-surface-200 bg-surface-50 px-4 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-100"
      >
        {expanded ? (
          <>
            <ChevronUp className="h-3 w-3" /> Hide details
          </>
        ) : (
          <>
            <ChevronDown className="h-3 w-3" /> Show details
          </>
        )}
      </button>

      {expanded && (
        <div className="grid gap-4 border-t border-surface-200 bg-surface-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Detail icon={Building2} label="Trade license">
            {v.trade_license_number || '—'}
          </Detail>
          <Detail icon={Mail} label="Store contact">
            {v.store_contact_email || v.email}
          </Detail>
          <Detail icon={StoreIcon} label="Store slug">
            <span className="font-mono text-xs">{v.store_slug || '—'}</span>
          </Detail>
          <Detail icon={ShieldCheck} label="Business type">
            {v.business_type || '—'}
          </Detail>
          <Detail icon={Building2} label="Business address">
            {addr || '—'}
          </Detail>
          <Detail icon={Check} label={v.status === 'APPROVED' ? 'Approved at' : 'Updated at'}>
            {v.approved_at ? formatDateTime(v.approved_at) : formatDateTime(v.updated_at)}
          </Detail>
          {v.store_description && (
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Store description
              </p>
              <p className="mt-1 whitespace-pre-line text-sm text-text-primary">
                {v.store_description}
              </p>
            </div>
          )}
          {v.store_slug && (
            <div className="sm:col-span-2 lg:col-span-3">
              <a
                href={`/stores/${v.store_slug}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-accent-600 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                View public storefront
              </a>
            </div>
          )}
        </div>
      )}
    </article>
  );
};

const Detail = ({ icon: Icon, label, children }) => (
  <div>
    <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">
      <Icon className="h-3 w-3" aria-hidden="true" /> {label}
    </p>
    <p className="mt-1 text-sm text-text-primary">{children}</p>
  </div>
);

// ---------- useVendorTabCounts: lightweight per-status counts ---------
//
// Fires one tiny query (page_size=1) per status on mount so the tab
// strip can show a counter badge. The main listing query is independent.
function useVendorTabCounts() {
  const statuses = ['PENDING', 'APPROVED', 'REJECTED', 'INFO_REQUESTED'];
  const out = {};
  statuses.forEach((status) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const q = useQuery({
      queryKey: ['admin', 'vendors', 'count', status],
      queryFn: () =>
        adminService.listVendors({ status, page: 1, page_size: 1 }),
      staleTime: 30_000,
    });
    out[status] = q.data?.meta?.pagination?.total_items;
  });
  return out;
}

export default AdminVendorsPage;
