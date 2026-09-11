import { brand } from '@repo/config/brand';

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
