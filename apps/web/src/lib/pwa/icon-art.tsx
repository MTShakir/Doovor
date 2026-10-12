import { brand } from '@repo/config/brand';
import { appIconLogo } from '@repo/config/logo/app-icon';
import { DrawnLogo } from '@/lib/brand/drawn-logo';
import type { AppIcon } from './icons';

/**
 * How much of the icon the drawing takes (D-249). The master's own frame is the whole icon, with
 * the wheel filling 77% of it (assets/brand/app-icon.svg). A maskable icon draws that frame at 80%,
 * so the wheel comes out at 62%: Android keeps a circle 80% across whatever shape it crops to, and
 * the wheel keeps a ring of black inside it rather than touching the edge.
 */
export function appIconArtScale(purpose: AppIcon['purpose']): number {
  return purpose === 'maskable' ? 0.8 : 1;
}

/**
 * An app icon as the image renderer draws it (PRD 8.1, M4-08, D-249): the white wheel on black,
 * from the logo's own shapes, so it changes when the logo does.
 */
export function AppIconArt({ icon }: { icon: Pick<AppIcon, 'size' | 'purpose'> }) {
  const artSize = Math.round(icon.size * appIconArtScale(icon.purpose));
  return (
    <div
      style={{
        width: icon.size,
        height: icon.size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: brand.colours.black,
      }}
    >
      <DrawnLogo art={appIconLogo} height={artSize} width={artSize} colour={brand.colours.white} />
    </div>
  );
}
