// OrdersPage — order history.
import { usePageTitle } from '@/hooks/usePageTitle';
import PagePlaceholder from '@/components/common/PagePlaceholder';

const OrdersPage = () => {
  usePageTitle('Orders · PCCraft');
  return (
    <PagePlaceholder
      module="Module 9 — Orders"
      title="My orders"
      subtitle="All your past and active orders."
      bullets={[
        'orderService.list() paginated by date desc',
        'Status pill: pending / confirmed / shipped / delivered / cancelled',
        'Row click → /orders/:orderNumber',
      ]}
    />
  );
};

export default OrdersPage;