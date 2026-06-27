// CategoryDetailPage — products in a single category.
import { usePageTitle } from '@/hooks/usePageTitle';
import PagePlaceholder from '@/components/common/PagePlaceholder';

const CategoryDetailPage = () => {
  usePageTitle('Category · PCCraft');
  return (
    <PagePlaceholder
      module="Module 4 — Catalog"
      title="Category products"
      subtitle="Filtered product grid for a single category."
      bullets={[
        'Sub-category chips at the top',
        'productService.list({ category: slug })',
        'Same filters as /products, scoped to the category',
      ]}
    />
  );
};

export default CategoryDetailPage;