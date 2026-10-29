import { Avatar } from '@repo/ui/avatar';
import { cn } from '@repo/ui/lib/cn';
import { MapPin } from 'lucide-react';
import type { ReactNode } from 'react';
import { joinHookScript, type JoinHook, type JoinHookKey, type PrintedPiece } from '@/lib/site/join';
import { SignalEyebrow, type Feature } from './marketing';

/**
 * The pieces of the page the printed QR codes open (PRD 8.3, D-404), in the look of the leaflet
 * they come from: the traffic light, the yellow marker over the words that matter, and the
 * messages an instructor knows too well. Plain values in, so the design page can show them.
 */

/**
 * Which of the opening's words show, by the piece that was scanned. Written out whole, so the
 * stylesheet has each one: the opening is marked before it is painted (joinHookScript), and
 * everybody who came another way sees the page's own words.
 */
const shownInline: Record<JoinHookKey, string> = {
  default: 'group-data-[join-hook]/hero:hidden',
  card: 'hidden group-data-[join-hook=card]/hero:inline',
  leaflet: 'hidden group-data-[join-hook=leaflet]/hero:inline',
  flyer: 'hidden group-data-[join-hook=flyer]/hero:inline',
};

const shownBlock: Record<JoinHookKey, string> = {
  default: 'group-data-[join-hook]/hero:hidden',
  card: 'hidden group-data-[join-hook=card]/hero:block',
  leaflet: 'hidden group-data-[join-hook=leaflet]/hero:block',
  flyer: 'hidden group-data-[join-hook=flyer]/hero:block',
};

const hiddenFor: Record<PrintedPiece, string> = {
  card: 'group-data-[join-hook=card]/hero:hidden',
  leaflet: 'group-data-[join-hook=leaflet]/hero:hidden',
  flyer: 'group-data-[join-hook=flyer]/hero:hidden',
};

/** Words marked as the printed pieces mark them: black on the brand yellow. */
function Marked({ children }: { children: ReactNode }) {
  return <span className="box-decoration-clone bg-yellow px-1 text-black">{children}</span>;
}

/**
 * The opening, carrying straight on from whichever piece was scanned: the same headline, under the
 * founding offer's line except where the headline already is the offer. Laid out as every other
 * page's opening (PageHero). The page is built once for everybody, so the words of every piece are
 * in it, and the script before them says which to show before anything is painted.
 */
export function JoinHero({
  hooks,
  badge,
  eyebrow,
  actions,
  note,
  visual,
  only,
}: {
  hooks: readonly JoinHook[];
  /** The founding offer's line over the headline. */
  badge: ReactNode;
  eyebrow: string;
  actions: ReactNode;
  note: ReactNode;
  visual: ReactNode;
  /** One way of arriving's words alone, with nothing to switch: for the design page. */
  only?: JoinHookKey;
}) {
  const switched = only === undefined;
  const shown = switched ? hooks : hooks.filter((hook) => hook.key === only);
  const badgeHidden = hooks.flatMap((hook) => (hook.badge || hook.key === 'default' ? [] : [hiddenFor[hook.key]]));
  const withBadge = switched || shown.some((hook) => hook.badge);
  return (
    // Marked by the script inside it before React arrives, which is told to expect that one attribute.
    <section
      suppressHydrationWarning
      className="group/hero mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-12 px-4 pt-10 pb-14 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:px-6 md:pt-20 md:pb-24"
    >
      {/* A fixed string, written by the page, with nothing from the address in it. */}
      {switched ? <script dangerouslySetInnerHTML={{ __html: joinHookScript() }} /> : null}
      <div className="flex flex-col gap-5">
        {withBadge ? <div className={cn(switched && badgeHidden)}>{badge}</div> : null}
        <p className="text-small font-semibold text-grey-700">{eyebrow}</p>
        <h1 className="text-display text-balance text-black md:text-hero">
          {shown.map((hook) => (
            <span key={hook.key} className={switched ? shownInline[hook.key] : undefined}>
              {hook.title.before}
              <Marked>{hook.title.marked}</Marked>
              {hook.title.after}
            </span>
          ))}
        </h1>
        {shown.map((hook) => (
          <p key={hook.key} className={cn('max-w-xl text-body text-pretty text-grey-700 md:text-h3 md:font-normal', switched && shownBlock[hook.key])}>
            {hook.description}
          </p>
        ))}
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">{actions}</div>
        <div className="text-small text-grey-700">{note}</div>
      </div>
      <div className="flex justify-center md:justify-end">{visual}</div>
    </section>
  );
}

/**
 * The page's button again at the end of a part of it, so somebody convinced there need not scroll
 * back for it, with a line beside it (D-406), or under it in a column too narrow for both, as under
 * the film (D-408). Its id lets the phone's bar keep out of its way.
 */
