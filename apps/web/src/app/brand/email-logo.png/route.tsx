import { brand } from '@repo/config/brand';
import { horizontalLogo } from '@repo/config/logo/horizontal';
import { emailLogo } from '@repo/emails/logo';
import { ImageResponse } from 'next/og';
import { DrawnLogo } from '@/lib/brand/drawn-logo';

/**
 * The logo at the top of every email (NTF-03, D-249, D-275), drawn when the app is built: black on a
 * white tile with rounded corners and the corners left clear, at twice the size it is shown so it
 * stays sharp on a phone. A mail app that darkens the email for the night shows the tile as a tile.
 */
export function GET(): ImageResponse {
  const scale = emailLogo.scale;
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: emailLogo.width * scale,
        height: emailLogo.height * scale,
        background: brand.colours.white,
        borderRadius: emailLogo.radius * scale,
      }}
    >
      <DrawnLogo
        art={horizontalLogo}
        height={emailLogo.logoHeight * scale}
        width={emailLogo.logoWidth * scale}
        colour={brand.colours.black}
      />
    </div>,
    { width: emailLogo.width * scale, height: emailLogo.height * scale },
  );
}
