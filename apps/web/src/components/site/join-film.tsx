'use client';

import Image, { type StaticImageData } from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { PlayLabel } from './join-embeds';

/**
 * The join page's own film (D-408), hosted with the site, so nothing is asked of another company,
 * nothing plays after it, and its last frame, an arrow pointing down to the page's button, stays on
 * screen. It is its poster until somebody presses play, so a visitor who never does downloads
 * none of it; then it plays in the page, with sound, and captions to turn on.
 */
export function FilmPlayer({
  src,
  captions,
  title,
  length,
  poster,
}: {
  src: string;
  /** A WebVTT file of the voice-over's own words. */
  captions: string;
  title: string;
  /** "3:43" */
  length: string;
  poster: StaticImageData;
}) {
  const [playing, setPlaying] = useState(false);
  const film = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = film.current;
    if (!playing || !video) return;
    video.focus();
    // Pressing play is what lets it start with sound; a browser that still says no leaves its own play button.
    video.play().catch(() => undefined);
  }, [playing]);
  return (
    <div className="relative aspect-[4/5] w-full overflow-hidden rounded-card bg-black">
      {playing ? (
        <video
          ref={film}
          src={src}
          poster={poster.src}
          aria-label={title}
          controls
          playsInline
          preload="auto"
          className="absolute inset-0 size-full"
        >
          <track kind="captions" src={captions} srcLang="en-GB" label="English" />
        </video>
      ) : (
        <button
          type="button"
          onClick={() => {
            setPlaying(true);
          }}
          aria-label={`Play the video, ${title}, ${length}`}
          className="group absolute inset-0 size-full cursor-pointer"
        >
          <Image src={poster} alt="" fill sizes="(min-width: 768px) 26rem, 100vw" placeholder="blur" className="object-cover" />
          <PlayLabel length={length} />
        </button>
      )}
    </div>
  );
}
