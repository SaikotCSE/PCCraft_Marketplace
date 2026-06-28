// HomePage — landing page.
//
// Module 7 additions:
//   - Trending Now carousel (public)
//   - Recommended For You carousel (IsAuthenticated)
//   - Recently Viewed carousel (IsAuthenticated)
// All carousels lazy-load via useIntersectionObserver.
import { usePageTitle } from '@hooks/usePageTitle';
import { useAuthStore } from '@context/useAuthStore';
import RecommendationCarousel from '@components/recommendation/RecommendationCarousel';
import { recommendationService } from '@services/recommendationService';
import { getSessionKey } from '@utils/sessionKey';

const HomePage = () => {
  usePageTitle('PCCraft Marketplace');
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const sessionKey = getSessionKey();

  return (
    <div className="flex flex-col gap-2">
      {/* Hero / featured banner area is owned by the marketing module; the
          recommendation block sits below it for every visitor. */}
      <RecommendationCarousel
        title="Trending Now"
        fetchFn={() => recommendationService.getTrending({ limit: 10 })}
      />

      <RecommendationCarousel
        title="Recommended For You"
        fetchFn={() => recommendationService.getPersonalized({ limit: 10 })}
        hidden={!isAuthenticated}
      />

      <RecommendationCarousel
        title="Recently Viewed"
        fetchFn={() =>
          recommendationService.getRecentlyViewed({ limit: 10, sessionKey })
        }
        hidden={!isAuthenticated}
      />
    </div>
  );
};

export default HomePage;