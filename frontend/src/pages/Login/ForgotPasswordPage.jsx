// ForgotPasswordPage — request a password reset email.
import { usePageTitle } from '@/hooks/usePageTitle';
import PagePlaceholder from '@/components/common/PagePlaceholder';

const ForgotPasswordPage = () => {
  usePageTitle('Forgot password · PCCraft');
  return (
    <PagePlaceholder
      module="Module 2 — Auth"
      title="Forgot your password?"
      subtitle="Enter your account email and we'll send a reset link."
      bullets={[
        'Single email input + submit',
        'Always returns success (no user-enumeration)',
        'Calls authService.requestPasswordReset()',
      ]}
    />
  );
};

export default ForgotPasswordPage;