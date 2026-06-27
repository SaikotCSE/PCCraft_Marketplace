// VendorProductsPage — vendor's product list (manageable).
import { usePageTitle } from '@/hooks/usePageTitle';
import PagePlaceholder from '@/components/common/PagePlaceholder';

const VendorProductsPage = () => {
  usePageTitle('My products · PCCraft');
  return (
    <PagePlaceholder
      module="Module 11 — Vendor Portal"
      title="My products"
      subtitle="List, edit, archive, restock."
      bullets={[
        'vendorService.myProducts()',
        'Inline stock editor + bulk actions',
        '"New product" → /vendor/products/new',
        'Row click → /vendor/products/:slug/edit',
      ]}
    />
  );
};

export default VendorProductsPage;