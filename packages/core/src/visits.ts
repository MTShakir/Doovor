/**
 * Visits to the public site, counted without cookies, and where each account came from (D-413).
 *
 * Every page of the site sends one small note when it is opened, and the server keeps what that
 * says about the visit and nothing about the visitor: the page, the tags on the link it came from,
 * the site it came from, the country and town the request came through, and the kind of device and
 * browser. No internet address, no identifier, no browser string, and nothing stored on the device.
 * This module is the rules that turn a request into those words, so the server, the sign-up and the
 * admin screen all read a visit the same way.
 */

/** How a visit came, in the groups the admin reads first. */
export const channels = ['social', 'search', 'print', 'ai', 'email', 'paid', 'referral', 'direct', 'other'] as const;
export type Channel = (typeof channels)[number];

export const channelLabels: Record<Channel, string> = {
  social: 'Social media',
  search: 'Search engines',
  print: 'Printed QR codes',
  ai: 'AI assistants',
  email: 'Email',
  paid: 'Adverts',
  referral: 'Other websites',
  direct: 'Direct',
  other: 'Other tagged links',
};

export function isChannel(value: unknown): value is Channel {
  return typeof value === 'string' && (channels as readonly string[]).includes(value);
}

/** The tags a link was given: `?utm_source=instagram&utm_medium=social&utm_campaign=week2`. */
export interface VisitTags {
  source: string | null;
  medium: string | null;
  campaign: string | null;
}

export const noTags: VisitTags = { source: null, medium: null, campaign: null };

/**
 * A tag worth keeping, in lower case: letters, digits, dots, dashes and underscores, at most 60
 * characters, with spaces turned into dashes ("Week 2" is "week-2"). Anything else is dropped
 * rather than kept: a tag is whatever the person who made the link typed.
 */
export function cleanTag(value: string | null | undefined): string | null {
  const tag = (value ?? '').trim().toLowerCase().replace(/\s+/g, '-');
  return /^[a-z0-9][a-z0-9._-]{0,59}$/.test(tag) ? tag : null;
}

/** The tags in an address's query, each cleaned. */
export function readTags(search: string): VisitTags {
  const params = new URLSearchParams(search);
  return {
    source: cleanTag(params.get('utm_source')),
    medium: cleanTag(params.get('utm_medium')),
    campaign: cleanTag(params.get('utm_campaign')),
  };
}

/** Whether a link carried any tag at all. */
export function hasTags(tags: VisitTags): boolean {
  return tags.source !== null || tags.medium !== null || tags.campaign !== null;
}

/** An address with the tags added, keeping any it already has. */
export function withTags(href: string, tags: VisitTags): string {
  const [base = '', fragment] = href.split('#', 2);
  const [path = '', query = ''] = base.split('?', 2);
  const params = new URLSearchParams(query);
  const pairs: [string, string | null][] = [
    ['utm_source', tags.source],
    ['utm_medium', tags.medium],
    ['utm_campaign', tags.campaign],
  ];
  let changed = false;
  for (const [name, value] of pairs) {
    if (value === null || params.has(name)) continue;
    params.set(name, value);
    changed = true;
  }
  if (!changed) return href;
  return `${path}?${params.toString()}${fragment === undefined ? '' : `#${fragment}`}`;
}

/**
 * The site a referrer is, without "www.": "google.co.uk", "l.instagram.com". An app on Android
 * names itself instead of a site ("android-app://com.google.android.gm"), and that name is kept.
 * Null for nothing, or for anything that is not an address.
 */
export function referrerHost(referrer: string | null | undefined): string | null {
  const value = (referrer ?? '').trim();
  if (value === '') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'android-app:') return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return /^[a-z0-9][a-z0-9.-]{0,99}$/.test(host) ? host : null;
  } catch {
    return null;
  }
}

/** The apps whose own browser a page can be opened in, from a link inside them. */
export const inAppBrowsers = ['instagram', 'facebook', 'tiktok', 'linkedin', 'threads', 'snapchat', 'pinterest', 'x', 'google'] as const;
export type InAppBrowser = (typeof inAppBrowsers)[number];

