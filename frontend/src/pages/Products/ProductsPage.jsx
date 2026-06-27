// ProductsPage — paginated product list with filters.
import { usePageTitle } from '@/hooks/usePageTitle';
import PagePlaceholder from '@/components/common/PagePlaceholder';

const ProductsPage = () => {
  usePageTitle('Products · PCCraft');
  return (
    <PagePlaceholder
      module="Module 4 — Catalog"
      title="All products"
      subtitle="Browse, filter, and sort across every vendor."
      bullets={[
        'Category + brand + price range + rating filters',
        'Sort: relevance / newest / price asc / price desc / rating',
        'Paginated grid with skeleton loaders',
        'Uses productService.list() with debounced filter state',
      ]}
    />
  );
};

export default ProductsPage;