import { brand } from '@repo/config/brand';
import { faviconLogo } from '@repo/config/logo/favicon';
import { logoSvgMarkup } from '@/lib/brand/logo-markup';

/** The browser tab's icon, sharp on any screen (D-249): the white wheel on a black circle. */
export function GET(): Response {
  return new Response(logoSvgMarkup(faviconLogo, { colour: brand.colours.white, background: brand.colours.black }), {
    headers: { 'Content-Type': 'image/svg+xml' },
  });
}
