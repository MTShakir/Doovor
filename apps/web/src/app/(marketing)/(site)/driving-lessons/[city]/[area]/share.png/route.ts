import { placeShareImage } from '../../../place-share';

export async function GET(_request: Request, { params }: RouteContext<'/driving-lessons/[city]/[area]/share.png'>): Promise<Response> {
  const { city, area } = await params;
  return placeShareImage({ city, area, automatic: false });
}
