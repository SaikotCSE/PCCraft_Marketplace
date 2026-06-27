// AdminVendorsPage — vendor approval queue + active vendors.
import { usePageTitle } from '@/hooks/usePageTitle';
import PagePlaceholder from '@/components/common/PagePlaceholder';

const AdminVendorsPage = () => {
  usePageTitle('Vendors · Admin · PCCraft');
  return (
    <PagePlaceholder
      module="Module 12 — Admin Console"
      title="Vendor management"
      subtitle="Pending approvals + active vendor directory."
      bullets={[
        'adminService.pendingVendors() / adminService.listUsers({ role: vendor })',
        'Approve / Reject buttons (reject requires a reason)',
        'Click vendor row → full application review drawer',
      ]}
    />
  );
};

export default AdminVendorsPage;