import { brand } from '@repo/config/brand';
import { horizontalLogo } from '@repo/config/logo/horizontal';
import { emailLogo } from '@repo/emails';
import { ImageResponse } from 'next/og';
import { DrawnLogo } from '@/lib/brand/drawn-logo';

/**
 * The logo at the top of every email (NTF-03, D-249), drawn when the app is built: black on the
 * email's own grey, at twice the size it is shown so it stays sharp on a phone.
 */
export function GET(): ImageResponse {
  const width = emailLogo.width * emailLogo.scale;
  const height = emailLogo.height * emailLogo.scale;
  return new ImageResponse(
    <div style={{ display: 'flex', width, height, background: brand.colours['grey-100'] }}>
      <DrawnLogo art={horizontalLogo} height={height} width={width} colour={brand.colours.black} />
    </div>,
    { width, height },
  );
}
