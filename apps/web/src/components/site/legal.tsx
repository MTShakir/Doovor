import { brand } from '@repo/config/brand';
import { AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * The shape every legal page shares (M6-07, NFR-PRV-02, PRD 15).
 *
 * These are drafts. They say what the product actually does, which is the part only we know, and
 * they leave the wording that only a solicitor may write clearly marked, so nobody can mistake a
 * draft for the real thing: a notice at the top of the page, and a marked block at each gap.
 *
 * `reviewed` is the date a solicitor signed the page off. While it is null the page says so.
 */
export function LegalPage({
  title,
  summary,
  updated,
  reviewed = null,
  children,
}: {
  title: string;
  summary: string;
  updated: string;
  reviewed?: string | null;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 md:px-6 md:py-16">
      <header className="flex flex-col gap-3">
        <h1 className="text-h1 text-balance text-black">{title}</h1>
        <p className="text-body text-grey-700">{summary}</p>
        <p className="text-small text-grey-700">
          Last changed {updated}.{' '}
          {reviewed === null ? 'Not yet checked by a solicitor.' : `Checked by a solicitor on ${reviewed}.`}
        </p>
      </header>

      {reviewed === null ? (
        <aside className="flex gap-3 rounded-card border-2 border-black bg-yellow p-4 text-black" aria-label="Draft notice">
          <AlertTriangle className="size-5 shrink-0" aria-hidden />
          <p className="text-body">
            <strong className="font-semibold">This page is a draft.</strong> It says what {brand.name} does today, so a
            solicitor has something to work from. It is not legal advice and it is not in force until one has checked it.
          </p>
        </aside>
      ) : null}

      <div className="flex flex-col gap-8">{children}</div>

      <footer className="border-t border-grey-200 pt-6 text-small text-grey-700">
        <p>
          Questions about this page go to{' '}
          <a href={`mailto:${brand.supportEmail}`} className="font-semibold text-blue underline underline-offset-4">
            {brand.supportEmail}
          </a>
          . {brand.name} is run by {brand.legalEntity}.
        </p>
      </footer>
    </article>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby={headingId(title)}>
      <h2 id={headingId(title)} className="text-h3 text-black">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A gap only a solicitor may fill, marked so that nobody reads past it by accident. */
export function ForTheSolicitor({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-card border-2 border-dashed border-grey-700 bg-grey-100 p-4">
      <p className="text-caption font-semibold tracking-wide text-black uppercase">For the solicitor</p>
      <div className="flex flex-col gap-2 text-body text-ink">{children}</div>
    </div>
  );
}

/** Plain prose, at a width that can be read. */
export function LegalText({ children }: { children: ReactNode }) {
  return <p className="text-body text-ink">{children}</p>;
}

export function LegalList({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-ink">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/** Who holds what, for the privacy notice and the processing terms. */
export function LegalTable({ caption, rows }: { caption: string; rows: readonly (readonly [string, string])[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-body">
        <caption className="pb-2 text-left text-small text-grey-700">{caption}</caption>
        <tbody>
          {rows.map(([term, detail]) => (
            <tr key={term} className="border-t border-grey-200 align-top">
              <th scope="row" className="py-2 pr-4 font-semibold text-black">
                {term}
              </th>
              <td className="py-2 text-ink">{detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function headingId(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