const appNames: Record<InAppBrowser, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  threads: 'Threads',
  snapchat: 'Snapchat',
  pinterest: 'Pinterest',
  x: 'X',
  google: 'Google',
};

/** "Instagram app". */
export function inAppLabel(app: InAppBrowser): string {
  return `${appNames[app]} app`;
}

export function isInAppBrowser(value: unknown): value is InAppBrowser {
  return typeof value === 'string' && (inAppBrowsers as readonly string[]).includes(value);
}

/**
 * The app a page was opened inside, from its browser string. An app's own browser often sends no
 * referrer at all, so this is how a visit from a post without tags still says where it came from.
 * Threads is asked first: its browser names Instagram too.
 */
export function inAppBrowserOf(userAgent: string): InAppBrowser | null {
  if (/\bBarcelona\b/.test(userAgent)) return 'threads';
  if (userAgent.includes('Instagram')) return 'instagram';
  if (/FBAN|FBAV|FB_IAB|FBIOS|MessengerForiOS/.test(userAgent)) return 'facebook';
  if (/musical_ly|Bytedance|TikTok/i.test(userAgent)) return 'tiktok';
  if (userAgent.includes('LinkedInApp')) return 'linkedin';
  if (userAgent.includes('Snapchat')) return 'snapchat';
  if (userAgent.includes('Pinterest')) return 'pinterest';
  if (userAgent.includes('Twitter')) return 'x';
  if (/\bGSA\//.test(userAgent)) return 'google';
  return null;
}

export const devices = ['phone', 'tablet', 'computer'] as const;
export type Device = (typeof devices)[number];

export const deviceLabels: Record<Device, string> = { phone: 'Phone', tablet: 'Tablet', computer: 'Computer' };

export function isDevice(value: unknown): value is Device {
  return typeof value === 'string' && (devices as readonly string[]).includes(value);
}

/** Phone, tablet or computer, from the browser string. */
export function deviceOf(userAgent: string): Device {
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(userAgent) || (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent))) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(userAgent)) return 'phone';
  return 'computer';
}

/** The device's operating system, as people call it. */
export function systemOf(userAgent: string): string {
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'iOS';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('CrOS')) return 'ChromeOS';
  if (userAgent.includes('Windows')) return 'Windows';
  if (/Mac OS X|Macintosh/.test(userAgent)) return 'macOS';
  if (userAgent.includes('Linux')) return 'Linux';
  return 'Other';
}

