// RoleCard — login phase-1 tile.
//
// One of three tiles in the login page phase 1. Selecting a role advances
// the page to phase 2 (the actual form).
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

/**
 * @param {{
 *   icon: React.ReactNode,
 *   title: string,
 *   description: string,
 *   onSelect: () => void,
 *   tone?: 'accent' | 'warning' | 'info',
 * }} props
 */
const TONE_CLASSES = {
  accent: 'border-accent-500/30 hover:border-accent-500 bg-accent-500/5 hover:bg-accent-500/10',
  warning: 'border-warning/30 hover:border-warning bg-warning/5 hover:bg-warning/10',
  info: 'border-info/30 hover:border-info bg-info/5 hover:bg-info/10',
};

const TONE_BADGE = {
  accent: 'bg-accent-500 text-primary-900',
  warning: 'bg-warning text-primary-900',
  info: 'bg-info text-primary-900',
};

export default function RoleCard({ icon, title, description, onSelect, tone = 'accent' }) {
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className={`group flex h-full w-full flex-col items-start gap-3 rounded-xl border p-5 text-left shadow-sm transition-colors ${TONE_CLASSES[tone]}`}
    >
      <div className={`grid h-11 w-11 place-items-center rounded-lg ${TONE_BADGE[tone]}`}>
        {icon}
      </div>
      <div className="flex-1">
        <h3 className="font-heading text-lg font-semibold text-text-primary">{title}</h3>
        <p className="mt-1 text-sm text-text-secondary">{description}</p>
      </div>
      <span className="inline-flex items-center gap-1 text-sm font-medium text-text-primary group-hover:gap-2 transition-all">
        Continue
        <ArrowRight className="h-4 w-4" />
      </span>
    </motion.button>
  );
}