// PagePlaceholder — temporary shell for every page that hasn't been
// built yet. Keeps the route tree alive so Vite + React Router can
// compile and load the app. Each later module replaces one or more of
// these placeholders with the real implementation.
import { Link } from 'react-router-dom';

import { paths } from '@/routes/routePaths';

/**
 * @param {object} props
 * @param {string} props.title — page title shown in the H1.
 * @param {string} [props.subtitle] — short description below the H1.
 * @param {string[]} [props.bullets] — bullet list of planned features.
 * @param {string} [props.module] — module name from the spec (e.g. "Module 4").
 * @param {string} [props.homeHref] — route to return to; defaults to /.
 */
const PagePlaceholder = ({ title, subtitle, bullets = [], module, homeHref }) => (
  <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
    <div className="rounded-lg border border-surface-200 bg-surface-50 p-8 shadow-sm">
      {module && (
        <span className="inline-block rounded-full bg-accent-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent-500">
          {module}
        </span>
      )}
      <h1 className="mt-4 font-heading text-3xl font-bold text-text-primary sm:text-4xl">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-3 max-w-2xl text-text-secondary">{subtitle}</p>
      )}

      {bullets.length > 0 && (
        <ul className="mt-6 space-y-2 text-sm text-text-secondary">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-2">
              <span className="mt-1.5 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent-500" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          to={homeHref || paths.home()}
          className="rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-primary-900 hover:bg-accent-400"
        >
          Back to home
        </Link>
      </div>
    </div>
  </section>
);

export default PagePlaceholder;
