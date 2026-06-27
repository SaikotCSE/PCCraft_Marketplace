// SearchPage — full search results.
import { usePageTitle } from '@/hooks/usePageTitle';
import PagePlaceholder from '@/components/common/PagePlaceholder';

const SearchPage = () => {
  usePageTitle('Search · PCCraft');
  return (
    <PagePlaceholder
      module="Module 5 — Search"
      title="Search results"
      subtitle="Full-text search powered by Postgres GIN + trigram."
      bullets={[
        'Query from ?q= URL param',
        'searchService.products(q, { page, sort })',
        'Filters + facets on the left, results grid on the right',
        'Recent searches persisted in localStorage',
      ]}
    />
  );
};

export default SearchPage;