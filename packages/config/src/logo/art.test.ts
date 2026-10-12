import { describe, expect, it } from 'vitest';
import { logoArtFromSvg, sameArtwork } from './art.ts';

// Shaped like what Illustrator writes, with made-up shapes.
const exported = `<?xml version="1.0" encoding="UTF-8"?>
<svg id="Layer_1" xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 120.5 40">
  <!-- Generator: Adobe Illustrator 30.0.0, SVG Export Plug-In . SVG Version: 2.1.1 Build 123)  -->
  <defs>
    <style>
      .st0, .st1 {
        fill: #fff;
      }

      .st1 {
        fill-rule: evenodd;
      }
    </style>
  </defs>
  <path class="st0" d="M0,0h10v10H0Z"/>
  <path class="st1" d="M20,0h10v10H20Z
    M22,2h6v6h-6Z"/>
</svg>`;

describe('logoArtFromSvg (D-249)', () => {
  it('reads the frame and every shape, and which shapes cut holes', () => {
    expect(logoArtFromSvg(exported)).toEqual({
      width: 120.5,
      height: 40,
      paths: [
        { d: 'M0,0h10v10H0Z', evenOdd: false },
        { d: 'M20,0h10v10H20Z M22,2h6v6h-6Z', evenOdd: true },
      ],
    });
  });

  it('reads a fill rule written on the shape itself', () => {
    const svg = '<svg viewBox="0 0 10 10"><path fill-rule="evenodd" d="M0,0h10v10H0Z"/></svg>';
    expect(logoArtFromSvg(svg).paths).toEqual([{ d: 'M0,0h10v10H0Z', evenOdd: true }]);
  });

  it("takes the app icon's square behind the shapes as its backdrop, which the app paints itself", () => {
    const svg = '<svg viewBox="0 0 270.15 270.15"><rect class="st1" x=".28" y=".28" width="269.58" height="269.58"/><path d="M2,2h6v6H2Z"/></svg>';
    expect(logoArtFromSvg(svg)).toEqual({ width: 270.15, height: 270.15, backdrop: 'square', paths: [{ d: 'M2,2h6v6H2Z', evenOdd: false }] });
  });

  it("takes the favicon's circle behind the shapes as its backdrop", () => {
    const svg = '<svg viewBox="0 0 270.15 270.15"><circle class="st1" cx="135.21" cy="135.21" r="134.93"/><path d="M2,2h6v6H2Z"/></svg>';
    expect(logoArtFromSvg(svg).backdrop).toBe('circle');
  });

  it('refuses a square or a circle that is a shape in the logo rather than the whole frame behind it', () => {
    expect(() => logoArtFromSvg('<svg viewBox="0 0 100 100"><rect x="10" y="10" width="20" height="20"/><path d="M0,0Z"/></svg>')).toThrow('<rect>');
    expect(() => logoArtFromSvg('<svg viewBox="0 0 100 100"><circle cx="30" cy="50" r="20"/><path d="M0,0Z"/></svg>')).toThrow('<circle>');
    expect(() => logoArtFromSvg('<svg viewBox="0 0 100 100"><rect width="100" height="100"/><circle cx="50" cy="50" r="50"/><path d="M0,0Z"/></svg>')).toThrow('more than one backdrop');
  });

  it('refuses what it cannot carry across as plain shapes', () => {
    expect(() => logoArtFromSvg('<svg viewBox="0 0 10 10"><text>name</text><path d="M0,0Z"/></svg>')).toThrow('<text>');
    expect(() => logoArtFromSvg('<svg viewBox="0 0 10 10"><image href="x.png"/><path d="M0,0Z"/></svg>')).toThrow('<image>');
    expect(() => logoArtFromSvg('<svg viewBox="0 0 10 10"><path transform="scale(2)" d="M0,0Z"/></svg>')).toThrow('transform');
    expect(() => logoArtFromSvg('<svg viewBox="5 0 10 10"><path d="M0,0Z"/></svg>')).toThrow('0 0');
    expect(() => logoArtFromSvg('<svg width="10" height="10"><path d="M0,0Z"/></svg>')).toThrow('viewBox');
    expect(() => logoArtFromSvg('<svg viewBox="0 0 10 10"></svg>')).toThrow('no shapes');
  });
});

describe('sameArtwork (D-249)', () => {
  const black = logoArtFromSvg(exported);

  it('takes the same shapes written another way as the same artwork', () => {
    const rewritten = { ...black, paths: black.paths.map((path) => ({ ...path, d: path.d.replace(/,/g, ' ') })) };
    expect(sameArtwork(rewritten, black)).toBe(true);
  });

  it('tells a different frame, a missing shape, another fill rule or another backdrop apart', () => {
    expect(sameArtwork({ ...black, width: 121 }, black)).toBe(false);
    expect(sameArtwork({ ...black, backdrop: 'circle' }, black)).toBe(false);
    expect(sameArtwork({ ...black, paths: black.paths.slice(1) }, black)).toBe(false);
    expect(sameArtwork({ ...black, paths: black.paths.map((path) => ({ ...path, evenOdd: !path.evenOdd })) }, black)).toBe(false);
  });
});
