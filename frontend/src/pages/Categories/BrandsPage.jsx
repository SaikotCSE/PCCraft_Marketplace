// BrandsPage — all brands.
import { usePageTitle } from '@/hooks/usePageTitle';
import PagePlaceholder from '@/components/common/PagePlaceholder';

const BrandsPage = () => {
  usePageTitle('Brands · PCCraft');
  return (
    <PagePlaceholder
      module="Module 3 — Catalog Taxonomy"
      title="Brands"
      subtitle="A → Z grid of every brand with at least one live product."
      bullets={[
        'Logo grid from brandService.list()',
        'Search box for quick filtering',
        'Click → /brands/:slug',
      ]}
    />
  );
};

export default BrandsPage;