import { describe, expect, it } from 'vitest';
import {
  accountOriginOf,
  arrivalOf,
  browserOf,
  channelLabels,
  channels,
  cleanTag,
  deviceOf,
  hasTags,
  heardAboutChoices,
  heardAboutFromSource,
  heardAboutLabels,
  heardAboutOptions,
  inAppBrowserOf,
  inAppLabel,
  isChannel,
  isDevice,
  isHeardAbout,
  isInAppBrowser,
  isRobot,
  noTags,
  originMetadata,
  readTags,
  referrerHost,
  sourceLabel,
  systemOf,
  withTags,
  type VisitTags,
} from './visits';

/** Browser strings as real phones and computers send them. */
const agents = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  iphoneInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22G86 Instagram 389.0.0.29.87 (iPhone15,3; iOS 18_6; en_GB; en-GB; scale=3.00; 1290x2796; 752427463)',
  iphoneThreads:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22G86 Barcelona 389.0.0.29.87 (iPhone15,3; iOS 18_6; en_GB; en-GB; scale=3.00; 1290x2796; 752427463) Instagram',
  androidFacebook:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/485.0.0.70.77;]',
  androidTikTok:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240905.003; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36 trill_360204 BytedanceWebview/d8a21c6 musical_ly_360204',
  iphoneLinkedIn:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.31.1000',
  iphoneGoogleApp:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/380.0.794167411 Mobile/15E148 Safari/604.1',
  iphoneSnapchat: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Snapchat/13.10.0.40 (like Safari/8618.1.15.10.15, panda)',
  iphonePinterest: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [Pinterest/iOS]',
  iphoneX: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone/10.60',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  androidSamsung:
    'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.68',
  windowsChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  windowsOpera: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/114.0.0.0',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  macFirefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:132.0) Gecko/20100101 Firefox/132.0',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
  chromebook: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  bingbot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36',
  facebookPreview: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  whatsAppPreview: 'WhatsApp/2.24.21.80 A',
  headless: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0.6723.31 Safari/537.36',
  lighthouse:
    'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse',
  curl: 'curl/8.9.1',
  cubotPhone: 'Mozilla/5.0 (Linux; Android 12; CUBOT X50) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
};

const ownHosts = ['example.com', 'app.example.com'];

function arrival(tags: Partial<VisitTags>, referrer: string | null = null, agent = agents.iphoneSafari) {
  return arrivalOf({ tags: { ...noTags, ...tags }, referrer: referrerHost(referrer), app: inAppBrowserOf(agent), ownHosts });
}

describe('the tags on a link (D-413)', () => {
  it('keeps plain words in lower case, turns spaces into dashes, and drops anything else', () => {
    expect(cleanTag('Instagram')).toBe('instagram');
    expect(cleanTag(' week 2 ')).toBe('week-2');
    expect(cleanTag('chatgpt.com')).toBe('chatgpt.com');
    expect(cleanTag('summer_sale-2026')).toBe('summer_sale-2026');
    expect(cleanTag('')).toBeNull();
    expect(cleanTag(null)).toBeNull();
    expect(cleanTag(undefined)).toBeNull();
    expect(cleanTag('<script>')).toBeNull();
    expect(cleanTag('-starts-with-a-dash')).toBeNull();
    expect(cleanTag('a'.repeat(61))).toBeNull();
    expect(cleanTag('a'.repeat(60))).toBe('a'.repeat(60));
  });

  it('reads the source, medium and campaign from a query, and nothing else', () => {
    expect(readTags('?utm_source=Instagram&utm_medium=social&utm_campaign=week2&ref=K7F2WQ9B')).toEqual({
      source: 'instagram',
      medium: 'social',
      campaign: 'week2',
    });
    expect(readTags('?utm_source=card')).toEqual({ source: 'card', medium: null, campaign: null });
    expect(readTags('')).toEqual(noTags);
    expect(hasTags(readTags('?utm_campaign=week1'))).toBe(true);
    expect(hasTags(noTags)).toBe(false);
  });

  it('adds tags to an address without losing what it had, or repeating one it has', () => {
    const tags = { source: 'card', medium: 'qr', campaign: 'week1' };
    expect(withTags('https://app.example.com/start', tags)).toBe('https://app.example.com/start?utm_source=card&utm_medium=qr&utm_campaign=week1');
    expect(withTags('https://app.example.com/sign-up?role=instructor', { ...noTags, source: 'leaflet' })).toBe(
      'https://app.example.com/sign-up?role=instructor&utm_source=leaflet',
    );
    expect(withTags('https://app.example.com/sign-up?role=school&utm_source=flyer', tags)).toBe(
      'https://app.example.com/sign-up?role=school&utm_source=flyer&utm_medium=qr&utm_campaign=week1',
    );
    expect(withTags('/start#roles', { ...noTags, source: 'card' })).toBe('/start?utm_source=card#roles');
    expect(withTags('https://app.example.com/start', noTags)).toBe('https://app.example.com/start');
  });
});

