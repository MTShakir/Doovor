import { Button } from '@repo/ui/button';
import Link from 'next/link';
import { AnswerCookies } from './answer-cookies';

/**
 * The one question we ask before counting anything (NFR-PRV-02, M6-08, D-152).
 *
 * It is in the page as the page is built, and hidden by the stylesheet unless the script in the
 * head has said there is no answer yet. That way it is either in the first frame or never painted:
 * deciding in React instead made this paragraph the largest thing painted, three seconds in, on
 * every public page.
 *
 * It sits over the page rather than pushing it down, so it cannot move what somebody is reading.
 */
export function ConsentBanner() {
  return (
    <div
      data-cookie-banner
      role="dialog"
      aria-label="Cookies"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-grey-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-card md:p-6"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="text-body text-ink">
          We count how the app is used, so we know what to fix. Nothing is counted until you say yes, and you can
          change your mind at any time.{' '}
          <Link href="/cookies" className="font-semibold text-blue underline underline-offset-4">
            What we keep
          </Link>
          .
        </p>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <AnswerCookies />
        </div>
      </div>
    </div>
  );
}

/** Shown while the page has no script: the question needs one to be answered at all. */
export function ConsentButtonsFallback() {
  return (
    <Button disabled width="responsive">
      Yes, count me
    </Button>
  );
}