export function ActionRow({ id, children, aside, stacked = false }: { id: string; children: ReactNode; aside?: ReactNode; stacked?: boolean }) {
  return (
    <div id={id} className={stacked ? 'flex flex-col gap-3' : 'flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5'}>
      {children}
      {aside === undefined ? null : <div className="text-small text-grey-700">{aside}</div>}
    </div>
  );
}

export interface TextMessage {
  from: string;
  /** "23:12" */
  at: string;
  text: string;
  /** What it costs the instructor, in a line. */
  cost: string;
}

/**
 * Messages an instructor knows too well, each with what it costs them: the old way, as the
 * leaflet tells it. The learners are made up, as in every creative (BRIEF, People).
 */
export function TextBubbles({ messages }: { messages: readonly TextMessage[] }) {
  return (
    <ul className="flex flex-col gap-6">
      {messages.map((message) => (
        <li key={`${message.from} ${message.at}`} className="flex flex-col gap-2">
          <p className="text-caption text-grey-700">
            <span className="font-semibold">{message.from}</span>
            <span aria-hidden> · </span>
            <span className="sr-only">, at </span>
            <span className="tabular-nums">{message.at}</span>
          </p>
          <p className="w-fit max-w-[85%] rounded-card rounded-tl-input bg-white px-4 py-3 text-body text-black shadow-card">{message.text}</p>
          <p className="text-small text-grey-700">{message.cost}</p>
        </li>
      ))}
    </ul>
  );
}

/** What the old way costs in a year, worked out as the leaflet works it out, on black. */
export function CostPanel({
  figure,
  explanation,
  costs,
}: {
  /** "£2,080" */
  figure: string;
  explanation: string;
  costs: readonly { title: string; description: string }[];
}) {
  return (
    <div className="flex flex-col gap-6 rounded-card bg-black p-6 text-white md:p-8">
      <p className="text-small font-semibold">
        <SignalEyebrow lit="red">What it costs you</SignalEyebrow>
      </p>
      <div className="flex flex-col gap-3">
        <p className="w-fit rounded-input bg-yellow px-3 text-display text-black tabular-nums md:text-hero">{figure}</p>
        <p className="text-body text-pretty">{explanation}</p>
      </div>
      <dl className="flex flex-col gap-4 border-t border-white/25 pt-6">
        {costs.map((cost) => (
          <div key={cost.title} className="flex flex-col gap-1">
            <dt className="text-body font-semibold">{cost.title}</dt>
            <dd className="text-small text-pretty">{cost.description}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * What it costs, in the order somebody asks: today, the year ahead, after that, and on each card
 * payment. Each line's figures come from the configuration, written by the page.
 */
export function PriceLines({ lines }: { lines: readonly { when: string; what: string }[] }) {
  return (
    <dl className="flex flex-col divide-y divide-grey-200 rounded-card border border-grey-200 bg-white">
      {lines.map((line) => (
        <div key={line.when} className="flex flex-col gap-1 p-5 sm:flex-row sm:gap-6">
          <dt className="text-body font-semibold text-black sm:w-44 sm:shrink-0">{line.when}</dt>
          <dd className="text-body text-pretty text-ink">{line.what}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Short facts, each beside its icon: a phone shows four in the room FeatureGrid gives two, which
 * matters on a page read in a minute between lessons.
 */
export function FactList({ facts }: { facts: readonly Feature[] }) {
  return (
    <ul className="flex flex-col gap-6">
      {facts.map(({ icon: Icon, title, description }) => (
        <li key={title} className="flex gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-grey-100 text-black" aria-hidden>
            <Icon size={24} strokeWidth={1.5} />
          </span>
          <div className="flex flex-col gap-1">
            <h3 className="text-h3 text-black">{title}</h3>
            <p className="text-body text-pretty text-grey-700">{description}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Who is behind it, in their own words: a person in the area the offer is made in, and what they
 * will do for somebody in person. A photo of them only once they have said yes to one (D-405);
 * until then their initials, as anybody without a photo has in the app, in white on the grey band.
 */
export function FounderNote({
  name,
  jobTitle,
  place,
  photo = null,
  children,
}: {
  name: string;
  jobTitle: string;
  place: string;
  photo?: string | null;
  children: ReactNode;
}) {
  return (
    <figure className="flex flex-col gap-6 md:flex-row md:items-start md:gap-10">
      <Avatar name={name} src={photo} size="xl" decorative className="[--quiet:var(--color-white)]" />
      <div className="flex max-w-2xl flex-col gap-5">
        <blockquote className="flex flex-col gap-4 text-body text-pretty text-ink md:text-h3 md:font-normal">{children}</blockquote>
        <figcaption className="flex flex-col gap-1">
          <span className="text-body font-semibold text-black">{name}</span>
          <span className="flex items-center gap-1 text-small text-grey-700">
            <MapPin size={14} strokeWidth={1.5} aria-hidden />
            {jobTitle}, {place}
          </span>
        </figcaption>
      </div>
    </figure>
  );
}