describe('where a referrer is (D-413)', () => {
  it('names the site without www, and an Android app by its own name', () => {
    expect(referrerHost('https://www.google.co.uk/')).toBe('google.co.uk');
    expect(referrerHost('https://l.instagram.com/?u=x')).toBe('l.instagram.com');
    expect(referrerHost('android-app://com.google.android.gm/')).toBe('com.google.android.gm');
    expect(referrerHost('http://example.org/page')).toBe('example.org');
  });

  it('is nothing for nothing, or for what is not an address', () => {
    expect(referrerHost('')).toBeNull();
    expect(referrerHost(null)).toBeNull();
    expect(referrerHost(undefined)).toBeNull();
    expect(referrerHost('not a url')).toBeNull();
    expect(referrerHost('javascript:alert(1)')).toBeNull();
    expect(referrerHost('file:///etc/passwd')).toBeNull();
  });
});

describe('the app a page was opened in (D-413)', () => {
  it('knows each app by its browser, Threads before Instagram', () => {
    expect(inAppBrowserOf(agents.iphoneInstagram)).toBe('instagram');
    expect(inAppBrowserOf(agents.iphoneThreads)).toBe('threads');
    expect(inAppBrowserOf(agents.androidFacebook)).toBe('facebook');
    expect(inAppBrowserOf(agents.androidTikTok)).toBe('tiktok');
    expect(inAppBrowserOf(agents.iphoneLinkedIn)).toBe('linkedin');
    expect(inAppBrowserOf(agents.iphoneGoogleApp)).toBe('google');
    expect(inAppBrowserOf(agents.iphoneSnapchat)).toBe('snapchat');
    expect(inAppBrowserOf(agents.iphonePinterest)).toBe('pinterest');
    expect(inAppBrowserOf(agents.iphoneX)).toBe('x');
    expect(inAppBrowserOf(agents.iphoneSafari)).toBeNull();
    expect(inAppBrowserOf(agents.windowsChrome)).toBeNull();
    expect(inAppLabel('instagram')).toBe('Instagram app');
    expect(isInAppBrowser('tiktok')).toBe(true);
    expect(isInAppBrowser('myspace')).toBe(false);
  });
});

