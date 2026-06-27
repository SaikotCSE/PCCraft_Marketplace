// VendorPublicPage — public storefront for a vendor (/:storeSlug).
import { usePageTitle } from '@/hooks/usePageTitle';
import PagePlaceholder from '@/components/common/PagePlaceholder';

const VendorPublicPage = () => {
  usePageTitle('Vendor · PCCraft');
  return (
    <PagePlaceholder
      module="Module 11 — Vendor Portal"
      title="Vendor storefront"
      subtitle="Public store page — banner, policies, product grid."
      bullets={[
        'vendorService.publicProfile(storeSlug)',
        'Product grid scoped to that vendor',
        'Rating + review summary',
        '"Follow" / contact buttons',
      ]}
    />
  );
};

export default VendorPublicPage;