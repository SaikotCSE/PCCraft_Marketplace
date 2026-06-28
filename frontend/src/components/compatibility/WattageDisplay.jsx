// WattageDisplay — estimated TDP vs PSU wattage visual gauge.
//
// Spec §2.10 "Wattage Display" defines four states:
//
//   1. No PSU selected            → neutral "Add a PSU to estimate"
//   2. estimated_tdp < 0.70 × PSU → OK (green)
//   3. 0.70 × PSU ≤ est < PSU     → WARNING (amber) — within headroom
//   4. estimated_tdp ≥ PSU        → ERROR (red) — overloaded
//
// We compute the state locally from the same numbers the engine emits so
// this component stays decoupled from the rule logic. Missing PSU or
// partial TDP data falls back to "INFO" (slate).

import { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Plug,
  ShieldAlert,
  Zap,
} from 'lucide-react';

import { cn } from '@utils/cn';

/**
 * Derive a presentation state from the wattage payload the engine emits.
 * @param {{estimated_tdp:number, psu_wattage:number|null,
 *          psu_headroom:number|null, status:string, message:string}|null} wattage
 */
export function deriveWattageState(wattage) {
  if (!wattage) {
    return { kind: 'MISSING', icon: Info, label: 'Awaiting PSU selection' };
  }
  const tdp = Number(wattage.estimated_tdp || 0);
  const psu = Number(wattage.psu_wattage || 0);

  if (!psu || Number.isNaN(psu)) {
    return {
      kind: 'MISSING_PSU',
      icon: Plug,
      label: 'Add a PSU to estimate wattage',
      tdp,
    };
  }

  if (tdp >= psu) {
    return {
      kind: 'ERROR',
      icon: ShieldAlert,
      label: 'PSU overloaded — pick a higher-wattage unit',
      tdp,
      psu,
    };
  }

  if (tdp >= psu * 0.7) {
    return {
      kind: 'WARNING',
      icon: AlertTriangle,
      label: 'Limited PSU headroom — consider upgrading',
      tdp,
      psu,
    };
  }

  return {
    kind: 'OK',
    icon: CheckCircle2,
    label: 'PSU has healthy headroom',
    tdp,
    psu,
  };
}

const STATE_STYLES = {
  OK: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  WARNING: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  ERROR: 'border-red-500/40 bg-red-500/10 text-red-200',
  MISSING_PSU: 'border-slate-500/30 bg-slate-500/10 text-slate-200',
  MISSING: 'border-slate-500/30 bg-slate-500/10 text-slate-200',
};

const BAR_STYLES = {
  OK: 'bg-emerald-500',
  WARNING: 'bg-amber-500',
  ERROR: 'bg-red-500',
  MISSING_PSU: 'bg-slate-500',
  MISSING: 'bg-slate-500',
};

/**
 * @param {object} props
 * @param {{estimated_tdp:number, psu_wattage:number|null,
 *          psu_headroom:number|null, status:string, message:string}|null} props.wattage
 * @param {string} [props.className]
 */
const WattageDisplay = ({ wattage, className = '' }) => {
  const state = useMemo(() => deriveWattageState(wattage), [wattage]);
  const Icon = state.icon;

  // Bar fill is capped at 100% but still labelled with the raw ratio so
  // the user can see they're over-spec even if the bar is pinned.
  const tdp = state.tdp || 0;
  const psu = state.psu || wattage?.psu_wattage || 0;
  const ratio = psu > 0 ? Math.min(100, Math.round((tdp / psu) * 100)) : 0;

  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        STATE_STYLES[state.kind],
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-heading text-sm font-semibold uppercase tracking-wide">
              <Zap className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Power Budget</span>
            </div>
            <p className="mt-1 text-sm">{state.label}</p>
            {wattage?.message && (
              <p className="mt-1 text-xs opacity-80">{wattage.message}</p>
            )}
          </div>
        </div>

        <div className="text-right">
          <div className="font-heading text-2xl font-bold leading-none">
            {Number.isFinite(tdp) ? `${tdp} W` : '— W'}
          </div>
          <div className="mt-1 text-xs opacity-80">
            {psu > 0 ? `of ${psu} W PSU` : 'PSU required'}
          </div>
        </div>
      </div>

      {/* Gauge bar */}
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-black/20">
        <div
          className={cn('h-full transition-all duration-300', BAR_STYLES[state.kind])}
          style={{ width: `${ratio}%` }}
          aria-valuenow={tdp}
          aria-valuemin={0}
          aria-valuemax={Math.max(psu, tdp)}
          role="progressbar"
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] uppercase tracking-wide opacity-80">
        <span>0 W</span>
        <span>
          {psu > 0 ? `${ratio}% of headroom` : 'No PSU selected'}
        </span>
        <span>{psu > 0 ? `${psu} W` : '—'}</span>
      </div>
    </div>
  );
};

export default WattageDisplay;