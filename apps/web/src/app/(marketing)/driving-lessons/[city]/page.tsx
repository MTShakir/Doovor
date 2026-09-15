import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PlaceContent, placeMetadata, PlaceSkeleton } from '../place';

type Props = PageProps<'/driving-lessons/[city]'>;

/** A city's page: its instructors, its areas and its automatic lessons (PRD 8.3, M5-07). */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolved = await params;
  return placeMetadata({ city: resolved.city, area: null, automatic: false });
}

export default function CityRoute({ params }: Props) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <Suspense fallback={<PlaceSkeleton />}>
        <PlaceContent params={params.then((resolved) => ({ city: resolved.city, area: null, automatic: false }))} />
      </Suspense>
    </main>
  );
}
