// VendorProductEditPage — edit existing product.
import { usePageTitle } from '@/hooks/usePageTitle';
import PagePlaceholder from '@/components/common/PagePlaceholder';

const VendorProductEditPage = () => {
  usePageTitle('Edit product · PCCraft');
  return (
    <PagePlaceholder
      module="Module 11 — Vendor Portal"
      title="Edit product"
      subtitle="Same wizard as /vendor/products/new, hydrated from server data."
      bullets={[
        'PATCH /vendor/products/:slug/ on each step save',
        '"Archive" toggle hides product from public catalog',
      ]}
    />
  );
};

export default VendorProductEditPage;