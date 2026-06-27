// WishlistPage — saved products.
import { usePageTitle } from '@/hooks/usePageTitle';
import PagePlaceholder from '@/components/common/PagePlaceholder';

const WishlistPage = () => {
  usePageTitle('Wishlist · PCCraft');
  return (
    <PagePlaceholder
      module="Module 7 — Wishlist"
      title="Your wishlist"
      subtitle="Products you saved for later."
      bullets={[
        'Grid of saved products from useWishlistStore',
        '"Move to cart" action: useCartStore.addItem() then remove from wishlist',
        'Empty state: "Find products you love" → /products',
      ]}
    />
  );
};

export default WishlistPage;