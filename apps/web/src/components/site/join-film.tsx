'use client';

import Image, { type StaticImageData } from 'next/image';
import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { PlayLabel } from './join-embeds';

/**
 * The join page's own film (D-408), hosted with the site, so nothing is asked of another company,
 * nothing plays after it, and its last frame, an arrow pointing down to the page's button, stays on
 * screen. It is its poster until somebody presses play, so a visitor who never does downloads
 * none of it; then it plays in the page, with sound, and captions to turn on.
 *
 * The film is started inside the press itself (D-412). A phone lets a film play with sound only
 * when a person asked for it, and Safari on an iPhone judges that by whether play is called while
 * the tap is still being handled, so the player is put in place and started there, not a moment
 * later. The file is one every browser plays (film.test.ts); if a browser still says no, the
 * player's own controls are there to press.
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
  const start = () => {
    flushSync(() => {
      setPlaying(true);
    });
    const video = film.current;
    if (video === null) return;
    video.focus();
    video.play().catch(() => undefined);
  };
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
          onClick={start}
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