/** The browser, as people call it, or the app whose browser it is. */
export function browserOf(userAgent: string): string {
  const app = inAppBrowserOf(userAgent);
  if (app !== null) return inAppLabel(app);
  if (/\bEdg(e|A|iOS)?\//.test(userAgent)) return 'Edge';
  if (userAgent.includes('SamsungBrowser')) return 'Samsung Internet';
  if (/\bOPR\/|Opera|OPiOS/.test(userAgent)) return 'Opera';
  if (/Firefox|FxiOS/.test(userAgent)) return 'Firefox';
  if (/CriOS|Chrome\//.test(userAgent)) return 'Chrome';
  if (userAgent.includes('Safari/')) return 'Safari';
  return 'Other';
}

/**
 * Whether a request came from a program rather than a person: a search engine's crawler, a link
 * preview, a speed test, a monitor or a script. They are not counted. A phone made by Cubot has
 * "bot" in its name and is a person.
 */
export function isRobot(userAgent: string): boolean {
  const value = userAgent.trim();
  if (value === '') return true;
  if (/cubot/i.test(value)) return false;
  return /^whatsapp\/|bot\b|bot\/|crawl|spider|slurp|archiver|facebookexternalhit|meta-external|embedly|preview|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|python|curl|wget|httpclient|axios|node-fetch|undici|go-http|java\/|okhttp|scrapy|phantom|selenium|puppeteer|playwright/i.test(
    value,
  );
}

/** Other spellings of a source, as people type them into a link's tags. */
const sourceAliases: Record<string, string> = {
  ig: 'instagram',
  insta: 'instagram',
  'instagram.com': 'instagram',
  fb: 'facebook',
  'facebook.com': 'facebook',
  tt: 'tiktok',
  'tiktok.com': 'tiktok',
  yt: 'youtube',
  'youtube.com': 'youtube',
  li: 'linkedin',
  'linkedin.com': 'linkedin',
  'threads.net': 'threads',
  'threads.com': 'threads',
  twitter: 'x',
  'twitter.com': 'x',
  'x.com': 'x',
  't.co': 'x',
  'chatgpt.com': 'chatgpt',
  'chat.openai.com': 'chatgpt',
  openai: 'chatgpt',
  'perplexity.ai': 'perplexity',
  'gemini.google.com': 'gemini',
  'copilot.microsoft.com': 'copilot',
  'claude.ai': 'claude',
  'google.com': 'google',
  'google.co.uk': 'google',
  'bing.com': 'bing',
  'business-card': 'card',
  businesscard: 'card',
};

const socialSources = new Set(['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin', 'threads', 'x', 'pinterest', 'reddit', 'snapchat', 'whatsapp', 'nextdoor']);
const searchSources = new Set(['google', 'bing', 'duckduckgo', 'yahoo', 'ecosia', 'brave', 'yandex', 'baidu']);
const printSources = new Set(['card', 'leaflet', 'flyer', 'poster', 'qr', 'print', 'sticker']);
const aiSources = new Set(['chatgpt', 'perplexity', 'gemini', 'copilot', 'claude']);
const emailSources = new Set(['email', 'newsletter', 'gmail', 'outlook', 'webmail']);

function channelOfMedium(medium: string): Channel | null {
  if (['social', 'social-media', 'social_media', 'organic-social', 'organic_social', 'bio', 'post', 'reel', 'story', 'video'].includes(medium)) {
    return 'social';
  }
  if (['cpc', 'ppc', 'paid', 'paid-social', 'paid_social', 'ads', 'ad', 'display'].includes(medium)) return 'paid';
  if (['email', 'e-mail', 'newsletter'].includes(medium)) return 'email';
  if (['qr', 'print', 'offline', 'card', 'leaflet', 'flyer'].includes(medium)) return 'print';
  if (['search', 'organic', 'seo'].includes(medium)) return 'search';
  if (['ai', 'assistant', 'llm'].includes(medium)) return 'ai';
  if (['referral', 'partner', 'affiliate'].includes(medium)) return 'referral';
  return null;
}

function channelOfSource(source: string): Channel | null {
  if (socialSources.has(source)) return 'social';
  if (searchSources.has(source)) return 'search';
  if (printSources.has(source)) return 'print';
  if (aiSources.has(source)) return 'ai';
  if (emailSources.has(source)) return 'email';
  return null;
}

interface HostRule {
  matches: (host: string) => boolean;
  source: string;
  channel: Channel;
}

const ends = (host: string, name: string): boolean => host === name || host.endsWith(`.${name}`);

/** Known sites a visit comes from, most particular first: Gemini and Gmail before Google. */
const hostRules: readonly HostRule[] = [
  { matches: (host) => host === 'gemini.google.com' || host === 'bard.google.com', source: 'gemini', channel: 'ai' },
  { matches: (host) => host === 'mail.google.com' || host === 'com.google.android.gm', source: 'gmail', channel: 'email' },
  { matches: (host) => host === 'com.google.android.youtube' || ends(host, 'youtube.com') || host === 'youtu.be', source: 'youtube', channel: 'social' },
  { matches: (host) => /(^|\.)google\.[a-z.]+$/.test(host) || host === 'com.google.android.googlequicksearchbox', source: 'google', channel: 'search' },
  { matches: (host) => ends(host, 'bing.com'), source: 'bing', channel: 'search' },
  { matches: (host) => ends(host, 'duckduckgo.com'), source: 'duckduckgo', channel: 'search' },
  { matches: (host) => host === 'mail.yahoo.com', source: 'webmail', channel: 'email' },
  { matches: (host) => ends(host, 'yahoo.com') || ends(host, 'yahoo.co.uk'), source: 'yahoo', channel: 'search' },
  { matches: (host) => ends(host, 'ecosia.org'), source: 'ecosia', channel: 'search' },
  { matches: (host) => host === 'search.brave.com', source: 'brave', channel: 'search' },
  { matches: (host) => ends(host, 'threads.net') || ends(host, 'threads.com'), source: 'threads', channel: 'social' },
  { matches: (host) => ends(host, 'instagram.com') || host === 'com.instagram.android', source: 'instagram', channel: 'social' },
  { matches: (host) => ends(host, 'facebook.com') || host === 'fb.com' || host === 'fb.me' || host === 'com.facebook.katana', source: 'facebook', channel: 'social' },
  { matches: (host) => ends(host, 'tiktok.com'), source: 'tiktok', channel: 'social' },
  { matches: (host) => ends(host, 'linkedin.com') || host === 'lnkd.in' || host === 'com.linkedin.android', source: 'linkedin', channel: 'social' },
  { matches: (host) => host === 't.co' || ends(host, 'x.com') || ends(host, 'twitter.com'), source: 'x', channel: 'social' },
  { matches: (host) => /(^|\.)pinterest\.[a-z.]+$/.test(host) || host === 'pin.it', source: 'pinterest', channel: 'social' },
  { matches: (host) => ends(host, 'reddit.com'), source: 'reddit', channel: 'social' },
  { matches: (host) => host === 'wa.me' || ends(host, 'whatsapp.com'), source: 'whatsapp', channel: 'social' },
  { matches: (host) => ends(host, 'nextdoor.co.uk') || ends(host, 'nextdoor.com'), source: 'nextdoor', channel: 'social' },
  { matches: (host) => host === 'chatgpt.com' || host === 'chat.openai.com', source: 'chatgpt', channel: 'ai' },
  { matches: (host) => ends(host, 'perplexity.ai'), source: 'perplexity', channel: 'ai' },
  { matches: (host) => host === 'copilot.microsoft.com', source: 'copilot', channel: 'ai' },
  { matches: (host) => host === 'claude.ai', source: 'claude', channel: 'ai' },
  { matches: (host) => /^outlook\.(live|office|office365)\.com$/.test(host), source: 'webmail', channel: 'email' },
];

/** Where a visit came from, in one word, and the group that belongs to. */
export interface Arrival {
  source: string;
  channel: Channel;
}

/**
 * Where a visit came from (D-413). In order: the link's own tags, which say it best; then a site we
 * know the referrer to be; then the app whose browser the page opened in; then any other site,
 * named by itself; and otherwise nothing at all, which is a visit typed in, kept, or scanned from a
 * code without tags. A referrer that is one of our own hosts is a page of ours, not a source.
 */
export function arrivalOf(input: { tags: VisitTags; referrer: string | null; app: InAppBrowser | null; ownHosts: readonly string[] }): Arrival {
  const { tags, app } = input;
  if (tags.source !== null) {
    const source = sourceAliases[tags.source] ?? tags.source;
    const channel = (tags.medium === null ? null : channelOfMedium(tags.medium)) ?? channelOfSource(source) ?? 'other';
    return { source, channel };
  }

  const own = input.ownHosts.map((host) => host.toLowerCase().replace(/^www\./, '').replace(/:\d+$/, ''));
  const host = input.referrer !== null && !own.includes(input.referrer) ? input.referrer : null;
  const known = host === null ? undefined : hostRules.find((rule) => rule.matches(host));
  if (known !== undefined) return { source: known.source, channel: known.channel };

  if (app !== null) return { source: app, channel: app === 'google' ? 'search' : 'social' };
  if (host !== null) return { source: host, channel: 'referral' };
  return { source: 'direct', channel: 'direct' };
}

const sourceNames: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  threads: 'Threads',
  x: 'X',
  pinterest: 'Pinterest',
  reddit: 'Reddit',
  snapchat: 'Snapchat',
  whatsapp: 'WhatsApp',
  nextdoor: 'Nextdoor',
  google: 'Google',
  bing: 'Bing',
  duckduckgo: 'DuckDuckGo',
  yahoo: 'Yahoo',
  ecosia: 'Ecosia',
  brave: 'Brave Search',
  chatgpt: 'ChatGPT',
  perplexity: 'Perplexity',
  gemini: 'Gemini',
  copilot: 'Copilot',
  claude: 'Claude',
  gmail: 'Gmail',
  webmail: 'Email in a browser',
  card: 'Business card',
  leaflet: 'Leaflet',
  flyer: 'Flyer',
  poster: 'Poster',
  qr: 'QR code',
  direct: 'Direct',
};

/** A source as people read it: "Instagram", "Business card", or a site's own name. */
export function sourceLabel(source: string): string {
  return sourceNames[source] ?? source;
}

/** The answers to "How did you hear about us?", in the order they are offered. */
export const heardAboutChoices = [
  'instagram',
  'tiktok',
  'facebook',
  'youtube',
  'linkedin',
  'threads',
  'search',
  'ai',
  'print',
  'word_of_mouth',
  'instructor',
  'other',
] as const;
export type HeardAbout = (typeof heardAboutChoices)[number];

export const heardAboutLabels: Record<HeardAbout, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  threads: 'Threads',
  search: 'Google or another search engine',
  ai: 'ChatGPT or another AI assistant',
  print: 'A card, leaflet or flyer',
  word_of_mouth: 'A friend or another instructor',
  instructor: 'My driving instructor or school',
  other: 'Somewhere else',
};

