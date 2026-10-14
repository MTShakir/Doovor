import { Button } from '@repo/ui/button';
import type { Route } from 'next';
import Link from 'next/link';
import { PassPhotoCard, type PassPhoto } from './pass-photo';

/**
 * The passes on a public profile (D-218): three of them, and the way to the rest (D-268).
 *
 * The database chooses the three, the ones we have checked first, so the tick is what a learner
 * deciding whether to book sees before anything else. One to a row on a phone, where two across is
 * too small to see a face, and the three side by side from the tablet width up.
 */
export function PassWall({
  photos,
  total,
  businessName,
  colour,
  title,
  description,
  galleryHref,
}: {
  photos: PassPhoto[];
  /** How many are up in all, which says whether there is a rest to open. */
  total: number;
  businessName: string;
  colour: string | null;
  title: string;
  description: string;
  /** The whole wall, on a page of its own. */
  galleryHref: string;
}) {
  if (photos.length === 0) return null;
  return (
    <section className="flex flex-col gap-4" aria-labelledby="passes-title">
      <div className="flex flex-col gap-1">
        <h2 id="passes-title" className="text-h2 text-black">
          {title}
        </h2>
        <p className="text-body text-grey-700">{description}</p>
      </div>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-start">
        {photos.map((photo) => (
          <li key={photo.id}>
            <PassPhotoCard photo={photo} businessName={businessName} colour={colour} />
          </li>
        ))}
      </ul>
      {total > photos.length ? (
        <Button variant="secondary" width="responsive" className="md:self-start" asChild>
          <Link href={galleryHref as Route}>View full gallery</Link>
        </Button>
      ) : null}
    </section>
  );
}

/**
 * The whole wall, on the gallery's own page (D-268): every photo still up, newest first.
 *
 * In columns rather than rows: each photo is its own shape (D-267), and in rows an upright one
 * leaves a gap under the one beside it. The newest is at the top of the first column.
 */
export function FullPassWall({
  photos,
  businessName,
  colour,
}: {
  photos: PassPhoto[];
  businessName: string;
  colour: string | null;
}) {
  return (
    <ul className="gap-4 sm:columns-2 lg:columns-3">
      {photos.map((photo) => (
        <li key={photo.id} className="mb-4 break-inside-avoid last:mb-0">
          <PassPhotoCard photo={photo} businessName={businessName} colour={colour} />
        </li>
      ))}
    </ul>
  );
}
