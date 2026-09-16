import { placeShareImage } from '../../../place-share';

export async function GET(_request: Request, { params }: RouteContext<'/driving-lessons/[city]/automatic/share.png'>): Promise<Response> {
  const { city } = await params;
  return placeShareImage({ city, area: null, automatic: true });
}
