// PCBuilderPage — the heart of Module 8.
//
// Layout (spec frontend sub-spec lines 2993-3117):
//
//   ┌─────────────────────────────────┬──────────────────────────┐
//   │ <BuildNameInput/>               │  <BuildSummary/>          │
//   │ <BuildStatusAlert/> (top hints) │   (checklist, totals,     │
//   │                                 │    action buttons)         │
//   │ <SlotCard/> grid (2 cols)       │  <WattageDisplay/>         │
//   │   CPU, MOBO, RAM_1, RAM_2       │                           │
//   │   GPU, PSU, CASE, COOLER        │  <CompatibilityReport/>   │
//   │   SSD_1, SSD_2, HDD             │   (rule results)           │
//   └─────────────────────────────────┴──────────────────────────┘
//
// Mount-time behaviour:
//   - If the store has any persisted slots (localStorage), kick a
//     `recheckNow()` so the panel updates from current engine data
//     rather than the stale snapshot from the last session.
//   - On auth flip false→true the global login migrator in
//     `usePCBuilder` POSTs the build to /api/v1/builds/.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Hammer, Info } from 'lucide-react';
import toast from 'react-hot-toast';

import { usePageTitle } from '@/hooks/usePageTitle';
import { usePCBuilder } from '@hooks/usePCBuilder';

import BuildNameInput from '@components/compatibility/BuildNameInput';
import BuildSummary from '@components/compatibility/BuildSummary';
import CompatibilityReport from '@components/compatibility/CompatibilityReport';
import ComponentSelectModal from '@components/compatibility/ComponentSelectModal';
import ShareBuildModal from '@components/compatibility/ShareBuildModal';
import SlotCard from '@components/compatibility/SlotCard';
import WattageDisplay from '@components/compatibility/WattageDisplay';

import ErrorState from '@components/common/ErrorState';
import { useAuthStore } from '@context/useAuthStore';
import { cn } from '@utils/cn';
import { SLOTS } from '@utils/pcSlots';

const PCBuilderPage = () => {
  usePageTitle('PC Builder · PCCraft');

  const slots = usePCBuilder((s) => s.slots);
  const slotProducts = usePCBuilder((s) => s.slotProducts) || {};
  const results = usePCBuilder((s) => s.results);
  const wattage = usePCBuilder((s) => s.wattage);
  const isChecking = usePCBuilder((s) => s.isChecking);
  const error = usePCBuilder((s) => s.error);
  const setSlot = usePCBuilder((s) => s.setSlot);
  const clearSlot = usePCBuilder((s) => s.clearSlot);
  const recheckNow = usePCBuilder((s) => s.recheckNow);
  const migratedOnLogin = usePCBuilder((s) => s.migratedOnLogin);

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Which slot is the modal currently editing? null = closed.
  const [activeSlot, setActiveSlot] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);

  // Re-run the engine on mount so the right-hand panel reflects the
  // current store, not the last-session's snapshot.
  useEffect(() => {
    const hasAny = Object.values(slots || {}).some(
      (v) => v !== null && v !== undefined && v !== '',
    );
    if (hasAny) recheckNow();
    // Intentional: only on mount. The store handles every later change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One-time toast after a login-migration so the user knows what happened.
  useEffect(() => {
    if (migratedOnLogin) {
      toast.success('Your anonymous build was saved to your account.');
    }
  }, [migratedOnLogin]);

  const handleSelect = useCallback((slot) => {
    setActiveSlot(slot);
  }, []);

  const handlePicked = useCallback(
    (slot, product) => {
      // product may be null if the modal closes without a selection.
      if (!product?.id) {
        setActiveSlot(null);
        return;
      }
      setSlot(slot.key, String(product.id), product);
      setActiveSlot(null);
    },
    [setSlot],
  );

  const handleModalClose = useCallback(() => setActiveSlot(null), []);

  const handleClear = useCallback(
    (slot) => {
      clearSlot(slot.key);
    },
    [clearSlot],
  );

  const handleShare = useCallback(async () => {
    if (!isAuthenticated) {
      toast.error('Sign in to share your build.');
      return;
    }
    setShareOpen(true);
  }, [isAuthenticated]);

  // Top-of-page alert if any ERROR rule is firing.
  const errorCount = useMemo(
    () => (results || []).filter((r) => r.status === 'ERROR').length,
    [results],
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-text-secondary">
            <Hammer className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Module 8 · PC Builder
            </span>
          </div>
          <BuildNameInput className="mt-1" />
          {!isAuthenticated && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-text-secondary">
              <Info className="h-3.5 w-3.5" aria-hidden="true" />
              Your build is saved locally. Sign in to back it up and share.
            </p>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ----- left: slot grid ----- */}
        <section
          aria-label="Components"
          className="lg:col-span-2"
        >
          {errorCount > 0 && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100"
            >
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0 text-red-300"
                aria-hidden="true"
              />
              <div>
                <p className="font-semibold">
                  {errorCount} compatibility issue
                  {errorCount === 1 ? '' : 's'} need fixing.
                </p>
                <p className="mt-0.5 opacity-90">
                  Review the red rows in the report on the right and swap the
                  affected component.
                </p>
              </div>
            </div>
          )}

          {error && (
            <ErrorState
              className="mb-4"
              title="Could not run the compatibility check."
              description={error}
              onRetry={recheckNow}
            />
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {SLOTS.map((slot) => {
              const filledProduct = slotProducts[slot.key];
              return (
                <SlotCard
                  key={slot.key}
                  slot={slot}
                  product={filledProduct || null}
                  onSelect={handleSelect}
                  onClear={handleClear}
                  className={cn(
                    filledProduct && 'shadow-sm',
                  )}
                />
              );
            })}
          </div>
        </section>

        {/* ----- right: summary column ----- */}
        <aside
          aria-label="Build summary"
          className="space-y-4 lg:sticky lg:top-6 lg:self-start"
        >
          <BuildSummary onShare={handleShare} />

          <WattageDisplay wattage={wattage} />

          <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <h3 className="mb-3 font-heading text-sm font-semibold uppercase tracking-wide text-text-secondary">
              Compatibility Report
            </h3>
            <CompatibilityReport
              results={results}
              loading={isChecking}
            />
          </div>
        </aside>
      </div>

      {/* Modals */}
      <ComponentSelectModal
        slot={activeSlot}
        slots={slots}
        open={Boolean(activeSlot)}
        onClose={handleModalClose}
        onPick={handlePicked}
      />

      <ShareBuildModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
      />
    </div>
  );
};

export default PCBuilderPage;