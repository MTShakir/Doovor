import { PortalPlaceholder, sectionParams } from '@/components/portal-placeholder';

export function generateStaticParams() {
  return sectionParams('learner');
}

export default async function LearnerSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return <PortalPlaceholder portal="learner" section={section} />;
}
