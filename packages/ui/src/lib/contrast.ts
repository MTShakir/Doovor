/** WCAG 2.2 relative luminance and contrast ratio for #RRGGBB colours (PRD 14.4). */

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new RangeError(`Expected #RRGGBB, got ${hex}`);
  const [r, g, b] = [match[1], match[2], match[3]].map((part) => channel(parseInt(part ?? '0', 16))) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: string, background: string): number {
  const [light, dark] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

/** WCAG AA thresholds: normal text 4.5, large text and UI component boundaries 3. */
export const AA_TEXT = 4.5;
export const AA_NON_TEXT = 3;
