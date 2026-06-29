// NavPromoStrip — the slim "moving news" banner under the navbar.
//
// Three lanes, balanced width on lg+:
//   1. Newest Deals   — live discount pills (auto-rotates every 4.5s)
//   2. Ticker         — free shipping / promo code / sale announcements
//                       (auto-rotates every 4s, marquee-style fade)
//   3. Trust stats    — verified vendors, fast delivery, easy returns
//
// Hidden on small screens — the mobile search drawer handles that
// real estate instead.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Tag, Truck, BadgeCheck, Sparkles } from 'lucide-react';

import { productService } from '@services/productService';
import { paths } from '@routes/routePaths';

const TICKER_MESSAGES = [
  {
    icon: Truck,
    text: 'Free shipping on orders over ৳5,000',
    tone: 'text-info',
  },
  {
    icon: Sparkles,
    text: '10% off first order — code PCCRAFT10',
    tone: 'text-accent-400',
  },
  {
    icon: Tag,
    text: 'Bundle deals: save up to 15% on CPU + motherboard',
    tone: 'text-success',
  },
  {
    icon: Sparkles,
    text: 'Build your PC and skip compatibility errors',
    tone: 'text-warning',
  },
  {
    icon: Truck,
    text: 'Same-day dispatch from verified vendors',
    tone: 'text-info',
  },
];

const TRUST_STATS = [
  { icon: BadgeCheck, label: 'Verified vendors', sub: 'Trade-licensed' },
  { icon: Truck, label: 'Fast delivery', sub: 'Same-day dispatch' },
  { icon: Tag, label: 'Easy returns', sub: '7-day window' },
];

// Discount % helper — same formula as backend discount_percent().
const discountPercent = (p) => {
  if (!p) return 0;
  const base = Number(p.base_price ?? p.price ?? 0);
  const sale = Number(p.discounted_price ?? 0);
  if (!base || !sale || sale >= base) return 0;
  return Math.round(((base - sale) / base) * 100);
};

const formatPrice = (p) => {
  if (!p) return '';
  const sale = Number(p.discounted_price);
  if (sale && Number(p.base_price ?? p.price ?? 0) > sale) {
    return `৳${sale.toLocaleString('en-IN')}`;
  }
  const price = Number(p.base_price ?? p.price ?? 0);
  return `৳${price.toLocaleString('en-IN')}`;
};

const NavPromoStrip = () => {
  const [deals, setDeals] = useState([]);
  const [tickerIndex, setTickerIndex] = useState(0);
  const [dealIndex, setDealIndex] = useState(0);

  // Live deals feed — newest with the highest discount first. If the
  // backend doesn't expose a discount filter we still get fresh items
  // via `-created_at` ordering.
  useEffect(() => {
    let mounted = true;
    productService
      .list({
        ordering: '-created_at',
        page_size: 8,
        in_stock: true,
      })
      .then((data) => {
        if (!mounted) return;
        const list = Array.isArray(data?.results)
          ? data.results
          : Array.isArray(data)
            ? data
            : [];
        const withDiscount = list
          .map((p) => ({ p, pct: discountPercent(p) }))
          .filter((x) => x.pct > 0)
          .sort((a, b) => b.pct - a.pct)
          .slice(0, 5)
          .map((x) => x.p);
        setDeals(withDiscount);
      })
      .catch(() => {
        if (!mounted) return;
        setDeals([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Tick the rotating chips.
  useEffect(() => {
    if (!deals.length) return undefined;
    const id = setInterval(() => {
      setDealIndex((i) => (i + 1) % deals.length);
    }, 4500);
    return () => clearInterval(id);
  }, [deals.length]);

  useEffect(() => {
    const id = setInterval(() => {
      setTickerIndex((i) => (i + 1) % TICKER_MESSAGES.length);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  const activeDeal = deals[dealIndex];
  const activeTicker = TICKER_MESSAGES[tickerIndex];

  const dealBadge = useMemo(
    () => (activeDeal ? `${discountPercent(activeDeal)}% OFF` : ''),
    [activeDeal]
  );

  return (
    <div className="hidden border-t border-accent-500/10 bg-gradient-to-r from-primary-900/80 via-primary-800/70 to-primary-900/80 md:block">
      <div className="mx-auto flex h-10 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        {/* Lane 1 — Newest Deals chip */}
        <div className="flex flex-shrink-0 items-center gap-2">
          <Link
            to={`${paths.products()}?ordering=-created_at&in_stock=1`}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent-500 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-primary-900 shadow-sm shadow-accent-500/30 transition hover:bg-accent-400"
          >
            <Tag className="h-3 w-3" />
            Newest deals
          </Link>

          {activeDeal ? (
            <Link
              key={activeDeal.id ?? activeDeal.slug ?? dealIndex}
              to={`/products/${activeDeal.slug ?? activeDeal.id}/`}
              className="flex max-w-[260px] items-center gap-1.5 truncate text-xs text-text-inverse/80 transition hover:text-accent-300"
            >
              <span className="truncate font-medium">{activeDeal.name}</span>
              <span className="rounded-full bg-danger/90 px-1.5 py-0.5 text-[10px] font-bold text-text-inverse">
                {dealBadge}
              </span>
              <span className="hidden text-[11px] text-text-inverse/60 sm:inline">
                {formatPrice(activeDeal)}
              </span>
            </Link>
          ) : (
            <span className="text-[11px] text-text-inverse/50">
              Fresh drops updated daily
            </span>
          )}
        </div>

        {/* Lane 2 — Ticker (rotating message) */}
        <div className="relative hidden h-6 flex-1 items-center overflow-hidden text-xs lg:flex">
          {TICKER_MESSAGES.map((m, i) => {
            const Icon = m.icon;
            const isActive = i === tickerIndex;
            return (
              <span
                key={i}
                className={`absolute inset-0 flex items-center gap-2 transition-all duration-500 ease-in-out ${
                  isActive
                    ? 'translate-y-0 opacity-100'
                    : '-translate-y-2 opacity-0'
                } ${m.tone}`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="font-medium">{m.text}</span>
              </span>
            );
          })}
        </div>

        {/* Lane 3 — Trust stats */}
        <div className="ml-auto hidden items-center gap-4 text-[11px] text-text-inverse/70 xl:flex">
          {TRUST_STATS.map((s) => {
            const Icon = s.icon;
            return (
              <span key={s.label} className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 text-accent-300" />
                <span className="font-medium text-text-inverse/80">
                  {s.label}
                </span>
                <span className="text-text-inverse/50">· {s.sub}</span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default NavPromoStrip;
