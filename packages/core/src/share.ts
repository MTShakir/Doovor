/**
 * Sharing a booking link: the message, the WhatsApp link and the QR code (PUB-03, M5-05).
 *
 * The QR code is drawn as one SVG path, black on white with a quiet zone of four modules, as the
 * standard asks, so a phone camera reads it from a car window or a printed card.
 */

import { encode } from 'uqr';

/** The words that go with a shared link. */
export function bookingShareMessage(instructorName: string, url: string): string {
  return `Book a driving lesson with ${instructorName}: ${url}`;
}

/** Opens WhatsApp with the message ready to send to anybody (PUB-03). */
export function whatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export interface QrCode {
  /** Modules across and down, the quiet zone included. */
  size: number;
  /** One SVG path with a 1 by 1 square for every dark module, in module units. */
  path: string;
  /** Dark modules, row by row, the quiet zone included. */
  modules: readonly (readonly boolean[])[];
}

/** The quiet zone the QR standard asks for around the code, in modules. */
const QUIET_ZONE = 4;

/**
 * A QR code for a link. Medium error correction survives a scuff or a sticker's curve on a car
 * window without making the code too dense to read from a distance.
 */
export function qrCode(text: string): QrCode {
  const encoded = encode(text, { ecc: 'M', border: QUIET_ZONE });
  const path = encoded.data
    .flatMap((row, y) => row.map((dark, x) => (dark ? `M${String(x)} ${String(y)}h1v1h-1z` : '')))
    .join('');
  return { size: encoded.size, path, modules: encoded.data };
}

/** The QR code as a standalone SVG file, for downloading and printing. */
export function qrSvg(text: string, pixelsPerModule = 10): string {
  const { size, path } = qrCode(text);
  const pixels = size * pixelsPerModule;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(pixels)}" height="${String(pixels)}" viewBox="0 0 ${String(size)} ${String(size)}" shape-rendering="crispEdges">` +
    // Named colours, not the brand's: a QR code is black on white whatever the brand looks like.
    `<rect width="${String(size)}" height="${String(size)}" fill="white"/><path d="${path}" fill="black"/></svg>`
  );
}
