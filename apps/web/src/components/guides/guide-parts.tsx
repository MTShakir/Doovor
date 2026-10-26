import {
  audienceLabels,
  guideAuthor,
  guideDate,
  guidePath,
  guidePhotoCredit,
  readingMinutes,
  type Block,
  type Guide,
  type GuidePlace,
  type GuideSource,
  type Inline,
} from '@repo/core/guides';
import { cn } from '@repo/ui/lib/cn';
import { ArrowUpRight, MapPin } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { Route } from 'next';
import { guideImages } from './guide-images';

/**
 * How a guide is drawn (PRD 8.3, 14.6, D-255): the blocks its Markdown was read into, in the site's
 * own type and colours, with links in blue as long text has them (PRD 7.2). A link to our own site
 * stays in the page; a link out, to GOV.UK and the like, opens beside it.
 */

export function InlineContent({ content }: { content: readonly Inline[] }) {
  return (
    <>
      {content.map((piece, index) => {
        // The pieces of a line never move, so where each sits is what it is.
        const key = `${String(index)}-${piece.text}`;
        if (piece.kind === 'strong') {
          return (
            <strong key={key} className="font-semibold text-black">
              {piece.text}
            </strong>
          );
        }
        if (piece.kind === 'link') {
          return piece.href.startsWith('/') ? (
            <Link key={key} href={piece.href as Route} className="text-blue underline underline-offset-4 hover:text-black">
              {piece.text}
            </Link>
          ) : (
            <a key={key} href={piece.href} target="_blank" rel="noopener noreferrer" className="text-blue underline underline-offset-4 hover:text-black">
              {piece.text}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          );
        }
        return <span key={key}>{piece.text}</span>;
      })}
    </>
  );
}

/** A link out of a guide, which opens beside it, as every link out does. */
function OutLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue underline underline-offset-4 hover:text-black">
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/**
 * A screen of the app in a guide (D-387): a phone's width at most, framed as a screen, with its
 * caption under it. A photograph is drawn at its own width with who took it, when, and the licence
 * it is used under, each linked, as the licence asks (D-391). Below the first screenful a picture
 * loads only as the reader reaches it.
 */
export function GuideFigure({ block }: { block: Extract<Block, { kind: 'image' }> }) {
  const credit = guidePhotoCredit(block.key);
  if (credit !== null) {
    return (
      <figure className="flex flex-col items-center gap-3 py-2">
        <Image
          src={guideImages[block.key]}
          alt={block.alt}
          placeholder="blur"
          sizes="(min-width: 768px) 640px, 100vw"
          className="h-auto w-full max-w-160 rounded-card border border-grey-200 bg-grey-100"
        />
        <figcaption className="flex w-full max-w-160 flex-col gap-1 text-small text-pretty text-grey-700">
          <span>{block.caption}</span>
          <span>
            Photo: <OutLink href={credit.sourceUrl}>{credit.title}</OutLink> by {credit.author}, {String(credit.year)},{' '}
            <OutLink href={credit.licenceUrl}>{credit.licence}</OutLink>, via {credit.via}.
          </span>
        </figcaption>
      </figure>
    );
  }
  return (
    <figure className="flex flex-col items-center gap-3 py-2">
      <Image
        src={guideImages[block.key]}
        alt={block.alt}
        placeholder="blur"
        sizes="(min-width: 768px) 288px, 72vw"
        className="h-auto w-[72vw] max-w-72 rounded-card border border-grey-200 bg-white shadow-raised"
      />
      <figcaption className="max-w-md text-center text-small text-pretty text-grey-700">{block.caption}</figcaption>
    </figure>
  );
}

