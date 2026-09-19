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
  const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(userAgent);
  return isIos(userAgent, maxTouchPoints) && userAgent.includes('Safari/') && !otherBrowser;
}

/** An iPhone, iPad or iPod, in any browser. An iPad asking for the desktop site says it is a Mac with a touch screen. */
export function isIos(userAgent: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (userAgent.includes('Macintosh') && maxTouchPoints > 1);
}

/**
 * What the Install the app page shows (PRD 8.1, D-160). Unlike the card, it answers after somebody
 * has said not now, since they went looking for it: the browser's own prompt where there is one,
 * Safari's steps on an iPhone or iPad, the way to Safari from any other browser there, and
 * otherwise the browser's menu, which is where installing lives before a browser offers it.
 */
export type InstallHelp = 'installed' | 'button' | 'ios-safari' | 'ios-other-browser' | 'browser-menu';

export function installHelp(state: Omit<InstallState, 'dismissed'> & { ios: boolean }): InstallHelp {
  if (state.installed) return 'installed';
  if (state.canPrompt) return 'button';
  if (state.iosSafari) return 'ios-safari';
  return state.ios ? 'ios-other-browser' : 'browser-menu';
}
