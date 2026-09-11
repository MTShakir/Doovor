import { PortalPlaceholder, sectionParams } from '@/components/portal-placeholder';

export function generateStaticParams() {
  return sectionParams('admin');
}

export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return <PortalPlaceholder portal="admin" section={section} />;
}
