import { MoreMenu } from '@/components/more-menu';

export default function LearnerAccountPage() {
  return <MoreMenu title="Account" links={[{ href: '/account', title: 'Account and security', subtitle: 'Password, devices, two-step verification' }]} />;
}
