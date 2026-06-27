// NotFoundPage — 404 fallback for unknown routes.
import { usePageTitle } from '@/hooks/usePageTitle';
import PagePlaceholder from '@/components/common/PagePlaceholder';

const NotFoundPage = () => {
  usePageTitle('Not found · PCCraft');
  return (
    <PagePlaceholder
      module="Module 0 — Scaffolding"
      title="404 — Page not found"
      subtitle="The page you were looking for doesn't exist."
      bullets={[
        'Shown for any route not matched by AppRouter',
        'Calls useUIStore.closeAllModals() on mount to clean up state',
      ]}
    />
  );
};

export default NotFoundPage;