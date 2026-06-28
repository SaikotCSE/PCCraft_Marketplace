// PriceDisplay — effective price, strike-through base, and discount % badge.
//
// Used inside ProductCard and ProductDetailPage (spec §2.7).
// Accepts either pre-computed values from the API list/detail serializers
// (preferred) or raw base/discounted/effective/discount_percent.
import { formatPrice } from '@/utils/formatters';

const PriceDisplay = ({
  base_price,
  discounted_price,
  effective_price,
  discount_percent = 0,
  size = 'md',
  className = '',
}) => {
  const effective = effective_price ?? discounted_price ?? base_price;
  const hasDiscount = Number(discount_percent) > 0 && discounted_price != null;

  const sizeMap = {
    sm: { price: 'text-base', strike: 'text-xs' },
    md: { price: 'text-xl', strike: 'text-sm' },
    lg: { price: 'text-3xl', strike: 'text-base' },
  };
  const cls = sizeMap[size] ?? sizeMap.md;

  return (
    <div className={`flex items-baseline gap-2 ${className}`}>
      <span className={`font-bold text-text-primary ${cls.price}`}>
        {formatPrice(effective)}
      </span>
      {hasDiscount && (
        <>
          <span className={`text-text-secondary line-through ${cls.strike}`}>
            {formatPrice(base_price)}
          </span>
          <span className="rounded-full bg-accent-500 px-2 py-0.5 text-xs font-semibold text-white">
            -{Math.round(discount_percent)}%
          </span>
        </>
      )}
    </div>
  );
};

export default PriceDisplay;