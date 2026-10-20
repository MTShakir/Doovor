'use client';

import { Button } from '@repo/ui/button';
import { useEffect } from 'react';
import { writeConsent, type CookieChoice } from '@/lib/analytics/consent';

/** How tall the question is, for the room the page leaves under it while it is asked. */
const bannerHeight = '--cookie-banner-height';

/** The two answers. The only part of the question that needs React (M6-08, D-152). */
export function AnswerCookies() {
  const answer = (next: CookieChoice) => () => {
    writeConsent(next);
  };

  // The question sits over the bottom of the page, so the page is given that much more room at its
  // end: the last button on a phone can always be scrolled clear of it, and reached by the keyboard
  // without being hidden behind it (WCAG 2.4.11). Measured, as its height follows the text size.
  useEffect(() => {
    const banner = document.querySelector<HTMLElement>('[data-cookie-banner]');
    if (!banner) return undefined;
    const root = document.documentElement;
    const measure = () => {
      root.style.setProperty(bannerHeight, `${String(banner.offsetHeight)}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(banner);
    return () => {
      observer.disconnect();
      root.style.removeProperty(bannerHeight);
    };
  }, []);

  return (
    <>
      <Button onClick={answer('accepted')}>Yes, count me</Button>
      <Button variant="secondary" onClick={answer('declined')}>
        No thanks
      </Button>
    </>
  );
}
