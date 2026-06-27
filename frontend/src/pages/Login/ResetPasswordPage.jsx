// ResetPasswordPage — finalize password reset from email link.
import { usePageTitle } from '@/hooks/usePageTitle';
import PagePlaceholder from '@/components/common/PagePlaceholder';

const ResetPasswordPage = () => {
  usePageTitle('Reset password · PCCraft');
  return (
    <PagePlaceholder
      module="Module 2 — Auth"
      title="Choose a new password"
      subtitle="Reset link from your email. Token + uid encoded in the URL."
      bullets={[
        'New password + confirm field with Zod passwordSchema',
        'Calls authService.confirmPasswordReset(uid, token, password)',
        'On success → /login with success toast',
      ]}
    />
  );
};

export default ResetPasswordPage;