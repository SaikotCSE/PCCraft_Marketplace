// VendorProductNewPage — create product wizard.
import { usePageTitle } from '@/hooks/usePageTitle';
import PagePlaceholder from '@/components/common/PagePlaceholder';

const VendorProductNewPage = () => {
  usePageTitle('New product · PCCraft');
  return (
    <PagePlaceholder
      module="Module 11 — Vendor Portal"
      title="Add a new product"
      subtitle="Multi-step wizard: Basics → Media → Specs → Pricing → Inventory."
      bullets={[
        'react-hook-form + Zod productSchema (server is the source of truth)',
        'Image upload via presigned URLs (django-storages + S3 in prod)',
        'Live compatibility-tag picker (CPU socket, RAM type, ...)',
      ]}
    />
  );
};

export default VendorProductNewPage;