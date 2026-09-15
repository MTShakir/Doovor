import { ImageResponse } from 'next/og';
import { AppIconArt } from '@/lib/pwa/icon-art';
import { appIcon, appIcons } from '@/lib/pwa/icons';

export function generateStaticParams() {
  return appIcons.map((icon) => ({ file: icon.file }));
}

/** The app's icons, drawn when the app is built (PRD 8.1, M4-08). Any other name is not found. */
export async function GET(_request: Request, { params }: RouteContext<'/icons/[file]'>): Promise<Response> {
  const icon = appIcon((await params).file);
  if (icon === undefined) return new Response(null, { status: 404 });
  return new ImageResponse(<AppIconArt icon={icon} />, { width: icon.size, height: icon.size });
}
