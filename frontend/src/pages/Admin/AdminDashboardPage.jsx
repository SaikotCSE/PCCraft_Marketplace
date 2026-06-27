// AdminDashboardPage — platform-wide KPIs.
import { usePageTitle } from '@/hooks/usePageTitle';
import PagePlaceholder from '@/components/common/PagePlaceholder';

const AdminDashboardPage = () => {
  usePageTitle('Admin · PCCraft');
  return (
    <PagePlaceholder
      module="Module 12 — Admin Console"
      title="Platform dashboard"
      subtitle="GMV, MAU, vendor pending approvals, returns queue."
      bullets={[
        'adminService.dashboard()',
        'GMV chart (last 90 days) — recharts',
        'Pending vendor approval queue (top of page)',
        'Open return requests count',
      ]}
    />
  );
};

export default AdminDashboardPage;