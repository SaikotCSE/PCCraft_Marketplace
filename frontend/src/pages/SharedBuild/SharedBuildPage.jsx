// SharedBuildPage — public read-only view of someone else's PC build.
//
//   GET /api/v1/compatibility/builds/share/:token/
//
// Renders the same two-column shell as PCBuilderPage (slot grid left,
// summary right) but every slot is locked into read-only mode.
// Owners can:
//   - Add All to Cart  →  POST /cart/items/bulk/  with all filled slots
//   - Clone this Build →  hydrate usePCBuilder + navigate to /pc-builder
// Anonymous visitors see the same two actions; "Add All" requires the
// user to be authenticated (the cart service will 401 and we toast it).

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Eye,
  Hammer,
  ShoppingBag,
  Copy as CopyIcon,
  Check,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { usePageTitle } from '@/hooks/usePageTitle';
import { usePCBuilder } from '@hooks/usePCBuilder';
import { useAuthStore } from '@context/useAuthStore';
import { compatibilityService } from '@services/compatibilityService';
import { cartService } from '@services/cartService';
import { cn } from '@utils/cn';
import { formatDateTime, formatPrice } from '@utils/formatters';
import { paths } from '@routes/routePaths';
import { SLOTS } from '@utils/pcSlots';

import ErrorState from '@components/common/ErrorState';
import EmptyState from '@components/common/EmptyState';
import SlotCard from '@components/compatibility/SlotCard';
import WattageDisplay from '@components/compatibility/WattageDisplay';
import CompatibilityReport from '@components/compatibility/CompatibilityReport';

const SharedBuildPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hydrateFromBuild = usePCBuilder((s) => s.hydrateFromBuild);

  const [build, setBuild] = useState(null);
  const [report, setReport] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isCloning, setIsCloning] = useState(false);
  const [isAddingCart, setIsAddingCart] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  usePageTitle(build?.name ? `${build.name} · Shared Build · PCCraft` : 'Shared Build · PCCraft');

  const fetchShared = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await compatibilityService.getSharedBuild(token);
      // Some endpoints return { build, report }; others return the build directly.
      if (data?.build && data?.report) {
        setBuild(data.build);
        setReport(data.report);
      } else {
        setBuild(data);
        setReport(null);
      }
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404) setError('This build link is no longer active.');
      else
        setError(
          err?.response?.data?.error?.message ||
            err?.message ||
            'Could not load this shared build.',
        );
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) fetchShared();
  }, [token, fetchShared]);

  const filledSlots = build
    ? SLOTS.filter((slot) => build.slots?.[slot.key])
    : [];
  const totalFilled = filledSlots.length;

  const handleClone = useCallback(async () => {
    if (!build) return;
    setIsCloning(true);
    try {
      hydrateFromBuild(build);
      toast.success('Cloned to your builder.');
      navigate(paths.pcBuilder());
    } catch {
      toast.error('Could not clone this build.');
    } finally {
      setIsCloning(false);
    }
  }, [build, hydrateFromBuild, navigate]);

  const handleAddAllToCart = useCallback(async () => {
    if (!build) return;
    if (!isAuthenticated) {
      toast.error('Please sign in to add parts to your cart.');
      navigate(paths.login());
      return;
    }
    const items = filledSlots
      .map((slot) => build.slots?.[slot.key])
      .filter(Boolean)
      .map((product) => ({ product_id: product.id, quantity: 1 }));
    if (items.length === 0) {
      toast.error('No components to add.');
      return;
    }
    setIsAddingCart(true);
    try {
      // cartService only exposes single-item addItem, so we iterate.
      // We do this serially to keep the UI responsive (failures bubble up).
      for (const item of items) {
        // eslint-disable-next-line no-await-in-loop
        await cartService.addItem(item);
      }
      toast.success(`${items.length} item${items.length === 1 ? '' : 's'} added to cart.`);
    } catch (err) {
      toast.error(err?.message || 'Could not update cart.');
    } finally {
      setIsAddingCart(false);
    }
  }, [build, filledSlots, isAuthenticated, navigate]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard?.writeText?.(window.location.href);
      setLinkCopied(true);
      toast.success('Link copied.');
      setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      toast.error('Copy failed.');
    }
  }, []);

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="h-40 w-full animate-pulse rounded-xl bg-surface-200/60" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 w-full animate-pulse rounded-xl bg-surface-200/60"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
        <ErrorState
          title="Couldn't load this build"
          description={error}
          onRetry={fetchShared}
        />
      </div>
    );
  }

  if (!build) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
        <EmptyState
          icon={Eye}
          title="Build not found"
          description="The link may have expired or been removed by its owner."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-text-secondary">
            <Eye className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Shared build
            </span>
          </div>
          <h1 className="mt-1 font-heading text-2xl font-semibold text-text-primary">
            {build.name || 'Untitled build'}
          </h1>
          <p className="mt-1 text-xs text-text-secondary">
            Shared {formatDateTime(build.shared_at || build.updated_at)} · {totalFilled}/{SLOTS.length} slots filled · {formatPrice(build.total_price || '0')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm font-semibold text-text-primary transition hover:bg-surface-50"
          >
            {linkCopied ? (
              <Check className="h-4 w-4 text-emerald-500" />
            ) : (
              <CopyIcon className="h-4 w-4" />
            )}
            Copy link
          </button>
          <button
            type="button"
            onClick={handleClone}
            disabled={isCloning}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm font-semibold text-text-primary transition hover:bg-surface-50 disabled:opacity-60"
          >
            <Hammer className="h-4 w-4" />
            {isCloning ? 'Cloning…' : 'Clone this build'}
          </button>
          <button
            type="button"
            onClick={handleAddAllToCart}
            disabled={isAddingCart || totalFilled === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-400 disabled:opacity-60"
          >
            <ShoppingBag className="h-4 w-4" />
            {isAddingCart ? 'Adding…' : 'Add all to cart'}
          </button>
        </div>
      </header>

      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        {/* Slot grid */}
        <section
          aria-label="Build slots"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          {SLOTS.map((slot) => {
            const product = build.slots?.[slot.key];
            return (
              <SlotCard
                key={slot.key}
                slot={slot}
                product={product || null}
                onPick={() => {}}
                onClear={() => {}}
                readOnly
              />
            );
          })}
        </section>

        {/* Right rail */}
        <aside className="space-y-4">
          {build.psu_wattage ? (
            <WattageDisplay
              psuWattage={build.psu_wattage}
              totalTdp={build.total_tdp}
              systemOverhead={build.system_overhead}
            />
          ) : null}

          {report ? (
            <CompatibilityReport results={report.results || []} />
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-surface p-4 text-sm text-text-secondary">
              Compatibility check unavailable for this shared build.
            </div>
          )}

          <div className={cn('rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary')}>
            <p className="font-semibold text-text-primary">Read-only view</p>
            <p className="mt-1 text-xs">
              Clone this build to make your own edits, or add its parts straight to your cart.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default SharedBuildPage;
