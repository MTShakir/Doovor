import { audienceLabels, guideAuthor, guideDate, guidePath, readingMinutes, type Block, type Guide, type GuideSource, type Inline } from '@repo/core/guides';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';

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
          case 'table':
            return (
              // Wide tables scroll inside themselves, so the page never moves sideways (M6-06).
              <div key={key} className="overflow-x-auto rounded-card border border-grey-200">
                <table className="w-full border-collapse text-left text-small text-ink">
                  <thead className="bg-grey-100">
                    <tr>
                      {block.header.map((cell, cellIndex) => (
                        <th key={String(cellIndex)} scope="col" className="px-4 py-3 font-semibold text-black">
                          <InlineContent content={cell} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={String(rowIndex)} className="border-t border-grey-200">
                        {row.map((cell, cellIndex) => (
                          <td key={String(cellIndex)} className="px-4 py-3 tabular-nums">
                            <InlineContent content={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'note':
            return (
              <p key={key} className="rounded-card bg-grey-100 p-4 text-small text-ink">
                <InlineContent content={block.content} />
              </p>
            );
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
