import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { bookingShareMessage, qrCode, qrSvg, whatsAppShareUrl } from './share';

/** Draws the modules as a camera would see them, four pixels each, and reads them back. */
function scan(modules: readonly (readonly boolean[])[]): string | null {
  const scale = 4;
  const size = modules.length * scale;
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dark = modules[Math.floor(y / scale)]?.[Math.floor(x / scale)] ?? false;
      const at = (y * size + x) * 4;
      const value = dark ? 0 : 255;
      pixels[at] = value;
      pixels[at + 1] = value;
      pixels[at + 2] = value;
      pixels[at + 3] = 255;
    }
  }
  return jsQR(pixels, size, size)?.data ?? null;
}

describe('sharing a booking link (PUB-03, M5-05)', () => {
  it('scans to the booking link, exactly', () => {
    const link = 'https://app.example.com/book/sarah-khan';
    expect(scan(qrCode(link).modules)).toBe(link);
    // A long slug still reads.
    const long = 'https://app.example.com/book/alexandra-montgomery-whitfield-driving-tuition';
    expect(scan(qrCode(long).modules)).toBe(long);
  });

  it('keeps the quiet zone the standard asks for, so a camera can find the edges', () => {
    const { modules, size } = qrCode('https://app.example.com/book/sarah-khan');
    expect(modules).toHaveLength(size);
    for (const row of modules.slice(0, 4)) expect(row.every((dark) => !dark)).toBe(true);
    for (const row of modules) expect(row.slice(0, 4).every((dark) => !dark)).toBe(true);
  });

  it('draws the dark modules as one path, and as a file black on white', () => {
    const { path, modules, size } = qrCode('https://app.example.com/book/sarah-khan');
    const dark = modules.flat().filter(Boolean).length;
    expect(path.match(/M\d+ \d+h1v1h-1z/g)).toHaveLength(dark);
    const svg = qrSvg('https://app.example.com/book/sarah-khan', 8);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="(\d+)" height="\1" viewBox="0 0 \d+ \d+"/);
    expect(svg).toContain(`<rect width="${String(size)}" height="${String(size)}" fill="white"/>`);
    expect(svg).toContain('fill="black"');
  });

  it('writes the message, and a WhatsApp link that carries it whole', () => {
    const message = bookingShareMessage('Sarah Khan', 'https://app.example.com/book/sarah-khan');
    expect(message).toBe('Book a driving lesson with Sarah Khan: https://app.example.com/book/sarah-khan');
    const url = new URL(whatsAppShareUrl(message));
    expect(url.origin).toBe('https://wa.me');
    expect(url.searchParams.get('text')).toBe(message);
  });
});
