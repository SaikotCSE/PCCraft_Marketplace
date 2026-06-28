// OrderConfirmPage — post-checkout confirmation screen.
//
// Module 7 places the "Other Customers Also Bought" carousel here. The
// checkout / payment confirmation flow itself is owned by Module 5;
// for now this file just provides the recommendation slot so Module 7's
// placement contract is satisfied end-to-end.
import { usePageTitle } from '@hooks/usePageTitle';
import RecommendationCarousel from '@components/recommendation/RecommendationCarousel';
import { recommendationService } from '@services/recommendationService';

const OrderConfirmPage = () => {
  usePageTitle('Order confirmed · PCCraft');

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="rounded-xl border border-border bg-surface p-8 text-center">
        <h1 className="font-heading text-2xl font-bold text-text-primary">
          Order confirmed
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Module 5 will render the full order summary + receipt here.
        </p>
      </div>

      <RecommendationCarousel
        title="Other Customers Also Bought"
        fetchFn={() => recommendationService.getTrending({ limit: 10 })}
      />
    </section>
  );
};

export default OrderConfirmPage;