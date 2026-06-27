// BrandDetailPage — products for one brand.
import { usePageTitle } from '@/hooks/usePageTitle';
import PagePlaceholder from '@/components/common/PagePlaceholder';

const BrandDetailPage = () => {
  usePageTitle('Brand · PCCraft');
  return (
    <PagePlaceholder
      module="Module 4 — Catalog"
      title="Brand products"
      subtitle="All products for one brand, with category sub-filter."
      bullets={[
        'productService.list({ brand: slug })',
        'Category chips to narrow within the brand',
      ]}
    />
  );
};

export default BrandDetailPage;