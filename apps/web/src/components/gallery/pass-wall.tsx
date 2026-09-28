import { PassPhotoCard, type PassPhoto } from './pass-photo';

/**
 * A wall of pass photos on a public profile (D-218). Two across on a phone is too small to see a
 * face, so one on a phone and two from the tablet width up.
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
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {photos.map((photo) => (
          <li key={photo.id}>
            <PassPhotoCard photo={photo} businessName={businessName} colour={colour} />
          </li>
        ))}
      </ul>
    </section>
  );
}
