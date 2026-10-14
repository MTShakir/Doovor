import { brand } from '@repo/config/brand';
import { passBannerWords } from '@repo/core/gallery';
import { cn } from '@repo/ui/lib/cn';
import { BadgeCheck } from 'lucide-react';
import { galleryUrl } from '@/lib/storage/images';

export interface PassPhoto {
  id: string;
  learnerName: string;
  /** The calendar day they passed, as "YYYY-MM-DD". */
  passedOn: string;
  imagePath: string;
  /** The picture's size, null for one added before it was written down (D-267). */
  width: number | null;
  height: number | null;
  verified: boolean;
}

/**
 * A pass photo drawn whole, at its own shape (D-267).
 *
 * Every photo used to sit in a box four wide and three high with whatever did not fit cut off, and
 * one taken upright on a phone lost the learner's head or the certificate in their hands. The size
 * written down when it was added keeps the right room for it before it arrives, so nothing under it
 * moves. One added before that keeps a four by three room until it loads and then takes its own
 * shape, which is what `auto` in the ratio means.
 *
 * Never taller than most of the screen: a picture far taller than it is wide is shown whole inside
 * that, rather than as a tile that goes on and on.
 */
export function PassPicture({
  path,
  alt,
  width,
  height,
  className,
}: {
  path: string;
  alt: string;
  width: number | null;
  height: number | null;
  className?: string;
}) {
  const sized = width !== null && height !== null;
  return (
    // Not next/image: the picture is on a storage host, already resized to the width it is shown
    // at, and a public page that waits for an optimiser is a page that loads slower.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={galleryUrl(path)}
      alt={alt}
      width={width ?? undefined}
      height={height ?? undefined}
      loading="lazy"
      decoding="async"
      className={cn('h-auto max-h-[80svh] w-full bg-grey-100 object-contain', !sized && 'aspect-[auto_4/3]', className)}
    />
  );
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
        <PassPicture path={photo.imagePath} alt={words} width={photo.width} height={photo.height} />
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
