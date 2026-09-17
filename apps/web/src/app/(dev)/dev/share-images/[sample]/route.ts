import { instructorShareCard, placeShareCard, schoolShareCard, type ShareCard } from '@repo/core/share-card';
import sharp from 'sharp';
import { serverEnv } from '@/env/server';
import { shareImageResponse } from '@/lib/public/share-image';

/** A made-up photo, as a WebP like the ones kept for profiles, so the design page shows one drawn. */
async function samplePhoto(): Promise<string> {
  const webp = await sharp({ create: { width: 320, height: 320, channels: 3, background: { r: 120, g: 144, b: 156 } } })
    .webp()
    .toBuffer();
  return `data:image/webp;base64,${webp.toString('base64')}`;
}

async function sampleCard(name: string): Promise<ShareCard | null> {
  switch (name) {
    case 'instructor.png':
      return instructorShareCard({ name: 'Sarah Khan', qualification: 'adi', transmission: 'manual', cityName: 'Leeds', hourlyFromPence: 4200, takingBookings: true, photoUrl: null });
    case 'instructor-paused.png':
      return instructorShareCard({
        name: 'Aisha Rahman',
        qualification: 'pdi',
        transmission: 'both',
        cityName: 'Manchester',
        hourlyFromPence: 3850,
        takingBookings: false,
        photoUrl: await samplePhoto(),
      });
    case 'school.png':
      return schoolShareCard({ name: 'Quayside Driving School', cityName: 'Manchester', instructorCount: 2, hourlyFromPence: 4000, logoUrl: null });
    case 'place.png':
      return placeShareCard({ citySlug: 'london', cityName: 'London', area: { slug: 'croydon', name: 'Croydon' }, instructorCount: 4 });
    default:
      return null;
  }
}

/** The share images drawn from made-up cards, for the design page (PRD 14.6, M5-08). Not reachable in production. */
export async function GET(_request: Request, { params }: RouteContext<'/dev/share-images/[sample]'>): Promise<Response> {
  if (serverEnv.APP_ENV === 'production') return new Response('Not found', { status: 404 });
  const card = await sampleCard((await params).sample);
  if (card === null) return new Response('Not found', { status: 404 });
  return shareImageResponse(card);
}
