// Stepper — horizontal 4-step progress indicator.
//
// Shows numbered circles for each step, with the active step highlighted
// in accent color, completed steps filled, and future steps muted. Renders
// labels below each circle; collapses labels on narrow screens.
import { Check } from 'lucide-react';
import { cn } from '@/utils/cn';

export default function Stepper({ steps, currentStep }) {
  return (
    <nav aria-label="Progress" className="w-full">
      <ol className="flex items-center justify-between gap-2">
        {steps.map((step, idx) => {
          const stepNum = idx + 1;
          const isCompleted = stepNum < currentStep;
          const isActive = stepNum === currentStep;
          return (
            <li key={step.title} className="flex flex-1 items-center">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'grid h-9 w-9 place-items-center rounded-full border-2 text-sm font-semibold transition-colors',
                    isCompleted && 'border-success bg-success text-primary-900',
                    isActive && 'border-accent-500 bg-accent-500 text-primary-900',
                    !isCompleted && !isActive && 'border-surface-300 bg-surface-100 text-text-secondary',
                  )}
                  aria-current={isActive ? 'step' : undefined}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : stepNum}
                </div>
                <div className="mt-2 hidden text-center sm:block">
                  <p
                    className={cn(
                      'text-xs font-medium',
                      isActive ? 'text-text-primary' : 'text-text-secondary',
                    )}
                  >
                    {step.title}
                  </p>
                  {step.subtitle && (
                    <p className="mt-0.5 text-[10px] uppercase tracking-wider text-text-secondary">
                      {step.subtitle}
                    </p>
                  )}
                </div>
              </div>

              {idx < steps.length - 1 && (
                <div
                  className={cn(
                    'mx-2 h-0.5 flex-1 transition-colors',
                    stepNum < currentStep ? 'bg-success' : 'bg-surface-300',
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}