import { brand } from '@repo/config/brand';
import { passBannerWords } from '@repo/core/gallery';
import { BadgeCheck } from 'lucide-react';
import { galleryUrl } from '@/lib/storage/images';

export interface PassPhoto {
  id: string;
  learnerName: string;
  /** The calendar day they passed, as "YYYY-MM-DD". */
  passedOn: string;
  imagePath: string;
  verified: boolean;
}

/**
 * One pass photo with its banner (D-218).
 *
 * The banner is drawn in the Business own colour, the same one the booking page uses, and carries
 * white writing: D-210 only lets a colour be chosen at all when white on it can be read, so the
 * two rules are the same rule. Black where no colour has been chosen.
 *
 * The tick is black on white rather than green: green on a photograph is a colour that lands
 * somewhere different on every picture, and this one has to say the same thing every time.
 */
export function PassPhotoCard({
  photo,
  businessName,
  colour,
}: {
  photo: PassPhoto;
  businessName: string;
  colour: string | null;
}) {
  const words = passBannerWords({ learnerName: photo.learnerName, passedOn: photo.passedOn, businessName });
  return (
    <figure className="overflow-hidden rounded-card border border-grey-200 bg-white">
      <div className="relative">
        {/* Not next/image: the picture is on a storage host, already resized to the width it is
            shown at, and a public page that waits for an optimiser is a page that loads slower. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={galleryUrl(photo.imagePath)}
          alt={words}
          loading="lazy"
          decoding="async"
          className="aspect-[4/3] w-full bg-grey-100 object-cover"
        />
        {photo.verified ? (
          <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-black px-2.5 py-1 text-caption font-semibold text-white">
            <BadgeCheck className="size-4" aria-hidden />
            Verified by {brand.name}
          </span>
        ) : null}
      </div>
      <figcaption
        className="px-4 py-3 text-small font-semibold text-white"
        // The default is the brand's black, read from the tokens: a hex value written here is
        // what the copy guard exists to stop.
        style={{ backgroundColor: colour ?? brand.colours.black }}
      >
        {words}
      </figcaption>
    </figure>
  );
}
