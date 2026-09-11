import { brand } from '@repo/config/brand';

/**
 * Writes the brand colours from brand.ts as CSS variables. The Tailwind theme in
 * styles/theme.css maps utilities such as `bg-yellow` to these variables, so brand.ts stays
 * the only place a colour value lives (D-005). Render once inside <head>.
 */
export function brandCss(): string {
  const declarations = Object.entries(brand.colours)
    .map(([token, value]) => `--brand-${token}:${value};`)
    .join('');
  return `:root{${declarations}}`;
}

export function BrandStyle() {
  // Static, trusted content from brand.ts: no user input reaches this string.
  return <style id="brand-tokens" dangerouslySetInnerHTML={{ __html: brandCss() }} />;
}
