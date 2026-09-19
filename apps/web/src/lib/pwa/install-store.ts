import { installHelp, installOffer, isIos, isIosSafari, type InstallHelp, type InstallOffer } from './install';

/**
 * The install offer as the browser sees it, for `useSyncExternalStore` (PRD 8.1, M4-08), and what
 * the Install the app page shows, which stays after not now (D-160).
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
let dismissedHere = false;
let offer: InstallOffer = null;
let help: InstallHelp | null = null;
let listening = false;

function dismissed(): boolean {
  if (dismissedHere) return true;
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
  const installed = installedHere || runningInstalled();
  const canPrompt = prompt !== null;
  const iosSafari = isIosSafari(navigator.userAgent, navigator.maxTouchPoints);
  const nextOffer = installOffer({ installed, dismissed: dismissed(), canPrompt, iosSafari });
  const nextHelp = installHelp({ installed, canPrompt, iosSafari, ios: isIos(navigator.userAgent, navigator.maxTouchPoints) });
  if (nextOffer === offer && nextHelp === help) return;
  offer = nextOffer;
  help = nextHelp;
  for (const listener of listeners) listener();
}

/** Starts listening for the browser's install prompt. Safe to call more than once, and on the server. */
export function listenForInstall(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    // The card and the Install the app page offer it instead of the browser's own bar.
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

/** What the Install the app page shows, or null until this code is running in a browser. */
export function installHelpSnapshot(): InstallHelp | null {
  return help;
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

/**
 * Not now: the card stays away on this device. The browser's prompt is kept, since the Install
 * the app page in the menu may still use it (D-160).
 */
export function dismissInstall(): void {
  dismissedHere = true;
  try {
    localStorage.setItem(dismissedKey, new Date().toISOString());
  } catch {
    // Storage switched off: the card goes for this visit, and may come back on the next.
  }
  update();
}
