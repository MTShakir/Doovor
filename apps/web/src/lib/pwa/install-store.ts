import { installOffer, isIosSafari, type InstallOffer } from './install';

/**
 * The install offer as the browser sees it, for `useSyncExternalStore` (PRD 8.1, M4-08).
 *
 * Chrome hands over its install prompt once, soon after a page loads, and never again for that
 * page, so it is caught as soon as this module runs rather than when a card mounts.
 */

/** Chrome's install prompt event, which TypeScript's DOM types do not describe. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const dismissedKey = 'install-offer-dismissed';
const listeners = new Set<() => void>();
let prompt: InstallPromptEvent | null = null;
let installedHere = false;
let offer: InstallOffer = null;
let listening = false;

function dismissed(): boolean {
  try {
    return localStorage.getItem(dismissedKey) !== null;
  } catch {
    return false;
  }
}

function runningInstalled(): boolean {
  // Safari on iOS says so on the navigator; everything else answers the display mode.
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

function update(): void {
  const next = installOffer({
    installed: installedHere || runningInstalled(),
    dismissed: dismissed(),
    canPrompt: prompt !== null,
    iosSafari: isIosSafari(navigator.userAgent, navigator.maxTouchPoints),
  });
  if (next === offer) return;
  offer = next;
  for (const listener of listeners) listener();
}

/** Starts listening for the browser's install prompt. Safe to call more than once, and on the server. */
export function listenForInstall(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    // The card offers it instead of the browser's own bar.
    event.preventDefault();
    prompt = event as InstallPromptEvent;
    update();
  });
  window.addEventListener('appinstalled', () => {
    installedHere = true;
    prompt = null;
    update();
  });
  update();
}

export function subscribeToInstall(listener: () => void): () => void {
  listenForInstall();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function installOfferSnapshot(): InstallOffer {
  return offer;
}

/** Shows the browser's own install prompt, and says what the person chose. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const shown = prompt;
  if (shown === null) return 'unavailable';
  // Chrome allows each prompt to be shown once.
  prompt = null;
  await shown.prompt();
  const { outcome } = await shown.userChoice;
  if (outcome === 'accepted') installedHere = true;
  update();
  return outcome;
}

/** Not now: the offer stays away on this device. */
export function dismissInstall(): void {
  try {
    localStorage.setItem(dismissedKey, new Date().toISOString());
  } catch {
    // Storage switched off: the card goes for this visit, and may come back on the next.
    prompt = null;
    installedHere = true;
  }
  update();
}
