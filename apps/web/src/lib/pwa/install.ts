/**
 * Whether, and how, to offer putting the app on the home screen (PRD 8.1, M4-08).
 *
 * Chrome, Edge and Samsung Internet hand the page an install prompt it can show from a button.
 * Safari on an iPhone or iPad has no such prompt: the only way is Share, then Add to Home Screen,
 * so it gets those two steps in words instead. Nothing is offered once the app is installed,
 * once somebody has said not now, or where the browser can do neither.
 */

export type InstallOffer = 'button' | 'ios-steps' | null;

export interface InstallState {
  /** Running as an installed app already. */
  installed: boolean;
  /** Somebody said not now on this device. */
  dismissed: boolean;
  /** The browser has handed over an install prompt. */
  canPrompt: boolean;
  /** Safari on an iPhone or iPad, which installs from the Share menu only. */
  iosSafari: boolean;
}

export function installOffer(state: InstallState): InstallOffer {
  if (state.installed || state.dismissed) return null;
  if (state.canPrompt) return 'button';
  return state.iosSafari ? 'ios-steps' : null;
}

/**
 * Safari on an iPhone or iPad. An iPad asks for the desktop site and says it is a Mac, so a Mac
 * with a touch screen is one too. Chrome, Firefox and Edge on iOS say who they are, and cannot add
 * to the home screen from their own menus on every version, so they are left out.
 */
export function isIosSafari(userAgent: string, maxTouchPoints: number): boolean {
  const apple = /iPhone|iPad|iPod/.test(userAgent) || (userAgent.includes('Macintosh') && maxTouchPoints > 1);
  const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(userAgent);
  return apple && userAgent.includes('Safari/') && !otherBrowser;
}