/** The short answers at the top of a guide (D-387), for somebody who wants the answer first. */
export function GuideTakeaways({ takeaways }: { takeaways: readonly string[] }) {
  return (
    <section aria-labelledby="guide-takeaways" className="rounded-card bg-grey-100 p-5 md:p-6">
      <h2 id="guide-takeaways" className="text-h3 text-black">
        In short
      </h2>
      <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-body text-pretty text-ink">
        {takeaways.map((takeaway) => (
          <li key={takeaway} className="pl-1">
            {takeaway}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Where a guide applies (D-387): the places it is about, as tags under its title. */
export function GuidePlaces({ places }: { places: readonly GuidePlace[] }) {
  return (
    <ul aria-label="Where this applies" className="flex flex-wrap gap-2">
      {places.map((place) => (
        <li key={place.name} className="inline-flex items-center gap-1 rounded-full border border-grey-200 bg-white px-3 py-1 text-small text-ink">
          <MapPin size={14} strokeWidth={1.75} className="shrink-0 text-grey-700" aria-hidden />
          {place.name}
        </li>
      ))}
    </ul>
  );
}

/**
 * A table too wide for a phone (D-387): four columns or more, with a cell long enough to wrap into a
 * narrow column word by word. Its cells keep a readable width, the table scrolls inside itself, and
 * its first column stays put, so each row keeps its label as the reader scrolls across.
 */
function isWideTable(block: Extract<Block, { kind: 'table' }>): boolean {
  const cells = [...block.header, ...block.rows.flat()];
  return block.header.length >= 4 && cells.some((cell) => cell.map((piece) => piece.text).join('').length > 30);
}

export function GuideBody({ blocks }: { blocks: readonly Block[] }) {
  return (
    <div className="flex flex-col gap-5">
      {blocks.map((block, index) => {
        const key = `${String(index)}-${block.kind}`;
        switch (block.kind) {
          case 'heading':
            return block.level === 2 ? (
              <h2 key={key} id={block.id} className="mt-6 scroll-mt-24 text-h2 text-balance text-black">
                {block.text}
              </h2>
            ) : (
              <h3 key={key} id={block.id} className="mt-2 scroll-mt-24 text-h3 text-black">
                {block.text}
              </h3>
            );
          case 'paragraph':
            return (
              <p key={key} className="text-body text-pretty text-ink">
                <InlineContent content={block.content} />
              </p>
            );
          case 'list': {
            const List = block.ordered ? 'ol' : 'ul';
            return (
              <List key={key} className={block.ordered ? 'flex list-decimal flex-col gap-2 pl-6 text-body text-ink' : 'flex list-disc flex-col gap-2 pl-6 text-body text-ink'}>
                {block.items.map((item, itemIndex) => (
                  // An item's words are its identity, and two items never say the same thing.
                  <li key={`${String(itemIndex)}-${item.map((piece) => piece.text).join('')}`} className="pl-1">
                    <InlineContent content={item} />
                  </li>
                ))}
              </List>
            );
          }
          case 'table': {
            const wide = isWideTable(block);
            // The pinned first column covers what scrolls beneath it, so it carries the row's own ground.
            const pinned = (cellIndex: number) => wide && cellIndex === 0 && 'sticky left-0 z-10 border-r border-grey-200';
            return (
              // Wide tables scroll inside themselves, so the page never moves sideways (M6-06).
              <div key={key} className="overflow-x-auto rounded-card border border-grey-200">
                <table className="w-full border-collapse text-left text-small text-ink">
                  <thead className="bg-grey-100">
                    <tr>
                      {block.header.map((cell, cellIndex) => (
                        <th
                          key={String(cellIndex)}
                          scope="col"
                          className={cn('px-4 py-3 font-semibold text-black', wide && 'min-w-36', pinned(cellIndex), pinned(cellIndex) && 'bg-grey-100')}
                        >
                          <InlineContent content={cell} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={String(rowIndex)} className="border-t border-grey-200">
                        {row.map((cell, cellIndex) => (
                          <td
                            key={String(cellIndex)}
                            className={cn('px-4 py-3 tabular-nums', wide && 'min-w-36', pinned(cellIndex), pinned(cellIndex) && 'bg-white')}
                          >
                            <InlineContent content={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
          case 'note':
            return (
              <p key={key} className="rounded-card bg-grey-100 p-4 text-small text-ink">
                <InlineContent content={block.content} />
              </p>
            );
          case 'image':
            return <GuideFigure key={key} block={block} />;
        }
      })}
    </div>
  );
}

/** "By The [brand] team, updated Tue 13 Oct 2026, 5 minute read." */
export function GuideByline({ guide }: { guide: Guide }) {
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-small text-grey-700">
      <span>By {guideAuthor}</span>
      <span>
        Updated <time dateTime={guide.updated}>{guideDate(guide.updated)}</time>
      </span>
      <span>{readingMinutes(guide)} minute read</span>
    </p>
  );
}

/** The page's own contents, so somebody can go straight to the part they came for. */
export function GuideOutline({ outline }: { outline: readonly { id: string; text: string }[] }) {
  return (
    <nav aria-label="On this page" className="rounded-card border border-grey-200 p-5">
      <p className="text-small font-semibold text-black">On this page</p>
      <ol className="mt-3 flex flex-col gap-2">
        {outline.map((item) => (
          <li key={item.id}>
            <a href={`#${item.id}`} className="text-small text-blue underline underline-offset-4 hover:text-black">
              {item.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function GuideSources({ sources }: { sources: readonly GuideSource[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {sources.map((source) => (
        <li key={source.url}>
          <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 text-body text-blue underline underline-offset-4 hover:text-black">
            {source.label}
            <ArrowUpRight size={18} strokeWidth={1.5} className="mt-1 shrink-0" aria-hidden />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** One guide, as the guides page and "read next" list it. */
export function GuideCard({ guide }: { guide: Guide }) {
  return (
    <article className="flex h-full flex-col gap-3 rounded-card border border-grey-200 bg-white p-6">
      <p className="text-small font-semibold text-grey-700">{audienceLabels[guide.audience]}</p>
      <h3 className="text-h3 text-balance text-black">
        <Link href={guidePath(guide.slug) as Route} className="hover:underline hover:underline-offset-4">
          {guide.title}
        </Link>
      </h3>
      <p className="flex-1 text-body text-pretty text-grey-700">{guide.summary}</p>
      <p className="text-small text-grey-700">
        {readingMinutes(guide)} minute read, updated <time dateTime={guide.updated}>{guideDate(guide.updated)}</time>
      </p>
    </article>
  );
}
