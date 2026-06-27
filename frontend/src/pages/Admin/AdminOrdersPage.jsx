// AdminOrdersPage — all platform orders.
import { usePageTitle } from '@/hooks/usePageTitle';
import PagePlaceholder from '@/components/common/PagePlaceholder';

const AdminOrdersPage = () => {
  usePageTitle('Orders · Admin · PCCraft');
  return (
    <PagePlaceholder
      module="Module 12 — Admin Console"
      title="All orders"
      subtitle="Platform-wide order moderation."
      bullets={[
        'adminService.listOrders({ status, vendor, date_from, date_to })',
        'Force-cancel + refund actions',
      ]}
    />
  );
};

export default AdminOrdersPage;