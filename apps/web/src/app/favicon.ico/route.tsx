import { ImageResponse } from 'next/og';
import { icoFromPngs } from '@/lib/brand/ico';
import { AppIconArt } from '@/lib/pwa/icon-art';

/**
 * The browser tab's icon for whatever asks for it here rather than reading the page (D-249):
 * bookmarks, feed readers, older browsers. The app icon at the three sizes a tab and a desktop
 * shortcut use, drawn when the app is built.
 */
const sizes = [16, 32, 48] as const;

export async function GET(): Promise<Response> {
  const images = await Promise.all(
    sizes.map(async (size) => {
      const picture = new ImageResponse(<AppIconArt icon={{ size, purpose: 'any' }} />, { width: size, height: size });
      return { size, png: new Uint8Array(await picture.arrayBuffer()) };
    }),
  );
  return new Response(icoFromPngs(images), { headers: { 'Content-Type': 'image/x-icon' } });
}
