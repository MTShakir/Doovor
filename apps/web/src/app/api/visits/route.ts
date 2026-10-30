import { brand } from '@repo/config/brand';
import { arrivalOf, browserOf, deviceOf, inAppBrowserOf, isRobot, readTags, referrerHost, systemOf } from '@repo/core/visits';
import { z } from '@repo/core/zod';
import { getAppUrl } from '@/lib/app-url';
import { isSitePath } from '@/lib/hosts';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

/**
 * A page of the public site, opened (D-413). The page says which page it is, whether it began the
 * visit, and the tags and referrer the visit came with; this works out the rest from the request
 * itself: which site or app it came from, the kind of device and browser, and the country and town
 * the request came through, which the host passes on. Nothing about the person is kept: not their
 * internet address, not their browser string, not anything that would know them again.
 *
 * The answer says where the visit came from, as tags, so the page can carry them on to sign-up.
 */

const pathSchema = z.string().min(1).max(200).regex(/^\/[^?#\s]*$/);

const visitSchema = z.object({
  path: pathSchema,
  entry: z.boolean(),
  landing: pathSchema.nullable(),
  /** The query the visit landed with: only its tags are read. */
  search: z.string().max(2000),
  /** Where the visit came from, as the browser told the page. */
  referrer: z.string().max(2000),
});

/** A note is a few hundred characters; anything far longer is not one. */
const largest = 8000;

/** The host a request came to, and the site's and the app's own, so a page of ours is never a source. */
function ownHosts(request: Request): string[] {
  const appHost = new URL(getAppUrl()).host;
  return [brand.domain, `www.${brand.domain}`, brand.appHost, appHost, new URL(request.url).host];
}

/** An address's host, or nothing for what is not an address. */
function hostOf(address: string): string {
  try {
    return new URL(address).host;
  } catch {
    return '';
  }
}

/** A town's name, which the host writes as it would be in an address. */
function townOf(written: string): string {
  try {
    return decodeURIComponent(written).trim();
  } catch {
    return '';
  }
}

/** The country, region and town the host found the request came through, when it says. */
function placeOf(headers: Headers): { country: string; region: string; city: string } {
  const country = (headers.get('x-vercel-ip-country') ?? '').toUpperCase();
  const region = (headers.get('x-vercel-ip-country-region') ?? '').toUpperCase();
  const city = townOf(headers.get('x-vercel-ip-city') ?? '');
  return {
    country: /^[A-Z]{2}$/.test(country) ? country : '',
    region: /^[A-Z0-9]{1,10}$/.test(region) ? region : '',
    city: city.length <= 80 ? city : '',
  };
}

export async function POST(request: Request): Promise<Response> {
  const text = await request.text();
  if (text.length > largest) return new Response(null, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = visitSchema.safeParse(body);
  if (!parsed.success || !isSitePath(parsed.data.path)) return new Response(null, { status: 400 });

  // Sent by a page of ours, from a browser: never from another site.
  const origin = request.headers.get('origin');
  const hosts = ownHosts(request);
  if (origin !== null && !hosts.includes(hostOf(origin))) return new Response(null, { status: 403 });

  const visit = parsed.data;
  const tags = readTags(visit.search);
  const userAgent = request.headers.get('user-agent') ?? '';
  const app = inAppBrowserOf(userAgent);
  // A referrer that is a page of ours is no referrer at all.
  const own = hosts.map((host) => host.toLowerCase().replace(/^www\./, '').replace(/:\d+$/, ''));
  const from = referrerHost(visit.referrer);
  const referrer = from !== null && !own.includes(from) ? from : null;
  const arrival = arrivalOf({ tags, referrer, app, ownHosts: hosts });
  // What the page carries on to sign-up: the link's own tags, or the source worked out without them.
  const carried =
    arrival.channel === 'direct'
      ? { source: null, medium: null, campaign: null }
      : { source: arrival.source, medium: tags.medium ?? arrival.channel, campaign: tags.campaign };

  // Programs are not people, and are not counted.
  if (isRobot(userAgent)) return Response.json({ counted: false, tags: carried });

  const place = placeOf(request.headers);
  const { error } = await getSupabaseServiceClient().rpc('system_record_visit', {
    p_path: visit.path,
    p_entry: visit.entry,
    p_landing: visit.landing ?? '',
    p_channel: arrival.channel,
    p_source: arrival.source,
    p_medium: tags.source === null ? '' : (tags.medium ?? ''),
    p_campaign: tags.source === null ? '' : (tags.campaign ?? ''),
    p_referrer: referrer ?? '',
    p_country: place.country,
    p_region: place.region,
    p_city: place.city,
    p_device: deviceOf(userAgent),
    p_browser: browserOf(userAgent),
    p_system: systemOf(userAgent),
    p_app: app ?? '',
  });
  // A count that could not be written is never the visitor's problem.
  if (error) console.error(`Could not count a visit to ${visit.path}: ${error.message}`);
  return Response.json({ counted: error === null, tags: carried });
}
