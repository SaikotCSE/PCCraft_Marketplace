// HomePage — landing page.
//
// Module 0 placeholder. The real home page (hero + featured categories +
// trending products + PC-builder CTA + footer) lands in Module 3.
import { usePageTitle } from '@/hooks/usePageTitle';
import PagePlaceholder from '@/components/common/PagePlaceholder';

const HomePage = () => {
  usePageTitle('PCCraft Marketplace');
  return (
    <PagePlaceholder
      module="Module 0 — Scaffolding"
      title="Welcome to PCCraft Marketplace"
      subtitle="Bangladesh's marketplace for PC components, peripherals, and pre-built rigs."
      bullets={[
        'Hero banner with current promo + featured vendor',
        'Category grid (CPUs, GPUs, RAM, Storage, Cases, PSUs, Cooling, Peripherals)',
        'Trending products strip',
        'PC Builder CTA banner',
        'Vendor spotlight',
      ]}
    />
  );
};

export default HomePage;