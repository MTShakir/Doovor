import { ChevronRight } from 'lucide-react';

/**
 * The links that tie the public pages together (PRD 14.6, M5-07): where a page sits, and the
 * places around it. Plain values in, so the design page can show them without a database.
 */

export interface Crumb {
  name: string;
  href: string;
}

/** Home, the city, and the page itself, which is named but not linked. */
export function Breadcrumbs({ crumbs }: { crumbs: readonly Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-small text-grey-700">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={crumb.href} className="flex items-center gap-1">
              {last ? (
                <span aria-current="page" className="text-ink">
                  {crumb.name}
                </span>
              ) : (
                <>
                  <a href={crumb.href} className="underline underline-offset-4 hover:text-black">
                    {crumb.name}
                  </a>
                  <ChevronRight className="size-4 shrink-0" aria-hidden />
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export interface PlaceLink {
  href: string;
  name: string;
  /** Instructors listed there, when it is worth saying. */
  count?: number;
}

export interface PlaceLinksProps {
  title: string;
  links: readonly PlaceLink[];
  idPrefix?: string;
}

/** Areas of a city, or the city an area belongs to, as a list of links. Nothing when there are none. */
export function PlaceLinks({ title, links, idPrefix = '' }: PlaceLinksProps) {
  if (links.length === 0) return null;
  return (
    <section aria-labelledby={`${idPrefix}places-heading`} className="flex flex-col gap-3">
      <h2 id={`${idPrefix}places-heading`} className="text-h3 text-black">
        {title}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {links.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              className="inline-flex min-h-12 items-center gap-2 rounded-full border border-grey-200 px-4 text-small font-semibold text-black hover:border-black"
            >
              {link.name}
              {link.count === undefined ? null : <span className="font-normal text-grey-700 tabular-nums">{link.count}</span>}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
