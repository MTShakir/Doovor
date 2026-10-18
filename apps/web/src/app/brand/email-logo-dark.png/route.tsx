import { brand } from '@repo/config/brand';
import { horizontalLogo } from '@repo/config/logo/horizontal';
import { emailLogo } from '@repo/emails/logo';
import { ImageResponse } from 'next/og';
import { DrawnLogo } from '@/lib/brand/drawn-logo';

/**
 * The logo for a mail app that says it is in dark mode (NTF-03, D-275): white on a black tile with
 * rounded corners, the size of the light one's, so swapping one for the other moves nothing. On a
 * tile rather than on nothing, because a mail app can say it is dark and still show the email's own
 * light grey, and white on that would be lost.
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
        background: brand.colours.black,
        borderRadius: emailLogo.radius * scale,
      }}
    >
      <DrawnLogo
        art={horizontalLogo}
        height={emailLogo.logoHeight * scale}
        width={emailLogo.logoWidth * scale}
        colour={brand.colours.white}
      />
    </div>,
    { width: emailLogo.width * scale, height: emailLogo.height * scale },
  );
}
