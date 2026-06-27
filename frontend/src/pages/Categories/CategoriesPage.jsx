// CategoriesPage — full category tree.
import { usePageTitle } from '@/hooks/usePageTitle';
import PagePlaceholder from '@/components/common/PagePlaceholder';

const CategoriesPage = () => {
  usePageTitle('Categories · PCCraft');
  return (
    <PagePlaceholder
      module="Module 3 — Catalog Taxonomy"
      title="Categories"
      subtitle="Hierarchical product taxonomy (CPUs → Gaming CPUs, Server CPUs, ...)."
      bullets={[
        'Category tree from categoryService.tree()',
        'Click a leaf → /categories/:slug',
        'Each card shows count of products',
      ]}
    />
  );
};

export default CategoriesPage;