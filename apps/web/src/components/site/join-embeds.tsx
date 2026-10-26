'use client';

import { Button } from '@repo/ui/button';
import { CalendarDays, Play } from 'lucide-react';
import Image, { type StaticImageData } from 'next/image';
import { useEffect, useRef, useState } from 'react';

/**
 * What the page the printed QR codes opens borrows from other companies (D-406), each drawn as
 * itself until somebody asks for it. Nothing is fetched from YouTube or Calendly before then, so
 * the page is as quick to open as it was, and nobody's visit is told to either company unless
 * they press play or ask to see the times. The frames are admitted by the security policy and by
 * nothing else (security-headers.ts).
 */

/** Moves the keyboard into a frame that has just taken a button's place, so nobody is left on nothing. */
function useFocusOnArrival(arrived: boolean) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (arrived) frame.current?.focus();
  }, [arrived]);
  return frame;
}

/** The setup tutorial, as its own thumbnail until somebody presses play, then YouTube's privacy-enhanced player. */
export function VideoFacade({ videoId, title, length, poster }: { videoId: string; title: string; length: string; poster: StaticImageData }) {
  const [playing, setPlaying] = useState(false);
  const frame = useFocusOnArrival(playing);
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-card bg-black">
      {playing ? (
        <iframe
          ref={frame}
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="absolute inset-0 size-full border-0"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setPlaying(true);
          }}
          aria-label={`Play the video, ${title}, ${length}`}
          className="group absolute inset-0 size-full cursor-pointer"
        >
          <Image src={poster} alt="" fill sizes="(min-width: 768px) 768px, 100vw" placeholder="blur" className="object-cover" />
          {/* In a corner rather than the middle, so it covers none of the thumbnail's own words. */}
          <span
            className="absolute bottom-3 left-3 flex min-h-12 items-center gap-2 rounded-full bg-black py-2 pr-5 pl-4 text-body font-semibold text-white shadow-raised transition-transform duration-200 ease-out group-hover:scale-105"
            aria-hidden
          >
            <Play size={20} strokeWidth={2} fill="currentColor" />
            Play
            <span className="font-normal tabular-nums">{length}</span>
          </span>
        </button>
      )}
    </div>
  );
}

/**
 * The onboarding call's free times, from Calendly, once somebody asks to see them. Calendly's own
 * page is a plain link beside it, for anybody who would rather book there. Calendly asks about its
 * own cookies inside its frame, so that question is left to it.
 */
export function BookingFacade({ url, embedDomain, title }: { url: string; embedDomain: string; title: string }) {
  const [open, setOpen] = useState(false);
  const frame = useFocusOnArrival(open);
  const embedded = `${url}?embed_domain=${encodeURIComponent(embedDomain)}&embed_type=Inline&hide_event_type_details=1`;
  return open ? (
    <iframe ref={frame} src={embedded} title={title} className="h-[44rem] w-full rounded-card border border-grey-200 bg-white" />
  ) : (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Button
        size="lg"
        width="responsive"
        variant="secondary"
        onClick={() => {
          setOpen(true);
        }}
      >
        <CalendarDays size={20} strokeWidth={2} aria-hidden />
        Choose a time
      </Button>
      <a href={url} target="_blank" rel="noopener" className="inline-flex min-h-12 items-center text-body font-semibold text-blue underline underline-offset-4">
        Open the booking page<span className="sr-only"> (opens in a new tab)</span>
      </a>
    </div>
  );
}