export function isHeardAbout(value: unknown): value is HeardAbout {
  return typeof value === 'string' && (heardAboutChoices as readonly string[]).includes(value);
}

/** The answers offered to somebody signing up as this: only a learner is taught by somebody already. */
export function heardAboutOptions(role: 'learner' | 'instructor' | 'school'): HeardAbout[] {
  return heardAboutChoices.filter((choice) => choice !== 'instructor' || role === 'learner');
}

/**
 * The answer a link's source suggests, so the question starts there and a tap confirms it. Null
 * when the source says nothing a person would answer with.
 */
export function heardAboutFromSource(source: string | null): HeardAbout | null {
  if (source === null) return null;
  const known = sourceAliases[source] ?? source;
  if (isHeardAbout(known) && known !== 'other' && known !== 'instructor' && known !== 'word_of_mouth') return known;
  if (searchSources.has(known)) return 'search';
  if (aiSources.has(known)) return 'ai';
  if (printSources.has(known)) return 'print';
  return null;
}

/** What is kept with a new account about where it came from (D-413). */
export interface AccountOrigin {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  channel: Channel | null;
  heardAbout: HeardAbout | null;
  /** Only with "Somewhere else", in their own words. */
  heardAboutOther: string | null;
}

/**
 * Where a new account came from: the link's tags, read the way a visit's are, and the answer to
 * "How did you hear about us?". Null when there is neither, so nothing is kept.
 */
