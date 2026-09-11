import { PortalPlaceholder, sectionParams } from '@/components/portal-placeholder';

export function generateStaticParams() {
  return sectionParams('school');
}

export default async function SchoolSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return <PortalPlaceholder portal="school" section={section} />;
}
