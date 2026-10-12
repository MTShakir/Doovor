import { describe, expect, it } from 'vitest';
import { icoFromPngs } from './ico';

const png = (bytes: number[]) => Uint8Array.from(bytes);

describe('icoFromPngs (D-249)', () => {
  it('writes the header, one entry per size, then the pictures where the entries say', () => {
    const small = png([1, 2, 3]);
    const large = png([4, 5]);
    const file = icoFromPngs([
      { size: 16, png: small },
      { size: 256, png: large },
    ]);
    const view = new DataView(file.buffer);

    expect(file.length).toBe(6 + 2 * 16 + 3 + 2);
    expect([view.getUint16(0, true), view.getUint16(2, true), view.getUint16(4, true)]).toEqual([0, 1, 2]);

    // The first entry: 16 by 16, 32 bits, its bytes straight after the two entries.
    expect([view.getUint8(6), view.getUint8(7), view.getUint16(10, true), view.getUint16(12, true)]).toEqual([16, 16, 1, 32]);
    expect([view.getUint32(14, true), view.getUint32(18, true)]).toEqual([3, 38]);
    // The second: 256 is written as 0, and its bytes follow the first picture's.
    expect([view.getUint8(22), view.getUint8(23)]).toEqual([0, 0]);
    expect([view.getUint32(30, true), view.getUint32(34, true)]).toEqual([2, 41]);

    expect([...file.subarray(38)]).toEqual([1, 2, 3, 4, 5]);
  });

  it('refuses a size the format cannot hold', () => {
    expect(() => icoFromPngs([{ size: 0, png: png([1]) }])).toThrow(RangeError);
    expect(() => icoFromPngs([{ size: 300, png: png([1]) }])).toThrow('1 to 256');
  });
});
