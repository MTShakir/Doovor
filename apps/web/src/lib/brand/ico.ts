/**
 * An .ico file made of PNG pictures (D-249): what a browser fetches from /favicon.ico when a page
 * does not say where its icon is, and what bookmarks and feed readers still ask for. An icon file
 * may carry each size as a whole PNG, so making one is a short header, then the pictures end to end.
 */
export interface IcoImage {
  /** Width and height in pixels, from 1 to 256. */
  size: number;
  png: Uint8Array;
}

const HEADER = 6;
const ENTRY = 16;

export function icoFromPngs(images: readonly IcoImage[]): Uint8Array<ArrayBuffer> {
  const length = HEADER + ENTRY * images.length + images.reduce((sum, image) => sum + image.png.length, 0);
  const file = new Uint8Array(length);
  const view = new DataView(file.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true); // 1 is an icon, 2 a cursor
  view.setUint16(4, images.length, true);

  let offset = HEADER + ENTRY * images.length;
  images.forEach((image, index) => {
    if (!Number.isInteger(image.size) || image.size < 1 || image.size > 256) {
      throw new RangeError(`An icon is 1 to 256 pixels across, not ${String(image.size)}`);
    }
    const entry = HEADER + ENTRY * index;
    // 256 does not fit in a byte, so the format writes it as 0.
    view.setUint8(entry, image.size % 256);
    view.setUint8(entry + 1, image.size % 256);
    view.setUint8(entry + 2, 0); // no palette
    view.setUint8(entry + 3, 0);
    view.setUint16(entry + 4, 1, true); // colour planes
    view.setUint16(entry + 6, 32, true); // bits per pixel
    view.setUint32(entry + 8, image.png.length, true);
    view.setUint32(entry + 12, offset, true);
    file.set(image.png, offset);
    offset += image.png.length;
  });
  return file;
}
