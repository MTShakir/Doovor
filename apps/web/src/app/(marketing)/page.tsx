import { brand } from '@repo/config/brand';
import type { Metadata } from 'next';
import { publicPageMetadata } from '@/lib/public/metadata';

/** The site's own name, at the site's root (PRD 14.6). */
export function generateMetadata(): Metadata {
  return publicPageMetadata({ title: brand.name, description: brand.tagline, path: '/', indexable: true, absoluteTitle: true });
}

// Placeholder home until the marketing pages land in M5 (PRD 8.3).
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-6">
      <p className="text-small font-semibold text-grey-700">{brand.name}</p>
      <h1 className="text-display text-black">Driving lessons, sorted.</h1>
      <p className="text-body text-ink">{brand.tagline}</p>
    </main>
  );
}
