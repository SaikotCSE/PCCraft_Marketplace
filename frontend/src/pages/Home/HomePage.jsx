// HomePage — landing page.
//
// Module 7 (recommendation carousels) + UI upgrade module
// (hero, category grid, builder promo, value strip, brand strip).
//
// Sections, top → bottom:
//   1. HomeHero               — branded hero + dual CTA + quick category chips
//   2. HomeFeatureStrip       — 4-tile trust / value props
//   3. HomeCategoryGrid       — category tiles linking into /products
//   4. Trending Now carousel  — public, global trending (Module 7)
//   5. Recommended For You    — IsAuthenticated (Module 7)
//   6. Recently Viewed        — IsAuthenticated (Module 7)
//   7. HomePCBuilderPromo     — spotlights the compatibility feature
//   8. HomeBrandStrip         — lazy-loaded brand logos
//
// Every async section uses its own skeleton/empty/error state. The
// three recommendation carousels reuse the existing
// `RecommendationCarousel` from Module 7 — no regressions.
import { usePageTitle } from '@hooks/usePageTitle';
import { useAuthStore } from '@context/useAuthStore';
import RecommendationCarousel from '@components/recommendation/RecommendationCarousel';
import { recommendationService } from '@services/recommendationService';
import { getSessionKey } from '@utils/sessionKey';

import HomeHero from './HomeHero';
import HomeFeatureStrip from './HomeFeatureStrip';
import HomeCategoryGrid from './HomeCategoryGrid';
import HomePCBuilderPromo from './HomePCBuilderPromo';
import HomeBrandStrip from './HomeBrandStrip';

const HomePage = () => {
  usePageTitle('PCCraft Marketplace');
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const sessionKey = getSessionKey();

  return (
    <div className="flex flex-col">
      <HomeHero />
      <HomeFeatureStrip />
      <HomeCategoryGrid />

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

      <HomePCBuilderPromo />
      <HomeBrandStrip />
    </div>
  );
};

export default HomePage;