import { describe, expect, it } from 'vitest';
import { installHelp, installOffer, isIos, isIosSafari } from './install';

const iphoneSafari =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const ipadAsMac =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const iphoneChrome =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/139.0.7258.76 Mobile/15E148 Safari/604.1';
const androidChrome =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36';

describe('offering to put the app on the home screen (PRD 8.1, M4-08)', () => {
  const nothingYet = { installed: false, dismissed: false, canPrompt: false, iosSafari: false };

  it('offers the browser\'s own prompt where there is one', () => {
    expect(installOffer({ ...nothingYet, canPrompt: true })).toBe('button');
  });

  it('gives the two steps in words on an iPhone or iPad, which has no prompt', () => {
    expect(installOffer({ ...nothingYet, iosSafari: true })).toBe('ios-steps');
  });

  it('offers nothing once installed, once somebody has said not now, or where neither is possible', () => {
    expect(installOffer({ ...nothingYet, canPrompt: true, installed: true })).toBeNull();
    expect(installOffer({ ...nothingYet, iosSafari: true, dismissed: true })).toBeNull();
    expect(installOffer(nothingYet)).toBeNull();
  });

  it('knows Safari on an iPhone or iPad, the iPad that says it is a Mac included', () => {
    expect(isIosSafari(iphoneSafari, 5)).toBe(true);
    expect(isIosSafari(ipadAsMac, 5)).toBe(true);
    // A real Mac has no touch points.
    expect(isIosSafari(ipadAsMac, 0)).toBe(false);
    expect(isIosSafari(iphoneChrome, 5)).toBe(false);
    expect(isIosSafari(androidChrome, 5)).toBe(false);
  });
});

describe('the way to install from the menu, which stays after not now (PRD 8.1, D-160)', () => {
  const browser = { installed: false, canPrompt: false, iosSafari: false, ios: false };

  it('says so once the app is installed, whatever else is true', () => {
    expect(installHelp({ ...browser, installed: true, canPrompt: true, iosSafari: true, ios: true })).toBe('installed');
  });

  it('offers the browser\'s own prompt where there is one', () => {
    expect(installHelp({ ...browser, canPrompt: true })).toBe('button');
  });

  it('gives Safari\'s steps on an iPhone or iPad, and sends other browsers there to Safari', () => {
    expect(installHelp({ ...browser, iosSafari: true, ios: true })).toBe('ios-safari');
    expect(installHelp({ ...browser, ios: true })).toBe('ios-other-browser');
  });

  it('points everywhere else to the browser\'s own menu, where installing lives when there is no prompt yet', () => {
    expect(installHelp(browser)).toBe('browser-menu');
  });

  it('knows an iPhone or iPad whichever browser is on it', () => {
    expect(isIos(iphoneSafari, 5)).toBe(true);
    expect(isIos(iphoneChrome, 5)).toBe(true);
    expect(isIos(ipadAsMac, 5)).toBe(true);
    expect(isIos(ipadAsMac, 0)).toBe(false);
    expect(isIos(androidChrome, 5)).toBe(false);
  });
});
