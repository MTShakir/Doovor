import type { LogoArt } from '@repo/config/logo/art';
import { describe, expect, it } from 'vitest';
import { logoSvgMarkup } from './logo-markup';

const art: LogoArt = {
  width: 40,
  height: 10,
  paths: [
    { d: 'M0,0h10v10H0Z', evenOdd: false },
    { d: 'M20,0h10v10H20Z M22,2h6v6h-6Z', evenOdd: true },
  ],
};

describe('logoSvgMarkup (D-249)', () => {
  it('writes the shapes in the colour given, cutting holes where the logo has them', () => {
    expect(logoSvgMarkup(art, { colour: '#111111' })).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 10" aria-hidden="true">' +
        '<path d="M0,0h10v10H0Z" fill="#111111"/>' +
        '<path d="M20,0h10v10H20Z M22,2h6v6h-6Z" fill="#111111" fill-rule="evenodd"/>' +
        '</svg>',
    );
  });

  it('names it for a screen reader, sizes it by its height, and paints a background first', () => {
    const svg = logoSvgMarkup(art, { colour: '#ABCDEF', background: '#123456', label: 'A & B', height: 32 });
    expect(svg).toContain(' width="128" height="32" role="img" aria-label="A &amp; B">');
    expect(svg).toContain('<rect width="40" height="10" fill="#123456"/><path d="M0,0h10v10H0Z" fill="#ABCDEF"/>');
  });
});
