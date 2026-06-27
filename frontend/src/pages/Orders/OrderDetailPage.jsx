// OrderDetailPage — single order detail with timeline.
import { usePageTitle } from '@/hooks/usePageTitle';
import PagePlaceholder from '@/components/common/PagePlaceholder';

const OrderDetailPage = () => {
  usePageTitle('Order · PCCraft');
  return (
    <PagePlaceholder
      module="Module 9 — Orders"
      title="Order detail"
      subtitle="Line items, shipping address, status timeline."
      bullets={[
        'orderService.detail(orderNumber)',
        'Status timeline (ordered → packed → shipped → delivered)',
        'Cancel button if status is `pending` or `confirmed`',
        '"Request return" link if delivered within 7 days',
      ]}
    />
  );
};

export default OrderDetailPage;