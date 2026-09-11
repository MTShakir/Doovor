import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DesignShowcase } from './showcase';

export const metadata: Metadata = { title: 'Design system', robots: { index: false, follow: false } };

/** Every component and state (PRD 7.4, M0-15). Development and preview only. */
export default function DesignPage() {
  if (process.env.APP_ENV === 'production') notFound();
  return <DesignShowcase />;
}
