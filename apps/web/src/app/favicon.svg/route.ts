import { brand } from '@repo/config/brand';
import { appIconLogo } from '@repo/config/logo/app-icon';
import { logoSvgMarkup } from '@/lib/brand/logo-markup';

/** The browser tab's icon, sharp on any screen (D-249): the app icon, the white wheel on black. */
export function GET(): Response {
  return new Response(logoSvgMarkup(appIconLogo, { colour: brand.colours.white, background: brand.colours.black }), {
    headers: { 'Content-Type': 'image/svg+xml' },
  });
}
