// HomeFeatureStrip — value-prop / trust strip on the HomePage.
//
// Four-tile row highlighting the marketplace's unique value props:
//   1. Trade-licensed verified vendors (§2.3 vendor approval workflow)
//   2. Compatibility-checked carts  (§2.10 PC builder rules)
//   3. Fast Dhaka + nationwide delivery (operational highlight)
//   4. Secure payments + structured returns (§2.11 returns)
//
// Pure static block — no data fetch, no lazy-load.
import { ShieldCheck, Cpu, Truck, RotateCcw } from 'lucide-react';

const features = [
  {
    icon: ShieldCheck,
    title: 'Verified vendors',
    description: 'Every store is trade-licensed and approved before listing.',
    tone: 'text-success bg-success/10',
  },
  {
    icon: Cpu,
    title: 'Compatibility checked',
    description: 'Wattage, socket, form factor — verified as you build.',
    tone: 'text-accent-700 bg-accent-500/10',
  },
  {
    icon: Truck,
    title: 'Fast delivery',
    description: 'Same-day inside Dhaka, 2–4 days nationwide.',
    tone: 'text-info bg-info/10',
  },
  {
    icon: RotateCcw,
    title: 'Easy returns',
    description: 'Structured return & refund policy on every order.',
    tone: 'text-warning bg-warning/10',
  },
];

const HomeFeatureStrip = () => (
  <section className="border-y border-surface-300 bg-surface-50">
    <div className="mx-auto grid max-w-7xl gap-4 px-4 py-8 sm:px-6 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4 lg:px-8 lg:py-10">
      {features.map((f) => {
        const Icon = f.icon;
        return (
          <div
            key={f.title}
            className="group flex items-start gap-3 rounded-xl border border-transparent p-3 transition hover:border-surface-300 hover:bg-surface-100"
          >
            <span
              className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg ${f.tone}`}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="font-heading text-sm font-semibold text-text-primary">
                {f.title}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
                {f.description}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  </section>
);

export default HomeFeatureStrip;