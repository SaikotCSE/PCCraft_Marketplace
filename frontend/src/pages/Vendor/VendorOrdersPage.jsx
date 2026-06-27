// VendorOrdersPage — vendor's incoming orders.
import { usePageTitle } from '@/hooks/usePageTitle';
import PagePlaceholder from '@/components/common/PagePlaceholder';

const VendorOrdersPage = () => {
  usePageTitle('Vendor orders · PCCraft');
  return (
    <PagePlaceholder
      module="Module 11 — Vendor Portal"
      title="Orders to fulfil"
      subtitle="All orders that include at least one of your products."
      bullets={[
        'vendorService.myOrders({ status })',
        'Action buttons: confirm, pack, ship (with tracking #), cancel',
        'Bulk print packing slip (PDF)',
      ]}
    />
  );
};

export default VendorOrdersPage;