describe('the device, its system and its browser (D-413)', () => {
  it('tells phones, tablets and computers apart', () => {
    expect(deviceOf(agents.iphoneSafari)).toBe('phone');
    expect(deviceOf(agents.androidChrome)).toBe('phone');
    expect(deviceOf(agents.androidFacebook)).toBe('phone');
    expect(deviceOf(agents.ipad)).toBe('tablet');
    expect(deviceOf(agents.androidTablet)).toBe('tablet');
    expect(deviceOf(agents.windowsChrome)).toBe('computer');
    expect(deviceOf(agents.macSafari)).toBe('computer');
    expect(isDevice('phone')).toBe(true);
    expect(isDevice('watch')).toBe(false);
  });

  it('names the system as people call it', () => {
    expect(systemOf(agents.iphoneSafari)).toBe('iOS');
    expect(systemOf(agents.ipad)).toBe('iOS');
    expect(systemOf(agents.androidChrome)).toBe('Android');
    expect(systemOf(agents.windowsEdge)).toBe('Windows');
    expect(systemOf(agents.macFirefox)).toBe('macOS');
    expect(systemOf(agents.chromebook)).toBe('ChromeOS');
    expect(systemOf(agents.linuxFirefox)).toBe('Linux');
    expect(systemOf('Something new')).toBe('Other');
  });

  it('names the browser, or the app whose browser it is', () => {
    expect(browserOf(agents.iphoneSafari)).toBe('Safari');
    expect(browserOf(agents.macSafari)).toBe('Safari');
    expect(browserOf(agents.androidChrome)).toBe('Chrome');
    expect(browserOf(agents.windowsChrome)).toBe('Chrome');
    expect(browserOf(agents.androidSamsung)).toBe('Samsung Internet');
    expect(browserOf(agents.windowsEdge)).toBe('Edge');
    expect(browserOf(agents.windowsOpera)).toBe('Opera');
    expect(browserOf(agents.macFirefox)).toBe('Firefox');
    expect(browserOf(agents.iphoneInstagram)).toBe('Instagram app');
    expect(browserOf(agents.androidTikTok)).toBe('TikTok app');
    expect(browserOf('Something new')).toBe('Other');
  });

  it('does not count programs: crawlers, previews, speed tests and scripts', () => {
    for (const robot of [agents.googlebot, agents.bingbot, agents.facebookPreview, agents.headless, agents.lighthouse, agents.curl, agents.whatsAppPreview, '', '  ']) {
      expect(isRobot(robot), robot).toBe(true);
    }
    for (const person of [agents.iphoneSafari, agents.iphoneInstagram, agents.androidFacebook, agents.windowsEdge, agents.cubotPhone]) {
      expect(isRobot(person), person).toBe(false);
    }
  });
});

