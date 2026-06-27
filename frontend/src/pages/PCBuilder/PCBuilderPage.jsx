// PCBuilderPage — drag-and-drop compatibility checker.
import { usePageTitle } from '@/hooks/usePageTitle';
import PagePlaceholder from '@/components/common/PagePlaceholder';

const PCBuilderPage = () => {
  usePageTitle('PC Builder · PCCraft');
  return (
    <PagePlaceholder
      module="Module 8 — PC Builder"
      title="Build your PC"
      subtitle="Pick parts, check compatibility, save the build, share a link."
      bullets={[
        'Slot list: CPU, Motherboard, RAM, GPU, Storage, PSU, Case, Cooler',
        'usePCBuilder() hook for local state',
        'compatibilityService.checkBuild(buildId) after each change',
        '"Save build" → returns shareable URL',
        'Compatibility warnings shown inline + at the top of the summary card',
      ]}
    />
  );
};

export default PCBuilderPage;