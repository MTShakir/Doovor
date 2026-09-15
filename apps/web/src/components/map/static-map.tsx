import { MapPin } from 'lucide-react';

export interface StaticMapProps {
  radiusMiles: number;
  /** The postcode at the middle, when there is one. */
  place?: string | null;
  description: string;
  /** "around you" for the instructor's own area, "around" for a visitor reading about it. */
  audience?: 'self' | 'public';
}

/**
 * The coverage circle without a map (COV-01, M1-06).
 *
 * Shown when no map key is set, which is every build until one is. It is drawn rather than
 * fetched, so it needs no account, no network and no consent, and it still answers the only
 * question the step asks: how far out does this reach.
 */
export function StaticMap({ radiusMiles, place, description, audience = 'self' }: StaticMapProps) {
  return (
    <div
      role="img"
      aria-label={description}
      className="relative flex h-56 w-full items-center justify-center overflow-hidden rounded-card border border-grey-200 bg-grey-100 md:h-72"
    >
      <svg viewBox="0 0 200 200" className="absolute h-[90%]" aria-hidden focusable="false">
        <circle cx="100" cy="100" r="78" className="fill-blue/10 stroke-blue" strokeWidth="2" />
        <circle cx="100" cy="100" r="52" className="fill-none stroke-blue/40" strokeWidth="1" strokeDasharray="4 4" />
        <circle cx="100" cy="100" r="26" className="fill-none stroke-blue/40" strokeWidth="1" strokeDasharray="4 4" />
      </svg>
      <div className="relative flex flex-col items-center gap-1 text-center">
        <MapPin className="size-6 text-black" aria-hidden />
        {place ? <p className="text-small font-semibold text-ink">{place}</p> : null}
        <p className="text-small text-grey-700">
          {radiusMiles} {radiusMiles === 1 ? 'mile' : 'miles'} around{audience === 'self' ? ' you' : ''}
        </p>
      </div>
    </div>
  );
}
