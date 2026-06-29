// HomeHero — top-of-page hero block on the HomePage.
//
// Per spec §1.2 (single light theme, navy chrome) we render the hero
// on the page's surface-100 background with a deep navy → indigo
// gradient panel inside. Copy + dual CTAs on the left, decorative
// SVG illustration + floating "stat" cards on the right.
//
// Designed to feel like a real marketplace landing (not a placeholder)
// while staying inside the spec's tokens — no third-party image assets.
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Cpu,
  HardDrive,
  MemoryStick,
  Monitor,
  Zap,
  ShieldCheck,
  Truck,
} from 'lucide-react';

import { paths } from '@routes/routePaths';

const quickLinks = [
  { label: 'CPUs', to: paths.products() + '?category=cpu', icon: Cpu },
  { label: 'GPUs', to: paths.products() + '?category=gpu', icon: Monitor },
  { label: 'RAM', to: paths.products() + '?category=ram', icon: MemoryStick },
  { label: 'Storage', to: paths.products() + '?category=storage', icon: HardDrive },
  { label: 'PSU', to: paths.products() + '?category=psu', icon: Zap },
];

const HomeHero = () => (
  <section className="relative overflow-hidden border-b border-surface-300 bg-surface-100">
    {/* Decorative background grid + blobs */}
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute -left-32 -top-32 h-72 w-72 rounded-full bg-accent-500/20 blur-3xl" />
      <div className="absolute -right-24 top-12 h-80 w-80 rounded-full bg-primary-900/10 blur-3xl" />
      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full opacity-[0.06]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="hero-grid"
            width="32"
            height="32"
            patternUnits="userSpaceOnUse"
          >
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#0F172A" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hero-grid)" />
      </svg>
    </div>

    <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-12 lg:gap-12 lg:px-8 lg:py-20">
      {/* Left — copy + CTAs */}
      <div className="lg:col-span-7">
        <span className="inline-flex items-center gap-2 rounded-full border border-accent-300 bg-accent-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent-700">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-500" />
          Bangladesh's PC Marketplace
        </span>

        <h1 className="mt-5 font-heading text-4xl font-bold leading-tight text-text-primary sm:text-5xl lg:text-6xl">
          Build it. Buy it.{' '}
          <span className="bg-gradient-to-r from-accent-500 to-primary-900 bg-clip-text text-transparent">
            Ship it faster.
          </span>
        </h1>

        <p className="mt-5 max-w-xl text-base text-text-secondary sm:text-lg">
          Shop verified PC components from trusted vendors, or open the
          PC Builder for an automated compatibility check across 10+ hardware
          rules — wattage, socket, form factor and more.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            to={paths.products()}
            className="group inline-flex items-center gap-2 rounded-md bg-accent-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-accent-500/30 transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent-600"
          >
            Shop all products
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <Link
            to={paths.pcBuilder()}
            className="inline-flex items-center gap-2 rounded-md border border-primary-900/15 bg-surface-50 px-5 py-3 text-sm font-semibold text-text-primary shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-900/30 hover:shadow-md"
          >
            <Cpu className="h-4 w-4" />
            Open PC Builder
          </Link>
        </div>

        {/* Quick category chips */}
        <div className="mt-8 flex flex-wrap gap-2">
          {quickLinks.map((q) => {
            const Icon = q.icon;
            return (
              <Link
                key={q.label}
                to={q.to}
                className="group inline-flex items-center gap-2 rounded-full border border-surface-300 bg-surface-50 px-3.5 py-1.5 text-xs font-medium text-text-secondary shadow-sm transition hover:border-accent-400 hover:text-accent-700"
              >
                <Icon className="h-3.5 w-3.5" />
                {q.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Right — illustration + stat cards */}
      <div className="relative hidden lg:col-span-5 lg:block">
        <div className="relative mx-auto aspect-square w-full max-w-md">
          {/* Decorative ring */}
          <div className="absolute inset-0 rounded-3xl border border-surface-300 bg-gradient-to-br from-primary-900 to-primary-800 shadow-2xl shadow-primary-900/30">
            <div className="absolute inset-0 rounded-3xl bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.35),transparent_60%)]" />
            <div className="absolute inset-0 grid place-items-center">
              <Cpu className="h-32 w-32 text-accent-400 opacity-90" strokeWidth={1.2} />
            </div>
            {/* Floating chips */}
            <div className="absolute -left-6 top-10 flex items-center gap-2 rounded-full bg-surface-50 px-3 py-2 text-xs font-semibold text-text-primary shadow-lg">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-success/15 text-success">
                <ShieldCheck className="h-3.5 w-3.5" />
              </span>
              Trade-licensed vendors
            </div>
            <div className="absolute -right-4 top-32 flex items-center gap-2 rounded-full bg-surface-50 px-3 py-2 text-xs font-semibold text-text-primary shadow-lg">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-warning/15 text-warning">
                <Zap className="h-3.5 w-3.5" />
              </span>
              Real-time compatibility
            </div>
            <div className="absolute -bottom-4 left-6 flex items-center gap-2 rounded-full bg-surface-50 px-3 py-2 text-xs font-semibold text-text-primary shadow-lg">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-info/15 text-info">
                <Truck className="h-3.5 w-3.5" />
              </span>
              Fast Dhaka delivery
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default HomeHero;