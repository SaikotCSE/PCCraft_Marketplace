// VendorDashboardPage — vendor home with KPIs.
import { usePageTitle } from '@/hooks/usePageTitle';
import PagePlaceholder from '@/components/common/PagePlaceholder';

const VendorDashboardPage = () => {
  usePageTitle('Vendor dashboard · PCCraft');
  return (
    <PagePlaceholder
      module="Module 11 — Vendor Portal"
      title="Vendor dashboard"
      subtitle="KPIs: revenue, orders, top products, low-stock alerts."
      bullets={[
        'vendorService.myDashboard()',
        'Revenue chart (last 30 days) — recharts',
        'Order queue pending fulfilment',
        'Low-stock product list',
      ]}
    />
  );
};

export default VendorDashboardPage;