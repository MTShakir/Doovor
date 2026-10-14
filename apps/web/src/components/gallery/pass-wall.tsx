import { PassPhotoCard, type PassPhoto } from './pass-photo';

/**
 * A wall of pass photos on a public profile (D-218). Two across on a phone is too small to see a
 * face, so one on a phone and two from the tablet width up.
 *
 * In columns rather than rows: each photo is its own shape (D-267), and in rows an upright one
 * leaves a gap under the one beside it. The newest is still first, at the top of the first column.
 */
export function PassWall({
  photos,
  businessName,
  colour,
  title,
  description,
}: {
  photos: PassPhoto[];
  businessName: string;
  colour: string | null;
  title: string;
  description: string;
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
      <ul className="gap-4 sm:columns-2">
        {photos.map((photo) => (
          <li key={photo.id} className="mb-4 break-inside-avoid last:mb-0">
            <PassPhotoCard photo={photo} businessName={businessName} colour={colour} />
          </li>
        ))}
      </ul>
    </section>
  );
}
