import { brand } from '@repo/config/brand';
import { faviconLogo } from '@repo/config/logo/favicon';
import { ImageResponse } from 'next/og';
import { DrawnLogo } from '@/lib/brand/drawn-logo';
import { icoFromPngs } from '@/lib/brand/ico';

/**
 * The browser tab's icon for whatever asks for it here rather than reading the page (D-249):
 * bookmarks, feed readers, older browsers. The white wheel on a black circle, at the three sizes
 * a tab and a desktop shortcut use, drawn when the app is built.
 */
const sizes = [16, 32, 48] as const;

export async function GET(): Promise<Response> {
  const images = await Promise.all(
    sizes.map(async (size) => {
      const picture = new ImageResponse(
        <div style={{ display: 'flex', width: size, height: size }}>
          <DrawnLogo art={faviconLogo} height={size} width={size} colour={brand.colours.white} backdropColour={brand.colours.black} />
        </div>,
        { width: size, height: size },
      );
      return { size, png: new Uint8Array(await picture.arrayBuffer()) };
    }),
  );
  return new Response(icoFromPngs(images), { headers: { 'Content-Type': 'image/x-icon' } });
}
