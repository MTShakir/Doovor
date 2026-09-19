'use client';

import { Button } from '@repo/ui/button';
import { writeConsent, type CookieChoice } from '@/lib/analytics/consent';

/** The two answers. The only part of the question that needs React (M6-08, D-152). */
export function AnswerCookies() {
  const answer = (next: CookieChoice) => () => {
    writeConsent(next);
  };

  return (
    <>
      <Button onClick={answer('accepted')}>Yes, count me</Button>
      <Button variant="secondary" onClick={answer('declined')}>
        No thanks
      </Button>
    </>
  );
}
