// StarRating — visual 5-star display + interactive selector.
//
// Read-only by default (e.g. summary on the product detail page).
// Pass `interactive` to enable hover-preview + click-to-set behaviour.
// `size` controls Tailwind width class. `value` is 0..5 (decimals
// accepted for half-stars only in `display` mode).
import { useState } from 'react';
import { Star } from 'lucide-react';

import { cn } from '@/utils/cn';

const SIZE_CLASSES = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
  xl: 'h-8 w-8',
};

const StarRating = ({
  value = 0,
  onChange,
  size = 'md',
  readOnly = false,
  className = '',
  showValue = false,
  ariaLabel,
}) => {
  const interactive = Boolean(onChange) && !readOnly;
  const [hover, setHover] = useState(null);
  const displayed = interactive && hover !== null ? hover : value;
  const sizeCls = SIZE_CLASSES[size] || SIZE_CLASSES.md;

  return (
    <div
      className={cn('inline-flex items-center gap-0.5', className)}
      role={interactive ? 'radiogroup' : 'img'}
      aria-label={ariaLabel || `Rated ${value} out of 5 stars`}
      onMouseLeave={() => interactive && setHover(null)}
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const starValue = i + 1;
        // Visual fill: 1 = full, 0 = empty, fractional via width.
        const fill = Math.max(0, Math.min(1, displayed - i));
        return (
          <button
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            type="button"
            disabled={!interactive}
            tabIndex={interactive ? 0 : -1}
            aria-label={`${starValue} star${starValue === 1 ? '' : 's'}`}
            aria-pressed={interactive ? value === starValue : undefined}
            role={interactive ? 'radio' : undefined}
            aria-checked={interactive ? value === starValue : undefined}
            onMouseEnter={() => interactive && setHover(starValue)}
            onClick={() => {
              if (!interactive) return;
              // Click same star twice → deselect to 0
              onChange(value === starValue ? 0 : starValue);
            }}
            className={cn(
              'relative inline-flex p-0.5',
              interactive
                ? 'cursor-pointer rounded transition-transform hover:scale-110'
                : 'cursor-default',
            )}
          >
            {/* Background (empty) star */}
            <Star
              className={cn(sizeCls, 'text-surface-300')}
              aria-hidden="true"
              strokeWidth={1.5}
            />
            {/* Foreground (filled) star with fractional width */}
            {fill > 0 && (
              <span
                className="pointer-events-none absolute inset-0.5 overflow-hidden"
                style={{ width: `${fill * 100}%` }}
              >
                <Star
                  className={cn(sizeCls, 'fill-amber-400 text-amber-400')}
                  aria-hidden="true"
                  strokeWidth={1.5}
                />
              </span>
            )}
          </button>
        );
      })}
      {showValue && (
        <span className="ml-2 text-sm font-semibold text-text-primary">
          {Number(value || 0).toFixed(1)}
        </span>
      )}
    </div>
  );
};

export default StarRating;