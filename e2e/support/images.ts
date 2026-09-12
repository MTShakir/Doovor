import type { Page } from '@playwright/test';

/**
 * Picture fixtures for the profile photo tests (M1-03).
 *
 * A photo taken on a phone carries the position it was taken at. Profile photos are public,
 * so the app must not store that. These helpers build a JPEG that really does carry a GPS
 * position, and read back what was stored.
 */

const GPS_IFD_OFFSET = 26;

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? 'http://127.0.0.1:54321';

/** Where anyone, signed in or not, can download a stored profile photo. */
export function publicAvatarUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}`;
}

/** A little-endian TIFF block whose only content is a GPS position. */
function exifWithGps(): Buffer {
  const tiff = Buffer.alloc(128);
  tiff.write('II', 0, 'latin1');
  tiff.writeUInt16LE(0x2a, 2);
  tiff.writeUInt32LE(8, 4);

  // IFD0: one entry, pointing at the GPS directory.
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x8825, 10);
  tiff.writeUInt16LE(4, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt32LE(GPS_IFD_OFFSET, 18);
  tiff.writeUInt32LE(0, 22);

  // GPS directory: 53 48 00 N, 1 33 00 W, which is Leeds.
  let at = GPS_IFD_OFFSET;
  tiff.writeUInt16LE(4, at);
  at += 2;
  const entry = (tag: number, type: number, count: number, value: number) => {
    tiff.writeUInt16LE(tag, at);
    tiff.writeUInt16LE(type, at + 2);
    tiff.writeUInt32LE(count, at + 4);
    tiff.writeUInt32LE(value, at + 8);
    at += 12;
  };
  const degrees = (data: number[], offset: number) => {
    for (const [index, value] of data.entries()) {
      tiff.writeUInt32LE(value, offset + index * 8);
      tiff.writeUInt32LE(1, offset + index * 8 + 4);
    }
  };
  entry(0x0001, 2, 2, 0x004e); // GPSLatitudeRef "N", short enough to sit in the value itself
  entry(0x0002, 5, 3, 80);
  entry(0x0003, 2, 2, 0x0057); // GPSLongitudeRef "W"
  entry(0x0004, 5, 3, 104);
  tiff.writeUInt32LE(0, at);
  degrees([53, 48, 0], 80);
  degrees([1, 33, 0], 104);

  const header = Buffer.alloc(4);
  header.writeUInt16BE(0xffe1, 0);
  header.writeUInt16BE(2 + 6 + tiff.length, 2);
  return Buffer.concat([header, Buffer.from('Exif\0\0', 'latin1'), tiff]);
}

/** A real JPEG, drawn by the browser under test, with a GPS position spliced in after the start marker. */
export async function jpegWithGps(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 800;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No canvas');
    const gradient = context.createLinearGradient(0, 0, 1200, 800);
    gradient.addColorStop(0, '#1d4ed8');
    gradient.addColorStop(1, '#f59e0b');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1200, 800);
    context.fillStyle = '#fdf6e3';
    context.font = 'bold 160px sans-serif';
    context.fillText('NN', 480, 460);
    return canvas.toDataURL('image/jpeg', 0.92);
  });
  const jpeg = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  return Buffer.concat([jpeg.subarray(0, 2), exifWithGps(), jpeg.subarray(2)]);
}

/** True when the bytes carry camera metadata: the JPEG marker, or the WebP chunk of that name. */
export function hasExif(buffer: Buffer): boolean {
  return buffer.includes(Buffer.from('Exif\0\0', 'latin1')) || buffer.includes(Buffer.from('EXIF', 'latin1'));
}

/** True when the bytes carry a GPS directory: tag 0x8825, then type 4, as stored. */
export function hasGpsTag(buffer: Buffer): boolean {
  return buffer.includes(Buffer.from([0x25, 0x88, 0x04, 0x00]));
}

/** Width and height of a WebP, whichever of the three encodings it uses. */
export function webpSize(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.toString('latin1', 0, 4) !== 'RIFF' || buffer.toString('latin1', 8, 12) !== 'WEBP') return null;
  const chunk = buffer.toString('latin1', 12, 16);
  if (chunk === 'VP8 ') return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 };
  return null;
}
