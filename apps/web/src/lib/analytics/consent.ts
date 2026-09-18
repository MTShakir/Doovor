/**
 * Whether the person has agreed to being counted (NFR-PRV-02, M6-08, D-144).
 *
 * The answer lives on their own device, not in a cookie the server reads: a page that has to be
 * rendered for each request to know the answer is a page that cannot be kept ready, and the public
 * pages must be (NFR-PERF-04). Nothing is loaded or sent until the answer is yes.
 *
 * It is read the way React reads anything outside itself, through `useSyncExternalStore`, so a
 * screen that shows the question and a screen that does the counting always see the same answer.
 */
export type CookieChoice = 'accepted' | 'declined';

/** Before the page is in a browser, nobody knows the answer, and nothing is shown or counted. */
export const unknownChoice = 'unknown';

export type ConsentState = CookieChoice | null | typeof unknownChoice;

/** Neutral, because the brand's name lives in one file and this is not it (D-076). */
export const consentKey = 'cookie-consent';

/** Told to every listening part of the app the moment the answer changes, in this tab too. */
const changed = 'cookie-consent-changed';

function fromStorage(): CookieChoice | null {
  try {
    const saved = window.localStorage.getItem(consentKey);
    return saved === 'accepted' || saved === 'declined' ? saved : null;
  } catch {
    // A browser with storage switched off has no way to remember an answer, so it is asked again.
    return null;
  }
}

/** The last answer read, so React is handed the same value until it actually changes. */
let current: ConsentState = unknownChoice;

export function consentSnapshot(): ConsentState {
  if (typeof window === 'undefined') return unknownChoice;
  const answer = fromStorage();
  if (answer !== current) current = answer;
  return current;
}

/** On the server, and through hydration: not yet known. */
export function consentServerSnapshot(): ConsentState {
  return unknownChoice;
}

export function subscribeConsent(listen: () => void): () => void {
  window.addEventListener(changed, listen);
  // Another tab answering counts as an answer here too.
  window.addEventListener('storage', listen);
  return () => {
    window.removeEventListener(changed, listen);
    window.removeEventListener('storage', listen);
  };
}

export function writeConsent(choice: CookieChoice): void {
  try {
    window.localStorage.setItem(consentKey, choice);
  } catch {
    // Nothing to do: the answer holds for this page, and the question returns next time.
  }
  window.dispatchEvent(new Event(changed));
}

/** Asks again, for somebody changing their mind. */
export function forgetConsent(): void {
  try {
    window.localStorage.removeItem(consentKey);
  } catch {
    // As above.
  }
  window.dispatchEvent(new Event(changed));
}