describe('where a visit came from (D-413)', () => {
  it('reads a link’s tags first, with the group their medium or source belongs to', () => {
    expect(arrival({ source: 'instagram' })).toEqual({ source: 'instagram', channel: 'social' });
    expect(arrival({ source: 'ig', medium: 'bio' })).toEqual({ source: 'instagram', channel: 'social' });
    expect(arrival({ source: 'card' })).toEqual({ source: 'card', channel: 'print' });
    expect(arrival({ source: 'leaflet', campaign: 'week1' })).toEqual({ source: 'leaflet', channel: 'print' });
    expect(arrival({ source: 'chatgpt.com' })).toEqual({ source: 'chatgpt', channel: 'ai' });
    expect(arrival({ source: 'google', medium: 'cpc' })).toEqual({ source: 'google', channel: 'paid' });
    expect(arrival({ source: 'newsletter' })).toEqual({ source: 'newsletter', channel: 'email' });
    expect(arrival({ source: 'facebook', medium: 'email' })).toEqual({ source: 'facebook', channel: 'email' });
    expect(arrival({ source: 'bing', medium: 'organic' })).toEqual({ source: 'bing', channel: 'search' });
    expect(arrival({ source: 'partner-site', medium: 'referral' })).toEqual({ source: 'partner-site', channel: 'referral' });
    expect(arrival({ source: 'van-sign', medium: 'qr' })).toEqual({ source: 'van-sign', channel: 'print' });
    expect(arrival({ source: 'gemini', medium: 'ai' })).toEqual({ source: 'gemini', channel: 'ai' });
    expect(arrival({ source: 'mystery' })).toEqual({ source: 'mystery', channel: 'other' });
    // Tags beat everything else the request says.
    expect(arrival({ source: 'flyer' }, 'https://www.google.com/', agents.iphoneInstagram)).toEqual({ source: 'flyer', channel: 'print' });
  });

  it('knows the sites people come from without tags', () => {
    expect(arrival({}, 'https://www.google.co.uk/')).toEqual({ source: 'google', channel: 'search' });
    expect(arrival({}, 'https://www.bing.com/search?q=x')).toEqual({ source: 'bing', channel: 'search' });
    expect(arrival({}, 'https://duckduckgo.com/')).toEqual({ source: 'duckduckgo', channel: 'search' });
    expect(arrival({}, 'https://uk.search.yahoo.com/')).toEqual({ source: 'yahoo', channel: 'search' });
    expect(arrival({}, 'https://www.ecosia.org/')).toEqual({ source: 'ecosia', channel: 'search' });
    expect(arrival({}, 'https://search.brave.com/')).toEqual({ source: 'brave', channel: 'search' });
    expect(arrival({}, 'android-app://com.google.android.googlequicksearchbox/')).toEqual({ source: 'google', channel: 'search' });
    expect(arrival({}, 'https://gemini.google.com/')).toEqual({ source: 'gemini', channel: 'ai' });
    expect(arrival({}, 'https://chatgpt.com/')).toEqual({ source: 'chatgpt', channel: 'ai' });
    expect(arrival({}, 'https://www.perplexity.ai/')).toEqual({ source: 'perplexity', channel: 'ai' });
    expect(arrival({}, 'https://copilot.microsoft.com/')).toEqual({ source: 'copilot', channel: 'ai' });
    expect(arrival({}, 'https://claude.ai/')).toEqual({ source: 'claude', channel: 'ai' });
    expect(arrival({}, 'https://l.instagram.com/')).toEqual({ source: 'instagram', channel: 'social' });
    expect(arrival({}, 'https://lm.facebook.com/')).toEqual({ source: 'facebook', channel: 'social' });
    expect(arrival({}, 'https://www.tiktok.com/')).toEqual({ source: 'tiktok', channel: 'social' });
    expect(arrival({}, 'https://m.youtube.com/')).toEqual({ source: 'youtube', channel: 'social' });
    expect(arrival({}, 'https://www.linkedin.com/')).toEqual({ source: 'linkedin', channel: 'social' });
    expect(arrival({}, 'https://www.threads.com/')).toEqual({ source: 'threads', channel: 'social' });
    expect(arrival({}, 'https://t.co/abc')).toEqual({ source: 'x', channel: 'social' });
    expect(arrival({}, 'https://uk.pinterest.com/')).toEqual({ source: 'pinterest', channel: 'social' });
    expect(arrival({}, 'https://www.reddit.com/')).toEqual({ source: 'reddit', channel: 'social' });
    expect(arrival({}, 'https://wa.me/')).toEqual({ source: 'whatsapp', channel: 'social' });
    expect(arrival({}, 'https://nextdoor.co.uk/')).toEqual({ source: 'nextdoor', channel: 'social' });
    expect(arrival({}, 'https://mail.google.com/')).toEqual({ source: 'gmail', channel: 'email' });
    expect(arrival({}, 'android-app://com.google.android.gm/')).toEqual({ source: 'gmail', channel: 'email' });
    expect(arrival({}, 'https://outlook.live.com/')).toEqual({ source: 'webmail', channel: 'email' });
    expect(arrival({}, 'https://mail.yahoo.com/')).toEqual({ source: 'webmail', channel: 'email' });
  });

  it('names the app a page opened in when nothing else says, and any other site by itself', () => {
    expect(arrival({}, null, agents.iphoneInstagram)).toEqual({ source: 'instagram', channel: 'social' });
    expect(arrival({}, null, agents.androidTikTok)).toEqual({ source: 'tiktok', channel: 'social' });
    expect(arrival({}, null, agents.iphoneGoogleApp)).toEqual({ source: 'google', channel: 'search' });
    expect(arrival({}, 'https://www.drivingforum.co.uk/thread/1')).toEqual({ source: 'drivingforum.co.uk', channel: 'referral' });
  });

  it('is direct with nothing to go on, and a page of ours is not a source', () => {
    expect(arrival({})).toEqual({ source: 'direct', channel: 'direct' });
    expect(arrival({}, 'https://example.com/pricing')).toEqual({ source: 'direct', channel: 'direct' });
    expect(arrival({}, 'https://www.example.com/')).toEqual({ source: 'direct', channel: 'direct' });
    expect(arrival({}, 'https://app.example.com/start')).toEqual({ source: 'direct', channel: 'direct' });
    expect(arrivalOf({ tags: noTags, referrer: 'localhost', app: null, ownHosts: ['localhost:3100'] })).toEqual({ source: 'direct', channel: 'direct' });
  });

  it('labels every group and the sources people know', () => {
    for (const channel of channels) {
      expect(channelLabels[channel].length).toBeGreaterThan(0);
      expect(isChannel(channel)).toBe(true);
    }
    expect(isChannel('carrier-pigeon')).toBe(false);
    expect(sourceLabel('instagram')).toBe('Instagram');
    expect(sourceLabel('card')).toBe('Business card');
    expect(sourceLabel('direct')).toBe('Direct');
    expect(sourceLabel('drivingforum.co.uk')).toBe('drivingforum.co.uk');
  });
});