export function accountOriginOf(input: { tags: VisitTags; heardAbout: HeardAbout | null; heardAboutOther?: string | null }): AccountOrigin | null {
  const arrival = input.tags.source === null ? null : arrivalOf({ tags: input.tags, referrer: null, app: null, ownHosts: [] });
  if (arrival === null && input.heardAbout === null) return null;
  const other = input.heardAbout === 'other' ? (input.heardAboutOther ?? '').trim().slice(0, 80) : '';
  return {
    source: arrival?.source ?? null,
    medium: arrival === null ? null : input.tags.medium,
    campaign: arrival === null ? null : input.tags.campaign,
    channel: arrival?.channel ?? null,
    heardAbout: input.heardAbout,
    heardAboutOther: other === '' ? null : other,
  };
}

/** An origin as the sign-up sends it with the account, which the database reads as it is made. */
export function originMetadata(origin: AccountOrigin | null): Record<string, string> {
  if (origin === null) return {};
  const fields: [string, string | null][] = [
    ['arrival_source', origin.source],
    ['arrival_medium', origin.medium],
    ['arrival_campaign', origin.campaign],
    ['arrival_channel', origin.channel],
    ['heard_about', origin.heardAbout],
    ['heard_about_other', origin.heardAboutOther],
  ];
  return Object.fromEntries(fields.filter((field): field is [string, string] => field[1] !== null));
}
