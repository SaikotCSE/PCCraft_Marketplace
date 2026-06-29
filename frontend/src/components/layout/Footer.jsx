// Footer — site footer with link groups + social + legal copy.
import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin } from 'lucide-react';

import { paths } from '@routes/routePaths';
import { PCCRAFT_LOGO_TEXT } from '@assets/logos';

const groups = [
  {
    title: 'Shop',
    links: [
      { label: 'All Products', to: paths.products() },
      { label: 'Categories', to: paths.categories() },
      { label: 'Brands', to: paths.brands() },
      { label: 'PC Builder', to: paths.pcBuilder() },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Login', to: paths.login() },
      { label: 'Register', to: paths.register() },
      { label: 'Become a Vendor', to: paths.registerVendor() },
    ],
  },
  {
    title: 'Support',
    links: [
      { label: 'Help Center', to: paths.home() },
      { label: 'Returns', to: paths.home() },
      { label: 'Privacy Policy', to: paths.home() },
      { label: 'Terms of Service', to: paths.home() },
    ],
  },
];

const Footer = () => (
  <footer className="mt-auto border-t border-primary-700 bg-primary-800 text-text-inverse">
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4 lg:px-8">
      <div className="space-y-3">
        <div className="flex items-center gap-2 font-heading text-xl font-bold text-text-inverse">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-primary-900 text-accent-400">
            PC
          </span>
          {PCCRAFT_LOGO_TEXT}
        </div>
        <p className="text-sm text-text-inverse/80">
          Bangladesh's marketplace for PC components, peripherals, and pre-built rigs.
        </p>
        <ul className="space-y-2 text-sm text-text-inverse/80">
          <li className="flex items-center gap-2">
            <Mail className="h-4 w-4" /> support@pccraft.bd
          </li>
          <li className="flex items-center gap-2">
            <Phone className="h-4 w-4" /> +880 1700 000000
          </li>
          <li className="flex items-center gap-2">
            <MapPin className="h-4 w-4" /> Dhaka, Bangladesh
          </li>
        </ul>
      </div>

      {groups.map((group) => (
        <div key={group.title}>
          <h3 className="mb-3 pt-1 text-sm font-semibold uppercase tracking-wide text-text-inverse">
            {group.title}
          </h3>
          <ul className="space-y-2 text-sm text-text-inverse/80">
            {group.links.map((link) => (
              <li key={link.label}>
                <Link to={link.to} className="hover:text-accent-400">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>

    <div className="border-t border-primary-700 py-4 text-center text-xs text-text-inverse/70">
      © {new Date().getFullYear()} {PCCRAFT_LOGO_TEXT} Marketplace. All rights reserved.
    </div>
  </footer>
);

export default Footer;
