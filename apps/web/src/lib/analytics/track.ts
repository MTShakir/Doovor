import type { AnalyticsEvent, AnalyticsEvents } from '@repo/core/analytics';
import { consentSnapshot } from './consent';
import { startCounting } from './posthog';

/**
 * Counts one thing that happened (PRD 16, M6-09).
 *
 * It asks the answer first, and does nothing at all unless it is yes, so a call from anywhere is
 * safe and a person who has not agreed is untouched by every one of them. When the answer is yes it
 * waits for the library rather than dropping the event: the first thing worth counting on a page
 * often happens while it is still arriving.
 *
 * Nothing waits on this. A count that fails to send is not a reason for a screen to stop.
 */
async function counted(work: (posthog: Awaited<ReturnType<typeof startCounting>>) => void): Promise<void> {
  try {
    if (consentSnapshot() !== 'accepted') return;
    const posthog = await startCounting();
    if (posthog !== null) work(posthog);
  } catch {
    // Counting is never worth an error somebody sees.
  }
}

/**
 * Said on the page itself as well as sent, so that what the product counts can be watched from
 * outside it: the end to end tests read these, and they are what a debug panel would show. It
 * carries no more than what is sent, and only when somebody has said yes.
 */
export const countedEvent = 'counted';

export function track<E extends AnalyticsEvent>(
  event: E,
  ...properties: Record<string, never> extends AnalyticsEvents[E] ? [] : [AnalyticsEvents[E]]
): void {
  void counted((posthog) => {
    posthog?.capture(event, properties[0]);
    window.dispatchEvent(new CustomEvent(countedEvent, { detail: { event, properties: properties[0] ?? {} } }));
  });
}

/**
 * Says who this is, once they have signed in, so their steps join up. Only ever the account's id:
 * no name, no email address (NFR-PRV-02).
 */
export function trackWho(userId: string): void {
  void counted((posthog) => {
    posthog?.identify(userId);
  });
}

/** Forgets them, on the way out. */
export function trackNobody(): void {
  void counted((posthog) => {
    posthog?.reset();
  });
}
