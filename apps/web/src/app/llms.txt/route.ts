import { llmsText } from '@repo/core/llms';
import { getSiteUrl } from '@/lib/site-url';

/**
 * The public site described for language models (D-387): what the product is and costs, what it
 * does not do yet, and its pages and guides, built from the same plans and guides the site shows.
 * Like robots.txt it is fetched by machines, so the proxy leaves it alone on either host.
 */
export function GET(): Response {
  return new Response(llmsText(getSiteUrl()), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
