import { PortalPlaceholder, sectionParams } from '@/components/portal-placeholder';

export function generateStaticParams() {
  return sectionParams('instructor');
}

export default async function InstructorSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return <PortalPlaceholder portal="instructor" section={section} />;
}
