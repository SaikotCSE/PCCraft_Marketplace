// CompatibilityReport — visual list of rule results emitted by
// `compatibilityService.checkBuild()`.
//
// Spec §2.10 "Compatibility Result" table:
//
//   status      icon          colour       meaning
//   ─────────────────────────────────────────────────────────────────
//   OK          CheckCircle2  green        rule satisfied
//   WARNING     AlertTriangle amber        under-spec but usable
//   ERROR       ShieldAlert   red          blocked
//   INFO        Info          slate        informational hint
//
// Each row carries `category_a`, `category_b`, `rule_name`, `message`,
// `status`. The component renders them with the categories shown as a
// compact "A ↔ B" pair (spec frontend sub-spec line 3047 — chip layout).

import {
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldAlert,
} from 'lucide-react';

import { cn } from '@utils/cn';

const STATUS_META = {
  OK: { Icon: CheckCircle2, tone: 'ok', label: 'Compatible' },
  WARNING: { Icon: AlertTriangle, tone: 'warning', label: 'Caution' },
  ERROR: { Icon: ShieldAlert, tone: 'error', label: 'Incompatible' },
  INFO: { Icon: Info, tone: 'info', label: 'Info' },
};

const TONE_STYLES = {
  ok: {
    row: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-100',
    chip: 'bg-emerald-500/15 text-emerald-200',
    icon: 'text-emerald-300',
  },
  warning: {
    row: 'border-amber-500/30 bg-amber-500/5 text-amber-100',
    chip: 'bg-amber-500/15 text-amber-200',
    icon: 'text-amber-300',
  },
  error: {
    row: 'border-red-500/40 bg-red-500/10 text-red-100',
    chip: 'bg-red-500/20 text-red-200',
    icon: 'text-red-300',
  },
  info: {
    row: 'border-slate-500/30 bg-slate-500/5 text-slate-100',
    chip: 'bg-slate-500/15 text-slate-200',
    icon: 'text-slate-300',
  },
};

/**
 * Roll up a result list into a small count summary.
 * @param {Array<{status:string}>} results
 */
export function summariseResults(results) {
  const counts = { OK: 0, WARNING: 0, ERROR: 0, INFO: 0 };
  for (const r of results || []) {
    if (counts[r.status] !== undefined) counts[r.status] += 1;
  }
  return counts;
}

/**
 * @param {object} props
 * @param {Array<{
 *   rule_name: string,
 *   status: 'OK'|'WARNING'|'ERROR'|'INFO',
 *   message: string,
 *   category_a: string,
 *   category_b: string,
 * }>} props.results
 * @param {boolean} [props.loading]
 * @param {string} [props.emptyMessage]
 * @param {string} [props.className]
 */
const CompatibilityReport = ({
  results = [],
  loading = false,
  emptyMessage = 'Add components to check compatibility.',
  className = '',
}) => {
  if (loading && (!results || results.length === 0)) {
    return (
      <div className={cn('space-y-2', className)} aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-12 w-full animate-pulse rounded-md bg-surface-200/60"
          />
        ))}
      </div>
    );
  }

  if (!results || results.length === 0) {
    return (
      <div
        className={cn(
          'rounded-xl border border-dashed border-surface-300 bg-surface-50 px-4 py-6 text-center text-sm text-text-secondary',
          className,
        )}
      >
        {emptyMessage}
      </div>
    );
  }

  // Order: ERROR → WARNING → INFO → OK so the eye lands on blockers first.
  const ORDER = ['ERROR', 'WARNING', 'INFO', 'OK'];
  const sorted = [...results].sort(
    (a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status),
  );

  return (
    <ul
      className={cn('space-y-2', className)}
      aria-label="Compatibility check results"
    >
      {sorted.map((row, idx) => {
        const meta = STATUS_META[row.status] || STATUS_META.INFO;
        const tone = TONE_STYLES[meta.tone];
        const Icon = meta.Icon;
        const key = `${row.rule_name}-${row.category_a}-${row.category_b}-${idx}`;
        return (
          <li
            key={key}
            className={cn(
              'flex items-start gap-3 rounded-lg border px-3 py-2.5',
              tone.row,
            )}
            data-status={row.status}
          >
            <Icon
              className={cn('mt-0.5 h-4 w-4 shrink-0', tone.icon)}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                    tone.chip,
                  )}
                >
                  {meta.label}
                </span>
                {row.category_a && row.category_b && (
                  <span className="text-xs opacity-80">
                    <span className="font-medium">{row.category_a}</span>
                    <span className="mx-1 opacity-60">↔</span>
                    <span className="font-medium">{row.category_b}</span>
                  </span>
                )}
              </div>
              {row.rule_name && (
                <div className="mt-1 text-xs font-semibold uppercase tracking-wide opacity-70">
                  {row.rule_name}
                </div>
              )}
              {row.message && (
                <p className="mt-0.5 text-sm leading-snug">{row.message}</p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export default CompatibilityReport;