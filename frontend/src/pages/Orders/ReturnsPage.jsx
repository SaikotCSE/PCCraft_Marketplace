// ReturnsPage — customer's return requests.
import { usePageTitle } from '@/hooks/usePageTitle';
import PagePlaceholder from '@/components/common/PagePlaceholder';

const ReturnsPage = () => {
  usePageTitle('Returns · PCCraft');
  return (
    <PagePlaceholder
      module="Module 10 — Returns"
      title="My returns"
      subtitle="Open and historical return requests."
      bullets={[
        'returnService.list()',
        'Status pill: requested / approved / rejected / refunded',
        'Click row → return detail with timeline',
      ]}
    />
  );
};

export default ReturnsPage;