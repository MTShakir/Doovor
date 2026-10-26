'use client';

import { cn } from '@repo/ui/lib/cn';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { arrivalSource, withArrivalSource } from '@/lib/site/join';
import { PrimaryLink } from './marketing';

/** An address does not change under a page that is open, so there is nothing to listen for. */
function nothingToListenFor(): () => void {
  return () => undefined;
}

/** The utm_source this visit arrived with: none while the page is built, the address's own once it is open. */
function useArrivalSource(): string | null {
  return useSyncExternalStore(
    nothingToListenFor,
    () => arrivalSource(window.location.search),
    () => null,
  );
}

/**
 * The page's button to sign up, carrying on where the visitor came from (D-404). The page is built
 * once for everybody, so the address it was opened at is only known in the browser: the button is
 * drawn without it, and gains it as soon as the page is open.
 */
export function SignUpLink({ href, children, onDark = false }: { href: string; children: ReactNode; onDark?: boolean }) {
  const source = useArrivalSource();
  return (
    <PrimaryLink href={withArrivalSource(href, source)} onDark={onDark}>
      {children}
    </PrimaryLink>
  );
}

/**
 * The page's one action, kept at the foot of a phone's screen while somebody reads (D-404): from
 * the moment the opening's own button has gone off the top, until the founding offer or the closing
 * call has its button in view, or has been passed. Out of sight, and out of reach of a keyboard or
 * a screen reader, the rest of the time; never on a wide screen, where the page's buttons are never
 * far. The cookie question sits where this would, so while it is asked this waits (theme.css).
 */
export function StickyAction({
  href,
  children,
  after,
  quietWhile,
  preview = false,
}: {
  href: string;
  children: ReactNode;
  /** The element whose passing brings it up: the opening's buttons. */
  after: string;
  /** Elements with buttons of their own, by id, in page order: it keeps out of their way. */
  quietWhile: readonly string[];
  /** Drawn where it stands and always up, at every width: for the design page. */
  preview?: boolean;
}) {
  const [shown, setShown] = useState(false);
  const quiet = quietWhile.join(' ');

  useEffect(() => {
    if (preview) return;
    const start = document.getElementById(after);
    if (start === null) return;
    const others = quiet
      .split(' ')
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null);
    const last = others.at(-1) ?? null;

    // Worked out from where each element is, every time the page moves: a jump from the foot of the
    // page to its middle takes the closing call from above the screen to below it without it ever
    // being in view, which an IntersectionObserver never reports.
    const gone = (element: HTMLElement) => element.getBoundingClientRect().bottom <= 0;
    const inView = (element: HTMLElement) => {
      const box = element.getBoundingClientRect();
      return box.bottom > 0 && box.top < window.innerHeight;
    };
    let frame = 0;
    const update = () => {
      frame = 0;
      setShown(gone(start) && !others.some(inView) && !(last !== null && gone(last)));
    };
    const soon = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', soon, { passive: true });
    window.addEventListener('resize', soon);
    return () => {
      window.removeEventListener('scroll', soon);
      window.removeEventListener('resize', soon);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [after, quiet, preview]);

  return (
    <div
      data-sticky-action={preview ? undefined : ''}
      inert={!(preview || shown)}
      className={cn(
        'border-t border-grey-200 bg-white px-4 pt-3 shadow-sheet',
        preview
          ? 'pb-3'
          : 'fixed inset-x-0 bottom-0 z-30 pb-[calc(0.75rem+env(safe-area-inset-bottom))] transition-[translate,visibility] duration-200 ease-out md:hidden',
        !preview && (shown ? 'visible translate-y-0' : 'invisible translate-y-full'),
      )}
    >
      <SignUpLink href={href}>{children}</SignUpLink>
    </div>
  );
}
