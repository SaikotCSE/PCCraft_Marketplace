// MyBuildsPage — authenticated list of the user's saved PC builds.
//
//   GET /api/v1/compatibility/builds/  →  { results: [...], ... }
//
// Each row shows name, updated-at, filled-count + a quick action bar:
//   - Load   → hydrate usePCBuilder + navigate to /pc-builder
//   - Copy   → write the public share URL to the clipboard (when one exists)
//   - Share  → open ShareBuildModal to generate + copy a fresh link
//   - Delete → soft-delete (server marks is_active=false / similar)

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clipboard,
  ClipboardCheck,
  Hammer,
  Share2,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { usePageTitle } from '@/hooks/usePageTitle';
import { usePCBuilder } from '@hooks/usePCBuilder';
import { useAuthStore } from '@context/useAuthStore';
import { compatibilityService } from '@services/compatibilityService';
import { cn } from '@utils/cn';
import { formatDateTime, formatPrice } from '@utils/formatters';
import { paths } from '@routes/routePaths';
import { SLOTS } from '@utils/pcSlots';

import ConfirmDialog from '@components/common/ConfirmDialog';
import EmptyState from '@components/common/EmptyState';
import ErrorState from '@components/common/ErrorState';
import ShareBuildModal from '@components/compatibility/ShareBuildModal';

const MyBuildsPage = () => {
  usePageTitle('My Builds · PCCraft');

  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hydrateFromBuild = usePCBuilder((s) => s.hydrateFromBuild);

  const [builds, setBuilds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [shareBuildId, setShareBuildId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const fetchBuilds = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await compatibilityService.listBuilds({ page_size: 50 });
      const list = Array.isArray(data)
        ? data
        : data?.results || data?.items || [];
      setBuilds(list);
    } catch (err) {
      setError(
        err?.response?.data?.error?.message ||
          err?.message ||
          'Could not load your builds.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) fetchBuilds();
  }, [isAuthenticated, fetchBuilds]);

  const handleLoad = useCallback(
    (build) => {
      hydrateFromBuild(build);
      toast.success(`Loaded “${build.name}”.`);
      navigate(paths.pcBuilder());
    },
    [hydrateFromBuild, navigate],
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    try {
      await compatibilityService.deleteBuild(id);
      setBuilds((prev) => prev.filter((b) => b.id !== id));
      toast.success('Build deleted.');
    } catch (err) {
      toast.error(err?.message || 'Delete failed.');
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget]);

  const handleCopyInline = useCallback(async (build) => {
    if (!build.share_token) return;
    const url = `${window.location.origin}${paths.sharedBuild(build.share_token)}`;
    try {
      await navigator.clipboard?.writeText?.(url);
      setCopiedId(build.id);
      toast.success('Link copied.');
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      toast.error('Copy failed.');
    }
  }, []);

  const totalSlots = SLOTS.length;
  const sortedBuilds = useMemo(
    () =>
      [...builds].sort((a, b) => {
        const ta = new Date(a.updated_at || a.created_at || 0).getTime();
        const tb = new Date(b.updated_at || b.created_at || 0).getTime();
        return tb - ta;
      }),
    [builds],
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-text-secondary">
            <Hammer className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Saved builds
            </span>
          </div>
          <h1 className="mt-1 font-heading text-2xl font-semibold text-text-primary">
            My PC Builds
          </h1>
        </div>

        <button
          type="button"
          onClick={() => navigate(paths.pcBuilder())}
          className="rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-400"
        >
          + Start a new build
        </button>
      </header>

      {error && (
        <ErrorState
          className="mb-4"
          title="Could not load your builds."
          description={error}
          onRetry={fetchBuilds}
        />
      )}

      {isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 w-full animate-pulse rounded-xl bg-surface-200/60"
            />
          ))}
        </div>
      ) : sortedBuilds.length === 0 ? (
        <EmptyState
          icon={Hammer}
          title="No builds yet"
          description="Open the PC Builder, pick your parts, and hit Save to see them here."
          actionLabel="Open PC Builder"
          onAction={() => navigate(paths.pcBuilder())}
        />
      ) : (
        <ul className="space-y-3">
          {sortedBuilds.map((build) => {
            const filledCount = Object.values(build.slots || {}).filter(
              Boolean,
            ).length;
            return (
              <li
                key={build.id}
                className="rounded-xl border border-border bg-surface p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-heading text-base font-semibold text-text-primary">
                      {build.name || 'Untitled build'}
                    </h3>
                    <p className="mt-0.5 text-xs text-text-secondary">
                      Updated {formatDateTime(build.updated_at || build.created_at)} ·{' '}
                      {filledCount}/{totalSlots} slots · {formatPrice(build.total_price || '0')}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleLoad(build)}
                      className="rounded-md bg-accent-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-accent-400"
                    >
                      Load
                    </button>

                    {build.share_token ? (
                      <button
                        type="button"
                        onClick={() => handleCopyInline(build)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-primary transition hover:bg-surface-50"
                      >
                        {copiedId === build.id ? (
                          <ClipboardCheck className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Clipboard className="h-3.5 w-3.5" />
                        )}
                        Copy link
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShareBuildId(build.id)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-primary transition hover:bg-surface-50"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        Share
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setDeleteTarget(build)}
                      aria-label={`Delete ${build.name}`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1.5 text-xs font-semibold text-text-secondary transition hover:border-danger/40 hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Per-slot strip */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {SLOTS.map((slot) => {
                    const filled = build.slots?.[slot.key];
                    return (
                      <span
                        key={slot.key}
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                          filled
                            ? 'bg-accent-500/15 text-accent-500'
                            : 'bg-surface-200 text-text-secondary',
                        )}
                      >
                        {slot.label.split(' ')[0]}
                      </span>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete this build?"
        description="This removes the saved build from your account. Components already in your cart are unaffected."
        confirmLabel="Delete"
        tone="danger"
      />

      <ShareBuildModal
        open={Boolean(shareBuildId)}
        onClose={() => setShareBuildId(null)}
      />
    </div>
  );
};

export default MyBuildsPage;