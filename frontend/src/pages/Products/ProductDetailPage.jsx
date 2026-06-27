// ProductDetailPage — single product page.
import { usePageTitle } from '@/hooks/usePageTitle';
import PagePlaceholder from '@/components/common/PagePlaceholder';

const ProductDetailPage = () => {
  usePageTitle('Product · PCCraft');
  return (
    <PagePlaceholder
      module="Module 4 — Catalog"
      title="Product details"
      subtitle="Image gallery, specs, vendor info, reviews, and add-to-cart."
      bullets={[
        'Image gallery + spec table + compatibility tags',
        'Vendor card (store name, rating, link to /vendors/:slug)',
        'Quantity selector with stock-aware max',
        'Add-to-cart and toggle-wishlist buttons',
        'Reviews list + write-a-review form',
        '"Frequently bought together" rail from recommendationService.coOccurrence()',
      ]}
    />
  );
};

export default ProductDetailPage;