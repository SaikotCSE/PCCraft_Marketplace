// PasswordStrength — live 5-bar strength indicator + checklist.
//
// Renders a 4-segment progress bar and a list of which rule has been
// satisfied. The score is computed by `evaluatePassword` in validators.js.
import { Check, X } from 'lucide-react';
import { evaluatePassword } from '@utils/validators';

const COLORS = [
  'bg-danger',     // 0
  'bg-danger',     // 1
  'bg-warning',    // 2 fair
  'bg-accent-500', // 3 good
  'bg-success',    // 4 strong
];

const LABELS = {
  weak: 'Weak',
  fair: 'Fair',
  good: 'Good',
  strong: 'Strong',
};

const RULE_LABELS = [
  { key: 'length', text: 'At least 8 characters' },
  { key: 'upper', text: 'One uppercase letter' },
  { key: 'lower', text: 'One lowercase letter' },
  { key: 'digit', text: 'One digit' },
  { key: 'symbol', text: 'One special character (recommended)' },
];

export default function PasswordStrength({ password = '' }) {
  const { score, label, checks } = evaluatePassword(password);
  const colorClass = COLORS[score];

  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex items-center justify-between">
        <div className="flex flex-1 gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i < score ? colorClass : 'bg-surface-300'
              }`}
            />
          ))}
        </div>
        <span
          className={`ml-3 text-xs font-medium ${
            score >= 3
              ? 'text-success'
              : score === 2
                ? 'text-warning'
                : 'text-danger'
          }`}
        >
          {LABELS[label] || 'Weak'}
        </span>
      </div>

      <ul className="grid grid-cols-1 gap-y-0.5 text-xs sm:grid-cols-2">
        {RULE_LABELS.map((rule) => {
          const passed = !!checks[rule.key];
          return (
            <li
              key={rule.key}
              className={`flex items-center gap-1.5 ${
                passed ? 'text-success' : 'text-text-secondary'
              }`}
            >
              {passed ? (
                <Check className="h-3 w-3" />
              ) : (
                <X className="h-3 w-3 text-surface-300" />
              )}
              <span>{rule.text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}