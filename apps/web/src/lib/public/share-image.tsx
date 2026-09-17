import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { brand } from '@repo/config/brand';
import { SHARE_IMAGE_SIZE, type ShareCard } from '@repo/core/share-card';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { brandMark } from '@/lib/pwa/icon-art';
import { isDrawablePhotoUrl } from '@/lib/storage/images';

/**
 * Draws a shared page's image (PRD 14.6, M5-08) from its card: the words come from
 * `@repo/core/share-card`, and this is only how they look.
 *
 * The renderer has one thin font of its own, so it is given Inter, the app's typeface, from the
 * files beside the app (Open Font License, from @fontsource/inter 5.3.0). It cannot read WebP, the
 * format photos are kept in, so a photo is turned into a PNG first; a photo that cannot be fetched
 * in time is drawn as initials rather than failing the image.
 */

const colours = brand.colours;

let fontFiles: Promise<[Buffer, Buffer]> | undefined;

function fonts(): Promise<[Buffer, Buffer]> {
  fontFiles ??= Promise.all([
    readFile(join(process.cwd(), 'src/assets/fonts/inter-latin-400-normal.woff')),
    readFile(join(process.cwd(), 'src/assets/fonts/inter-latin-700-normal.woff')),
  ]);
  return fontFiles;
}

const PICTURE_SIZE = 280;

/** A photo as the renderer can draw it, or null to draw initials instead. */
export async function drawablePhoto(url: string | null): Promise<string | null> {
  if (url === null || !isDrawablePhotoUrl(url)) return null;
  try {
    // Never anywhere but our own storage, and never wherever a redirect points (D-135).
    const response = await fetch(url, { signal: AbortSignal.timeout(3000), redirect: 'error' });
    if (!response.ok) return null;
    const png = await sharp(Buffer.from(await response.arrayBuffer()))
      .resize(PICTURE_SIZE * 2, PICTURE_SIZE * 2, { fit: 'cover' })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return null;
  }
}

function Picture({ picture, photo }: { picture: NonNullable<ShareCard['picture']>; photo: string | null }) {
  const round = { width: PICTURE_SIZE, height: PICTURE_SIZE, borderRadius: PICTURE_SIZE / 2 };
  return (
    <div style={{ display: 'flex', position: 'relative', flexShrink: 0, ...round }}>
      {photo === null ? (
        <div
          style={{
            ...round,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: colours['grey-100'],
            color: colours.ink,
            fontSize: 104,
            fontWeight: 700,
          }}
        >
          {picture.initials}
        </div>
      ) : (
        // The renderer draws a plain image element; the app's image component does not exist here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" width={PICTURE_SIZE} height={PICTURE_SIZE} style={{ ...round, objectFit: 'cover' }} />
      )}
      {picture.verified ? (
        <div
          style={{
            position: 'absolute',
            right: 6,
            bottom: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 76,
            height: 76,
            borderRadius: 38,
            background: colours.blue,
            border: `6px solid ${colours.white}`,
          }}
        >
          <svg width="36" height="36" viewBox="0 0 24 24">
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke={colours.white} strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      ) : null}
    </div>
  );
}

export function ShareCardArt({ card, photo }: { card: ShareCard; photo: string | null }) {
  const titleSize = card.title.length > 28 ? 60 : card.title.length > 20 ? 70 : 80;
  return (
    <div
      style={{
        ...SHARE_IMAGE_SIZE,
        display: 'flex',
        flexDirection: 'column',
        background: colours.white,
        color: colours.black,
        fontFamily: 'Inter',
      }}
    >
      <div style={{ display: 'flex', height: 14, background: colours.yellow }} />
      <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'space-between', padding: '56px 72px 64px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 56 }}>
          <div style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: colours['grey-700'] }}>{card.eyebrow}</div>
            <div style={{ display: 'flex', fontSize: titleSize, fontWeight: 700, lineHeight: 1.08, letterSpacing: -1.5 }}>{card.title}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 14 }}>
              {card.facts.map((fact) => (
                <div
                  key={fact}
                  style={{
                    display: 'flex',
                    padding: '10px 22px',
                    borderRadius: 999,
                    background: colours['grey-100'],
                    color: colours.ink,
                    fontSize: 27,
                    fontWeight: 700,
                  }}
                >
                  {fact}
                </div>
              ))}
            </div>
          </div>
          {card.picture === null ? null : <Picture picture={card.picture} photo={photo} />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 64,
                height: 64,
                borderRadius: 16,
                background: colours.black,
              }}
            >
              <svg width="40" height="40" viewBox="0 0 100 100">
                <path d={brandMark} fill={colours.white} fillRule="evenodd" />
              </svg>
            </div>
            <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, letterSpacing: -0.5 }}>{brand.name}</div>
          </div>
          <div
            style={{
              display: 'flex',
              padding: '18px 40px',
              borderRadius: 999,
              background: card.paused ? colours['grey-100'] : colours.black,
              color: card.paused ? colours.ink : colours.white,
              fontSize: 32,
              fontWeight: 700,
            }}
          >
            {card.action}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The image as a response. Its address carries the card's version, so what is at one address
 * changes only when the drawing does; a day's keeping lets a new drawing reach everybody soon.
 */
export async function shareImageResponse(card: ShareCard): Promise<ImageResponse> {
  const [[regular, bold], photo] = await Promise.all([fonts(), drawablePhoto(card.picture?.photoUrl ?? null)]);
  return new ImageResponse(<ShareCardArt card={card} photo={photo} />, {
    ...SHARE_IMAGE_SIZE,
    fonts: [
      { name: 'Inter', data: regular, weight: 400, style: 'normal' },
      { name: 'Inter', data: bold, weight: 700, style: 'normal' },
    ],
    // While the drawing itself is being worked on, nothing keeps an old one.
    ...(process.env.NODE_ENV === 'development' ? {} : { headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' } }),
  });
}
