// AdminReturnsPage — return request moderation.
import { usePageTitle } from '@/hooks/usePageTitle';
import PagePlaceholder from '@/components/common/PagePlaceholder';

const AdminReturnsPage = () => {
  usePageTitle('Returns · Admin · PCCraft');
  return (
    <PagePlaceholder
      module="Module 12 — Admin Console"
      title="Return requests"
      subtitle="Approve, reject, mark refunded."
      bullets={[
        'returnService.list() with status filter',
        'Approve / reject (requires reason) / mark refunded',
      ]}
    />
  );
};

export default AdminReturnsPage;