describe('how somebody heard about us (D-413)', () => {
  it('offers a learner their instructor, and nobody else', () => {
    expect(heardAboutOptions('learner')).toContain('instructor');
    expect(heardAboutOptions('instructor')).not.toContain('instructor');
    expect(heardAboutOptions('school')).not.toContain('instructor');
    expect(heardAboutOptions('school').at(-1)).toBe('other');
    for (const choice of heardAboutChoices) expect(heardAboutLabels[choice].length).toBeGreaterThan(0);
    expect(isHeardAbout('word_of_mouth')).toBe(true);
    expect(isHeardAbout('carrier-pigeon')).toBe(false);
    expect(isHeardAbout(undefined)).toBe(false);
  });

  it('starts from what the link said', () => {
    expect(heardAboutFromSource('instagram')).toBe('instagram');
    expect(heardAboutFromSource('ig')).toBe('instagram');
    expect(heardAboutFromSource('twitter')).toBeNull();
    expect(heardAboutFromSource('youtube')).toBe('youtube');
    expect(heardAboutFromSource('google')).toBe('search');
    expect(heardAboutFromSource('chatgpt.com')).toBe('ai');
    expect(heardAboutFromSource('card')).toBe('print');
    expect(heardAboutFromSource('leaflet')).toBe('print');
    expect(heardAboutFromSource('direct')).toBeNull();
    expect(heardAboutFromSource('other')).toBeNull();
    expect(heardAboutFromSource('instructor')).toBeNull();
    expect(heardAboutFromSource(null)).toBeNull();
  });
});

describe('where a new account came from (D-413)', () => {
  it('reads the link the way a visit is read, and keeps the answer with it', () => {
    expect(accountOriginOf({ tags: { source: 'ig', medium: 'bio', campaign: 'week2' }, heardAbout: 'instagram' })).toEqual({
      source: 'instagram',
      medium: 'bio',
      campaign: 'week2',
      channel: 'social',
      heardAbout: 'instagram',
      heardAboutOther: null,
    });
    expect(accountOriginOf({ tags: noTags, heardAbout: 'other', heardAboutOther: '  A van with your name on it  ' })).toEqual({
      source: null,
      medium: null,
      campaign: null,
      channel: null,
      heardAbout: 'other',
      heardAboutOther: 'A van with your name on it',
    });
  });

  it('keeps words of their own only with "Somewhere else", and nothing at all when nothing is known', () => {
    expect(accountOriginOf({ tags: noTags, heardAbout: 'search', heardAboutOther: 'Bing' })?.heardAboutOther).toBeNull();
    expect(accountOriginOf({ tags: noTags, heardAbout: 'other', heardAboutOther: '   ' })?.heardAboutOther).toBeNull();
    expect(accountOriginOf({ tags: { source: null, medium: 'social', campaign: 'week1' }, heardAbout: null })).toBeNull();
    expect(accountOriginOf({ tags: noTags, heardAbout: null })).toBeNull();
  });

  it('sends only what is known with the account', () => {
    expect(originMetadata(accountOriginOf({ tags: { ...noTags, source: 'card' }, heardAbout: 'print' }))).toEqual({
      arrival_source: 'card',
      arrival_channel: 'print',
      heard_about: 'print',
    });
    expect(originMetadata(null)).toEqual({});
  });
});
