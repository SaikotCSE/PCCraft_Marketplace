// CheckoutPage — address + shipping + payment selection.
import { usePageTitle } from '@/hooks/usePageTitle';
import PagePlaceholder from '@/components/common/PagePlaceholder';

const CheckoutPage = () => {
  usePageTitle('Checkout · PCCraft');
  return (
    <PagePlaceholder
      module="Module 9 — Orders"
      title="Checkout"
      subtitle="Address, shipping method, payment, review, place order."
      bullets={[
        'Steps: Address → Shipping → Payment → Review',
        'orderService.checkout(payload) returns orderNumber',
        'On success → /orders/:orderNumber with success toast',
        'Cash on Delivery + (later) SSL Commerz gateway',
      ]}
    />
  );
};

export default CheckoutPage;