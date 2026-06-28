// CategoryDetailPage — products in a single category.
//
// Module 7 adds the "Trending in <category>" carousel under the existing
// product grid. The product grid itself is owned by Module 4 — for now
// we render the carousel alongside a placeholder banner so the
// recommendation layer is wired even before Module 4 lands.
import { usePageTitle } from '@hooks/usePageTitle';
import { useParams } from 'react-router-dom';
import PagePlaceholder from '@components/common/PagePlaceholder';
import RecommendationCarousel from '@components/recommendation/RecommendationCarousel';
import { recommendationService } from '@services/recommendationService';

const CategoryDetailPage = () => {
  usePageTitle('Category · PCCraft');
  const { slug } = useParams();

  return (
    <div className="flex flex-col">
      <PagePlaceholder
        module="Module 4 — Catalog"
        title={`Category: ${slug}`}
        subtitle="Filtered product grid for a single category."
        bullets={[
          'Sub-category chips at the top',
          'productService.list({ category: slug })',
          'Same filters as /products, scoped to the category',
        ]}
      />
      <RecommendationCarousel
        title="Trending in this category"
        fetchFn={() => recommendationService.getTrending({ category_id: slug, limit: 10 })}
      />
    </div>
  );
};

export default CategoryDetailPage;