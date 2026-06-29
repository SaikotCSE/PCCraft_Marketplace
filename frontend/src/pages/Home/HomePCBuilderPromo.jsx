// HomePCBuilderPromo — spotlight banner for the PC Builder /
// Compatibility feature on the HomePage.
//
// The data-driven compatibility checker is the project's biggest
// differentiator (PCCraft_Master_Spec_v4.md §2.10). This block makes
// it discoverable from the homepage with a clear CTA.
import { Link } from 'react-router-dom';
import { Cpu, ArrowRight, CheckCircle2 } from 'lucide-react';

import { paths } from '@routes/routePaths';

const bullets = [
  '10+ compatibility rules',
  'Real-time wattage check',
  'Save & share your build',
];

const HomePCBuilderPromo = () => (
  <section className="mx-auto w-full max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
    <div className="relative overflow-hidden rounded-2xl border border-primary-900/10 bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 px-6 py-10 shadow-xl shadow-primary-900/20 sm:px-10 sm:py-12">
      {/* Glow accent */}
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent-500/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-accent-400/20 blur-3xl" />

      <div className="relative grid gap-8 lg:grid-cols-2 lg:items-center">
        <div className="text-text-inverse">
          <span className="inline-flex items-center gap-2 rounded-full bg-accent-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent-300">
            <Cpu className="h-3.5 w-3.5" /> Smart PC Builder
          </span>
          <h2 className="mt-4 font-heading text-2xl font-bold sm:text-3xl lg:text-4xl">
            Build a compatible rig in minutes.
          </h2>
          <p className="mt-3 max-w-lg text-sm text-text-inverse/80 sm:text-base">
            Pick a CPU, motherboard, GPU, PSU and case — we automatically
            check socket, RAM type, form factor, wattage and more before
            you commit to a purchase.
          </p>

          <ul className="mt-5 space-y-2">
            {bullets.map((b) => (
              <li
                key={b}
                className="flex items-center gap-2 text-sm text-text-inverse/90"
              >
                <CheckCircle2 className="h-4 w-4 text-accent-400" />
                {b}
              </li>
            ))}
          </ul>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              to={paths.pcBuilder()}
              className="group inline-flex items-center gap-2 rounded-md bg-accent-500 px-5 py-3 text-sm font-semibold text-primary-900 shadow-lg shadow-accent-500/30 transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent-400"
            >
              Start a build
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              to={paths.myBuilds()}
              className="inline-flex items-center gap-2 rounded-md border border-text-inverse/20 px-5 py-3 text-sm font-semibold text-text-inverse/90 transition hover:bg-primary-700/50"
            >
              My saved builds
            </Link>
          </div>
        </div>

        {/* Decorative slot diagram */}
        <div className="hidden lg:block">
          <div className="relative mx-auto grid max-w-md grid-cols-3 gap-3">
            {['CPU', 'GPU', 'RAM', 'SSD', 'PSU', 'CASE'].map((slot, i) => (
              <div
                key={slot}
                className="flex aspect-square items-center justify-center rounded-xl border border-text-inverse/15 bg-primary-800/60 text-center font-heading text-sm font-bold text-accent-300 shadow-inner"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                {slot}
              </div>
            ))}
            <div className="absolute inset-0 -z-10 rounded-2xl border border-accent-500/30" />
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default HomePCBuilderPromo;