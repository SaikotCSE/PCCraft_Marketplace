// AdminUsersPage — user moderation.
import { usePageTitle } from '@/hooks/usePageTitle';
import PagePlaceholder from '@/components/common/PagePlaceholder';

const AdminUsersPage = () => {
  usePageTitle('Users · Admin · PCCraft');
  return (
    <PagePlaceholder
      module="Module 12 — Admin Console"
      title="Users"
      subtitle="All accounts with role + status filters."
      bullets={[
        'adminService.listUsers({ role, status, q })',
        'Ban / unban toggle (with reason)',
        'Impersonate button for support (logs to audit trail)',
      ]}
    />
  );
};

export default AdminUsersPage;