// CartPage — line items + totals + checkout button.
import { usePageTitle } from '@/hooks/usePageTitle';
import PagePlaceholder from '@/components/common/PagePlaceholder';

const CartPage = () => {
  usePageTitle('Cart · PCCraft');
  return (
    <PagePlaceholder
      module="Module 6 — Cart"
      title="Your cart"
      subtitle="Line items, quantities, subtotal, taxes, shipping."
      bullets={[
        'Read-only line items with quantity stepper',
        'Optimistic updates via useCartStore.updateQty()',
        'Totals card: subtotal, VAT 5%, shipping ৳60, grand total',
        'Continue → /checkout (auth required)',
      ]}
    />
  );
};

export default CartPage;